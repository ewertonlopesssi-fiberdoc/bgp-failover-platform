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
