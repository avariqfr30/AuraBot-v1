# Aura AI Companion

Aura is a locally hosted AI companion with:

- Ollama-backed chat generation
- Chroma-backed long-term memory
- live OSINT/search via Serper
- a browser UI for chats, tools, and behavioral insights

Aura's beta configuration is intentionally single-user and same-device. The Node server, nginx example, and bundled Chroma configuration bind to loopback by default and are not intended to serve other devices.

## What Changed

- The browser uses same-origin requests for chat, memory, and search.
- The Node server serves only the explicit `public/` browser-asset directory.
- Ollama calls are proxied through the Aura server.
- Search was upgraded into a structured OSINT flow with richer evidence and source-backed synthesis.
- A loopback-only nginx example is included at [deploy/nginx/aura.conf](deploy/nginx/aura.conf).

## Requirements

- Node.js 24.21.0 LTS (see `.nvmrc`)
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

6. Open the app on the same machine at `http://127.0.0.1:3000`.

Aura does not listen on the machine's LAN address by default. Do not set `HOST` to a non-loopback address unless you separately provide authentication, TLS, restrictive CORS, and ownership/access controls. Those controls are not part of this beta.

## nginx Deployment

If you want nginx in front of Aura:

1. Start Aura on the host machine with `npm start`.
2. Copy [deploy/nginx/aura.conf](deploy/nginx/aura.conf) into your nginx sites config.
3. Reload nginx.
4. Open `http://127.0.0.1` on the same machine.

The example nginx listener is also loopback-only. Making nginx public would bypass the same-device release boundary and requires the additional controls described above.

## Environment Variables

See [.env.example](.env.example) for the full set. The main ones are:

- `PORT`: Aura server port
- `HOST`: bind address, defaults to `127.0.0.1`
- `AURA_DATA_DIR`: absolute or repository-relative runtime directory, defaults to `.aura-data`
- `OLLAMA_URL`: Ollama base URL on the host machine
- `CHROMA_URL`: Chroma base URL on the host machine
- `CHROMA_HOST`: Chroma bind address, defaults to `127.0.0.1`
- `CHROMA_PORT`: Chroma port, defaults to `8000`
- `CHROMA_PATH`: optional existing Chroma storage override; relative paths resolve from the repository root
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

By default, Aura starts ChromaDB on `http://127.0.0.1:8000` and stores its database, log, and PID beneath the absolute path resolved from `AURA_DATA_DIR` (`./.aura-data` by default). Docker also publishes Chroma only on `127.0.0.1:8000`.

### Chat stalls or an embedding service becomes unavailable

Memory and response-example retrieval have a 3-second browser budget. If retrieval fails, Aura continues with the available context, shows a short notice, and skips retrieval for 30 seconds before trying again. Stored memory is not deleted.

The composer provides **Stop** during a response. It cancels requests for that response and suppresses late replies; disconnecting an Ollama generation request also cancels the server's upstream request. Individual browser requests are bounded to 90 seconds and a complete response to 180 seconds. Slow responses release the controls with a retry message.

Server defaults separately bound Chroma transport requests to 10 seconds (`CHROMA_TIMEOUT_MS`) and embedding requests to 8 seconds (`EMBEDDING_TIMEOUT_MS`). Generation retains `REQUEST_TIMEOUT_MS`. These limits are distinct from the shorter optional-retrieval budget.

`npm run chroma:up` requires a valid `/api/v2/heartbeat` response before reporting success. An existing process or an open port alone is insufficient. If an existing service is unresponsive, startup exits with an error and leaves it available for inspection. Check its logs before restarting; restarting does not require deleting `chroma-data`.

Run `npm test` for the existing checks plus failure tests for stalled services, cancellation, late results, retrieval recovery, and Chroma readiness. These tests use controlled local services and do not require a live model or access to saved personal data.

If the `chroma` CLI is missing, install it with:

```bash
python3 -m venv .venv
./.venv/bin/python -m pip install -U pip chromadb
```

### Optional Docker fallback

If you prefer Docker, use the validated wrapper (it resolves and rejects runtime paths inside `public/` before invoking Compose):

```bash
npm run chroma:up:docker
npm run chroma:down:docker
```

### Running ChromaDB without Docker

Chroma’s official docs support running a local server from the CLI with:

```bash
chroma run --path ./.aura-data/chroma --host 127.0.0.1 --port 8000
```

That is the same approach Aura now uses under the hood.

- [Client-Server Mode](https://docs.trychroma.com/docs/run-chroma/client-server)

### Existing Chroma data, migration, and backups

Aura never deletes or silently moves an existing `chroma-data/` directory. Before an upgrade or migration:

1. Stop Aura and Chroma with `npm run chroma:down`.
2. Back up the complete existing directory while Chroma is stopped, preserving file permissions.
3. Choose one of these approaches:
   - Keep the existing location by setting `CHROMA_PATH=chroma-data`.
   - Copy—not move—the directory to `.aura-data/chroma`, then leave the original backup untouched until verification is complete.
4. Start Chroma with `npm run chroma:up`.
5. Open Aura and verify expected memories and response examples before removing any old copy manually.

For backups of the new default, stop Chroma and copy the complete `.aura-data/` directory. During application upgrades, preserve `.aura-data/`; it is ignored by Git and is not part of the browser-served `public/` tree. `AURA_DATA_DIR` and `CHROMA_PATH` are rejected if they resolve inside `public/`.

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

- Full chat, memory, and search features depend on the Aura server. Open `http://127.0.0.1:3000`; the source `public/index.html` is not a standalone deployment target.
- Binding Aura or nginx beyond loopback requires authentication, TLS, restrictive CORS, and ownership controls. This repository does not provide those controls.
- Release verification, manual network checks, branch-protection guidance, the historical-secret blocker, and the GitHub Pages blocker are documented in [docs/release-verification.md](docs/release-verification.md).
- MedGemma 1.5 is a medical model. Aura now adds MedGemma-specific prompt guidance for triage, uncertainty, and red-flag handling when that family of model is selected, but this is still not a substitute for clinician review or deployment-specific validation.
