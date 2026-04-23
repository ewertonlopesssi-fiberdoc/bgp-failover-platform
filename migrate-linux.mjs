import mysql from "mysql2/promise";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(url);

const sqls = [
  `CREATE TABLE IF NOT EXISTS \`linux_probes\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`operatorId\` int NOT NULL,
    \`name\` varchar(100) NOT NULL,
    \`sourceIp\` varchar(45) NOT NULL,
    \`active\` boolean NOT NULL DEFAULT true,
    \`createdAt\` timestamp NOT NULL DEFAULT (now()),
    \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT \`linux_probes_id\` PRIMARY KEY(\`id\`)
  )`,
  `CREATE TABLE IF NOT EXISTS \`linux_metrics\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`probeId\` int NOT NULL,
    \`operatorId\` int NOT NULL,
    \`destinationId\` int NOT NULL,
    \`latencyMs\` float NOT NULL,
    \`packetLoss\` float NOT NULL DEFAULT 0,
    \`measuredAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`linux_metrics_id\` PRIMARY KEY(\`id\`)
  )`,
];

for (const sql of sqls) {
  console.log("Executing:", sql.trim().split("\n")[0]);
  await conn.execute(sql);
  console.log("  OK");
}

await conn.end();
console.log("Migration complete!");
