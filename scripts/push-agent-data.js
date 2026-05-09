#!/usr/bin/env node
/**
 * Office Dashboard — VPS Agent Data Pusher
 * 
 * Polls OpenClaw sessions every 30s and pushes to the dashboard API.
 * Run this on the VPS where OpenClaw runs.
 * 
 * Usage:
 *   DASHBOARD_URL=https://office-dashboard.vercel.app node scripts/push-agent-data.js
 * 
 * Or for local dev:
 *   DASHBOARD_URL=http://localhost:4001 node scripts/push-agent-data.js
 */

const http = require('http');
const https = require('https');
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');

const DASHBOARD_URL = process.env.DASHBOARD_URL || 'http://localhost:4001';
const POLL_INTERVAL = parseInt(process.env.POLL_INTERVAL || '30000');
const OPENCLAW_BIN = '/home/braxton/.npm-global/bin/openclaw';
const SESSIONS_FILE = '/home/braxton/.openclaw/agents/main/sessions/sessions.json';

// Agent configuration: map session key patterns to agent identities
const AGENT_CONFIG = [
  { id: 'telegram', name: 'Krish', role: 'Main Assistant', channel: 'Telegram', match: 'telegram:direct:8124791929' },
  { id: 'whatsapp-braxton', name: 'Braxton', role: 'Personal DM', channel: 'WhatsApp', match: 'whatsapp:direct:+254718200559' },
  { id: 'whatsapp-faith', name: 'Faith', role: 'Personal DM', channel: 'WhatsApp', match: 'whatsapp:direct:+254115427092' },
  { id: 'group-college', name: 'College Group', role: 'WhatsApp Group', channel: 'WhatsApp', match: '120363374036709824' },
  { id: 'group-2', name: 'Group 2', role: 'WhatsApp Group', channel: 'WhatsApp', match: '120363409646110494' },
  { id: 'dev', name: 'Dev Session', role: 'Development', channel: 'Internal', match: 'explicit:figma-test' },
];

// Track last posted status for change detection
const lastStatus = {};

function getSessions() {
  try {
    const out = execSync(`${OPENCLAW_BIN} sessions --json`, {
      timeout: 10000, encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    const data = JSON.parse(out);
    return Array.isArray(data) ? data : (data.sessions || []);
  } catch (e) {
    return [];
  }
}

function getSessionMessages(sessionKey) {
  try {
    if (!fs.existsSync(SESSIONS_FILE)) return [];
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    const s = raw[sessionKey];
    return s?.messages || [];
  } catch (e) {
    return [];
  }
}

function buildAgentData() {
  const sessions = getSessions();
  const now = Date.now();
  const agents = [];
  let onlineCount = 0;

  for (const config of AGENT_CONFIG) {
    const session = sessions.find(s =>
      ((s.key || '') + '|' + (s.displayName || '')).includes(config.match)
    );

    let agent = {
      id: config.id,
      name: config.name,
      role: config.role,
      channel: config.channel,
      status: 'offline',
      model: '',
      tokens_used: 0,
      session_key: '',
      last_active: null,
    };

    if (session) {
      const age = session.updatedAt ? Math.floor((now - session.updatedAt) / 60000) : 999;
      let status = 'offline';
      if (age < 2) status = 'busy';
      else if (age < 10) status = 'online';
      else if (age < 60) status = 'idle';

      // Extract latest task
      let task = '';
      const messages = getSessionMessages(session.key);
      for (const msg of [...messages].reverse()) {
        const content = msg.content;
        if (Array.isArray(content)) {
          for (const c of content) {
            if (c && c.type === 'text' && c.text && c.text.trim().length > 2) {
              task = c.text.trim().slice(0, 120);
              break;
            }
          }
        } else if (typeof content === 'string' && content.trim().length > 2) {
          task = content.trim().slice(0, 120);
        }
        if (task) break;
      }

      agent.status = status;
      agent.model = session.model || '';
      agent.tokens_used = session.totalTokens || 0;
      agent.session_key = session.key;
      agent.last_active = session.updatedAt ? new Date(session.updatedAt).toISOString() : null;
      agent.task = task || '...';

      if (status !== 'offline') onlineCount++;
    }

    agents.push(agent);
  }

  // System stats
  const uptime = os.uptime();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  let diskInfo = '0%';
  try {
    const disk = execSync('df -h / | tail -1', { encoding: 'utf8', timeout: 3000 }).trim().split(/\s+/);
    if (disk.length >= 5) diskInfo = disk[4];
  } catch(e) {}

  let gwStatus = 'unknown';
  try {
    const gw = execSync('ss -tlnp 2>/dev/null | grep -q :18789 && echo reachable || echo unreachable', {
      encoding: 'utf8', timeout: 3000, shell: '/bin/bash'
    });
    gwStatus = gw.trim();
  } catch(e) {}

  return {
    agents,
    system: {
      hostname: os.hostname(),
      cpu_load: os.loadavg()[0],
      ram_used_pct: parseFloat(((totalMem - freeMem) / totalMem * 100).toFixed(1)),
      ram_total: totalMem,
      disk_used_pct: diskInfo,
      uptime_seconds: Math.floor(uptime),
      gateway_status: gwStatus,
      agents_online: onlineCount,
      agents_total: agents.length,
    }
  };
}

function post(url, data) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(data);
    const isHttps = url.startsWith('https');
    const lib = isHttps ? https : http;
    const u = new URL(url);

    const opts = {
      hostname: u.hostname,
      port: u.port || (isHttps ? 443 : 80),
      path: u.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 10000,
    };

    const req = lib.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 100)}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(body);
    req.end();
  });
}

async function pushAll() {
  try {
    const data = buildAgentData();
    const base = DASHBOARD_URL.replace(/\/+$/, '');

    // Push agents
    for (const agent of data.agents) {
      const key = agent.id;
      const changed = JSON.stringify(agent) !== JSON.stringify(lastStatus[key]);

      if (changed) {
        await post(`${base}/api/agents`, agent);
        lastStatus[key] = { ...agent };

        // Log status changes as activity
        if (agent.task && agent.task !== '...') {
          await post(`${base}/api/activity`, {
            agent_id: agent.id,
            event_type: 'status_change',
            task: agent.task,
            tokens_used: agent.tokens_used,
            status: agent.status,
          }).catch(() => {});
        }
      }
    }

    // Push system stats (every cycle)
    await post(`${base}/api/stats/system`, data.system);

    const online = data.system.agents_online;
    const total = data.system.agents_total;
    console.log(`[${new Date().toLocaleTimeString()}] Pushed ${online}/${total} agents — ${data.system.cpu_load.toFixed(1)} CPU`);
  } catch (err) {
    console.error(`[Push Error] ${err.message}`);
  }
}

// Main loop
console.log(`\n📤 Office Dashboard Data Pusher`);
console.log(`   Target: ${DASHBOARD_URL}`);
console.log(`   Interval: ${POLL_INTERVAL / 1000}s\n`);

pushAll();
setInterval(pushAll, POLL_INTERVAL);
