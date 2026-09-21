'use strict';

const crypto = require('node:crypto');
const { normalizeProfileId } = require('./profile-scope');

const MAX_STORAGE_BYTES = 4 * 1024 * 1024;
const REGISTRY_KEY = 'aura_profiles_v1';
const ACTIVE_KEY = 'aura_active_profile_id';
const STATE_PREFIX = 'aura_profile_state_v1:';
const SETTING_PREFIX = 'aura_profile_setting_v1:';
const PERSONAL_INTELLIGENCE_STATES = new Set(['not_enabled', 'active', 'paused']);

function usageError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function positiveInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new TypeError(`${name} must be a positive integer`);
    }
    return value;
}

function validateHostedSnapshot(storage) {
    if (!storage || typeof storage !== 'object' || Array.isArray(storage)) {
        throw new Error('Account storage must be an object');
    }
    if (Buffer.byteLength(JSON.stringify(storage)) > MAX_STORAGE_BYTES) {
        throw new Error('Account storage exceeds the size limit');
    }
    let registry;
    try {
        registry = JSON.parse(storage[REGISTRY_KEY]);
    } catch (_error) {
        throw new Error('Account storage requires a valid profile registry');
    }
    if (!Array.isArray(registry?.profiles) || registry.profiles.length < 1 || registry.profiles.length > 30) {
        throw new Error('Account storage requires 1 to 30 profiles');
    }
    const profileIds = new Set();
    for (const profile of registry.profiles) {
        const id = normalizeProfileId(profile?.id);
        if (
            !id || profileIds.has(id) ||
            typeof profile.name !== 'string' || !profile.name.trim() || profile.name.length > 80 ||
            !PERSONAL_INTELLIGENCE_STATES.has(profile.personalIntelligenceState)
        ) throw new Error('Account storage has an invalid profile');
        profileIds.add(id);
    }
    if (!profileIds.has(storage[ACTIVE_KEY])) throw new Error('Account storage has an invalid active profile');

    for (const [key, value] of Object.entries(storage)) {
        if (typeof value !== 'string') throw new Error('Account storage values must be strings');
        if (key === REGISTRY_KEY || key === ACTIVE_KEY) continue;
        let profileId = '';
        if (key.startsWith(STATE_PREFIX)) {
            profileId = key.slice(STATE_PREFIX.length);
        } else if (key.startsWith(SETTING_PREFIX)) {
            profileId = key.slice(SETTING_PREFIX.length).split(':', 1)[0];
        } else {
            throw new Error('Account storage has an unsupported storage key');
        }
        if (!profileIds.has(profileId)) throw new Error('Account storage references an unknown profile');
        try {
            JSON.parse(value);
        } catch (_error) {
            throw new Error('Account storage contains invalid JSON');
        }
    }
    return [...profileIds];
}

function toAccount(row, cipher) {
    if (!row) return null;
    const stored = typeof row.storage === 'string' ? JSON.parse(row.storage) : row.storage;
    const storage = stored?.alg === 'A256GCM'
        ? cipher.decrypt(stored, `account:${row.id}:storage`)
        : (stored && Object.keys(stored).length === 0 ? {} : null);
    if (!storage) throw new Error('Hosted account storage is not encrypted');
    return {
        id: row.id,
        version: Number(row.version),
        searchConsent: row.search_consent === true,
        storage,
        deleting: row.deleting === true,
        deletionMemoryDone: row.deletion_memory_done === true,
        deletionExamplesDone: row.deletion_examples_done === true
    };
}

function createHostedStore(pool, { cipher } = {}) {
    if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required');
    if (!cipher || typeof cipher.encrypt !== 'function' || typeof cipher.decrypt !== 'function') {
        throw new TypeError('A hosted data cipher is required');
    }
    return {
        async initialize() {
            await pool.query(`CREATE TABLE IF NOT EXISTS aura_accounts (
                id uuid PRIMARY KEY,
                oidc_issuer text NOT NULL,
                oidc_subject text NOT NULL,
                search_consent boolean NOT NULL DEFAULT false,
                deleting boolean NOT NULL DEFAULT false,
                deletion_memory_done boolean NOT NULL DEFAULT false,
                deletion_examples_done boolean NOT NULL DEFAULT false,
                storage jsonb NOT NULL DEFAULT '{}'::jsonb,
                version bigint NOT NULL DEFAULT 0,
                UNIQUE (oidc_issuer, oidc_subject)
            )`);
            await pool.query('ALTER TABLE aura_accounts ADD COLUMN IF NOT EXISTS search_consent boolean NOT NULL DEFAULT false');
            await pool.query('ALTER TABLE aura_accounts ADD COLUMN IF NOT EXISTS deleting boolean NOT NULL DEFAULT false');
            await pool.query('ALTER TABLE aura_accounts ADD COLUMN IF NOT EXISTS deletion_memory_done boolean NOT NULL DEFAULT false');
            await pool.query('ALTER TABLE aura_accounts ADD COLUMN IF NOT EXISTS deletion_examples_done boolean NOT NULL DEFAULT false');
            await pool.query(`CREATE TABLE IF NOT EXISTS aura_sessions (
                token_hash text PRIMARY KEY,
                account_id uuid NOT NULL REFERENCES aura_accounts(id) ON DELETE CASCADE,
                csrf_token text NOT NULL,
                expires_at timestamptz NOT NULL
            )`);
            await pool.query(`CREATE TABLE IF NOT EXISTS aura_login_flows (
                state_hash text PRIMARY KEY,
                pkce_verifier text NOT NULL,
                expires_at timestamptz NOT NULL
            )`);
            await pool.query('CREATE INDEX IF NOT EXISTS aura_sessions_account_id ON aura_sessions(account_id)');
            await pool.query('CREATE INDEX IF NOT EXISTS aura_sessions_expires_at ON aura_sessions(expires_at)');
            await pool.query('CREATE INDEX IF NOT EXISTS aura_login_flows_expires_at ON aura_login_flows(expires_at)');
            await pool.query(`CREATE TABLE IF NOT EXISTS aura_usage_events (
                id uuid PRIMARY KEY,
                account_id uuid NOT NULL REFERENCES aura_accounts(id) ON DELETE CASCADE,
                kind text NOT NULL,
                units bigint NOT NULL,
                created_at timestamptz NOT NULL
            )`);
            await pool.query(`CREATE TABLE IF NOT EXISTS aura_request_leases (
                id uuid PRIMARY KEY,
                account_id uuid NOT NULL REFERENCES aura_accounts(id) ON DELETE CASCADE,
                kind text NOT NULL,
                expires_at timestamptz NOT NULL
            )`);
            await pool.query(`CREATE TABLE IF NOT EXISTS aura_account_operations (
                id uuid PRIMARY KEY,
                account_id uuid NOT NULL REFERENCES aura_accounts(id) ON DELETE CASCADE,
                kind text NOT NULL,
                expires_at timestamptz NOT NULL
            )`);
            await pool.query('CREATE INDEX IF NOT EXISTS aura_usage_events_scope ON aura_usage_events(account_id, kind, created_at)');
            await pool.query('CREATE INDEX IF NOT EXISTS aura_request_leases_scope ON aura_request_leases(account_id, kind, expires_at)');
            await pool.query('CREATE INDEX IF NOT EXISTS aura_account_operations_scope ON aura_account_operations(account_id, expires_at)');
        },
        async ping() {
            const result = await pool.query('SELECT 1 AS ok');
            return Number(result.rows[0]?.ok) === 1;
        },
        async cleanupExpiredAuthRows(now = new Date()) {
            await pool.query('DELETE FROM aura_sessions WHERE expires_at <= $1', [now]);
            await pool.query('DELETE FROM aura_login_flows WHERE expires_at <= $1', [now]);
            await pool.query('DELETE FROM aura_request_leases WHERE expires_at <= $1', [now]);
            await pool.query('DELETE FROM aura_account_operations WHERE expires_at <= $1', [now]);
            await pool.query('DELETE FROM aura_usage_events WHERE created_at < $1', [new Date(now.getTime() - (62 * 24 * 60 * 60 * 1000))]);
        },
        async acquireUsage(accountId, kind, options = {}) {
            const limit = positiveInteger(options.limit, 'Usage limit');
            const concurrent = positiveInteger(options.concurrent, 'Concurrency limit');
            const windowMs = positiveInteger(options.windowMs, 'Usage window');
            const leaseMs = positiveInteger(options.leaseMs, 'Lease duration');
            const units = positiveInteger(options.units, 'Usage units');
            const budget = positiveInteger(options.budget, 'Usage budget');
            const now = options.now instanceof Date ? options.now : new Date();
            if (!accountId || !String(kind || '').trim() || Number.isNaN(now.getTime())) {
                throw new TypeError('A valid account, usage kind, and time are required');
            }

            const client = await pool.connect();
            const leaseId = crypto.randomUUID();
            try {
                await client.query('BEGIN');
                const account = await client.query(
                    'SELECT id FROM aura_accounts WHERE id=$1 AND deleting=false FOR UPDATE',
                    [accountId]
                );
                if (!account.rows.length) throw usageError('AURA_ACCOUNT_UNAVAILABLE', 'Account is unavailable');

                await client.query('DELETE FROM aura_request_leases WHERE expires_at <= $1', [now]);
                const active = await client.query(
                    'SELECT count(*)::int AS count FROM aura_request_leases WHERE account_id=$1 AND kind=$2',
                    [accountId, kind]
                );
                if (Number(active.rows[0]?.count) >= concurrent) {
                    throw usageError('AURA_CONCURRENCY_LIMIT', 'Too many requests are already running for this account');
                }

                const windowStart = new Date(now.getTime() - windowMs);
                const recent = await client.query(
                    'SELECT count(*)::int AS count FROM aura_usage_events WHERE account_id=$1 AND kind=$2 AND created_at > $3',
                    [accountId, kind, windowStart]
                );
                if (Number(recent.rows[0]?.count) >= limit) {
                    throw usageError('AURA_RATE_LIMIT', 'This account has reached its request limit');
                }

                const budgetStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
                const used = await client.query(
                    'SELECT COALESCE(sum(units), 0)::bigint AS units FROM aura_usage_events WHERE account_id=$1 AND kind=$2 AND created_at >= $3',
                    [accountId, kind, budgetStart]
                );
                if (Number(used.rows[0]?.units || 0) + units > budget) {
                    throw usageError('AURA_USAGE_BUDGET', 'This account has reached its monthly usage budget');
                }

                await client.query(
                    'INSERT INTO aura_usage_events (id, account_id, kind, units, created_at) VALUES ($1,$2,$3,$4,$5)',
                    [crypto.randomUUID(), accountId, kind, units, now]
                );
                await client.query(
                    'INSERT INTO aura_request_leases (id, account_id, kind, expires_at) VALUES ($1,$2,$3,$4)',
                    [leaseId, accountId, kind, new Date(now.getTime() + leaseMs)]
                );
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                throw error;
            } finally {
                client.release();
            }

            let released = false;
            return async () => {
                if (released) return;
                await pool.query('DELETE FROM aura_request_leases WHERE id=$1', [leaseId]);
                released = true;
            };
        },
        async beginAccountOperation(accountId, kind, { leaseMs = 120000 } = {}) {
            positiveInteger(leaseMs, 'Account operation lease');
            if (!accountId || !String(kind || '').trim()) throw new TypeError('A valid account operation is required');
            const client = await pool.connect();
            const operationId = crypto.randomUUID();
            try {
                await client.query('BEGIN');
                const account = await client.query(
                    'SELECT id FROM aura_accounts WHERE id=$1 AND deleting=false FOR UPDATE',
                    [accountId]
                );
                if (!account.rows.length) {
                    throw usageError('AURA_ACCOUNT_DELETING', 'Account deletion is in progress');
                }
                await client.query(
                    'INSERT INTO aura_account_operations (id, account_id, kind, expires_at) VALUES ($1,$2,$3,$4)',
                    [operationId, accountId, kind, new Date(Date.now() + leaseMs)]
                );
                await client.query('COMMIT');
            } catch (error) {
                await client.query('ROLLBACK').catch(() => {});
                throw error;
            } finally {
                client.release();
            }
            let released = false;
            return async () => {
                if (released) return;
                await pool.query('DELETE FROM aura_account_operations WHERE id=$1', [operationId]);
                released = true;
            };
        },
        async waitForAccountOperations(accountId, { timeoutMs = 5000, pollMs = 50 } = {}) {
            positiveInteger(timeoutMs, 'Account operation wait timeout');
            positiveInteger(pollMs, 'Account operation poll interval');
            const deadline = Date.now() + timeoutMs;
            while (true) {
                const now = new Date();
                await pool.query('DELETE FROM aura_account_operations WHERE expires_at <= $1', [now]);
                const active = await pool.query(
                    'SELECT count(*)::int AS count FROM aura_account_operations WHERE account_id=$1',
                    [accountId]
                );
                if (Number(active.rows[0]?.count) === 0) return true;
                if (Date.now() >= deadline) return false;
                await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, Math.max(1, deadline - Date.now()))));
            }
        },
        async accountForIdentity(issuer, subject) {
            if (!issuer || !subject) throw new Error('Verified identity is required');
            await pool.query(`INSERT INTO aura_accounts (id, oidc_issuer, oidc_subject)
                VALUES ($1, $2, $3) ON CONFLICT (oidc_issuer, oidc_subject) DO NOTHING`,
            [crypto.randomUUID(), issuer, subject]);
            const result = await pool.query('SELECT * FROM aura_accounts WHERE oidc_issuer=$1 AND oidc_subject=$2', [issuer, subject]);
            return toAccount(result.rows[0], cipher);
        },
        async loadAccount(accountId) {
            const result = await pool.query('SELECT * FROM aura_accounts WHERE id=$1', [accountId]);
            return toAccount(result.rows[0], cipher);
        },
        async saveSnapshot(accountId, version, storage) {
            validateHostedSnapshot(storage);
            const encrypted = cipher.encrypt(storage, `account:${accountId}:storage`);
            const result = await pool.query(`UPDATE aura_accounts SET storage=$3::jsonb, version=version+1
                WHERE id=$1 AND version=$2 AND deleting=false RETURNING version`, [accountId, version, JSON.stringify(encrypted)]);
            if (!result.rows.length) {
                const account = await this.loadAccount(accountId);
                if (account?.deleting) throw new Error('Account deletion is in progress');
                throw new Error('Account state version conflict');
            }
            return { version: Number(result.rows[0].version) };
        },
        async saveSearchConsent(accountId, enabled) {
            if (typeof enabled !== 'boolean') throw new TypeError('Web-search consent must be a boolean');
            const result = await pool.query('UPDATE aura_accounts SET search_consent=$2 WHERE id=$1 RETURNING search_consent', [accountId, enabled]);
            if (!result.rows.length) throw new Error('Account not found');
            return result.rows[0].search_consent === true;
        },
        async deleteAccount(accountId) {
            const result = await pool.query('DELETE FROM aura_accounts WHERE id=$1 RETURNING id', [accountId]);
            return result.rows.length > 0;
        },
        async beginAccountDeletion(accountId) {
            const result = await pool.query(`UPDATE aura_accounts
                SET deleting=true, deletion_memory_done=false, deletion_examples_done=false
                WHERE id=$1 AND deleting=false RETURNING id`, [accountId]);
            return result.rows.length > 0;
        },
        async markAccountDeletionScope(accountId, scope) {
            const column = scope === 'memory'
                ? 'deletion_memory_done'
                : (scope === 'personal_examples' ? 'deletion_examples_done' : null);
            if (!column) throw new TypeError('Unknown account deletion scope');
            const result = await pool.query(
                `UPDATE aura_accounts SET ${column}=true WHERE id=$1 AND deleting=true RETURNING id`,
                [accountId]
            );
            return result.rows.length > 0;
        },
        async pendingAccountDeletions() {
            const result = await pool.query('SELECT * FROM aura_accounts WHERE deleting=true ORDER BY id');
            return result.rows.map((row) => toAccount(row, cipher));
        },
        async issueSession(tokenHash, accountId, csrfToken, expiresAt) {
            await pool.query('INSERT INTO aura_sessions (token_hash, account_id, csrf_token, expires_at) VALUES ($1,$2,$3,$4)',
                [tokenHash, accountId, csrfToken, expiresAt]);
        },
        async resolveSession(tokenHash) {
            await pool.query('DELETE FROM aura_sessions WHERE token_hash=$1 AND expires_at <= now()', [tokenHash]);
            const result = await pool.query(`SELECT s.account_id, s.csrf_token FROM aura_sessions s
                JOIN aura_accounts a ON a.id=s.account_id
                WHERE s.token_hash=$1 AND s.expires_at > now() AND a.deleting=false`, [tokenHash]);
            return result.rows.length ? { accountId: result.rows[0].account_id, csrfToken: result.rows[0].csrf_token } : null;
        },
        async revokeSession(tokenHash) {
            await pool.query('DELETE FROM aura_sessions WHERE token_hash=$1', [tokenHash]);
        },
        async createLoginFlow(stateHash, verifier, expiresAt) {
            await pool.query('INSERT INTO aura_login_flows (state_hash, pkce_verifier, expires_at) VALUES ($1,$2,$3)',
                [stateHash, verifier, expiresAt]);
        },
        async consumeLoginFlow(stateHash) {
            const result = await pool.query(
                'DELETE FROM aura_login_flows WHERE state_hash=$1 RETURNING pkce_verifier, expires_at',
                [stateHash]
            );
            if (!result.rows.length || new Date(result.rows[0].expires_at) <= new Date()) return null;
            return { verifier: result.rows[0].pkce_verifier };
        },
        async ownedProfileIds(accountId) {
            const account = await this.loadAccount(accountId);
            if (!account || account.deleting || !account.storage?.[REGISTRY_KEY]) return [];
            try {
                const registry = JSON.parse(account.storage[REGISTRY_KEY]);
                return (registry.profiles || []).map((profile) => normalizeProfileId(profile.id)).filter(Boolean);
            } catch (_error) {
                return [];
            }
        }
    };
}

module.exports = { createHostedStore, validateHostedSnapshot };
