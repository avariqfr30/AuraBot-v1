'use strict';

function isEncryptedEnvelope(value) {
    return value?.v === 1 && value?.alg === 'A256GCM' && typeof value?.data === 'string';
}

async function migrateLegacyAccountStorage(pool, cipher, { apply = false, previousCipher = null } = {}) {
    if (!pool || typeof pool.query !== 'function') throw new TypeError('A PostgreSQL pool is required');
    if (!cipher || typeof cipher.encrypt !== 'function') throw new TypeError('A hosted data cipher is required');
    const result = await pool.query('SELECT id, storage FROM aura_accounts ORDER BY id');
    const candidates = result.rows.flatMap((row) => {
        const storage = typeof row.storage === 'string' ? JSON.parse(row.storage) : row.storage;
        if (!storage || Object.keys(storage).length === 0 || storage.kid === cipher.keyId) return [];
        if (!isEncryptedEnvelope(storage)) return [{ row, storage }];
        if (previousCipher?.keyId === storage.kid) {
            return [{ row, storage: previousCipher.decrypt(storage, `account:${row.id}:storage`) }];
        }
        return [{ row, blocked: true }];
    });
    const blocked = candidates.filter((candidate) => candidate.blocked).length;
    const migratable = candidates.filter((candidate) => !candidate.blocked);
    if (!apply) return { found: migratable.length, migrated: 0, blocked };
    if (blocked) throw new Error(`${blocked} encrypted account rows require the matching previous key`);

    let migrated = 0;
    for (const { row, storage } of migratable) {
        const updated = await pool.query(
            'UPDATE aura_accounts SET storage=$2::jsonb WHERE id=$1',
            [row.id, JSON.stringify(cipher.encrypt(storage, `account:${row.id}:storage`))]
        );
        migrated += updated.rowCount || 0;
    }
    return { found: migratable.length, migrated, blocked: 0 };
}

module.exports = { isEncryptedEnvelope, migrateLegacyAccountStorage };
