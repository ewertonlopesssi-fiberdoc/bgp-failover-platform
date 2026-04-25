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

// Linux Destinations — independent targets for direct Debian monitoring
export const linuxDestinations = mysqlTable("linux_destinations", {
  id: int("id").autoincrement().primaryKey(),
  probeId: int("probeId").notNull(), // FK to linux_probes
  name: varchar("name", { length: 100 }).notNull(),
  host: varchar("host", { length: 255 }).notNull(),
  packetSize: int("packetSize").default(32).notNull(),   // bytes
  packetCount: int("packetCount").default(5).notNull(),  // probes per run
  frequency: int("frequency").default(30).notNull(),     // seconds between runs
  // Telegram alert settings per destination
  offlineAlert: mysqlEnum("offlineAlert", ["never", "1", "2", "3", "5"]).default("never").notNull(), // consecutive failures before alert
  latencyThreshold: int("latencyThreshold").default(0).notNull(),   // ms, 0 = disabled
  lossThreshold: int("lossThreshold").default(0).notNull(),          // %, 0 = disabled
  alertRepeatMinutes: int("alertRepeatMinutes").default(5).notNull(), // minutes between repeat alerts during incident
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type LinuxDestination = typeof linuxDestinations.$inferSelect;

// Linux Destination Metrics — results from direct ping probes per destination
export const linuxDestMetrics = mysqlTable("linux_dest_metrics", {
  id: int("id").autoincrement().primaryKey(),
  destinationId: int("destinationId").notNull(),
  probeId: int("probeId").notNull(),
  latencyMs: float("latencyMs").notNull(),
  packetLoss: float("packetLoss").default(0).notNull(),
  measuredAt: timestamp("measuredAt").defaultNow().notNull(),
});
export type LinuxDestMetric = typeof linuxDestMetrics.$inferSelect;
// Linux Incidents — persistent incident history per destination
export const linuxIncidents = mysqlTable("linux_incidents", {
  id: int("id").autoincrement().primaryKey(),
  destinationId: int("destinationId").notNull(),
  probeId: int("probeId").notNull(),
  type: mysqlEnum("type", ["offline", "latency", "loss", "both"]).notNull(), // type of incident
  startedAt: timestamp("startedAt").notNull(),
  endedAt: timestamp("endedAt"),                // null = still ongoing
  avgLatencyMs: float("avgLatencyMs").default(0).notNull(),
  avgLoss: float("avgLoss").default(0).notNull(),
  maxLatencyMs: float("maxLatencyMs").default(0).notNull(),
  maxLoss: float("maxLoss").default(0).notNull(),
  resolved: boolean("resolved").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type LinuxIncident = typeof linuxIncidents.$inferSelect;
// Audit / event logg
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

// Interface traffic configurations (LibreNMS port labels, contracted plans, alert thresholds)
export const interfaceConfigs = mysqlTable("interface_configs", {
  id: int("id").autoincrement().primaryKey(),
  portId: int("portId").notNull().unique(),
  ifName: varchar("ifName", { length: 100 }).notNull(),
  label: varchar("label", { length: 150 }).notNull(),
  category: mysqlEnum("category", ["upstream", "dedicated"]).default("dedicated").notNull(),
  city: varchar("city", { length: 100 }),
  clientIp: varchar("clientIp", { length: 45 }),  // IP do cliente (.2 do /30)
  contractedBps: float("contractedBps").default(0).notNull(),  // 0 = use link speed
  alertThreshold: int("alertThreshold").default(80).notNull(), // % of contractedBps (or link speed)
  alertEnabled: boolean("alertEnabled").default(false).notNull(),
  visible: boolean("visible").default(true).notNull(),
  lastAlertAt: timestamp("lastAlertAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type InterfaceConfig = typeof interfaceConfigs.$inferSelect;
export type InsertInterfaceConfig = typeof interfaceConfigs.$inferInsert;

// Latency history — ping RTT per client interface over time
export const latencyHistory = mysqlTable("latency_history", {
  id: int("id").autoincrement().primaryKey(),
  portId: int("portId").notNull(),
  latencyMs: float("latencyMs"),  // null = timeout/unreachable
  status: varchar("status", { length: 20 }).default("ok").notNull(), // ok | timeout | error
  measuredAt: timestamp("measuredAt").defaultNow().notNull(),
});

export type LatencyHistory = typeof latencyHistory.$inferSelect;

// Network topology nodes (switches, routers, OLTs on the map)
export const networkNodes = mysqlTable("network_nodes", {
  id: int("id").autoincrement().primaryKey(),
  deviceId: int("deviceId"),           // LibreNMS device_id (optional)
  name: varchar("name", { length: 150 }).notNull(),
  city: varchar("city", { length: 100 }),
  lat: float("lat"),                   // GPS latitude
  lng: float("lng"),                   // GPS longitude
  nodeType: mysqlEnum("nodeType", ["router", "switch", "olt", "server", "pop"]).default("switch").notNull(),
  mgmtIp: varchar("mgmtIp", { length: 45 }),  // management IP
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NetworkNode = typeof networkNodes.$inferSelect;
export type InsertNetworkNode = typeof networkNodes.$inferInsert;

// Network topology links (connections between nodes)
export const networkLinks = mysqlTable("network_links", {
  id: int("id").autoincrement().primaryKey(),
  fromNodeId: int("fromNodeId").notNull(),
  fromPortId: int("fromPortId"),       // LibreNMS port_id for traffic data
  fromPortName: varchar("fromPortName", { length: 100 }),
  toNodeId: int("toNodeId").notNull(),
  toPortId: int("toPortId"),           // LibreNMS port_id for traffic data
  toPortName: varchar("toPortName", { length: 100 }),
  linkType: mysqlEnum("linkType", ["fiber", "radio", "copper", "vpn"]).default("fiber").notNull(),
  capacityBps: float("capacityBps"),   // link capacity in bps (0 = unknown)
  useRoadRoute: boolean("useRoadRoute").default(false).notNull(), // follow road routing via OSRM
  routePoints: json("routePoints").$type<Array<[number, number]>>(), // cached OSRM route points [[lat,lng],...]
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type NetworkLink = typeof networkLinks.$inferSelect;
export type InsertNetworkLink = typeof networkLinks.$inferInsert;

// Each link can have multiple destination segments (1 link → N destinations)
export const networkLinkSegments = mysqlTable("network_link_segments", {
  id: int("id").autoincrement().primaryKey(),
  linkId: int("linkId").notNull(),      // references network_links.id
  toNodeId: int("toNodeId").notNull(),
  toPortId: int("toPortId"),            // LibreNMS port_id at destination
  toPortName: varchar("toPortName", { length: 100 }),
  routePoints: json("routePoints").$type<Array<[number, number]>>(), // OSRM route for this segment
  color: varchar("color", { length: 20 }),   // override color for this segment
  capacityBps: float("capacityBps"),         // override capacity for this segment
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type NetworkLinkSegment = typeof networkLinkSegments.$inferSelect;
export type InsertNetworkLinkSegment = typeof networkLinkSegments.$inferInsert;

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

// Map customers: end-clients shown on the network topology map
export const mapCustomers = mysqlTable("map_customers", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  address: text("address"),              // human-readable address (optional)
  lat: float("lat"),                     // GPS latitude
  lng: float("lng"),                     // GPS longitude
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type MapCustomer = typeof mapCustomers.$inferSelect;
export type InsertMapCustomer = typeof mapCustomers.$inferInsert;

// Customer access links: connection from a customer to a network node (switch/router)
export const customerAccessLinks = mysqlTable("customer_access_links", {
  id: int("id").autoincrement().primaryKey(),
  customerId: int("customerId").notNull(),   // references map_customers.id
  nodeId: int("nodeId").notNull(),           // references network_nodes.id
  portId: int("portId"),                     // LibreNMS port_id for traffic monitoring
  portName: varchar("portName", { length: 100 }),
  linkType: mysqlEnum("linkType", ["fiber", "radio", "copper", "vpn"]).default("fiber").notNull(),
  capacityBps: float("capacityBps"),
  useRoadRoute: boolean("useRoadRoute").default(true).notNull(),
  routePoints: json("routePoints").$type<Array<[number, number]>>(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type CustomerAccessLink = typeof customerAccessLinks.$inferSelect;
export type InsertCustomerAccessLink = typeof customerAccessLinks.$inferInsert;
