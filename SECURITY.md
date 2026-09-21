# Security Policy

## Reporting

Do not open a public issue for a suspected vulnerability or exposed credential. Use GitHub's private vulnerability reporting for this repository, or contact the repository owner privately if that feature is unavailable. Include affected versions, reproduction steps, impact, and any evidence needed to validate the report. Do not include real user data or secrets.

## Release boundary

The local mode is intended for loopback-only use. Hosted mode is not approved for client data until every hosted gate in [docs/release-verification.md](docs/release-verification.md) has current evidence. `main` and `dev` are the supported branches; other branches are development snapshots.

## Required security properties

- Node, Ollama, Chroma, and PostgreSQL are private services; only the TLS reverse proxy is public.
- Every hosted personal-data request is authenticated, CSRF-protected when mutating, and scoped to the authenticated account.
- Account state and personal Chroma text are encrypted at the application layer. Secrets and encryption keys stay in the deployment secret manager.
- Serper research remains explicit opt-in. Hosted search queries are not cached by Aura.
- Account deletion locks access immediately and remains fail-closed until all deletion phases complete.
- Releases require secret scanning, tests, dependency audit, backup restoration, and account-isolation verification.
