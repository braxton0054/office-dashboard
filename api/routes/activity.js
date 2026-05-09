const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

// Log activity (POST from VPS)
router.post('/', async (req, res) => {
  try {
    const { agent_id, event_type, task, tokens_used, status, metadata } = req.body;
    if (!agent_id || !event_type) return res.status(400).json({ error: 'agent_id and event_type required' });

    const result = await pool.query(`
      INSERT INTO activity (agent_id, event_type, task, tokens_used, status, metadata)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [agent_id, event_type, task || '', tokens_used || 0, status || '', JSON.stringify(metadata || {})]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[POST /api/activity]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get recent activity
router.get('/', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const result = await pool.query(`
      SELECT a.*, ag.name AS agent_name, ag.channel
      FROM activity a
      LEFT JOIN agents ag ON a.agent_id = ag.id
      ORDER BY a.created_at DESC LIMIT $1
    `, [limit]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get activity for a specific agent
router.get('/:agent_id', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const result = await pool.query(`
      SELECT a.*, ag.name AS agent_name
      FROM activity a
      LEFT JOIN agents ag ON a.agent_id = ag.id
      WHERE a.agent_id = $1
      ORDER BY a.created_at DESC LIMIT $2
    `, [req.params.agent_id, limit]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
