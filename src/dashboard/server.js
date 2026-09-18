import http from 'http';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

const PORT = process.env.DASHBOARD_PORT || 3780;
const MAX_LOG_LINES = 500;

class DashboardManager {
  constructor() {
    this.botProcess = null;
    this.botStartTime = null;
    this.logs = [];
    this.sseClients = new Set();
    this.isStarting = false;
  }

  addLog(data, type = 'info') {
    const text = String(data || '');
    const lines = text.split(/\r?\n/).filter(line => line.length > 0);
    const timestamp = new Date().toLocaleTimeString();

    for (const line of lines) {
      const entry = {
        id: Date.now() + Math.random().toString(36).substring(2, 6),
        time: timestamp,
        type,
        text: line
      };
      this.logs.push(entry);
      if (this.logs.length > MAX_LOG_LINES) {
        this.logs.shift();
      }
      this.broadcastSSE('log', entry);
    }
  }

  broadcastSSE(event, data) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.write(payload);
      } catch {
        this.sseClients.delete(client);
      }
    }
  }

  startBot() {
    if (this.botProcess) return { success: false, message: 'Bot is already running' };
    this.isStarting = true;
    this.addLog('Starting Marvik bot process...', 'system');

    const entryPoint = path.join(projectRoot, 'src', 'index.js');
    this.botStartTime = Date.now();

    this.botProcess = spawn('node', [entryPoint], {
      cwd: projectRoot,
      env: { ...process.env, FORCE_COLOR: '1' }
    });

    this.botProcess.stdout.on('data', (data) => {
      this.addLog(data.toString(), 'stdout');
    });

    this.botProcess.stderr.on('data', (data) => {
      this.addLog(data.toString(), 'stderr');
    });

    this.botProcess.on('exit', (code, signal) => {
      const uptime = this.botStartTime ? Math.round((Date.now() - this.botStartTime) / 1000) : 0;
      this.addLog(`Bot exited (code: ${code}, signal: ${signal}, uptime: ${uptime}s)`, code === 0 ? 'system' : 'error');
      this.botProcess = null;
      this.botStartTime = null;
      this.isStarting = false;
      this.broadcastSSE('status', this.getStatus());
    });

    this.botProcess.on('error', (err) => {
      this.addLog(`Bot process error: ${err.message}`, 'error');
      this.botProcess = null;
      this.isStarting = false;
      this.broadcastSSE('status', this.getStatus());
    });

    this.isStarting = false;
    this.broadcastSSE('status', this.getStatus());
    return { success: true, message: 'Bot started' };
  }

  stopBot() {
    if (!this.botProcess) return { success: false, message: 'Bot is not running' };
    this.addLog('Stopping Marvik bot...', 'system');
    try {
      this.botProcess.kill('SIGTERM');
      setTimeout(() => {
        if (this.botProcess) {
          try { this.botProcess.kill('SIGKILL'); } catch {}
        }
      }, 4000);
      return { success: true, message: 'Bot stop signal sent' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  }

  restartBot() {
    this.addLog('Restarting Marvik bot...', 'system');
    if (this.botProcess) {
      this.botProcess.once('exit', () => {
        setTimeout(() => this.startBot(), 1000);
      });
      this.stopBot();
      return { success: true, message: 'Restarting bot...' };
    } else {
      return this.startBot();
    }
  }

  getStatus() {
    const isRunning = !!this.botProcess;
    const uptimeSec = this.botStartTime ? Math.round((Date.now() - this.botStartTime) / 1000) : 0;
    const memory = process.memoryUsage();

    let storageStats = {};
    try {
      const storagePath = path.join(projectRoot, 'storage', 'storage.json');
      if (fs.existsSync(storagePath)) {
        const raw = JSON.parse(fs.readFileSync(storagePath, 'utf8'));
        storageStats = raw.stats || {};
      }
    } catch {}

    let totalCommandsProcessed = 0;
    let totalMessagesProcessed = 0;
    const chats = storageStats.chats || {};
    for (const chat of Object.values(chats)) {
      if (chat.commandsByDate) {
        for (const dayCounts of Object.values(chat.commandsByDate)) {
          for (const count of Object.values(dayCounts || {})) {
            totalCommandsProcessed += Number(count) || 0;
          }
        }
      }
      if (chat.messagesByDate) {
        for (const count of Object.values(chat.messagesByDate || {})) {
          totalMessagesProcessed += Number(count) || 0;
        }
      }
    }

    return {
      running: isRunning,
      pid: this.botProcess?.pid || null,
      uptimeSeconds: uptimeSec,
      startedAt: this.botStartTime,
      memory: {
        rssMb: Math.round(memory.rss / (1024 * 1024)),
        heapMb: Math.round(memory.heapUsed / (1024 * 1024))
      },
      stats: {
        totalCommands: totalCommandsProcessed,
        totalMessages: totalMessagesProcessed,
        activeChats: Object.keys(chats).length
      }
    };
  }

  getPlugins() {
    const pluginsDir = path.join(projectRoot, 'src', 'plugins');
    if (!fs.existsSync(pluginsDir)) return [];

    const files = fs.readdirSync(pluginsDir).filter(f => f.endsWith('.js') && !f.startsWith('_'));
    const result = [];

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(pluginsDir, file), 'utf8');
        const nameMatch = content.match(/name\s*:\s*['"`](.*?)['"`]/);
        const descMatch = content.match(/description\s*:\s*['"`](.*?)['"`]/);
        const verMatch = content.match(/version\s*:\s*['"`](.*?)['"`]/);

        const commands = [];
        const cmdMatches = content.matchAll(/name\s*:\s*['"`]([a-zA-Z0-9_-]+)['"`][\s\S]*?(?:usage\s*:\s*['"`](.*?)['"`])?[\s\S]*?(?:description\s*:\s*['"`](.*?)['"`])?/g);
        for (const match of cmdMatches) {
          if (match[1] && match[1] !== (nameMatch ? nameMatch[1] : '')) {
            commands.push({
              name: match[1],
              usage: match[2] || `.${match[1]}`,
              description: match[3] || ''
            });
          }
        }

        result.push({
          file,
          name: nameMatch ? nameMatch[1] : file.replace('.js', ''),
          description: descMatch ? descMatch[1] : '',
          version: verMatch ? verMatch[1] : '1.0.0',
          commandsCount: Math.max(1, commands.length),
          commands
        });
      } catch {}
    }
    return result;
  }

  getConfig() {
    const envPath = path.join(projectRoot, '.env');
    if (!fs.existsSync(envPath)) return {};
    const content = fs.readFileSync(envPath, 'utf8');
    const result = {};
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        result[key] = value;
      }
    }
    return result;
  }

  saveConfig(newConfig) {
    const envPath = path.join(projectRoot, '.env');
    const lines = [];
    for (const [k, v] of Object.entries(newConfig)) {
      if (k && typeof v !== 'undefined') {
        lines.push(`${k}=${v}`);
      }
    }
    fs.writeFileSync(envPath, lines.join('\n') + '\n', 'utf8');
    this.addLog('Updated .env configuration from dashboard', 'system');
    return { success: true };
  }
}

const manager = new DashboardManager();

export function createDashboardServer() {
  const publicDir = path.join(__dirname, 'public');

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathname = url.pathname;

    // Static Assets
    if (pathname === '/' || pathname === '/index.html') {
      const htmlPath = path.join(publicDir, 'index.html');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(htmlPath, 'utf8'));
    }

    if (pathname === '/style.css') {
      const cssPath = path.join(publicDir, 'style.css');
      res.writeHead(200, { 'Content-Type': 'text/css; charset=utf-8' });
      return res.end(fs.readFileSync(cssPath, 'utf8'));
    }

    if (pathname === '/app.js') {
      const jsPath = path.join(publicDir, 'app.js');
      res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
      return res.end(fs.readFileSync(jsPath, 'utf8'));
    }

    // API Routes
    if (pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(manager.getStatus()));
    }

    if (pathname === '/api/plugins') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(manager.getPlugins()));
    }

    if (pathname === '/api/config') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify(manager.getConfig()));
      } else if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          try {
            const data = JSON.parse(body);
            const result = manager.saveConfig(data);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(result));
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: e.message }));
          }
        });
        return;
      }
    }

    if (pathname === '/api/bot/start' && req.method === 'POST') {
      const result = manager.startBot();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }

    if (pathname === '/api/bot/stop' && req.method === 'POST') {
      const result = manager.stopBot();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }

    if (pathname === '/api/bot/restart' && req.method === 'POST') {
      const result = manager.restartBot();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(result));
    }

    if (pathname === '/api/logs') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(manager.logs));
    }

    if (pathname === '/api/logs/clear' && req.method === 'POST') {
      manager.logs = [];
      manager.broadcastSSE('clear_logs', {});
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ success: true }));
    }

    // SSE Stream
    if (pathname === '/api/logs/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

      manager.sseClients.add(res);

      req.on('close', () => {
        manager.sseClients.delete(res);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  return {
    server,
    manager,
    start(port = PORT) {
      return new Promise((resolve) => {
        server.listen(port, () => {
          resolve(port);
        });
      });
    }
  };
}

export default { createDashboardServer, manager };

