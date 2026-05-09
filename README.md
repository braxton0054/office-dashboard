# 📊 Office Dashboard

OpenClaw agent activity dashboard with Neon PostgreSQL backend.

## Architecture

```
VPS (OpenClaw)
  └─ scripts/push-agent-data.js  (poll every 30s)
       │
       │ POST /api/agents
       │ POST /api/activity
       │ POST /api/stats/system
       ▼
Vercel
  └─ api/index.js → Express API
       │
       ├─ /api/agents      → agents table (Neon PG)
       ├─ /api/activity    → activity table
       ├─ /api/stats       → system_snapshots table
       │
       └─ public/          → Dashboard frontend
```

## Setup

### 1. Vercel Deployment

```bash
# Set environment variable in Vercel dashboard:
# DATABASE_URL = your Neon connection string
```

### 2. VPS Data Pusher

On your VPS, run the pusher script:

```bash
DASHBOARD_URL=https://your-app.vercel.app node scripts/push-agent-data.js
```

Add to crontab or run as a service:

```bash
# Run every 30s via cron
* * * * * cd /path/to/office-dashboard && DASHBOARD_URL=https://your-app.vercel.app node scripts/push-agent-data.js
```

Or use `watch`:
```bash
watch -n 30 "DASHBOARD_URL=https://your-app.vercel.app node scripts/push-agent-data.js"
```

## Local Development

```bash
cp .env.example .env
# Edit .env with your Neon URL
npm install
DATABASE_URL=your_neon_url npm start
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/health | Health check |
| GET | /api/agents | List all agents |
| POST | /api/agents | Upsert agent |
| GET | /api/activity | Recent activity |
| POST | /api/activity | Log activity |
| GET | /api/stats/summary | Dashboard summary |
| GET | /api/stats/system | Latest system stats |
| POST | /api/stats/system | Push system stats |
| GET | /api/stats/system/history | System history for charts |
