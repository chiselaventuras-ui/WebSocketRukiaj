/**
 * WebSocket API - Steal A Brainrot
 * Busca servidores do Roblox e envia para os bots a cada 10 segundos
 * Deploy: Railway
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const PLACE_ID = '109983668079237';
const ROBLOX_API = `https://games.roblox.com/v1/games/${PLACE_ID}/servers/Public`;
const PUSH_INTERVAL_MS = 10000;  // Envia servidores para os bots a cada 10s
const FETCH_INTERVAL_MS = 5000;  // Atualiza lista do Roblox a cada 5s
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/websocket/notifier' });

let serversCache = [];
let lastFetchAt = null;
let lastError = null;
let lastPushCount = 0;
let lastPushAt = null;
const clients = new Set();

function setError(msg) {
  lastError = { message: msg, at: new Date().toISOString() };
}

function clearError() {
  lastError = null;
}

// Busca servidores na API do Roblox
async function fetchServers() {
  try {
    const res = await fetch(`${ROBLOX_API}?sortOrder=Desc&limit=100`);
    if (!res.ok) throw new Error(`Roblox API: ${res.status}`);
    const json = await res.json();
    serversCache = (json.data || [])
      .filter(s => s.id)
      .map(s => ({ id: s.id, serverId: s.id, JobId: s.id, maxPlayers: s.maxPlayers || 8, playing: s.playing || 0 }));
    lastFetchAt = Date.now();
    clearError();
    console.log(`[fetch] ${serversCache.length} servidores`);
    return serversCache;
  } catch (err) {
    setError(`Falha ao buscar servidores: ${err.message}`);
    console.error('[fetch]', err.message);
    return serversCache;
  }
}

// Retorna servidores embaralhados (prioriza com vaga)
function getServers() {
  const withVacancy = serversCache.filter(s => (s.playing || 0) < (s.maxPlayers || 8));
  const full = serversCache.filter(s => (s.playing || 0) >= (s.maxPlayers || 8));
  const list = [...withVacancy, ...full];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, 50);
}

// Envia servidores para TODOS os clientes conectados
function broadcastServers() {
  try {
    const servers = getServers();
    const msg = JSON.stringify({ type: 'new_servers', data: servers });
    let count = 0;
    let pushErrors = 0;
    clients.forEach(ws => {
      if (ws.readyState === 1) {
        try {
          ws.send(msg);
          count++;
        } catch (e) {
          pushErrors++;
        }
      }
    });
    lastPushCount = count;
    lastPushAt = Date.now();
    if (pushErrors > 0) setError(`${pushErrors} bot(s) falhou ao enviar`);
    else if (clients.size > 0 && count === 0) setError('Bots conectados mas nenhum recebeu (conexão fechada?)');
    else clearError();
    if (count > 0) console.log(`[push] Servidores enviados para ${count} cliente(s)`);
  } catch (err) {
    setError(`Erro ao distribuir: ${err.message}`);
    console.error('[push]', err.message);
  }
}

// WebSocket
wss.on('connection', (ws) => {
  clients.add(ws);
  console.log(`[ws] Conectado. Total: ${clients.size}`);

  // Envia servidores na hora
  ws.send(JSON.stringify({ type: 'new_servers', data: getServers() }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong', ts: msg.ts }));
      if (msg.type === 'register_player') ws.playerName = msg.playerName;
      if (msg.type === 'request_servers') ws.send(JSON.stringify({ type: 'new_servers', data: getServers() }));
    } catch (_) {}
  });

  ws.on('close', () => { clients.delete(ws); });
  ws.on('error', () => { clients.delete(ws); });
});

// HTTP - Página de status com aviso de erros
app.get('/', (req, res) => {
  const hasError = lastError !== null;
  const status = hasError ? 'erro' : 'ok';
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Steal A Brainrot - WebSocket</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; max-width: 500px; margin: 40px auto; padding: 20px; background: #1a1a1a; color: #eee; }
    h1 { font-size: 1.2rem; margin-bottom: 20px; }
    .card { background: #252525; border-radius: 8px; padding: 16px; margin-bottom: 12px; }
    .status { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: 600; }
    .status.ok { background: #166534; color: #86efac; }
    .status.erro { background: #991b1b; color: #fca5a5; }
    .alerta { background: #7f1d1d; border: 1px solid #dc2626; color: #fecaca; padding: 12px; border-radius: 8px; margin-top: 12px; }
    .alerta h3 { margin: 0 0 8px 0; color: #f87171; }
    .info { color: #a3a3a3; font-size: 0.9rem; }
  </style>
</head>
<body>
  <h1>Steal A Brainrot - WebSocket API</h1>
  <div class="card">
    <span class="status ${status}">${hasError ? 'ERRO' : 'OK'}</span>
    <p class="info" style="margin-top: 12px;">
      Bots conectados: <strong>${clients.size}</strong><br>
      Último fetch: ${lastFetchAt ? new Date(lastFetchAt).toLocaleString() : 'Nunca'}<br>
      Último push: ${lastPushAt ? new Date(lastPushAt).toLocaleString() : 'Nunca'} → ${lastPushCount} bot(s)
    </p>
    ${hasError ? `
    <div class="alerta">
      <h3>⚠️ Aviso</h3>
      <p>${lastError.message}</p>
      <small>${lastError.at}</small>
    </div>
    ` : ''}
  </div>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

// JSON para APIs
app.get('/api', (req, res) => {
  res.json({
    status: lastError ? 'erro' : 'ok',
    placeId: PLACE_ID,
    clients: clients.size,
    lastFetch: lastFetchAt ? new Date(lastFetchAt).toISOString() : null,
    lastPush: lastPushAt ? new Date(lastPushAt).toISOString() : null,
    lastPushCount,
    error: lastError ? { message: lastError.message, at: lastError.at } : null
  });
});

app.get('/health', (req, res) => res.send('OK'));

// Loop: busca Roblox a cada 5s, envia para bots a cada 10s
fetchServers().then(() => {
  setInterval(fetchServers, FETCH_INTERVAL_MS);
  setInterval(broadcastServers, PUSH_INTERVAL_MS);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Porta ${PORT} | Steal A Brainrot | Push a cada ${PUSH_INTERVAL_MS / 1000}s`);
});
