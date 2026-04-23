import {
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  varchar,
  boolean,
  float,
  json,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Local auth users (separate from OAuth)
export const localUsers = mysqlTable("local_users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 64 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }).notNull(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  role: mysqlEnum("role", ["admin", "viewer"]).default("viewer").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn"),
});

export type LocalUser = typeof localUsers.$inferSelect;
export type InsertLocalUser = typeof localUsers.$inferInsert;

// Ne8000 configuration
export const ne8000Config = mysqlTable("ne8000_config", {
  id: int("id").autoincrement().primaryKey(),
  host: varchar("host", { length: 255 }).notNull(),
  port: int("port").default(22).notNull(),
  username: varchar("username", { length: 64 }).notNull(),
  sshKeyPath: text("sshKeyPath"),
  password: text("password"),
  asNumber: varchar("asNumber", { length: 20 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Operators (ISPs)
export const operators = mysqlTable("operators", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  interface: varchar("interface", { length: 100 }).notNull(),
  sourceIp: varchar("sourceIp", { length: 45 }).notNull(),
  peerIp: varchar("peerIp", { length: 45 }).notNull(),
  asNumber: varchar("asNumber", { length: 20 }),
  active: boolean("active").default(true).notNull(),
  status: mysqlEnum("status", ["up", "down", "degraded", "unknown"]).default("unknown").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Operator = typeof operators.$inferSelect;

// Monitored destinations per operator
export const destinations = mysqlTable("destinations", {
  id: int("id").autoincrement().primaryKey(),
  operatorId: int("operatorId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Destination = typeof destinations.$inferSelect;

// Telegram configuration
export const telegramConfig = mysqlTable("telegram_config", {
  id: int("id").autoincrement().primaryKey(),
  botToken: text("botToken"),
  chatId: varchar("chatId", { length: 100 }),
  enabled: boolean("enabled").default(false).notNull(),
  notifyFailover: boolean("notifyFailover").default(true).notNull(),
  notifyRecovery: boolean("notifyRecovery").default(true).notNull(),
  notifyHighLatency: boolean("notifyHighLatency").default(true).notNull(),
  notifyBgpDown: boolean("notifyBgpDown").default(true).notNull(),
  latencyThreshold: int("latencyThreshold").default(50).notNull(),
  packetLossThreshold: float("packetLossThreshold").default(5.0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

// Dedicated clients with automatic failover
export const dedicatedClients = mysqlTable("dedicated_clients", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  prefix: varchar("prefix", { length: 50 }).notNull(),
  description: text("description"),
  failoverEnabled: boolean("failoverEnabled").default(true).notNull(),
  latencyThreshold: int("latencyThreshold").default(100).notNull(),
  packetLossThreshold: float("packetLossThreshold").default(5.0).notNull(),
  prependCount: int("prependCount").default(3).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type DedicatedClient = typeof dedicatedClients.$inferSelect;

// Client monitored destinations
export const clientDestinations = mysqlTable("client_destinations", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ClientDestination = typeof clientDestinations.$inferSelect;

// Latency metrics
export const latencyMetrics = mysqlTable("latency_metrics", {
  id: int("id").autoincrement().primaryKey(),
  operatorId: int("operatorId").notNull(),
  destinationId: int("destinationId").notNull(),
  latencyMs: float("latencyMs").notNull(),
  packetLoss: float("packetLoss").default(0).notNull(),
  jitterMs: float("jitterMs").default(0).notNull(),
  measuredAt: timestamp("measuredAt").defaultNow().notNull(),
});

export type LatencyMetric = typeof latencyMetrics.$inferSelect;

// Linux Probes — loopback IPs for direct Debian monitoring
export const linuxProbes = mysqlTable("linux_probes", {
  id: int("id").autoincrement().primaryKey(),
  operatorId: int("operatorId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  sourceIp: varchar("sourceIp", { length: 45 }).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LinuxProbe = typeof linuxProbes.$inferSelect;

// Linux Metrics — results from direct ping probes
export const linuxMetrics = mysqlTable("linux_metrics", {
  id: int("id").autoincrement().primaryKey(),
  probeId: int("probeId").notNull(),
  operatorId: int("operatorId").notNull(),
  destinationId: int("destinationId").notNull(),
  latencyMs: float("latencyMs").notNull(),
  packetLoss: float("packetLoss").default(0).notNull(),
  measuredAt: timestamp("measuredAt").defaultNow().notNull(),
});
export type LinuxMetric = typeof linuxMetrics.$inferSelect;

// Audit / event log
export const auditLogs = mysqlTable("audit_logs", {
  id: int("id").autoincrement().primaryKey(),
  type: mysqlEnum("type", ["failover", "recovery", "config_change", "alert", "service", "auth", "info"]).notNull(),
  severity: mysqlEnum("severity", ["info", "warning", "critical", "success"]).default("info").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  metadata: json("metadata"),
  userId: int("userId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type AuditLog = typeof auditLogs.$inferSelect;

// Client failover state
export const clientFailoverState = mysqlTable("client_failover_state", {
  id: int("id").autoincrement().primaryKey(),
  clientId: int("clientId").notNull().unique(),
  activeOperatorId: int("activeOperatorId"),
  failoverActive: boolean("failoverActive").default(false).notNull(),
  failoverReason: text("failoverReason"),
  failoverAt: timestamp("failoverAt"),
  recoveredAt: timestamp("recoveredAt"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
