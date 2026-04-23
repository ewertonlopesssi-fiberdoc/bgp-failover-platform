import mysql from 'mysql2/promise';

const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }

// Parse mysql://user:pass@host:port/db
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (!m) { console.error('Invalid DATABASE_URL format'); process.exit(1); }
const [, user, password, host, port, database] = m;

const conn = await mysql.createConnection({ host, port: Number(port), user, password, database });

const sqls = [
  "ALTER TABLE telegram_config ADD COLUMN IF NOT EXISTS latencyThreshold int DEFAULT 50 NOT NULL",
  "ALTER TABLE telegram_config ADD COLUMN IF NOT EXISTS packetLossThreshold float DEFAULT 5 NOT NULL",
];

for (const sql of sqls) {
  try {
    await conn.execute(sql);
    console.log('OK:', sql.substring(0, 60));
  } catch (e) {
    if (e.code === 'ER_DUP_FIELDNAME') {
      console.log('SKIP (already exists):', sql.substring(0, 60));
    } else {
      console.error('ERROR:', e.message);
    }
  }
}

await conn.end();
console.log('Migration done.');
