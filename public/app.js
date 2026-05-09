/**
 * Office Dashboard — app.js
 */

const API = '/api';
const POLL = 10000;

let chart = null;

// ── Helpers ──

const fmtNumber = n => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
};

const timeAgo = d => {
  if (!d) return '—';
  const m = Math.floor((Date.now() - new Date(d).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ago`;
};

const esc = s => { const d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; };

// ── Status maps ──

const statusCls = s => ({
  busy: { pip: 'pip-busy', lbl: 'status-label-busy', text: 'BUSY' },
  online: { pip: 'pip-online', lbl: 'status-label-online', text: 'ONLINE' },
  idle: { pip: 'pip-idle', lbl: 'status-label-idle', text: 'IDLE' },
  offline: { pip: 'pip-offline', lbl: 'status-label-offline', text: 'OFFLINE' },
}[s] || { pip: 'pip-offline', lbl: 'status-label-offline', text: 'OFFLINE' });

const agentEmoji = id => ({
  telegram: '🤖', 'whatsapp-braxton': '🧑‍💻', 'whatsapp-faith': '🌸',
  'group-college': '🎓', 'group-2': '👥', dev: '🛠️',
}[id] || '🔹');

const actIcon = t => ({
  status_change: '🔄', message: '💬', error: '❌',
  session_start: '▶️', session_end: '⏹️',
}[t] || '📝');

// ── Clock ──

const updateClock = () => {
  const now = new Date();
  document.getElementById('topClock').textContent = now.toLocaleTimeString('en-US', { hour12: false });
};
setInterval(updateClock, 1000);
updateClock();

// ── Renderers ──

function renderAgents(agents) {
  const grid = document.getElementById('agentGrid');
  const badge = document.getElementById('agentBadge');
  const online = agents.filter(a => a.status !== 'offline').length;
  badge.textContent = `${online}/${agents.length}`;

  grid.innerHTML = agents.map(a => {
    const s = statusCls(a.status);
    return `<div class="agent-card">
      <div class="status-pip ${s.pip}"></div>
      <span class="badge-icon">${agentEmoji(a.id)}</span>
      <div class="ag-name">${esc(a.name)}</div>
      <div class="ag-role">${esc(a.role)}</div>
      <div class="ag-channel">${esc(a.channel)}</div>
      <span class="ag-status-label ${s.lbl}">${s.text}</span>
      ${a.task && a.task !== '...' ? `<div class="ag-task">${esc(a.task)}</div>` : ''}
      <div class="ag-meta">
        <span>⚡ ${fmtNumber(a.tokens_used || 0)}</span>
        <span>${timeAgo(a.last_active)}</span>
      </div>
    </div>`;
  }).join('');
}

function renderActivity(items) {
  const feed = document.getElementById('activityFeed');
  const badge = document.getElementById('activityBadge');
  if (!items || items.length === 0) {
    feed.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:13px;">No activity yet</div>';
    badge.textContent = '0';
    return;
  }
  badge.textContent = items.length;
  feed.innerHTML = items.slice(0, 25).map(a => `
    <div class="activity-item">
      <span class="act-icon">${actIcon(a.event_type)}</span>
      <div class="act-body">
        <span class="act-agent">${esc(a.agent_name || a.agent_id)}</span>
        ${a.task ? `<div class="act-text">${esc(a.task)}</div>` : ''}
      </div>
      <span class="act-time">${timeAgo(a.created_at)}</span>
    </div>
  `).join('');
}

function renderStats(s) {
  if (!s) return;
  document.getElementById('statOnline').textContent = s.agents?.online || 0;
  document.getElementById('statTotal').textContent = s.agents?.total || 0;
  document.getElementById('statTokens').textContent = fmtNumber(s.agents?.total_tokens || 0);
  document.getElementById('statActivity').textContent = s.activity24h || 0;
  document.getElementById('statCpu').textContent = s.system?.cpu_load != null ? s.system.cpu_load.toFixed(1) + '%' : '0%';
  document.getElementById('statRam').textContent = s.system?.ram_used_pct != null ? s.system.ram_used_pct + '%' : '0%';
}

function renderSystem(sys) {
  const g = document.getElementById('sysGrid');
  if (!sys) {
    g.innerHTML = '<div style="grid-column:1/-1;padding:20px;text-align:center;color:var(--text-dim)">No data</div>';
    return;
  }
  g.innerHTML = `
    <div class="sys-item"><span class="sys-lbl">Host</span><span class="sys-val">${esc(sys.hostname || '—')}</span></div>
    <div class="sys-item"><span class="sys-lbl">Gateway</span><span class="sys-val">${esc(sys.gateway_status || '—')}</span></div>
    <div class="sys-item"><span class="sys-lbl">Uptime</span><span class="sys-val">${sys.uptime_seconds ? fmtUptime(sys.uptime_seconds) : '—'}</span></div>
    <div class="sys-item"><span class="sys-lbl">CPU</span><span class="sys-val">${sys.cpu_load != null ? sys.cpu_load.toFixed(2) : '—'}</span></div>
    <div class="sys-item"><span class="sys-lbl">RAM</span><span class="sys-val">${sys.ram_used_pct != null ? sys.ram_used_pct + '%' : '—'}</span></div>
    <div class="sys-item"><span class="sys-lbl">Disk</span><span class="sys-val">${esc(sys.disk_used_pct || '—')}</span></div>
  `;
}

function fmtUptime(s) {
  return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

function updateChart(history) {
  if (!history || history.length < 2) return;
  const labels = history.map(h => {
    const d = new Date(h.recorded_at);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  });

  const ctx = document.getElementById('loadChart').getContext('2d');
  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = history.map(h => h.cpu_load || 0);
    chart.data.datasets[1].data = history.map(h => h.ram_used_pct || 0);
    chart.update('none');
    return;
  }

  chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'CPU',
          data: history.map(h => h.cpu_load || 0),
          borderColor: '#d4a043',
          backgroundColor: 'rgba(212,160,67,0.06)',
          fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2,
        },
        {
          label: 'RAM',
          data: history.map(h => h.ram_used_pct || 0),
          borderColor: '#41d4b0',
          backgroundColor: 'rgba(65,212,176,0.06)',
          fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { labels: { color: '#7a7d91', font: { family: "'JetBrains Mono', monospace", size: 11 }, boxWidth: 12, padding: 12 } },
      },
      scales: {
        x: {
          ticks: { color: '#4a4d60', font: { family: "'JetBrains Mono', monospace", size: 9 }, maxTicksLimit: 10 },
          grid: { color: 'rgba(30,30,48,0.5)' },
        },
        y: {
          ticks: { color: '#4a4d60', font: { family: "'JetBrains Mono', monospace", size: 9 } },
          grid: { color: 'rgba(30,30,48,0.5)' },
          beginAtZero: true,
        },
      },
    },
  });
}

// ── Fetch ──

async function fetchAll() {
  try {
    const [agents, activity, summary, system, history] = await Promise.all([
      fetch(`${API}/agents`).then(r => r.json()),
      fetch(`${API}/activity?limit=25`).then(r => r.json()),
      fetch(`${API}/stats/summary`).then(r => r.json()),
      fetch(`${API}/stats/system`).then(r => r.json()),
      fetch(`${API}/stats/system/history?limit=50`).then(r => r.json()),
    ]);

    if (Array.isArray(agents)) renderAgents(agents);
    if (Array.isArray(activity)) renderActivity(activity);
    if (summary) renderStats(summary);
    if (system) renderSystem(system);
    if (Array.isArray(history)) updateChart(history);

    // Terminal line
    const now = new Date();
    document.getElementById('lastUpdate').textContent = `⏱ ${now.toLocaleTimeString('en-US', { hour12: false })}`;
    document.getElementById('connStatus').querySelector('.conn-dot').style.background = 'var(--green)';
    document.getElementById('connStatus').querySelector('.conn-dot').style.boxShadow = '0 0 6px var(--green)';
    document.getElementById('connStatus').querySelector('.conn-label').textContent = 'Live';
  } catch (err) {
    document.getElementById('connStatus').querySelector('.conn-dot').style.background = 'var(--red)';
    document.getElementById('connStatus').querySelector('.conn-dot').style.boxShadow = '0 0 6px var(--red)';
    document.getElementById('connStatus').querySelector('.conn-label').textContent = 'Offline';
  }
}

fetchAll();
setInterval(fetchAll, POLL);
