# Release Hardening Design

## Goal

Harden Aura for a single-user, same-device beta without changing model behavior, personalization, existing user data, or supported Ollama and Chroma integrations.

## Starting Point

- `release-hardening`, local `dev`, fetched `origin/dev`, and `FETCH_HEAD` all point to `bc100dd50fd6696b9b6ab88fe3ffea5e03394bc3`.
- The worktree was clean before documentation was added.
- The unchanged test suite passes after installing the committed lockfile.
- The initial npm audit reports three high, two moderate, and one low vulnerability.
- A redacted Gitleaks full-history scan reports three historical findings, including the previously committed Serper credential.
- `origin/main` contains `.github/workflows/jekyll-gh-pages.yml`, which publishes the repository root. The workflow is absent from `dev`, `release-hardening`, and their merge base with `main`.

## Network Boundary

Aura defaults to `127.0.0.1`. `HOST` remains an explicit override. Documentation must state that a non-loopback override requires authentication, TLS, restrictive CORS, and ownership controls that are outside this release.

Unrestricted CORS middleware and its dependency are removed. Browser API requests remain same-origin. The nginx example listens on `127.0.0.1`, and Docker publishes Chroma as `127.0.0.1:8000:8000`. Chroma CLI scripts retain their existing loopback default.

## Static Boundary

Only browser-required files move beneath `public/`:

- `index.html`
- `css/`
- `js/`
- `contents/concepts/`
- `contents/distortions/`
- `contents/techniques/`

Server-only examples remain in `contents/examples/`. Server code, libraries, scripts, tests, package metadata, configuration, logs, databases, PID files, backup files, `sysprompt.txt`, and the unused `image.png` remain outside `public/`.

Express serves only the absolute `public/` directory. There is no SPA fallback. Unknown `/api/*` paths return JSON 404 responses; other unknown paths return a plain 404 response. This makes repository paths and runtime files unreachable even if they exist.

## Runtime Data

`AURA_DATA_DIR` resolves to an absolute path. Its default is `<repository>/.aura-data`, which is outside `public/` and ignored by Git. Chroma defaults to `<AURA_DATA_DIR>/chroma`; its log and PID file live directly beneath `AURA_DATA_DIR`.

`CHROMA_PATH` remains supported and takes precedence for Chroma storage. Existing `chroma-data/` is neither deleted nor moved. Documentation provides stop, backup, copy, explicit-path, startup, and verification steps so owners choose when to migrate.

## Tests

A real-server integration test starts Aura on an ephemeral loopback port with a temporary `AURA_DATA_DIR`. It verifies:

- the default bind address is exactly `127.0.0.1`;
- `/`, expected CSS, expected JavaScript, and browser Markdown return 200;
- every specified private path returns 404 and does not contain the SPA HTML marker;
- unknown API paths return JSON 404;
- wildcard CORS headers are absent; and
- a representative runtime file remains unreachable.

Existing source-path regression tests are updated only where browser files moved.

## Dependencies and CI

Direct and transitive dependencies receive compatible patched updates only. `cors` is removed. No forced audit fix or breaking major upgrade is allowed. Node.js `24.21.0` is declared in `.nvmrc` and used in CI; package engines accept the supported Node 24 line.

The security workflow runs for pull requests and pushes to `dev` and `main` with `contents: read`, full checkout history, `npm ci`, `npm test`, `npm audit --audit-level=high`, and Gitleaks. Third-party actions are pinned to immutable commits.

CI prevents leaks in the current tree and new commit range. A separate redacted full-history scan remains a release-readiness check and is not allowlisted or baselined.

## GitHub Pages Blocker

Adding `.github/workflows/jekyll-gh-pages.yml` on this branch would conflict with the independently added file on `main`. This branch therefore does not manufacture an add/add conflict. A separate PR based on `main` must delete or disable that workflow before release. Until then, root-directory Pages publishing is an explicit release blocker.

## Release Readiness

Application hardening can be complete while release readiness remains blocked. Release approval requires both:

1. removal or disabling of the `main` Pages deployment; and
2. owner confirmation that exposed credentials, including the historical Serper credential, were revoked or rotated and their usage reviewed.

No history rewrite, force-push, credential rotation, external account change, authentication feature, or multi-user feature is included.
