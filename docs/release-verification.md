# Release Verification

Aura's beta release boundary is one user, one device, and loopback networking only.

The optional hosted mode is a separate release track. It must not be considered client-ready solely because its account and isolation tests pass.

## Hosted-mode gates

- Configure a real OpenID Connect provider, PostgreSQL database, HTTPS origin, private Ollama, and private Chroma; verify the actual callback and cookie flow in a browser.
- Test two real accounts with identical profile IDs: each must fail to read, alter, or delete the other's chat state, Chroma memory, and personal examples.
- Verify the hosted disclosure links to Ollama's current privacy policy, the configured primary and medical models appear in their allowlists, and unlisted model IDs are rejected before Ollama is called. Record whether the primary is local or Ollama Cloud.
- Test sign-in from a second device, version conflict behavior, explicit old-profile import, logout, and complete hosted-account deletion including Chroma failures.
- Verify that the separate Serper research consent blocks every search request before any external call and that revocation applies immediately.
- Verify rate and concurrency limits, restore from PostgreSQL and Chroma backups, and run a real HTTPS deployment review before public exposure.
- Verify raw PostgreSQL and Chroma records do not contain a seeded canary conversation, feedback response, or approved memory; verify the matching encryption key restores them in an isolated environment.
- Interrupt account deletion after each Chroma phase, restart Aura, and verify access remains locked while maintenance completes the remaining phases.
- Confirm the public host exposes only the TLS proxy; Node, Ollama, Chroma, and PostgreSQL must be unreachable from a separate network device.

## Automated verification

Use Node.js `24.21.0` from `.nvmrc`, then run:

```bash
gitleaks dir . --redact --no-banner
npm ci
npm test
npm audit --audit-level=high
npm run check:security
gitleaks git . --redact --no-banner
git status --short
git diff --check
```

The repository exposure guard intentionally fails if a GitHub Pages publishing workflow or a database, key, environment file, or log appears beneath `public/`.

Run the current-tree Gitleaks scan immediately after checkout, before installing `node_modules`; this keeps dependency contents out of the scan. If an ignored local `.env` exists, Gitleaks intentionally scans it and reports redacted findings rather than treating the ignore rule as an exemption. The current-tree scan must pass. CI also scans every commit in the PR/push range without a first-parent restriction, so secrets added on merged side branches are not skipped.

The full-history scan is intentionally separate. It currently reports historical credentials, including the previously committed Serper credential. Do not add those findings to an allowlist or baseline. Release readiness remains blocked until the owner confirms credential revocation or rotation and reviews provider usage records for misuse.

## Manual loopback verification

Automated tests cannot prove that another physical device cannot reach the service. Perform these steps on the release machine and local network:

1. Start Aura without a `HOST` override:

   ```bash
   env -u HOST npm start
   ```

2. In another terminal, confirm the listener is exactly loopback-bound:

   ```bash
   lsof -nP -iTCP:3000 -sTCP:LISTEN
   ```

   The listener must show `127.0.0.1:3000`, never `*:3000`, `0.0.0.0:3000`, or `[::]:3000`. On Linux, `ss -ltnp | grep ':3000'` is an equivalent check.

3. Confirm local access:

   ```bash
   curl --fail --silent --show-error http://127.0.0.1:3000/ >/dev/null
   ```

4. Find the release machine's LAN address, then use a second physical device on the same network to open `http://<machine-LAN-IP>:3000`. The connection must fail. Record this as a manual result with the date, machine, and second device used.

5. If nginx is enabled, inspect the active configuration and listener:

   ```bash
   sudo nginx -T
   lsof -nP -iTCP:80 -sTCP:LISTEN
   ```

   The effective listener must be `127.0.0.1:80`; no public IPv4 or IPv6 listener may remain.

Stop Aura with `Ctrl-C` after verification.

## HTTP smoke verification

With Aura running locally, verify:

```bash
curl -i http://127.0.0.1:3000/
curl -i http://127.0.0.1:3000/css/style.css
curl -i http://127.0.0.1:3000/js/app.js
curl -i http://127.0.0.1:3000/server.js
curl -i http://127.0.0.1:3000/package-lock.json
curl -i http://127.0.0.1:3000/tests/model-routing.test.js
curl -i http://127.0.0.1:3000/chroma.log
curl -i -H 'Origin: https://attacker.example' http://127.0.0.1:3000/
```

The root, CSS, and JavaScript requests must return 200. Every private path must return 404 and must not contain `<title>Aura AI Companion</title>`. The final response must not contain an `Access-Control-Allow-Origin: *` header.

## Runtime-data preservation

The default runtime directory is the absolute repository path `.aura-data/`, outside `public/`. It contains `.chroma.pid`, `chroma.log`, and `chroma/`. Git ignores it, and the HTTP server cannot reach it.

Before upgrading or backing up:

1. Stop Chroma with `npm run chroma:down`.
2. Copy the complete `AURA_DATA_DIR` to a protected backup location.
3. Upgrade the application without deleting or replacing that directory.
4. Restart Chroma and verify expected memory before removing any backup.

For legacy installations, leave `chroma-data/` untouched. Either set `CHROMA_PATH=chroma-data`, or copy the stopped database to `.aura-data/chroma` and verify the copy before manually retiring the old directory.

## GitHub Pages release blocker

`origin/main` contains `.github/workflows/jekyll-gh-pages.yml`, which publishes the repository root. Aura requires its Node backend and must not be deployed through GitHub Pages.

That workflow is absent from `dev`, `release-hardening`, and their merge base with `main`. Adding a replacement at the same path on this branch would create an add/add merge conflict. A separate PR based directly on `main` must delete or disable the Pages workflow. Release readiness is blocked until that PR is merged and Pages no longer publishes the repository root.

The public-exposure guard runs in the security workflow and will reject a prospective `main` merge while the Pages workflow is present. Repository-owner action is still required to remove the workflow, disable the Pages source in repository settings, and verify the live URL no longer serves Aura.

## Recommended branch protection

Protect `main` and `dev` with these repository settings:

- require pull requests and at least one approval;
- require the `Security gates / verify` status check;
- require branches to be up to date before merging;
- dismiss stale approvals when new commits are pushed;
- block force pushes and branch deletion;
- restrict bypass permissions and direct pushes; and
- review GitHub Pages settings after removing its workflow to ensure no alternate root deployment remains enabled.

These are owner-admin actions and are not changed automatically by this branch.
