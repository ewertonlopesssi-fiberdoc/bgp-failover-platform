/**
 * Linux Monitor — executes ping directly on the Debian server using
 * a specific source IP (loopback) per probe, independent of Ne8000 NQA.
 *
 * Uses: ping -I <sourceIp> -c <count> -W 2 -s <packetSize> -q <destination>
 * Requires: the sourceIp must be configured as a loopback address on the host.
 * Each destination has its own frequency, packet count, and packet size.
 *
 * Telegram notifications:
 *  - Offline alert: sent after N consecutive failures (configurable per destination)
 *  - Periodic "still offline": every 5 minutes with average loss and duration
 *  - Recovery: includes total incident duration and average loss during the incident
 *  - Threshold breach: sent when latency/loss exceeds configured limits
 *  - Periodic "still degraded": every 5 minutes with average latency/loss and duration
 *  - Threshold normalized: includes duration and averages during the degradation period
 */
import { exec } from "child_process";
import { promisify } from "util";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
import { linuxProbes, linuxDestinations } from "../drizzle/schema";
import { addLinuxDestMetric } from "./db";
import { sendTelegramMessage } from "./telegram";

const execAsync = promisify(exec);

let _db: ReturnType<typeof drizzle> | null = null;
function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}

// ── Loopback management ────────────────────────────────────────────────────

export async function addLoopbackIp(ip: string): Promise<{ success: boolean; message: string }> {
  try {
    const { stdout: checkOut } = await execAsync(`ip addr show dev lo 2>/dev/null | grep "${ip}/32" || true`);
    if (checkOut.trim()) {
      return { success: true, message: `IP ${ip}/32 já está configurado na loopback` };
    }
    await execAsync(`ip addr add ${ip}/32 dev lo`);
    return { success: true, message: `IP ${ip}/32 adicionado à loopback com sucesso` };
  } catch (err: any) {
    return { success: false, message: `Erro ao adicionar ${ip}/32: ${err.message}` };
  }
}

export async function removeLoopbackIp(ip: string): Promise<{ success: boolean; message: string }> {
  try {
    const { stdout: checkOut } = await execAsync(`ip addr show dev lo 2>/dev/null | grep "${ip}/32" || true`);
    if (!checkOut.trim()) {
      return { success: true, message: `IP ${ip}/32 não estava configurado na loopback` };
    }
    await execAsync(`ip addr del ${ip}/32 dev lo`);
    return { success: true, message: `IP ${ip}/32 removido da loopback com sucesso` };
  } catch (err: any) {
    return { success: false, message: `Erro ao remover ${ip}/32: ${err.message}` };
  }
}

export async function listLoopbackIps(): Promise<string[]> {
  try {
    const { stdout } = await execAsync(`ip addr show dev lo 2>/dev/null | grep 'inet ' | awk '{print $2}' | grep -v '127.0.0.1'`);
    return stdout.trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

// ── Ping probe ─────────────────────────────────────────────────────────────

interface PingResult {
  latencyMs: number;
  packetLoss: number;
  success: boolean;
  error?: string;
}

async function runPing(
  sourceIp: string,
  destination: string,
  count = 5,
  packetSize = 32
): Promise<PingResult> {
  try {
    const { stdout } = await execAsync(
      `ping -I ${sourceIp} -c ${count} -W 2 -s ${packetSize} -q ${destination} 2>&1`,
      { timeout: (count + 2) * 3000 }
    );
    const lossMatch = stdout.match(/(\d+(?:\.\d+)?)%\s+packet\s+loss/i);
    const packetLoss = lossMatch ? parseFloat(lossMatch[1]) : 100;
    const rttMatch = stdout.match(/rtt\s+min\/avg\/max\/mdev\s*=\s*[\d.]+\/([\d.]+)\//i);
    const latencyMs = rttMatch ? parseFloat(rttMatch[1]) : 0;
    return { latencyMs, packetLoss, success: packetLoss < 100 };
  } catch (err: any) {
    const output = err.stdout ?? err.message ?? "";
    const lossMatch = output.match(/(\d+(?:\.\d+)?)%\s+packet\s+loss/i);
    const packetLoss = lossMatch ? parseFloat(lossMatch[1]) : 100;
    const rttMatch = output.match(/rtt\s+min\/avg\/max\/mdev\s*=\s*[\d.]+\/([\d.]+)\//i);
    const latencyMs = rttMatch ? parseFloat(rttMatch[1]) : 0;
    return { latencyMs, packetLoss, success: false, error: err.message };
  }
}

// ── Alert state tracking ───────────────────────────────────────────────────

// Consecutive failure counter per destination
const failureCount = new Map<number, number>();
// Whether an offline alert has already been sent (to avoid spam)
const alertSent = new Map<number, boolean>();
// Whether a threshold alert has already been sent
const thresholdAlertSent = new Map<number, boolean>();

// Incident state: tracks start time, samples, and last periodic notification
interface IncidentState {
  startedAt: number;           // timestamp ms when incident began
  lossSamples: number[];       // packet loss % samples during incident
  latencySamples: number[];    // latency ms samples during incident
  lastNotifiedMinute: number;  // last 5-min mark at which periodic notification was sent
}

const offlineIncident = new Map<number, IncidentState>();
const thresholdIncident = new Map<number, IncidentState>();

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  if (totalSecs < 60) return `${totalSecs} segundo${totalSecs !== 1 ? "s" : ""}`;
  const mins = Math.floor(totalSecs / 60);
  if (mins < 60) return `${mins} minuto${mins !== 1 ? "s" : ""}`;
  const hrs = Math.floor(mins / 60);
  const remMins = mins % 60;
  return remMins > 0 ? `${hrs}h ${remMins}min` : `${hrs} hora${hrs !== 1 ? "s" : ""}`;
}

function avg(arr: number[]): number {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function ptDate(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// ── Alert handler ──────────────────────────────────────────────────────────

async function handleAlerts(
  dest: {
    id: number;
    name: string;
    host: string;
    offlineAlert: string;
    latencyThreshold: number;
    lossThreshold: number;
  },
  probeName: string,
  result: PingResult
) {
  const isOffline = result.packetLoss >= 100;
  const currentFailures = failureCount.get(dest.id) ?? 0;
  const now = Date.now();

  // ── Offline alert ──────────────────────────────────────────────────────
  if (dest.offlineAlert !== "never") {
    const threshold = parseInt(dest.offlineAlert, 10); // 1, 2, 3 or 5

    if (isOffline) {
      const newCount = currentFailures + 1;
      failureCount.set(dest.id, newCount);

      // Start or update incident tracking
      if (!offlineIncident.has(dest.id)) {
        offlineIncident.set(dest.id, {
          startedAt: now,
          lossSamples: [result.packetLoss],
          latencySamples: [],
          lastNotifiedMinute: 0,
        });
      } else {
        offlineIncident.get(dest.id)!.lossSamples.push(result.packetLoss);
      }

      const inc = offlineIncident.get(dest.id)!;

      // Initial offline alert (fires exactly when consecutive count reaches threshold)
      if (newCount === threshold && !alertSent.get(dest.id)) {
        alertSent.set(dest.id, true);
        const msg =
          `🔴 *Monitor Linux — Destino OFFLINE*\n\n` +
          `📍 Probe: *${probeName}*\n` +
          `🎯 Destino: *${dest.name}* (\`${dest.host}\`)\n` +
          `❌ Falhas consecutivas: *${newCount}*\n` +
          `📊 Perda de pacotes: *${result.packetLoss}%*\n` +
          `🕐 Início do incidente: *${ptDate(inc.startedAt)}*`;
        await sendTelegramMessage(msg);
        console.log(`[LinuxMonitor] Alerta Telegram: ${dest.name} offline após ${newCount} falhas`);
      }

      // Periodic "still offline" notification every 5 minutes
      if (alertSent.get(dest.id)) {
        const elapsedMs = now - inc.startedAt;
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        const minuteMark = Math.floor(elapsedMinutes / 5) * 5;
        if (minuteMark > 0 && minuteMark !== inc.lastNotifiedMinute) {
          inc.lastNotifiedMinute = minuteMark;
          const avgLoss = avg(inc.lossSamples).toFixed(1);
          const msg =
            `🔴 *Monitor Linux — Destino ainda OFFLINE*\n\n` +
            `📍 Probe: *${probeName}*\n` +
            `🎯 Destino: *${dest.name}* (\`${dest.host}\`)\n` +
            `⏳ Offline há: *${formatDuration(elapsedMs)}*\n` +
            `📊 Perda média no período: *${avgLoss}%*\n` +
            `🕐 Início: *${ptDate(inc.startedAt)}*`;
          await sendTelegramMessage(msg);
          console.log(`[LinuxMonitor] Notif. periódica: ${dest.name} offline há ${formatDuration(elapsedMs)}, perda média ${avgLoss}%`);
        }
      }
    } else {
      // Destination recovered
      if (alertSent.get(dest.id)) {
        alertSent.set(dest.id, false);
        const inc = offlineIncident.get(dest.id);
        const durationStr = inc ? formatDuration(now - inc.startedAt) : "desconhecido";
        const avgLoss = inc ? avg(inc.lossSamples).toFixed(1) : "?";
        const msg =
          `🟢 *Monitor Linux — Destino RECUPERADO*\n\n` +
          `📍 Probe: *${probeName}*\n` +
          `🎯 Destino: *${dest.name}* (\`${dest.host}\`)\n` +
          `✅ Destino voltou ao normal\n` +
          `⏱ Duração do incidente: *${durationStr}*\n` +
          `📊 Perda média durante o incidente: *${avgLoss}%*\n` +
          `📈 Valores atuais: latência *${result.latencyMs}ms* | perda *${result.packetLoss}%*`;
        await sendTelegramMessage(msg);
        console.log(`[LinuxMonitor] Recuperação: ${dest.name} após ${durationStr} (perda média ${avgLoss}%)`);
      }
      offlineIncident.delete(dest.id);
      failureCount.set(dest.id, 0);
    }
  } else {
    // offlineAlert === "never": still track incident for potential future use
    if (isOffline) {
      failureCount.set(dest.id, currentFailures + 1);
      if (!offlineIncident.has(dest.id)) {
        offlineIncident.set(dest.id, { startedAt: now, lossSamples: [result.packetLoss], latencySamples: [], lastNotifiedMinute: 0 });
      } else {
        offlineIncident.get(dest.id)!.lossSamples.push(result.packetLoss);
      }
    } else {
      offlineIncident.delete(dest.id);
      failureCount.set(dest.id, 0);
    }
  }

  // ── Latency/loss threshold alert ───────────────────────────────────────
  if (!isOffline) {
    const latencyExceeded = dest.latencyThreshold > 0 && result.latencyMs > dest.latencyThreshold;
    const lossExceeded = dest.lossThreshold > 0 && result.packetLoss > dest.lossThreshold;
    const thresholdBreached = latencyExceeded || lossExceeded;

    if (thresholdBreached) {
      // Start or update threshold incident tracking
      if (!thresholdIncident.has(dest.id)) {
        thresholdIncident.set(dest.id, {
          startedAt: now,
          lossSamples: [result.packetLoss],
          latencySamples: [result.latencyMs],
          lastNotifiedMinute: 0,
        });
      } else {
        const inc = thresholdIncident.get(dest.id)!;
        inc.lossSamples.push(result.packetLoss);
        inc.latencySamples.push(result.latencyMs);
      }

      const inc = thresholdIncident.get(dest.id)!;

      if (!thresholdAlertSent.get(dest.id)) {
        // Initial threshold alert
        thresholdAlertSent.set(dest.id, true);
        const reasons: string[] = [];
        if (latencyExceeded) reasons.push(`Latência *${result.latencyMs}ms* > limiar *${dest.latencyThreshold}ms*`);
        if (lossExceeded) reasons.push(`Perda *${result.packetLoss}%* > limiar *${dest.lossThreshold}%*`);
        const msg =
          `⚠️ *Monitor Linux — Limiar Excedido*\n\n` +
          `📍 Probe: *${probeName}*\n` +
          `🎯 Destino: *${dest.name}* (\`${dest.host}\`)\n` +
          reasons.map(r => `• ${r}`).join("\n") + "\n" +
          `🕐 Início: *${ptDate(inc.startedAt)}*`;
        await sendTelegramMessage(msg);
        console.log(`[LinuxMonitor] Alerta de limiar: ${dest.name}`);
      } else {
        // Periodic "still degraded" notification every 5 minutes
        const elapsedMs = now - inc.startedAt;
        const elapsedMinutes = Math.floor(elapsedMs / 60000);
        const minuteMark = Math.floor(elapsedMinutes / 5) * 5;
        if (minuteMark > 0 && minuteMark !== inc.lastNotifiedMinute) {
          inc.lastNotifiedMinute = minuteMark;
          const avgLoss = avg(inc.lossSamples).toFixed(1);
          const avgLat = avg(inc.latencySamples).toFixed(1);
          const parts: string[] = [];
          if (dest.lossThreshold > 0) parts.push(`perda média *${avgLoss}%* (limiar: ${dest.lossThreshold}%)`);
          if (dest.latencyThreshold > 0) parts.push(`latência média *${avgLat}ms* (limiar: ${dest.latencyThreshold}ms)`);
          const msg =
            `⚠️ *Monitor Linux — Degradação persistente*\n\n` +
            `📍 Probe: *${probeName}*\n` +
            `🎯 Destino: *${dest.name}* (\`${dest.host}\`)\n` +
            `⏳ Degradado há: *${formatDuration(elapsedMs)}*\n` +
            (parts.length ? `📊 ${parts.join(" | ")}\n` : "") +
            `🕐 Início: *${ptDate(inc.startedAt)}*`;
          await sendTelegramMessage(msg);
          console.log(`[LinuxMonitor] Notif. periódica limiar: ${dest.name} degradado há ${formatDuration(elapsedMs)}`);
        }
      }
    } else if (!thresholdBreached && thresholdAlertSent.get(dest.id)) {
      // Threshold normalized — send enriched recovery message
      thresholdAlertSent.set(dest.id, false);
      const inc = thresholdIncident.get(dest.id);
      const durationStr = inc ? formatDuration(now - inc.startedAt) : "desconhecido";
      const avgLoss = inc?.lossSamples.length ? avg(inc.lossSamples).toFixed(1) : null;
      const avgLat = inc?.latencySamples.length ? avg(inc.latencySamples).toFixed(1) : null;
      const msg =
        `✅ *Monitor Linux — Limiar Normalizado*\n\n` +
        `📍 Probe: *${probeName}*\n` +
        `🎯 Destino: *${dest.name}* (\`${dest.host}\`)\n` +
        `✅ Métricas voltaram ao normal\n` +
        `⏱ Duração da degradação: *${durationStr}*\n` +
        (avgLoss !== null ? `📊 Perda média no período: *${avgLoss}%*\n` : "") +
        (avgLat !== null ? `📈 Latência média no período: *${avgLat}ms*\n` : "") +
        `📉 Valores atuais: perda *${result.packetLoss}%* | latência *${result.latencyMs}ms*`;
      await sendTelegramMessage(msg);
      console.log(`[LinuxMonitor] Limiar normalizado: ${dest.name} após ${durationStr}`);
      thresholdIncident.delete(dest.id);
    }
  }
}

// ── Monitor cycle ──────────────────────────────────────────────────────────

let monitorInterval: ReturnType<typeof setInterval> | null = null;
let isRunning = false;

// Track last run time per destination for individual frequency control
const lastRunMap = new Map<number, number>();

export async function runLinuxMonitorCycle() {
  const db = getDb();
  if (!db) return;
  try {
    const probes = await db
      .select()
      .from(linuxProbes)
      .where(eq(linuxProbes.active, true));
    if (probes.length === 0) return;
    const now = Date.now();
    for (const probe of probes) {
      const dests = await db
        .select()
        .from(linuxDestinations)
        .where(and(eq(linuxDestinations.probeId, probe.id), eq(linuxDestinations.active, true)));
      if (dests.length === 0) continue;
      for (const dest of dests) {
        const lastRun = lastRunMap.get(dest.id) ?? 0;
        const freqMs = dest.frequency * 1000;
        if (now - lastRun < freqMs) continue;
        lastRunMap.set(dest.id, now);
        const result = await runPing(probe.sourceIp, dest.host, dest.packetCount, dest.packetSize);
        console.log(
          `[LinuxMonitor] ${probe.name} → ${dest.name} (${dest.host}): RTT=${result.latencyMs}ms, perda=${result.packetLoss}%`
        );
        await addLinuxDestMetric({
          destinationId: dest.id,
          probeId: probe.id,
          latencyMs: result.latencyMs,
          packetLoss: result.packetLoss,
        });
        await handleAlerts(
          {
            id: dest.id,
            name: dest.name,
            host: dest.host,
            offlineAlert: dest.offlineAlert,
            latencyThreshold: dest.latencyThreshold,
            lossThreshold: dest.lossThreshold,
          },
          probe.name,
          result
        );
      }
    }
  } catch (err: any) {
    console.error("[LinuxMonitor] Erro no ciclo:", err.message);
  }
}

export function startLinuxMonitor(intervalSeconds = 10) {
  if (monitorInterval) return;
  isRunning = true;
  console.log(`[LinuxMonitor] Iniciando com ciclo de verificação de ${intervalSeconds}s`);
  runLinuxMonitorCycle();
  monitorInterval = setInterval(runLinuxMonitorCycle, intervalSeconds * 1000);
}

export function stopLinuxMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval);
    monitorInterval = null;
  }
  isRunning = false;
  console.log("[LinuxMonitor] Parado");
}

export function getLinuxMonitorStatus() {
  return { running: isRunning };
}
