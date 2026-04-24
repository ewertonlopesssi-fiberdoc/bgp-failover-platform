import { eq, desc, and, gte } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  localUsers, InsertLocalUser,
  ne8000Config, operators, destinations,
  telegramConfig, dedicatedClients, clientDestinations,
  latencyMetrics, auditLogs, clientFailoverState,
  linuxProbes, linuxMetrics, LinuxProbe,
  linuxDestinations, linuxDestMetrics, LinuxDestination,
  linuxIncidents,
  interfaceConfigs, InsertInterfaceConfig,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── OAuth Users ─────────────────────────────────────────────────────────────
export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;
  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  textFields.forEach((field) => {
    const value = user[field];
    if (value === undefined) return;
    const normalized = value ?? null;
    values[field] = normalized;
    updateSet[field] = normalized;
  });
  if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
  if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
  else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Local Auth Users ─────────────────────────────────────────────────────────
export async function getLocalUserByUsername(username: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(localUsers).where(eq(localUsers.username, username)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getLocalUserById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(localUsers).where(eq(localUsers.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function listLocalUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: localUsers.id,
    username: localUsers.username,
    name: localUsers.name,
    email: localUsers.email,
    role: localUsers.role,
    active: localUsers.active,
    createdAt: localUsers.createdAt,
    lastSignedIn: localUsers.lastSignedIn,
  }).from(localUsers).orderBy(desc(localUsers.createdAt));
}

export async function createLocalUser(data: InsertLocalUser) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(localUsers).values(data);
}

export async function updateLocalUser(id: number, data: Partial<InsertLocalUser>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(localUsers).set(data).where(eq(localUsers.id, id));
}

export async function deleteLocalUser(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(localUsers).where(eq(localUsers.id, id));
}

export async function updateLocalUserLastSignedIn(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(localUsers).set({ lastSignedIn: new Date() }).where(eq(localUsers.id, id));
}

export async function countLocalUsers() {
  const db = await getDb();
  if (!db) return 0;
  const result = await db.select({ id: localUsers.id }).from(localUsers);
  return result.length;
}

// ─── Ne8000 Config ────────────────────────────────────────────────────────────
export async function getNe8000Config() {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(ne8000Config).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function saveNe8000Config(data: {
  host: string; port: number; username: string;
  sshKeyPath?: string; password?: string; asNumber?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await getNe8000Config();
  if (existing) {
    await db.update(ne8000Config).set(data).where(eq(ne8000Config.id, existing.id));
  } else {
    await db.insert(ne8000Config).values(data);
  }
}

// ─── Operators ────────────────────────────────────────────────────────────────
export async function listOperators() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(operators).orderBy(operators.id);
}

export async function createOperator(data: {
  name: string; interface: string; sourceIp: string; peerIp: string; asNumber?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(operators).values(data);
}

export async function updateOperator(id: number, data: Partial<typeof operators.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(operators).set(data).where(eq(operators.id, id));
}

export async function deleteOperator(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(operators).where(eq(operators.id, id));
}

// ─── Destinations ─────────────────────────────────────────────────────────────
export async function listDestinations(operatorId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (operatorId !== undefined) {
    return db.select().from(destinations).where(eq(destinations.operatorId, operatorId));
  }
  return db.select().from(destinations);
}

export async function createDestination(data: { operatorId: number; name: string; host: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(destinations).values(data);
}

export async function updateDestination(id: number, data: { operatorId?: number; name?: string; host?: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(destinations).set(data).where(eq(destinations.id, id));
}

export async function deleteDestination(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(destinations).where(eq(destinations.id, id));
}

// ─── Telegram Config ──────────────────────────────────────────────────────────
export async function getTelegramConfig() {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(telegramConfig).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function saveTelegramConfig(data: {
  botToken?: string; chatId?: string; enabled: boolean;
  notifyFailover: boolean; notifyRecovery: boolean;
  notifyHighLatency: boolean; notifyBgpDown: boolean;
  latencyThreshold?: number; packetLossThreshold?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const existing = await getTelegramConfig();
  if (existing) {
    await db.update(telegramConfig).set(data).where(eq(telegramConfig.id, existing.id));
  } else {
    await db.insert(telegramConfig).values(data);
  }
}

// ─── Dedicated Clients ────────────────────────────────────────────────────────
export async function listDedicatedClients() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dedicatedClients).orderBy(desc(dedicatedClients.createdAt));
}

export async function getDedicatedClientById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(dedicatedClients).where(eq(dedicatedClients.id, id)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function createDedicatedClient(data: {
  name: string; prefix: string; description?: string;
  failoverEnabled: boolean; latencyThreshold: number;
  packetLossThreshold: number; prependCount: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(dedicatedClients).values(data);
}

export async function updateDedicatedClient(id: number, data: Partial<typeof dedicatedClients.$inferInsert>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(dedicatedClients).set(data).where(eq(dedicatedClients.id, id));
}

export async function deleteDedicatedClient(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(dedicatedClients).where(eq(dedicatedClients.id, id));
  await db.delete(clientDestinations).where(eq(clientDestinations.clientId, id));
  await db.delete(clientFailoverState).where(eq(clientFailoverState.clientId, id));
}

// ─── Client Destinations ──────────────────────────────────────────────────────
export async function listClientDestinations(clientId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(clientDestinations).where(eq(clientDestinations.clientId, clientId));
}

export async function createClientDestination(data: { clientId: number; name: string; host: string }) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(clientDestinations).values(data);
}

export async function deleteClientDestination(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(clientDestinations).where(eq(clientDestinations.id, id));
}

// ─── Latency Metrics ──────────────────────────────────────────────────────────
export async function addLatencyMetric(data: {
  operatorId: number; destinationId: number;
  latencyMs: number; packetLoss: number; jitterMs: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.insert(latencyMetrics).values(data);
}

export async function getLatencyMetrics(operatorId?: number, destinationId?: number, hours = 24) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const conditions = [gte(latencyMetrics.measuredAt, since)];
  if (operatorId !== undefined) conditions.push(eq(latencyMetrics.operatorId, operatorId));
  if (destinationId !== undefined) conditions.push(eq(latencyMetrics.destinationId, destinationId));
  return db.select().from(latencyMetrics)
    .where(and(...conditions))
    .orderBy(desc(latencyMetrics.measuredAt))
    .limit(500);
}

// ─── Audit Logs ───────────────────────────────────────────────────────────────
export async function addAuditLog(data: {
  type: "failover" | "recovery" | "config_change" | "alert" | "service" | "auth" | "info";
  severity: "info" | "warning" | "critical" | "success";
  title: string; description?: string; metadata?: unknown; userId?: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(auditLogs).values(data as typeof auditLogs.$inferInsert);
}

export async function listAuditLogs(limit = 100) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(limit);
}

// ─── Client Failover State ────────────────────────────────────────────────────
export async function getClientFailoverState(clientId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(clientFailoverState).where(eq(clientFailoverState.clientId, clientId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

// ─── Limpeza de Métricas ──────────────────────────────────────────────────────
export async function clearLatencyMetrics(operatorId?: number) {
  const db = await getDb();
  if (!db) return 0;
  if (operatorId !== undefined) {
    const result = await db.delete(latencyMetrics).where(eq(latencyMetrics.operatorId, operatorId));
    return (result as any)[0]?.affectedRows ?? 0;
  }
  const result = await db.delete(latencyMetrics);
  return (result as any)[0]?.affectedRows ?? 0;
}

// ─── Linux Probes ────────────────────────────────────────────────────────────────────────────────
export async function listLinuxProbes() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(linuxProbes).orderBy(linuxProbes.createdAt);
}
export async function addLinuxProbe(data: { operatorId: number; name: string; sourceIp: string }) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(linuxProbes).values({ ...data, active: true });
  const id = (result as any)[0]?.insertId;
  return id ? { id, ...data, active: true } : null;
}
export async function removeLinuxProbe(id: number) {
  const db = await getDb();
  if (!db) return;
  await db.delete(linuxProbes).where(eq(linuxProbes.id, id));
  // Also clean up metrics
  await db.delete(linuxMetrics).where(eq(linuxMetrics.probeId, id));
}
export async function toggleLinuxProbe(id: number, active: boolean) {
  const db = await getDb();
  if (!db) return;
  await db.update(linuxProbes).set({ active }).where(eq(linuxProbes.id, id));
}

// ─── Linux Metrics ─────────────────────────────────────────────────────────────────────────────
export async function listLinuxMetrics(params: {
  operatorId?: number;
  probeId?: number;
  destinationId?: number;
  hours?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - (params.hours ?? 6) * 3600 * 1000);
  const conditions = [gte(linuxMetrics.measuredAt, since)];
  if (params.operatorId) conditions.push(eq(linuxMetrics.operatorId, params.operatorId));
  if (params.probeId) conditions.push(eq(linuxMetrics.probeId, params.probeId));
  if (params.destinationId) conditions.push(eq(linuxMetrics.destinationId, params.destinationId));
  return db
    .select()
    .from(linuxMetrics)
    .where(and(...conditions))
    .orderBy(desc(linuxMetrics.measuredAt))
    .limit(1000);
}
export async function clearLinuxMetrics(probeId?: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = probeId
    ? await db.delete(linuxMetrics).where(eq(linuxMetrics.probeId, probeId))
    : await db.delete(linuxMetrics);
  return (result as any)[0]?.affectedRows ?? 0;
}

// ─── Linux Destinations ────────────────────────────────────────────────────────────────────────
export async function listLinuxDestinations(probeId?: number) {
  const db = await getDb();
  if (!db) return [];
  if (probeId !== undefined) {
    return db.select().from(linuxDestinations).where(eq(linuxDestinations.probeId, probeId)).orderBy(linuxDestinations.name);
  }
  return db.select().from(linuxDestinations).orderBy(linuxDestinations.name);
}

export async function getLinuxDestination(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(linuxDestinations).where(eq(linuxDestinations.id, id));
  return rows[0] ?? null;
}

export async function createLinuxDestination(data: {
  probeId: number;
  name: string;
  host: string;
  packetSize?: number;
  packetCount?: number;
  frequency?: number;
  offlineAlert?: "never" | "1" | "2" | "3" | "5";
  latencyThreshold?: number;
  lossThreshold?: number;
}) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  const result = await db.insert(linuxDestinations).values({
    probeId: data.probeId,
    name: data.name,
    host: data.host,
    packetSize: data.packetSize ?? 32,
    packetCount: data.packetCount ?? 5,
    frequency: data.frequency ?? 30,
    offlineAlert: data.offlineAlert ?? "never",
    latencyThreshold: data.latencyThreshold ?? 0,
    lossThreshold: data.lossThreshold ?? 0,
    active: true,
  });
  return (result as any)[0]?.insertId as number;
}
export async function updateLinuxDestination(id: number, data: Partial<{
  name: string;
  host: string;
  packetSize: number;
  packetCount: number;
  frequency: number;
  offlineAlert: "never" | "1" | "2" | "3" | "5";
  latencyThreshold: number;
  lossThreshold: number;
  active: boolean;
}>) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.update(linuxDestinations).set(data).where(eq(linuxDestinations.id, id));
}

export async function deleteLinuxDestination(id: number) {
  const db = await getDb();
  if (!db) throw new Error("DB not available");
  await db.delete(linuxDestMetrics).where(eq(linuxDestMetrics.destinationId, id));
  await db.delete(linuxDestinations).where(eq(linuxDestinations.id, id));
}

// ─── Linux Destination Metrics ─────────────────────────────────────────────────────────────────
export async function addLinuxDestMetric(data: {
  destinationId: number;
  probeId: number;
  latencyMs: number;
  packetLoss: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.insert(linuxDestMetrics).values({ ...data, measuredAt: new Date() });
}

export async function listLinuxDestMetrics(params: {
  destinationId?: number;
  probeId?: number;
  hours?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const since = new Date(Date.now() - (params.hours ?? 6) * 3600 * 1000);
  const conditions = [gte(linuxDestMetrics.measuredAt, since)];
  if (params.destinationId) conditions.push(eq(linuxDestMetrics.destinationId, params.destinationId));
  if (params.probeId) conditions.push(eq(linuxDestMetrics.probeId, params.probeId));
  return db
    .select()
    .from(linuxDestMetrics)
    .where(and(...conditions))
    .orderBy(desc(linuxDestMetrics.measuredAt))
    .limit(2000);
}

export async function clearLinuxDestMetrics(destinationId?: number) {
  const db = await getDb();
  if (!db) return 0;
  const result = destinationId
    ? await db.delete(linuxDestMetrics).where(eq(linuxDestMetrics.destinationId, destinationId))
    : await db.delete(linuxDestMetrics);
  return (result as any)[0]?.affectedRows ?? 0;
}
// ─── Linux Incidents ───────────────────────────────────────────────────────────────────────────────────────
export async function createLinuxIncident(data: {
  destinationId: number;
  probeId: number;
  type: "offline" | "latency" | "loss" | "both";
  startedAt: Date;
}) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(linuxIncidents).values({
    ...data,
    avgLatencyMs: 0,
    avgLoss: 0,
    maxLatencyMs: 0,
    maxLoss: 0,
    resolved: false,
  });
  return (result as any)[0]?.insertId as number | undefined;
}
export async function resolveLinuxIncident(id: number, data: {
  endedAt: Date;
  avgLatencyMs: number;
  avgLoss: number;
  maxLatencyMs: number;
  maxLoss: number;
}) {
  const db = await getDb();
  if (!db) return;
  await db.update(linuxIncidents)
    .set({ ...data, resolved: true })
    .where(eq(linuxIncidents.id, id));
}
export async function listLinuxIncidents(params: {
  probeId?: number;
  destinationId?: number;
  limit?: number;
}) {
  const db = await getDb();
  if (!db) return [];
  const conditions: any[] = [];
  if (params.probeId) conditions.push(eq(linuxIncidents.probeId, params.probeId));
  if (params.destinationId) conditions.push(eq(linuxIncidents.destinationId, params.destinationId));
  const rows = await db
    .select({
      id: linuxIncidents.id,
      destinationId: linuxIncidents.destinationId,
      probeId: linuxIncidents.probeId,
      type: linuxIncidents.type,
      startedAt: linuxIncidents.startedAt,
      endedAt: linuxIncidents.endedAt,
      avgLatencyMs: linuxIncidents.avgLatencyMs,
      avgLoss: linuxIncidents.avgLoss,
      maxLatencyMs: linuxIncidents.maxLatencyMs,
      maxLoss: linuxIncidents.maxLoss,
      resolved: linuxIncidents.resolved,
      createdAt: linuxIncidents.createdAt,
      destinationName: linuxDestinations.name,
      destinationHost: linuxDestinations.host,
      probeName: linuxProbes.name,
    })
    .from(linuxIncidents)
    .leftJoin(linuxDestinations, eq(linuxIncidents.destinationId, linuxDestinations.id))
    .leftJoin(linuxProbes, eq(linuxIncidents.probeId, linuxProbes.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(linuxIncidents.startedAt))
    .limit(params.limit ?? 100);
  return rows;
}

// ─── Interface Configs ────────────────────────────────────────────────────────
export async function getAllInterfaceConfigs() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(interfaceConfigs).orderBy(interfaceConfigs.category, interfaceConfigs.ifName);
}

export async function upsertInterfaceConfig(data: InsertInterfaceConfig) {
  const db = await getDb();
  if (!db) return;
  await db.insert(interfaceConfigs).values(data).onDuplicateKeyUpdate({
    set: {
      label: data.label,
      category: data.category,
      city: data.city,
      contractedBps: data.contractedBps,
      alertThreshold: data.alertThreshold,
      alertEnabled: data.alertEnabled,
    },
  });
}

export async function updateInterfaceAlertTime(portId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(interfaceConfigs)
    .set({ lastAlertAt: new Date() })
    .where(eq(interfaceConfigs.portId, portId));
}
