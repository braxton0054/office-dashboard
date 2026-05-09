const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDB } = require('./db');

const app = express();
const PORT = process.env.PORT || 4001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

// API Routes
app.use('/api/agents', require('./routes/agents'));
app.use('/api/activity', require('./routes/activity'));
app.use('/api/stats', require('./routes/stats'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Serve frontend for all other routes (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Init DB & start
if (require.main === module) {
  initDB()
    .then(() => {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`\n📊 Office Dashboard running on http://0.0.0.0:${PORT}`);
        console.log(`   API: http://0.0.0.0:${PORT}/api/health`);
        console.log(`   DB: ${process.env.DATABASE_URL ? 'Connected' : 'No DATABASE_URL set'}\n`);
      });
    })
    .catch(err => {
      console.error('[FATAL] Failed to init DB:', err);
      process.exit(1);
    });
}

// Export for Vercel serverless
module.exports = app;
