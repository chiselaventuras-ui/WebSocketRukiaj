/**
 * WebSocket Server - Steal a Brainrot
 * Busca servidores do Roblox e distribui para bots via WebSocket
 * Deploy: Railway (wss://seu-app.railway.app)
 */

const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const PLACE_ID = '109983668079237';
const ROBLOX_API = `https://games.roblox.com/v1/games/${PLACE_ID}/servers/Public`;
const FETCH_INTERVAL_MS = 5000;  // Atualiza lista a cada 5s
const MAX_SERVERS_PER_RESPONSE = 50;
const PORT = process.env.PORT || 3000;

const app = express();
app.use(express.json());

// Health check para Railway
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'steal-a-brainrot-websocket',
    placeId: PLACE_ID,
    clients: clients.size,
    lastFetch: lastFetchAt ? new Date(lastFetchAt).toISOString() : null
  });
});

app.get('/health', (req, res) => res.send('OK'));

const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: '/websocket/notifier'
});

let serversCache = [];
let lastFetchAt = null;
const clients = new Set();

/**
 * Busca servidores públicos do Roblox
 */
async function fetchRobloxServers() {
  try {
    const url = `${ROBLOX_API}?sortOrder=Desc&limit=100`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Roblox API: ${res.status}`);

    const json = await res.json();
    const data = json.data || [];

    serversCache = data
      .filter(s => s.id && s.playing !== undefined)
      .map(s => ({
        id: s.id,
        serverId: s.id,
        JobId: s.id,
        maxPlayers: s.maxPlayers || 0,
        playing: s.playing || 0,
        fps: s.fps,
        ping: s.ping
      }));

    lastFetchAt = Date.now();
    console.log(`[fetch] ${serversCache.length} servidores obtidos`);

    return serversCache;
  } catch (err) {
    console.error('[fetch] Erro:', err.message);
    return serversCache.length > 0 ? serversCache : [];
  }
}

/**
 * Retorna servidores com vagas (playing < maxPlayers), embaralhados
 */
function getAvailableServers() {
  const available = serversCache.filter(s => {
    const max = s.maxPlayers || 8;
    const playing = s.playing || 0;
    return playing < max;
  });

  // Embaralha
  const shuffled = [...available];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled.slice(0, MAX_SERVERS_PER_RESPONSE);
}

wss.on('connection', (ws, req) => {
  const url = req.url || '';
  const isBot = url.includes('bot=true');
  clients.add(ws);

  console.log(`[ws] Cliente conectado (bot=${isBot}), total: ${clients.size}`);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const type = msg.type;

      if (type === 'ping') {
        ws.send(JSON.stringify({ type: 'pong', ts: msg.ts }));
        return;
      }

      if (type === 'register_player') {
        ws.playerName = msg.playerName || 'unknown';
        console.log(`[ws] Player registrado: ${ws.playerName}`);
        return;
      }

      if (type === 'request_servers') {
        const servers = getAvailableServers();
        ws.send(JSON.stringify({
          type: 'new_servers',
          data: servers
        }));
        return;
      }
    } catch (err) {
      console.error('[ws] Erro ao processar mensagem:', err.message);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[ws] Cliente desconectado, total: ${clients.size}`);
  });

  ws.on('error', (err) => {
    clients.delete(ws);
    console.error('[ws] Erro:', err.message);
  });

  // Envia servidores imediatamente ao conectar (como o choice-notifier espera)
  const initialServers = getAvailableServers();
  if (initialServers.length > 0) {
    ws.send(JSON.stringify({
      type: 'new_servers',
      data: initialServers
    }));
  }
});

// Fetch inicial e loop periódico
fetchRobloxServers().then(() => {
  setInterval(fetchRobloxServers, FETCH_INTERVAL_MS);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Rodando na porta ${PORT}`);
  console.log(`[server] WebSocket: ws://localhost:${PORT}/websocket/notifier`);
  console.log(`[server] PlaceId: ${PLACE_ID}`);
});
