# Hosted Security and Operations

## Trust boundaries

The public boundary is the HTTPS reverse proxy. It forwards to Aura on `127.0.0.1`; Aura reaches PostgreSQL, Chroma, and the local Ollama API over private interfaces. Ollama may forward configured cloud-model inference to Ollama's service. Serper receives derived search queries only after the signed-in account enables external research. The OpenID Connect provider establishes identity but does not own Aura profile data.

Primary protected data includes chats, approved memories, personal response examples, feedback, session tokens, OIDC flow state, model prompts, and search queries. Main threats are cross-account access, stolen cookies, CSRF, public service exposure, leaked deployment secrets, plaintext backups, unbounded model cost, dependency compromise, and incomplete deletion.

Implemented controls include account-scoped authorization, secure server-side sessions, exact-origin CSRF checks, strict hosted model allowlists, loopback-only internal endpoints, application-layer AES-256-GCM encryption, PostgreSQL-backed account quotas and concurrency leases, redacted operational errors, no hosted search-query cache, phased deletion retries, CSP/security headers, and CI exposure/secret/dependency checks.

Embeddings still reveal similarity information and must be protected with encrypted storage and access controls at the Chroma volume or infrastructure layer. Aura cannot protect a compromised client device, identity provider, host operating system, or deployment secret manager.

## Initial deployment

1. Provision separate production PostgreSQL and Chroma storage with provider or full-disk encryption, restricted service identities, private networking, and automated encrypted snapshots.
2. Put deployment values in `/etc/aura/aura.env` with owner `root:aura` and mode `0640`; never copy that file into the repository.
3. Generate `AURA_DATA_ENCRYPTION_KEY` with `openssl rand -base64 32`. Store the key and its `AURA_DATA_KEY_ID` in the secret manager and in a separately protected recovery escrow.
4. Replace the domain and certificate paths in `deploy/nginx/aura-hosted.conf`. Keep Aura itself on `HOST=127.0.0.1`.
5. Install `deploy/systemd/aura.service`, adapting only installation paths and the service identity. Run Ollama and Chroma under separate least-privilege services.
6. If upgrading a preview database, stop Aura, back up PostgreSQL, run `npm run hosted:encrypt:migrate`, review the dry-run count, then run `npm run hosted:encrypt:migrate -- --apply` before starting Aura. The command migrates PostgreSQL account snapshots only. Any pre-encryption hosted Chroma records must be deliberately exported and re-ingested through the encrypted path or deleted before launch; prove removal with a raw-store canary check.
7. Complete every gate in `docs/release-verification.md` before accepting client data.

## Backup and restore

Back up PostgreSQL, the complete Chroma data volume, the deployment configuration minus transient logs, and the encryption-key escrow. Use encrypted backup storage with an independent access policy and retention schedule. Never place backup archives beneath `public/` or in Git.

Before production, the service owner must record an acceptable recovery-point objective, recovery-time objective, snapshot frequency, and retention period. These are client and infrastructure commitments, so the repository does not invent universal values.

For a consistent manual backup, put Aura into maintenance at the reverse proxy, stop Aura writes and Chroma, create a PostgreSQL custom-format dump with `pg_dump --format=custom`, copy the stopped Chroma volume, record checksums, then restart services. Prefer infrastructure snapshots that provide equivalent consistency. Do not pass database passwords on the command line.

Restore into an isolated environment first. Restore PostgreSQL with `pg_restore`, restore the matching Chroma snapshot, provide the matching encryption key and key ID, run the encryption migration dry-run, and start the private services. Verify readiness, two-account isolation, memory retrieval, and a full test-account deletion before promoting the restored environment. Perform and record a restore drill at least quarterly and after storage or encryption changes.

## Retention and incidents

Expired session, login-flow, and request-lease rows are removed automatically; usage events are retained for at most 62 days. Hosted search queries are not cached. User-owned profile data remains until the user deletes it or the service applies a separately published retention policy.

On suspected compromise, remove public traffic, preserve relevant redacted audit evidence, revoke affected OIDC sessions and provider credentials, rotate exposed secrets, and assess whether encrypted data and its key were both exposed. For data-key rotation, configure the new key and ID as active and the old pair as `AURA_PREVIOUS_DATA_ENCRYPTION_KEY` and `AURA_PREVIOUS_DATA_KEY_ID`, stop writes, back up, run the migration dry-run and apply modes, then complete a restore test. The runtime can read either key while migration is in progress and always encrypts new records with the active key. Do not discard the old key until old Chroma records and every backup under it have expired, been re-ingested, or been re-encrypted.
