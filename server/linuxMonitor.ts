/**
 * Linux Monitor — executes ping directly on the Debian server using
 * a specific source IP (loopback) per probe, independent of Ne8000 NQA.
 *
 * Uses: ping -I <sourceIp> -c <count> -W 2 -s <packetSize> -q <destination>
 * Requires: the sourceIp must be configured as a loopback address on the host.
 * Each destination has its own frequency, packet count, and packet size.
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
    // -I: source interface/IP, -c: count, -W: timeout per probe (secs), -s: packet size, -q: quiet
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

  // ── Offline alert ──────────────────────────────────────────────────────
  if (dest.offlineAlert !== "never") {
    const threshold = parseInt(dest.offlineAlert, 10); // 1, 2, 3 or 5

    if (isOffline) {
      const newCount = currentFailures + 1;
      failureCount.set(dest.id, newCount);

      if (newCount === threshold && !alertSent.get(dest.id)) {
        alertSent.set(dest.id, true);
        const msg =
          `\u{1F534} *Monitor Linux \u2014 Destino OFFLINE*\n\n` +
          `\u{1F4CD} Probe: *${probeName}*\n` +
          `\u{1F3AF} Destino: *${dest.name}* (\`${dest.host}\`)\n` +
          `\u274C Falhas consecutivas: *${newCount}*\n` +
          `\u{1F4CA} Perda de pacotes: *${result.packetLoss}%*\n` +
          `\u23F1 Lat\u00eancia: *${result.latencyMs}ms*`;
        await sendTelegramMessage(msg);
        console.log(`[LinuxMonitor] Alerta Telegram: ${dest.name} offline ap\u00f3s ${newCount} falhas`);
      }
    } else {
      if (alertSent.get(dest.id)) {
        alertSent.set(dest.id, false);
        const msg =
          `\u{1F7E2} *Monitor Linux \u2014 Destino RECUPERADO*\n\n` +
          `\u{1F4CD} Probe: *${probeName}*\n` +
          `\u{1F3AF} Destino: *${dest.name}* (\`${dest.host}\`)\n` +
          `\u2705 Destino voltou ao normal\n` +
          `\u{1F4CA} Perda: *${result.packetLoss}%* | Lat\u00eancia: *${result.latencyMs}ms*`;
        await sendTelegramMessage(msg);
        console.log(`[LinuxMonitor] Recupera\u00e7\u00e3o: ${dest.name}`);
      }
      failureCount.set(dest.id, 0);
    }
  } else {
    failureCount.set(dest.id, isOffline ? currentFailures + 1 : 0);
  }

  // ── Latency/loss threshold alert ───────────────────────────────────────
  if (!isOffline) {
    const latencyExceeded = dest.latencyThreshold > 0 && result.latencyMs > dest.latencyThreshold;
    const lossExceeded = dest.lossThreshold > 0 && result.packetLoss > dest.lossThreshold;

    if ((latencyExceeded || lossExceeded) && !thresholdAlertSent.get(dest.id)) {
      thresholdAlertSent.set(dest.id, true);
      const reasons: string[] = [];
      if (latencyExceeded) reasons.push(`Lat\u00eancia *${result.latencyMs}ms* > limiar *${dest.latencyThreshold}ms*`);
      if (lossExceeded) reasons.push(`Perda *${result.packetLoss}%* > limiar *${dest.lossThreshold}%*`);
      const msg =
        `\u26A0\uFE0F *Monitor Linux \u2014 Limiar Excedido*\n\n` +
        `\u{1F4CD} Probe: *${probeName}*\n` +
        `\u{1F3AF} Destino: *${dest.name}* (\`${dest.host}\`)\n` +
        reasons.map(r => `\u2022 ${r}`).join("\n");
      await sendTelegramMessage(msg);
      console.log(`[LinuxMonitor] Alerta de limiar: ${dest.name}`);
    } else if (!latencyExceeded && !lossExceeded && thresholdAlertSent.get(dest.id)) {
      thresholdAlertSent.set(dest.id, false);
      const msg =
        `\u2705 *Monitor Linux \u2014 Limiar Normalizado*\n\n` +
        `\u{1F4CD} Probe: *${probeName}*\n` +
        `\u{1F3AF} Destino: *${dest.name}* (\`${dest.host}\`)\n` +
        `\u{1F4CA} Perda: *${result.packetLoss}%* | Lat\u00eancia: *${result.latencyMs}ms*`;
      await sendTelegramMessage(msg);
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
      // Get independent destinations for this probe
      const dests = await db
        .select()
        .from(linuxDestinations)
        .where(and(eq(linuxDestinations.probeId, probe.id), eq(linuxDestinations.active, true)));

      if (dests.length === 0) {
        continue;
      }

      for (const dest of dests) {
        // Check if it's time to run this destination based on its individual frequency
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

        // Handle Telegram alerts per destination
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
  // Run immediately then on interval (short interval to check individual frequencies)
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
