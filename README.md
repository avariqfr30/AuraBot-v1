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

Suggested embedding model:

```bash
ollama pull bge-m3:latest
```

The app now prefers MedGemma for chat and ships with `medgemma1.5:4b` as the default model name. If your Ollama setup exposes a different MedGemma tag, you can switch to it in Settings. The model picker also prioritizes common MedGemma tag variants automatically.

On a host with MedGemma installed, verify the tag with:

```bash
ollama list
```

If you already have a MedGemma build under a different name, select that exact name in Settings.

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

4. Start ChromaDB:

```bash
npm run chroma:up
```

This now uses the local Python/CLI route by default, not Docker. It will use `./.venv/bin/chroma` if present, then fall back to a `chroma` executable on your `PATH`.

5. Start Aura:

```bash
npm start
```

You can also do both in one shot:

```bash
npm run start:with-chroma
```

6. Open the app:

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

## Troubleshooting

### Serper `403 Unauthorized`

If you see:

```text
[OSINT research] { message: 'Unauthorized.', statusCode: 403 }
```

then `SERPER_API_KEY` in `.env` is wrong, expired, or still a placeholder.

Fix:

1. Get a real API key from [serper.dev](https://serper.dev/).
2. Put it in `.env`:

```env
SERPER_API_KEY=your_real_key_here
```

3. Restart Aura with `npm start`.

### ChromaDB not running

If you see memory/vector-store errors, the easiest fix is:

```bash
npm run chroma:up
```

Useful helper commands:

```bash
npm run chroma:logs
npm run chroma:down
```

By default, Aura starts ChromaDB on `http://127.0.0.1:8000` and stores data in `./chroma-data`.

If the `chroma` CLI is missing, install it with:

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install -U pip chromadb
```

### Optional Docker fallback

If you ever want Docker after all, the old path is still there:

```bash
npm run chroma:up:docker
npm run chroma:down:docker
```

### Running ChromaDB without Docker

Chroma’s official docs support running a local server from the CLI with:

```bash
chroma run --path ./chroma-data --host 127.0.0.1 --port 8000
```

That is the same approach Aura now uses under the hood.

- [Client-Server Mode](https://docs.trychroma.com/docs/run-chroma/client-server)

## OSINT Flow

Aura’s search path now does more than a single query:

1. The app creates a structured search plan.
2. The server runs the primary query plus up to two supporting queries.
3. Web and news results are fetched in parallel.
4. Answer-box, knowledge-graph, local results, and cited sources are condensed into an OSINT brief.
5. Aura answers using only that brief and includes source links.

## Model Routing and Thinking Modes

Aura defaults to automatic model routing:

- GPT-OSS 120B Cloud handles general conversation, planning, tool use, search synthesis, and complex reasoning.
- MedGemma 1.5 handles medical-document interpretation and can review complex or current non-emergency medical responses.
- Complex medical turns may use both models. Auto routing can therefore send message content to GPT-OSS Cloud.
- Acute emergency signals skip the reviewer so deterministic urgent guidance is not delayed.
- Selecting a specific model in Settings disables automatic switching and cross-model review, except for the urgent safety fallback.

Thinking Mode is model-aware:

- Auto selects effort from task complexity and risk.
- Fast, Balanced, and Deep map to GPT-OSS `low`, `medium`, and `high` native thinking.
- MedGemma does not expose GPT-OSS-style thinking levels. Deep allows one bounded medical self-review pass instead.
- Background JSON, analysis, and memory tasks stay at low effort to control latency.

Reasoning traces are not displayed or stored. Medical responses remain informational and require appropriate professional verification.

## Response Example RAG

Aura keeps reusable response examples separate from personal context inside the same ChromaDB server:

- `aura_long_term_memory` contains user-specific conversation memory.
- `aura_response_examples_v1` contains approved synthetic medical and companion response-pattern examples.
- `aura_personal_response_examples_v1` contains only low-risk companion responses that the local user explicitly approves as personal examples.

Seed the example collection after ChromaDB and Ollama are running:

```bash
npm run examples:seed
```

The seed command validates and upserts 68 approved examples from `contents/examples/medical-response-examples.json` and `contents/examples/companion-response-examples.json`. It does not read or modify personal memory. Evaluation cases in `contents/examples/medical-evaluation-cases.json` and `contents/examples/companion-evaluation-cases.json` are never seeded.

For non-emergency medical turns, Aura retrieves up to three examples filtered by domain, task, risk, and model family. Selected companion turns retrieve up to two examples for emotional presence, supportive disagreement, clarification, topic transitions, repair, and good tool/no-tool behavior. Example retrieval runs in parallel with personal-memory retrieval. Examples guide response structure and safety behavior only; they are explicitly separated from user facts and external evidence in the prompt. High-risk turns skip example retrieval.

## Local Feedback Learning

Each Aura response can be marked Helpful or Needs work, tagged with structured reasons, and given an optional written note. This feedback stays in the browser's Aura state and is included in local data exports. A feedback-aware retry sends the applicable note to the selected model, and an explicitly approved personal example may be included in future prompts; automatic routing can therefore send that selected context to a configured cloud model.

The feedback loop is deliberately bounded:

1. A single rating is recorded but does not immediately rewrite Aura's behavior.
2. Repeated explicit signals can adjust response length, directness, structure, or suppress optional tool offers. Explicit tool requests and immediate grounding needs are not suppressed.
3. The user can retry a response with their feedback. The retry instruction is stored as conversation context but is not written into vector memory.
4. A Helpful, low-risk, non-medical response can be explicitly promoted into the isolated personal-example collection. Raw feedback, comments, medical replies, and high-risk replies are never auto-promoted.

Deleting a chat removes its local feedback authority, clearing Feedback Learning removes all active personal examples, and Delete All Data resets the local feedback profile. No feedback is sent to a shared dataset or used for automatic weight training.

## Notes

- Full chat, memory, and search features depend on the Aura server. Opening `index.html` directly is no longer the recommended path.
- If you expose Aura beyond your local network, put it behind proper authentication and TLS before treating it as an internet-facing service.
- MedGemma 1.5 is a medical model. Aura now adds MedGemma-specific prompt guidance for triage, uncertainty, and red-flag handling when that family of model is selected, but this is still not a substitute for clinician review or deployment-specific validation.
