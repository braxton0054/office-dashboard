/**
 * Office Dashboard — Frontend
 * Polls the API every 10s and renders the dashboard.
 */

const API_BASE = '/api';
const POLL_INTERVAL = 10000;

let loadChart = null;
let loadHistory = [];

// ── Status helpers ──

function statusLabel(status) {
  const map = { busy: '🟠 Busy', online: '🟢 Online', idle: '🔵 Idle', offline: '⚫ Offline' };
  return map[status] || '⚫ Offline';
}

function statusClass(status) {
  return 'status-' + status;
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const ms = Date.now() - new Date(dateStr).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ${min % 60}m ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

// ── Clock ──

function updateClock() {
  const now = new Date();
  document.getElementById('clock').textContent = now.toLocaleTimeString('en-US', { hour12: false });
}

setInterval(updateClock, 1000);
updateClock();

// ── Render Functions ──

function renderAgents(agents) {
  const grid = document.getElementById('agentGrid');
  const badge = document.getElementById('agentBadge');
  const online = agents.filter(a => a.status !== 'offline').length;

  badge.textContent = `${online}/${agents.length}`;

  grid.innerHTML = agents.map(a => `
    <div class="agent-card">
      <div class="status-dot ${statusClass(a.status)}"></div>
      <div class="emoji">${getAgentEmoji(a.id)}</div>
      <div class="name">${escapeHtml(a.name)}</div>
      <div class="role">${escapeHtml(a.role)}</div>
      <div class="channel">${escapeHtml(a.channel)} · ${statusLabel(a.status)}</div>
      ${a.task && a.task !== '...' ? `<div class="task">${escapeHtml(a.task)}</div>` : ''}
      <div class="meta">
        <span>${formatNumber(a.tokens_used || 0)} tokens</span>
        <span>${timeAgo(a.last_active)}</span>
      </div>
    </div>
  `).join('');
}

function getAgentEmoji(id) {
  const map = {
    'telegram': '🤖',
    'whatsapp-braxton': '🧑‍💻',
    'whatsapp-faith': '🌸',
    'group-college': '🎓',
    'group-2': '👥',
    'dev': '🛠️',
  };
  return map[id] || '🔹';
}

function renderActivity(activities) {
  const feed = document.getElementById('activityFeed');
  if (!activities || activities.length === 0) {
    feed.innerHTML = '<div class="activity-item" style="color:var(--text-muted);padding:20px;justify-content:center">No activity yet</div>';
    return;
  }

  feed.innerHTML = activities.slice(0, 30).map(a => `
    <div class="activity-item">
      <span class="icon">${getEventIcon(a.event_type)}</span>
      <div class="content">
        <span class="agent-name">${escapeHtml(a.agent_name || a.agent_id)}</span>
        ${a.task ? `<div class="task-text">${escapeHtml(a.task)}</div>` : ''}
      </div>
      <span class="time">${timeAgo(a.created_at)}</span>
    </div>
  `).join('');
}

function getEventIcon(type) {
  const map = { 'status_change': '🔄', 'message': '💬', 'error': '❌', 'session_start': '▶️', 'session_end': '⏹️' };
  return map[type] || '📝';
}

function renderStats(summary) {
  if (!summary) return;
  document.getElementById('statOnline').textContent = summary.agents?.online || 0;
  document.getElementById('statTotal').textContent = summary.agents?.total || 0;
  document.getElementById('statTokens').textContent = formatNumber(summary.agents?.total_tokens || 0);
  document.getElementById('statActivity').textContent = summary.activity24h || 0;
  document.getElementById('statCpu').textContent = summary.system?.cpu_load != null ? summary.system.cpu_load.toFixed(1) + '%' : '0%';
  document.getElementById('statRam').textContent = summary.system?.ram_used_pct != null ? summary.system.ram_used_pct + '%' : '0%';
  document.getElementById('connectionStatus').innerHTML = `<span class="dot dot-green"></span> Connected`;
}

function renderSystem(sys) {
  const info = document.getElementById('systemInfo');
  if (!sys) {
    info.innerHTML = '<div style="color:var(--text-muted);padding:20px;">No system data yet</div>';
    return;
  }

  info.innerHTML = `
    <div class="sys-item"><span class="label">Host</span><span class="value">${escapeHtml(sys.hostname || '—')}</span></div>
    <div class="sys-item"><span class="label">Gateway</span><span class="value">${escapeHtml(sys.gateway_status || 'unknown')}</span></div>
    <div class="sys-item"><span class="label">CPU Load</span><span class="value">${sys.cpu_load != null ? sys.cpu_load.toFixed(2) : '—'}</span></div>
    <div class="sys-item"><span class="label">RAM</span><span class="value">${sys.ram_used_pct != null ? sys.ram_used_pct + '%' : '—'}</span></div>
    <div class="sys-item"><span class="label">Disk</span><span class="value">${escapeHtml(sys.disk_used_pct || '—')}</span></div>
    <div class="sys-item"><span class="label">Uptime</span><span class="value">${sys.uptime_seconds ? formatUptime(sys.uptime_seconds) : '—'}</span></div>
  `;
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
}

function updateChart(history) {
  if (!history || history.length < 2) return;

  const labels = history.map(h => {
    const d = new Date(h.recorded_at);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  });
  const cpuData = history.map(h => h.cpu_load || 0);
  const ramData = history.map(h => h.ram_used_pct || 0);

  const ctx = document.getElementById('loadChart').getContext('2d');

  if (loadChart) {
    loadChart.data.labels = labels;
    loadChart.data.datasets[0].data = cpuData;
    loadChart.data.datasets[1].data = ramData;
    loadChart.update('none');
    return;
  }

  loadChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'CPU Load',
          data: cpuData,
          borderColor: '#6366f1',
          backgroundColor: 'rgba(99, 102, 241, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2,
        },
        {
          label: 'RAM %',
          data: ramData,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          fill: true,
          tension: 0.3,
          pointRadius: 2,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#8b8fa3', font: { size: 12 } },
        },
      },
      scales: {
        x: {
          ticks: { color: '#8b8fa3', maxTicksLimit: 10 },
          grid: { color: 'rgba(42, 46, 63, 0.5)' },
        },
        y: {
          ticks: { color: '#8b8fa3' },
          grid: { color: 'rgba(42, 46, 63, 0.5)' },
          beginAtZero: true,
        },
      },
    },
  });
}

// ── Data Fetching ──

async function fetchAll() {
  try {
    const [agents, activity, summary, system, history] = await Promise.all([
      fetch(`${API_BASE}/agents`).then(r => r.json()),
      fetch(`${API_BASE}/activity?limit=30`).then(r => r.json()),
      fetch(`${API_BASE}/stats/summary`).then(r => r.json()),
      fetch(`${API_BASE}/stats/system`).then(r => r.json()),
      fetch(`${API_BASE}/stats/system/history?limit=50`).then(r => r.json()),
    ]);

    if (Array.isArray(agents)) renderAgents(agents);
    if (Array.isArray(activity)) renderActivity(activity);
    if (summary) renderStats(summary);
    if (system) renderSystem(system);
    if (Array.isArray(history)) updateChart(history);
  } catch (err) {
    console.error('Fetch error:', err);
    document.getElementById('connectionStatus').innerHTML = `<span class="dot dot-red"></span> Disconnected`;
  }
}

// ── Init ──
fetchAll();
setInterval(fetchAll, POLL_INTERVAL);
