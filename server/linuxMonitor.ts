/**
 * Linux Monitor — executes ping directly on the Debian server using
 * a specific source IP (loopback) per operator, independent of Ne8000 NQA.
 *
 * Uses: ping -I <sourceIp> -c 5 -W 2 -q <destination>
 * Requires: the sourceIp must be configured as a loopback address on the host.
 */

import { exec } from "child_process";
import { promisify } from "util";
import { drizzle } from "drizzle-orm/mysql2";
import { eq, and, gte, desc } from "drizzle-orm";
import { linuxProbes, linuxMetrics, destinations, operators } from "../drizzle/schema";

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
    // Check if already configured
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

async function runPing(sourceIp: string, destination: string, count = 5): Promise<PingResult> {
  try {
    // -I: source interface/IP, -c: count, -W: timeout per probe (secs), -q: quiet
    const { stdout } = await execAsync(
      `ping -I ${sourceIp} -c ${count} -W 2 -q ${destination} 2>&1`,
      { timeout: (count + 2) * 3000 }
    );

    // Parse packet loss: "5 packets transmitted, 4 received, 20% packet loss"
    const lossMatch = stdout.match(/(\d+(?:\.\d+)?)%\s+packet\s+loss/i);
    const packetLoss = lossMatch ? parseFloat(lossMatch[1]) : 100;

    // Parse RTT: "rtt min/avg/max/mdev = 1.234/2.345/3.456/0.123 ms"
    const rttMatch = stdout.match(/rtt\s+min\/avg\/max\/mdev\s*=\s*[\d.]+\/([\d.]+)\//i);
    const latencyMs = rttMatch ? parseFloat(rttMatch[1]) : 0;

    return { latencyMs, packetLoss, success: packetLoss < 100 };
  } catch (err: any) {
    // ping returns exit code 1 when all packets lost — still parse output
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

export async function runLinuxMonitorCycle() {
  const db = getDb();
  if (!db) return;

  try {
    // Get all active probes with their operators
    const probes = await db
      .select()
      .from(linuxProbes)
      .where(eq(linuxProbes.active, true));

    if (probes.length === 0) return;

    for (const probe of probes) {
      // Get destinations for this operator
      const dests = await db
        .select()
        .from(destinations)
        .where(and(eq(destinations.operatorId, probe.operatorId), eq(destinations.active, true)));

      if (dests.length === 0) {
        console.log(`[LinuxMonitor] Probe ${probe.name} (${probe.sourceIp}): sem destinos configurados`);
        continue;
      }

      for (const dest of dests) {
        const result = await runPing(probe.sourceIp, dest.host);
        console.log(
          `[LinuxMonitor] ${probe.name} → ${dest.host}: RTT=${result.latencyMs}ms, perda=${result.packetLoss}%`
        );

        await db.insert(linuxMetrics).values({
          probeId: probe.id,
          operatorId: probe.operatorId,
          destinationId: dest.id,
          latencyMs: result.latencyMs,
          packetLoss: result.packetLoss,
          measuredAt: new Date(),
        });
      }
    }
  } catch (err: any) {
    console.error("[LinuxMonitor] Erro no ciclo:", err.message);
  }
}

export function startLinuxMonitor(intervalSeconds = 60) {
  if (monitorInterval) return;
  isRunning = true;
  console.log(`[LinuxMonitor] Iniciando com intervalo de ${intervalSeconds}s`);
  // Run immediately then on interval
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
