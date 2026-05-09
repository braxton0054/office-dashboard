const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
});

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        role TEXT DEFAULT '',
        channel TEXT DEFAULT '',
        status TEXT DEFAULT 'offline',
        model TEXT DEFAULT '',
        tokens_used BIGINT DEFAULT 0,
        session_key TEXT DEFAULT '',
        last_active TIMESTAMPTZ,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS activity (
        id SERIAL PRIMARY KEY,
        agent_id TEXT REFERENCES agents(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        task TEXT DEFAULT '',
        tokens_used BIGINT DEFAULT 0,
        status TEXT DEFAULT '',
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS system_snapshots (
        id SERIAL PRIMARY KEY,
        hostname TEXT DEFAULT '',
        cpu_load REAL DEFAULT 0,
        ram_used_pct REAL DEFAULT 0,
        ram_total BIGINT DEFAULT 0,
        disk_used_pct TEXT DEFAULT '',
        uptime_seconds BIGINT DEFAULT 0,
        gateway_status TEXT DEFAULT 'unknown',
        agents_online INT DEFAULT 0,
        agents_total INT DEFAULT 0,
        recorded_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_system_recorded ON system_snapshots(recorded_at DESC);
    `);
    console.log('[DB] Tables ready');
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
