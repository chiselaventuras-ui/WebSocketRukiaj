# Steal a Brainrot - WebSocket Server

WebSocket que busca servidores do jogo [Steal a Brainrot](https://www.roblox.com/games/109983668079237/Steal-a-Brainrot) e distribui para bots entrarem automaticamente.

## Deploy no Railway

1. Crie uma conta em [railway.app](https://railway.app)
2. Clique em **"New Project"** → **"Deploy from GitHub repo"** (ou use o CLI)
3. Conecte o repositório deste projeto
4. O Railway detecta Node.js automaticamente
5. Após o deploy, copie a URL (ex: `https://seu-app.up.railway.app`)
6. A URL do WebSocket será: `wss://seu-app.up.railway.app/websocket/notifier`

### Variáveis de ambiente (opcional)

- `PORT` - Railway define automaticamente
- `ROBLOSECURITY` - Cookie de sessão do Roblox (obtido ao logar no site). **Pode aumentar o rate limit** da API. No Railway: Variables → Add `ROBLOSECURITY` = valor do cookie

## Uso com o Bot (Lua)

No script do bot, configure:

```lua
local WEBSOCKET_URL = "wss://SEU-APP.up.railway.app/websocket/notifier"
```

O servidor envia `new_servers` quando o bot solicita (`request_servers`) ou ao conectar.

## API

- `GET /` - Status do serviço
- `GET /health` - Health check
- `WS /websocket/notifier` - WebSocket para bots

### Mensagens WebSocket

**Cliente → Servidor:**
- `{"type":"register_player","playerName":"NomeDoBot"}`
- `{"type":"request_servers"}` - Solicita lista de servidores
- `{"type":"ping","ts":123}` - Heartbeat

**Servidor → Cliente:**
- `{"type":"new_servers","data":[{id,jobId,...}]}` - Lista de servidores
- `{"type":"pong","ts":123}` - Resposta ao ping
