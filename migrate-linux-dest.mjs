import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error("DATABASE_URL not set"); process.exit(1); }

const url = new URL(DB_URL.replace("mysql://", "http://"));
const conn = await createConnection({
  host: url.hostname,
  port: parseInt(url.port) || 3306,
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  multipleStatements: true,
});

const sql = `
CREATE TABLE IF NOT EXISTS \`linux_destinations\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`probeId\` int NOT NULL,
  \`name\` varchar(100) NOT NULL,
  \`host\` varchar(255) NOT NULL,
  \`packetSize\` int NOT NULL DEFAULT 32,
  \`packetCount\` int NOT NULL DEFAULT 5,
  \`frequency\` int NOT NULL DEFAULT 30,
  \`offlineAlert\` enum('never','always','threshold') NOT NULL DEFAULT 'threshold',
  \`active\` boolean NOT NULL DEFAULT true,
  \`createdAt\` timestamp NOT NULL DEFAULT (now()),
  \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT \`linux_destinations_id\` PRIMARY KEY(\`id\`)
);

CREATE TABLE IF NOT EXISTS \`linux_dest_metrics\` (
  \`id\` int AUTO_INCREMENT NOT NULL,
  \`destinationId\` int NOT NULL,
  \`probeId\` int NOT NULL,
  \`latencyMs\` float NOT NULL,
  \`packetLoss\` float NOT NULL DEFAULT 0,
  \`measuredAt\` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT \`linux_dest_metrics_id\` PRIMARY KEY(\`id\`)
);
`;

try {
  await conn.execute(sql.split(";").filter(s => s.trim())[0]);
  await conn.execute(sql.split(";").filter(s => s.trim())[1]);
  console.log("✅ Tabelas linux_destinations e linux_dest_metrics criadas com sucesso");
} catch (err) {
  console.error("Erro:", err.message);
} finally {
  await conn.end();
}
