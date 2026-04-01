# Aura AI Companion

Aura is a locally hosted AI companion with:

- Ollama-backed chat generation
- Chroma-backed long-term memory
- live OSINT/search via Serper
- a browser UI for chats, tools, and behavioral insights

The app now runs in a host-machine model: the machine running Aura can act as the server for other devices on the same network instead of every browser needing its own local Ollama instance.

## What Changed

- The browser no longer hardcodes `127.0.0.1` for chat, memory, or search.
- The Node server now serves the web app directly.
- Ollama calls are proxied through the Aura server.
- Search was upgraded into a structured OSINT flow with richer evidence and source-backed synthesis.
- A sample nginx config is included at [deploy/nginx/aura.conf](deploy/nginx/aura.conf).

## Requirements

- Node.js 18+
- Ollama running on the host machine
- Chroma running on the host machine
- A Serper API key for live search

Suggested Ollama models:

```bash
ollama pull llama3:8b
ollama pull bge-m3:latest
```

## Local Setup

1. Install dependencies:

```bash
npm install
```

2. Create your environment file:

```bash
cp .env.example .env
```

3. Update `.env` with real values, especially `SERPER_API_KEY`.

4. Start Aura:

```bash
npm start
```

5. Open the app:

- On the same machine: `http://127.0.0.1:3000`
- From another device on the LAN: `http://<host-machine-ip>:3000`

## nginx Deployment

If you want nginx in front of Aura:

1. Start Aura on the host machine with `npm start`.
2. Copy [deploy/nginx/aura.conf](deploy/nginx/aura.conf) into your nginx sites config.
3. Reload nginx.
4. Open `http://<host-machine-ip>` or your configured hostname.

The nginx layer simply fronts the Aura Node server, which already serves the UI and proxies Ollama for connected clients.

## Environment Variables

See [.env.example](.env.example) for the full set. The main ones are:

- `PORT`: Aura server port
- `HOST`: bind address, defaults to `0.0.0.0`
- `OLLAMA_URL`: Ollama base URL on the host machine
- `CHROMA_URL`: Chroma base URL on the host machine
- `EMBEDDING_MODEL`: embedding model used for memory
- `SERPER_API_KEY`: API key for live OSINT/search

## OSINT Flow

Aura’s search path now does more than a single query:

1. The app creates a structured search plan.
2. The server runs the primary query plus up to two supporting queries.
3. Web and news results are fetched in parallel.
4. Answer-box, knowledge-graph, local results, and cited sources are condensed into an OSINT brief.
5. Aura answers using only that brief and includes source links.

## Notes

- Full chat, memory, and search features depend on the Aura server. Opening `index.html` directly is no longer the recommended path.
- If you expose Aura beyond your local network, put it behind proper authentication and TLS before treating it as an internet-facing service.
