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
 *  - Periodic "still offline": every alertRepeatMinutes with average loss and duration
 *  - Recovery: includes total incident duration and average loss during the incident
 *  - Threshold breach: sent when latency/loss exceeds configured limits
 *  - Periodic "still degraded": every alertRepeatMinutes with average latency/loss and duration
 *  - Threshold normalized: includes duration and averages during the degradation period
 *
 * Incidents are persisted in the linux_incidents table for historical consultation.
 */
import { exec } from "child_process";
import { promisify } from "util";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and } from "drizzle-orm";
import { linuxProbes, linuxDestinations } from "../drizzle/schema";
import { addLinuxDestMetric, createLinuxIncident, resolveLinuxIncident } from "./db";
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

// Incident state: tracks start time, samples, last periodic notification, and DB incident ID
interface IncidentState {
  startedAt: number;           // timestamp ms when incident began
  lossSamples: number[];       // packet loss % samples during incident
  latencySamples: number[];    // latency ms samples during incident
  lastNotifiedMinute: number;  // last repeat-interval mark at which periodic notification was sent
  dbIncidentId?: number;       // ID of the persisted incident in the database
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

function maxOf(arr: number[]): number {
  if (!arr.length) return 0;
  return Math.max(...arr);
}

function ptDate(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

// ── Alert handler ──────────────────────────────────────────────────────────

async function handleAlerts(
  dest: {
    id: number;
    probeId: number;
    name: string;
    host: string;
    offlineAlert: string;
    latencyThreshold: number;
    lossThreshold: number;
    alertRepeatMinutes: number;
  },
  probeName: string,
  result: PingResult
) {
  const isOffline = result.packetLoss >= 100;
  const currentFailures = failureCount.get(dest.id) ?? 0;
  const now = Date.now();
  const repeatMs = (dest.alertRepeatMinutes ?? 5) * 60000;

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
        // Persist incident in DB
        const dbId = await createLinuxIncident({
          destinationId: dest.id,
          probeId: dest.probeId,
          type: "offline",
          startedAt: new Date(inc.startedAt),
        });
        if (dbId) inc.dbIncidentId = dbId;
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

      // Periodic "still offline" notification every alertRepeatMinutes
      if (alertSent.get(dest.id)) {
        const elapsedMs = now - inc.startedAt;
        const repeatMark = Math.floor(elapsedMs / repeatMs);
        if (repeatMark > 0 && repeatMark !== inc.lastNotifiedMinute) {
          inc.lastNotifiedMinute = repeatMark;
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
        // Resolve incident in DB
        if (inc?.dbIncidentId) {
          await resolveLinuxIncident(inc.dbIncidentId, {
            endedAt: new Date(now),
            avgLatencyMs: avg(inc.latencySamples),
            avgLoss: avg(inc.lossSamples),
            maxLatencyMs: maxOf(inc.latencySamples),
            maxLoss: maxOf(inc.lossSamples),
          });
        }
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
    // offlineAlert === "never": still track incident for DB persistence
    if (isOffline) {
      failureCount.set(dest.id, currentFailures + 1);
      if (!offlineIncident.has(dest.id)) {
        offlineIncident.set(dest.id, { startedAt: now, lossSamples: [result.packetLoss], latencySamples: [], lastNotifiedMinute: 0 });
        // Persist incident even without Telegram alert
        const dbId = await createLinuxIncident({
          destinationId: dest.id,
          probeId: dest.probeId,
          type: "offline",
          startedAt: new Date(now),
        });
        if (dbId) offlineIncident.get(dest.id)!.dbIncidentId = dbId;
      } else {
        offlineIncident.get(dest.id)!.lossSamples.push(result.packetLoss);
      }
    } else {
      const inc = offlineIncident.get(dest.id);
      if (inc?.dbIncidentId) {
        await resolveLinuxIncident(inc.dbIncidentId, {
          endedAt: new Date(now),
          avgLatencyMs: avg(inc.latencySamples),
          avgLoss: avg(inc.lossSamples),
          maxLatencyMs: maxOf(inc.latencySamples),
          maxLoss: maxOf(inc.lossSamples),
        });
      }
      offlineIncident.delete(dest.id);
      failureCount.set(dest.id, 0);
    }
  }

  // ── Latency/loss threshold alert ───────────────────────────────────────
  if (!isOffline) {
    const latencyExceeded = dest.latencyThreshold > 0 && result.latencyMs > dest.latencyThreshold;
    const lossExceeded = dest.lossThreshold > 0 && result.packetLoss > dest.lossThreshold;
    const thresholdBreached = latencyExceeded || lossExceeded;

    // Determine incident type
    const incidentType = (): "latency" | "loss" | "both" => {
      if (latencyExceeded && lossExceeded) return "both";
      if (latencyExceeded) return "latency";
      return "loss";
    };

    // Helper functions to differentiate scenario in messages
    const scenarioLabel = (): string => {
      if (latencyExceeded && lossExceeded) return "Degradação Severa";
      if (latencyExceeded) return "Latência Alta";
      return "Perda de Pacotes";
    };
    const scenarioEmoji = (): string => {
      if (latencyExceeded && lossExceeded) return "🔶";
      if (latencyExceeded) return "🟡";
      return "🟠";
    };
    const scenarioDetail = (): string => {
      if (latencyExceeded && lossExceeded) {
        return `📡 Latência: *${result.latencyMs}ms* > limiar *${dest.latencyThreshold}ms*\n` +
               `📦 Perda: *${result.packetLoss}%* > limiar *${dest.lossThreshold}%*\n` +
               `💡 Diagnóstico: degradação severa (congestionamento + perda)`;
      }
      if (latencyExceeded) {
        return `📡 Latência: *${result.latencyMs}ms* > limiar *${dest.latencyThreshold}ms*\n` +
               `📦 Perda: *${result.packetLoss}%* (dentro do normal)\n` +
               `💡 Diagnóstico: possível congestionamento sem perda de pacotes`;
      }
      return `📦 Perda: *${result.packetLoss}%* > limiar *${dest.lossThreshold}%*\n` +
             `📡 Latência: *${result.latencyMs}ms* (dentro do normal)\n` +
             `💡 Diagnóstico: falha parcial de conectividade`;
    };
    const periodicDetail = (avgLoss: string, avgLat: string): string => {
      if (latencyExceeded && lossExceeded) {
        return `📊 Perda média: *${avgLoss}%* (limiar: ${dest.lossThreshold}%) | Latência média: *${avgLat}ms* (limiar: ${dest.latencyThreshold}ms)`;
      }
      if (latencyExceeded) {
        return `📡 Latência média: *${avgLat}ms* (limiar: ${dest.latencyThreshold}ms) | Perda: estável em *${avgLoss}%*`;
      }
      return `📦 Perda média: *${avgLoss}%* (limiar: ${dest.lossThreshold}%) | Latência: estável em *${avgLat}ms*`;
    };

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
        // Initial threshold alert — differentiated by scenario
        thresholdAlertSent.set(dest.id, true);
        // Persist threshold incident in DB
        const dbId = await createLinuxIncident({
          destinationId: dest.id,
          probeId: dest.probeId,
          type: incidentType(),
          startedAt: new Date(inc.startedAt),
        });
        if (dbId) inc.dbIncidentId = dbId;
        const msg =
          `${scenarioEmoji()} *Monitor Linux — ${scenarioLabel()}*\n\n` +
          `📍 Probe: *${probeName}*\n` +
          `🎯 Destino: *${dest.name}* (\`${dest.host}\`)\n` +
          scenarioDetail() + "\n" +
          `🕐 Início: *${ptDate(inc.startedAt)}*`;
        await sendTelegramMessage(msg);
        console.log(`[LinuxMonitor] Alerta de limiar (${scenarioLabel()}): ${dest.name}`);
      } else {
        // Periodic "still degraded" notification every alertRepeatMinutes
        const elapsedMs = now - inc.startedAt;
        const repeatMark = Math.floor(elapsedMs / repeatMs);
        if (repeatMark > 0 && repeatMark !== inc.lastNotifiedMinute) {
          inc.lastNotifiedMinute = repeatMark;
          const avgLoss = avg(inc.lossSamples).toFixed(1);
          const avgLat = avg(inc.latencySamples).toFixed(1);
          const msg =
            `${scenarioEmoji()} *Monitor Linux — ${scenarioLabel()} persistente*\n\n` +
            `📍 Probe: *${probeName}*\n` +
            `🎯 Destino: *${dest.name}* (\`${dest.host}\`)\n` +
            `⏳ Há: *${formatDuration(elapsedMs)}*\n` +
            periodicDetail(avgLoss, avgLat) + "\n" +
            `🕐 Início: *${ptDate(inc.startedAt)}*`;
          await sendTelegramMessage(msg);
          console.log(`[LinuxMonitor] Notif. periódica (${scenarioLabel()}): ${dest.name} há ${formatDuration(elapsedMs)}`);
        }
      }
    } else if (!thresholdBreached && thresholdAlertSent.get(dest.id)) {
      // Threshold normalized — enriched recovery message
      thresholdAlertSent.set(dest.id, false);
      const inc = thresholdIncident.get(dest.id);
      const durationStr = inc ? formatDuration(now - inc.startedAt) : "desconhecido";
      const avgLoss = inc?.lossSamples.length ? avg(inc.lossSamples).toFixed(1) : null;
      const avgLat = inc?.latencySamples.length ? avg(inc.latencySamples).toFixed(1) : null;
      // Resolve threshold incident in DB
      if (inc?.dbIncidentId) {
        await resolveLinuxIncident(inc.dbIncidentId, {
          endedAt: new Date(now),
          avgLatencyMs: avg(inc.latencySamples),
          avgLoss: avg(inc.lossSamples),
          maxLatencyMs: maxOf(inc.latencySamples),
          maxLoss: maxOf(inc.lossSamples),
        });
      }
      const msg =
        `✅ *Monitor Linux — Métricas Normalizadas*\n\n` +
        `📍 Probe: *${probeName}*\n` +
        `🎯 Destino: *${dest.name}* (\`${dest.host}\`)\n` +
        `✅ Métricas voltaram ao normal\n` +
        `⏱ Duração da degradação: *${durationStr}*\n` +
        (avgLoss !== null ? `📊 Perda média no período: *${avgLoss}%*\n` : "") +
        (avgLat !== null ? `📈 Latência média no período: *${avgLat}ms*\n` : "") +
        `📉 Valores atuais: perda *${result.packetLoss}%* | latência *${result.latencyMs}ms*`;
      await sendTelegramMessage(msg);
      console.log(`[LinuxMonitor] Métricas normalizadas: ${dest.name} após ${durationStr}`);
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
            probeId: probe.id,
            name: dest.name,
            host: dest.host,
            offlineAlert: dest.offlineAlert,
            latencyThreshold: dest.latencyThreshold,
            lossThreshold: dest.lossThreshold,
            alertRepeatMinutes: dest.alertRepeatMinutes ?? 5,
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
