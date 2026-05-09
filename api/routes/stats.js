const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

// Push system snapshot (POST from VPS)
router.post('/system', async (req, res) => {
  try {
    const { hostname, cpu_load, ram_used_pct, ram_total, disk_used_pct, uptime_seconds, gateway_status, agents_online, agents_total } = req.body;

    const result = await pool.query(`
      INSERT INTO system_snapshots (hostname, cpu_load, ram_used_pct, ram_total, disk_used_pct, uptime_seconds, gateway_status, agents_online, agents_total)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [
      hostname || '', cpu_load || 0, ram_used_pct || 0,
      ram_total || 0, disk_used_pct || '', uptime_seconds || 0,
      gateway_status || 'unknown', agents_online || 0, agents_total || 0
    ]);

    // Keep only last 1000 snapshots
    await pool.query('DELETE FROM system_snapshots WHERE id < (SELECT MAX(id) - 1000 FROM system_snapshots)');

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[POST /api/stats/system]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get latest system stats
router.get('/system', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM system_snapshots ORDER BY recorded_at DESC LIMIT 1');
    res.json(result.rows[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get system history (for charts)
router.get('/system/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const result = await pool.query(
      'SELECT * FROM system_snapshots ORDER BY recorded_at DESC LIMIT $1',
      [limit]
    );
    res.json(result.rows.reverse());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard summary
router.get('/summary', async (req, res) => {
  try {
    const [agentResult, activityResult, sysResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE status != 'offline') AS online,
          COALESCE(SUM(tokens_used), 0) AS total_tokens
        FROM agents
      `),
      pool.query('SELECT COUNT(*) AS count FROM activity WHERE created_at > NOW() - INTERVAL \'24 hours\''),
      pool.query('SELECT * FROM system_snapshots ORDER BY recorded_at DESC LIMIT 1'),
    ]);

    res.json({
      agents: agentResult.rows[0],
      activity24h: parseInt(activityResult.rows[0].count),
      system: sysResult.rows[0] || null,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
