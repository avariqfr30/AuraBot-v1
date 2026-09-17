# Release Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Constrain Aura to a loopback-only, explicit-public-directory beta release with safe runtime storage, patched dependencies, regression tests, and CI security gates.

**Architecture:** Express serves only an absolute `public/` tree and exposes API routes from the existing server process. Runtime files resolve beneath an absolute ignored `.aura-data/` directory, while existing Chroma path overrides remain authoritative. Real HTTP integration tests exercise the server on an ephemeral loopback socket.

**Tech Stack:** Node.js 24 LTS, CommonJS, Express 5, Node test/assert, npm audit, GitHub Actions, Gitleaks.

**Spec:** `docs/superpowers/specs/2026-09-17-release-hardening-design.md`

## Global Constraints

- Do not commit, push, open a PR, merge, rewrite history, force-push, rotate credentials, or alter external account settings.
- Do not delete, overwrite, or silently move `chroma-data/` or other user data.
- Do not add authentication, multi-user sharing, model changes, prompt changes, or unrelated refactoring.
- Do not use forced audit fixes or breaking major dependency upgrades.
- Do not allowlist or baseline the exposed historical credential.
- Keep release readiness blocked while the `main` Pages workflow exists or exposed credentials are not confirmed rotated/revoked and reviewed.

---

### Task 1: Security Boundary Regression Test

**Files:**
- Create: `tests/server-security.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `server.js` exported `DEFAULT_HOST`, `resolveServerConfig(env)`, and `startServer(options)`.
- Produces: executable HTTP acceptance coverage for loopback binding, public assets, private 404s, API 404s, CORS, and runtime isolation.

- [ ] **Step 1: Write the failing integration test**

Use a temporary directory, start the real app with port `0`, assert `server.address().address === '127.0.0.1'`, request all acceptance paths with `fetch`, and cleanly close the server and remove only the temporary fixture.

- [ ] **Step 2: Add the test command to `npm test` and verify RED**

Run: `node --test tests/server-security.test.js`

Expected: FAIL because the server currently auto-starts, defaults to `0.0.0.0`, exports no testable startup interface, exposes the repository root, serves SPA HTML for private paths, and emits wildcard CORS.

- [ ] **Step 3: Do not change production code until the expected failure is recorded**

Record the failing assertions in the execution log, then proceed to Task 2.

### Task 2: Network and Static Boundary

**Files:**
- Modify: `server.js`
- Modify: `tests/settings-regression.test.js`
- Move: `index.html` to `public/index.html`
- Move: `css/` to `public/css/`
- Move: `js/` to `public/js/`
- Move: `contents/concepts/` to `public/contents/concepts/`
- Move: `contents/distortions/` to `public/contents/distortions/`
- Move: `contents/techniques/` to `public/contents/techniques/`

**Interfaces:**
- Produces: `DEFAULT_HOST = '127.0.0.1'`, `resolveServerConfig(env)`, and `startServer({ host, port })` around the existing Express app.
- Preserves: all existing `/api/*` route behavior and same-origin browser paths.

- [ ] **Step 1: Move only browser files into `public/`**

Use explicit moves; leave `contents/examples/`, `image.png`, `sysprompt.txt`, and all server/runtime files outside `public/`.

- [ ] **Step 2: Implement the smallest server boundary**

Remove `cors`, set the default host to `127.0.0.1`, serve `PUBLIC_DIR`, return JSON 404 for unknown APIs, return plain 404 elsewhere, export startup helpers, and start only when `require.main === module`.

- [ ] **Step 3: Update source-path tests for `public/`**

Only change file reads and syntax-check paths caused by the move.

- [ ] **Step 4: Verify GREEN**

Run: `node --test tests/server-security.test.js`

Expected: all boundary assertions pass.

- [ ] **Step 5: Run the existing suite**

Run: `npm test`

Expected: exit 0 with all prior tests passing.

### Task 3: Runtime Data Boundary

**Files:**
- Create: `lib/runtime-paths.js`
- Create: `tests/runtime-paths.test.js`
- Modify: `scripts/chroma-up.js`
- Modify: `scripts/chroma-down.js`
- Modify: `scripts/chroma-up.sh`
- Modify: `scripts/chroma-down.sh`
- Modify: `scripts/chroma-logs.sh`
- Modify: `docker-compose.yml`
- Modify: `.gitignore`
- Modify: `.env.example`

**Interfaces:**
- Produces: `resolveRuntimePaths(env, rootDir)` returning absolute `dataDir`, `chromaPath`, `logFile`, and `pidFile`.
- Preserves: explicit `CHROMA_PATH` override precedence.

- [ ] **Step 1: Write failing path-resolution tests**

Assert the default absolute `.aura-data` paths, relative `AURA_DATA_DIR` resolution, absolute `AURA_DATA_DIR` preservation, and `CHROMA_PATH` precedence.

- [ ] **Step 2: Verify RED**

Run: `node --test tests/runtime-paths.test.js`

Expected: FAIL because `lib/runtime-paths.js` does not exist.

- [ ] **Step 3: Implement the pure resolver and consume it from JavaScript scripts**

Create directories only during Chroma startup. Down/log commands read the same resolved PID/log paths. Do not touch legacy `chroma-data/`.

- [ ] **Step 4: Align shell and Docker defaults**

Resolve shell defaults beneath an absolute `AURA_DATA_DIR`; publish Docker Chroma only on `127.0.0.1` and have the validated Docker wrapper supply the resolved `AURA_CHROMA_DOCKER_PATH` mount.

- [ ] **Step 5: Verify GREEN and full regression**

Run: `node --test tests/runtime-paths.test.js`

Run: `npm test`

Expected: both exit 0.

### Task 4: Compatible Dependency Repair

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Removes: `cors`.
- Produces: a lockfile with zero high or critical npm advisories.

- [ ] **Step 1: Inspect compatible upgrade candidates**

Run: `npm outdated`

Run: `npm audit --json`

- [ ] **Step 2: Remove `cors` and apply non-breaking patched versions**

Use explicit package installs/removals or ordinary `npm audit fix`; never use `--force`.

- [ ] **Step 3: Test each meaningful dependency group**

Run: `npm test`

Expected: exit 0 after direct-dependency changes and again after transitive lockfile changes.

- [ ] **Step 4: Verify the audit gate**

Run: `npm audit --audit-level=high`

Expected: exit 0 with zero high or critical vulnerabilities. Record any remaining lower-severity advisory.

### Task 5: CI and Release Documentation

**Files:**
- Create: `.github/workflows/security.yml`
- Create: `.nvmrc`
- Create: `docs/release-verification.md`
- Modify: `package.json`
- Modify: `README.md`
- Modify: `deploy/nginx/aura.conf`

**Interfaces:**
- CI triggers: pull requests and pushes to `dev` and `main`.
- CI permissions: `contents: read`.
- CI gates: `npm ci`, `npm test`, `npm audit --audit-level=high`, Gitleaks current/new commits.

- [ ] **Step 1: Resolve immutable action commits from official repositories**

Pin checkout, setup-node, and Gitleaks Action to commit SHAs while retaining version comments.

- [ ] **Step 2: Add Node and CI declarations**

Set `.nvmrc` to `24.21.0`, declare Node 24 in `engines`, fetch full history, and configure minimum permissions.

- [ ] **Step 3: Document operation, migration, backup, verification, blockers, and branch protection**

Include the non-loopback warning, exact manual second-device procedure, safe data preservation, credential rotation reminder, and separate `main`-targeted Pages deletion PR requirement.

- [ ] **Step 4: Validate YAML and documentation-linked commands**

Inspect the workflow, run package scripts locally, and confirm no workflow prints secrets.

### Task 6: Final Verification

**Files:**
- Verify all modified and moved files.

**Interfaces:**
- Produces: command evidence and an honest readiness decision.

- [ ] **Step 1: Perform clean install and automated gates**

Run: `npm ci`

Run: `npm test`

Run: `npm audit --audit-level=high`

Run: `node --test tests/server-security.test.js tests/runtime-paths.test.js`

- [ ] **Step 2: Run secret scans**

Run Gitleaks against the current tree/new work and separately against full history with `--redact`. Current/new work must pass; historical findings must remain reported without allowlisting.

- [ ] **Step 3: Run manual HTTP smoke checks**

Start Aura with no `HOST` override and a temporary data directory. Verify `/`, public CSS/JS, the required private paths, and absent wildcard CORS.

- [ ] **Step 4: Run repository hygiene checks**

Run: `git status --short`

Run: `git diff --check`

- [ ] **Step 5: Assess release readiness**

Do not claim release readiness while full-history secrets or the `origin/main` Pages workflow remain unresolved. Do not commit or publish changes.
