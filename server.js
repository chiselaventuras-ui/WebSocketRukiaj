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
const clients = new Set();

// Busca servidores na API do Roblox
async function fetchServers() {
  try {
    const res = await fetch(`${ROBLOX_API}?sortOrder=Desc&limit=100`);
    if (!res.ok) throw new Error(res.status);
    const json = await res.json();
    serversCache = (json.data || [])
      .filter(s => s.id)
      .map(s => ({ id: s.id, serverId: s.id, JobId: s.id, maxPlayers: s.maxPlayers || 8, playing: s.playing || 0 }));
    lastFetchAt = Date.now();
    console.log(`[fetch] ${serversCache.length} servidores`);
    return serversCache;
  } catch (err) {
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
  const servers = getServers();
  const msg = JSON.stringify({ type: 'new_servers', data: servers });
  let count = 0;
  clients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(msg);
      count++;
    }
  });
  if (count > 0) console.log(`[push] Servidores enviados para ${count} cliente(s)`);
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

// HTTP
app.get('/', (req, res) => {
  res.json({ status: 'ok', placeId: PLACE_ID, clients: clients.size, lastFetch: lastFetchAt });
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
