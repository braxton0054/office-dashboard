const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

// Upsert agent (POST from VPS)
router.post('/', async (req, res) => {
  try {
    const { id, name, role, channel, status, model, tokens_used, session_key, last_active } = req.body;
    if (!id || !name) return res.status(400).json({ error: 'id and name required' });

    const result = await pool.query(`
      INSERT INTO agents (id, name, role, channel, status, model, tokens_used, session_key, last_active, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        channel = EXCLUDED.channel,
        status = EXCLUDED.status,
        model = EXCLUDED.model,
        tokens_used = EXCLUDED.tokens_used,
        session_key = EXCLUDED.session_key,
        last_active = EXCLUDED.last_active,
        updated_at = NOW()
      RETURNING *
    `, [id, name, role || '', channel || '', status || 'offline', model || '', tokens_used || 0, session_key || '', last_active || null]);

    res.json(result.rows[0]);
  } catch (err) {
    console.error('[POST /api/agents]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// List all agents
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT *, EXTRACT(EPOCH FROM (NOW() - COALESCE(last_active, updated_at))) / 60 AS minutes_since_active
      FROM agents ORDER BY status != 'offline' DESC, updated_at DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('[GET /api/agents]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Get single agent
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM agents WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete agent
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM agents WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
