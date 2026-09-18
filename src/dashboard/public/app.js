let autoScroll = true;
let allPlugins = [];

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600).toString().padStart(2, '0');
  const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function switchTab(tabId) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  document.querySelectorAll('.tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `tab-${tabId}`);
  });

  const titles = {
    dashboard: ['Dashboard Overview', 'Real-time status, process control, and performance analytics'],
    terminal: ['Live Console Stream', 'Real-time output and error logs directly from the bot runtime'],
    plugins: ['Plugins & Commands', 'Explore all registered plugins, commands, and usages'],
    settings: ['Bot Settings', 'Manage .env configuration variables']
  };

  if (titles[tabId]) {
    document.getElementById('page-title').textContent = titles[tabId][0];
    document.getElementById('page-subtitle').textContent = titles[tabId][1];
  }
}

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Update Status UI
function updateStatusUI(status) {
  const isRunning = status.running;
  const statusLabel = document.getElementById('status-label');
  const statusDot = document.getElementById('status-dot');
  const cardStatus = document.getElementById('card-status');

  if (isRunning) {
    statusLabel.textContent = 'Bot Online';
    statusDot.className = 'status-dot online';
    cardStatus.textContent = 'Online';
    cardStatus.style.color = '#10b981';
  } else {
    statusLabel.textContent = 'Bot Offline';
    statusDot.className = 'status-dot offline';
    cardStatus.textContent = 'Offline';
    cardStatus.style.color = '#ef4444';
  }

  document.getElementById('card-uptime').textContent = formatTime(status.uptimeSeconds || 0);
  document.getElementById('card-commands').textContent = (status.stats?.totalCommands || 0).toLocaleString();
  document.getElementById('info-pid').textContent = status.pid || '-';
  document.getElementById('info-ram').textContent = `${status.memory?.rssMb || 0} MB`;
  document.getElementById('info-chats').textContent = status.stats?.activeChats || 0;
  document.getElementById('info-messages').textContent = (status.stats?.totalMessages || 0).toLocaleString();
}

// Fetch Status periodically
async function fetchStatus() {
  try {
    const res = await fetch('/api/status');
    if (res.ok) {
      const data = await res.json();
      updateStatusUI(data);
    }
  } catch {}
}

setInterval(fetchStatus, 2000);
fetchStatus();

// Fetch Plugins
async function fetchPlugins() {
  try {
    const res = await fetch('/api/plugins');
    if (res.ok) {
      allPlugins = await res.json();
      document.getElementById('card-plugins').textContent = allPlugins.length;
      document.getElementById('plugin-count-badge').textContent = `${allPlugins.length} Plugins Installed`;
      renderPlugins(allPlugins);
    }
  } catch {}
}

function renderPlugins(plugins) {
  const container = document.getElementById('plugins-list');
  container.innerHTML = plugins.map(p => `
    <div class="plugin-card">
      <div class="plugin-top">
        <span class="plugin-name">${p.name}</span>
        <span class="plugin-ver">v${p.version}</span>
      </div>
      <p class="plugin-desc">${p.description || 'No description provided.'}</p>
      <div style="display:flex; justify-content:space-between; font-size:12px; color:var(--text-dim);">
        <span>📄 ${p.file}</span>
        <span>⚡ ${p.commandsCount} command(s)</span>
      </div>
    </div>
  `).join('');
}

document.getElementById('plugin-search')?.addEventListener('input', (e) => {
  const q = e.target.value.toLowerCase();
  const filtered = allPlugins.filter(p => 
    p.name.toLowerCase().includes(q) || 
    p.description.toLowerCase().includes(q) ||
    p.file.toLowerCase().includes(q)
  );
  renderPlugins(filtered);
});

fetchPlugins();

// Settings
async function fetchSettings() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const config = await res.json();
      const form = document.getElementById('settings-form');
      form.innerHTML = Object.entries(config).map(([key, val]) => `
        <div class="form-group">
          <label>${key}</label>
          <input type="text" name="${key}" value="${val.replace(/"/g, '&quot;')}" />
        </div>
      `).join('');
    }
  } catch {}
}

document.getElementById('btn-save-settings')?.addEventListener('click', async () => {
  const inputs = document.querySelectorAll('#settings-form input');
  const payload = {};
  inputs.forEach(input => {
    payload[input.name] = input.value;
  });

  try {
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      alert('Settings saved to .env successfully!');
    }
  } catch (e) {
    alert('Failed to save settings');
  }
});

fetchSettings();

// Logs & Console SSE
function appendLog(entry) {
  const fullConsole = document.getElementById('full-console');
  const miniConsole = document.getElementById('mini-console');

  const div = document.createElement('div');
  div.className = `log-entry log-${entry.type || 'stdout'}`;
  div.innerHTML = `<span class="log-time">[${entry.time}]</span> <span class="log-text">${escapeHtml(entry.text)}</span>`;

  const miniDiv = div.cloneNode(true);

  if (fullConsole) {
    fullConsole.appendChild(div);
    if (fullConsole.children.length > 500) fullConsole.removeChild(fullConsole.firstChild);
    if (autoScroll) fullConsole.scrollTop = fullConsole.scrollHeight;
  }

  if (miniConsole) {
    miniConsole.appendChild(miniDiv);
    if (miniConsole.children.length > 50) miniConsole.removeChild(miniConsole.firstChild);
    miniConsole.scrollTop = miniConsole.scrollHeight;
  }
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function loadExistingLogs() {
  try {
    const res = await fetch('/api/logs');
    if (res.ok) {
      const logs = await res.json();
      for (const log of logs) {
        appendLog(log);
      }
    }
  } catch {}
}

loadExistingLogs();

// Connect SSE
const sse = new EventSource('/api/logs/stream');
sse.addEventListener('log', (e) => {
  try {
    const entry = JSON.parse(e.data);
    appendLog(entry);
  } catch {}
});

sse.addEventListener('clear_logs', () => {
  const fullConsole = document.getElementById('full-console');
  const miniConsole = document.getElementById('mini-console');
  if (fullConsole) fullConsole.innerHTML = '';
  if (miniConsole) miniConsole.innerHTML = '';
});

// Controls
document.getElementById('btn-start')?.addEventListener('click', async () => {
  await fetch('/api/bot/start', { method: 'POST' });
  fetchStatus();
});

document.getElementById('btn-stop')?.addEventListener('click', async () => {
  await fetch('/api/bot/stop', { method: 'POST' });
  fetchStatus();
});

document.getElementById('btn-restart')?.addEventListener('click', async () => {
  await fetch('/api/bot/restart', { method: 'POST' });
  fetchStatus();
});

document.getElementById('btn-clear-logs')?.addEventListener('click', async () => {
  await fetch('/api/logs/clear', { method: 'POST' });
});

document.getElementById('btn-autoscroll')?.addEventListener('click', (e) => {
  autoScroll = !autoScroll;
  e.target.textContent = `Auto-scroll: ${autoScroll ? 'ON' : 'OFF'}`;
  e.target.className = autoScroll ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost';
});

