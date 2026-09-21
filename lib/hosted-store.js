'use strict';

const crypto = require('node:crypto');
const { normalizeProfileId } = require('./profile-scope');

const MAX_STORAGE_BYTES = 4 * 1024 * 1024;
const REGISTRY_KEY = 'aura_profiles_v1';
const ACTIVE_KEY = 'aura_active_profile_id';
const STATE_PREFIX = 'aura_profile_state_v1:';
const SETTING_PREFIX = 'aura_profile_setting_v1:';
const PERSONAL_INTELLIGENCE_STATES = new Set(['not_enabled', 'active', 'paused']);

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

function toAccount(row) {
    if (!row) return null;
    return {
        id: row.id,
        version: Number(row.version),
        searchConsent: row.search_consent === true,
        storage: typeof row.storage === 'string' ? JSON.parse(row.storage) : row.storage,
        deleting: row.deleting === true
    };
}

function createHostedStore(pool) {
    if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required');
    return {
        async initialize() {
            await pool.query(`CREATE TABLE IF NOT EXISTS aura_accounts (
                id uuid PRIMARY KEY,
                oidc_issuer text NOT NULL,
                oidc_subject text NOT NULL,
                search_consent boolean NOT NULL DEFAULT false,
                deleting boolean NOT NULL DEFAULT false,
                storage jsonb NOT NULL DEFAULT '{}'::jsonb,
                version bigint NOT NULL DEFAULT 0,
                UNIQUE (oidc_issuer, oidc_subject)
            )`);
            await pool.query('ALTER TABLE aura_accounts ADD COLUMN IF NOT EXISTS search_consent boolean NOT NULL DEFAULT false');
            await pool.query('ALTER TABLE aura_accounts ADD COLUMN IF NOT EXISTS deleting boolean NOT NULL DEFAULT false');
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
        },
        async ping() {
            const result = await pool.query('SELECT 1 AS ok');
            return Number(result.rows[0]?.ok) === 1;
        },
        async accountForIdentity(issuer, subject) {
            if (!issuer || !subject) throw new Error('Verified identity is required');
            await pool.query(`INSERT INTO aura_accounts (id, oidc_issuer, oidc_subject)
                VALUES ($1, $2, $3) ON CONFLICT (oidc_issuer, oidc_subject) DO NOTHING`,
            [crypto.randomUUID(), issuer, subject]);
            const result = await pool.query('SELECT * FROM aura_accounts WHERE oidc_issuer=$1 AND oidc_subject=$2', [issuer, subject]);
            return toAccount(result.rows[0]);
        },
        async loadAccount(accountId) {
            const result = await pool.query('SELECT * FROM aura_accounts WHERE id=$1', [accountId]);
            return toAccount(result.rows[0]);
        },
        async saveSnapshot(accountId, version, storage) {
            validateHostedSnapshot(storage);
            const result = await pool.query(`UPDATE aura_accounts SET storage=$3::jsonb, version=version+1
                WHERE id=$1 AND version=$2 AND deleting=false RETURNING version`, [accountId, version, JSON.stringify(storage)]);
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
            const result = await pool.query('UPDATE aura_accounts SET deleting=true WHERE id=$1 AND deleting=false RETURNING id', [accountId]);
            return result.rows.length > 0;
        },
        async cancelAccountDeletion(accountId) {
            const result = await pool.query('UPDATE aura_accounts SET deleting=false WHERE id=$1 AND deleting=true RETURNING id', [accountId]);
            return result.rows.length > 0;
        },
        async issueSession(tokenHash, accountId, csrfToken, expiresAt) {
            await pool.query('INSERT INTO aura_sessions (token_hash, account_id, csrf_token, expires_at) VALUES ($1,$2,$3,$4)',
                [tokenHash, accountId, csrfToken, expiresAt]);
        },
        async resolveSession(tokenHash) {
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
            const result = await pool.query(`DELETE FROM aura_login_flows
                WHERE state_hash=$1 AND expires_at > now() RETURNING pkce_verifier`, [stateHash]);
            return result.rows.length ? { verifier: result.rows[0].pkce_verifier } : null;
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
