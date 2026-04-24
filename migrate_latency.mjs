import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

const conn = await mysql.createConnection(url);
await conn.execute(`
  CREATE TABLE IF NOT EXISTS \`latency_history\` (
    \`id\` int AUTO_INCREMENT NOT NULL,
    \`portId\` int NOT NULL,
    \`latencyMs\` float,
    \`status\` varchar(20) NOT NULL DEFAULT 'ok',
    \`measuredAt\` timestamp NOT NULL DEFAULT (now()),
    CONSTRAINT \`latency_history_id\` PRIMARY KEY(\`id\`)
  )
`);
console.log('latency_history table created OK');
await conn.end();
