'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { newDb } = require('pg-mem');
const { createDataCipher } = require('../lib/data-crypto');
const { migrateLegacyAccountStorage } = require('../lib/hosted-migration');

test('hosted storage migration is dry-run by default and encrypts only legacy rows', async () => {
    const pool = new (newDb().adapters.createPg().Pool)();
    const cipher = createDataCipher(Buffer.alloc(32, 4).toString('base64'));
    await pool.query('CREATE TABLE aura_accounts (id text PRIMARY KEY, storage jsonb NOT NULL)');
    await pool.query('INSERT INTO aura_accounts (id, storage) VALUES ($1,$2::jsonb),($3,$4::jsonb),($5,$6::jsonb)', [
        'legacy', JSON.stringify({ private: 'do not store in plaintext' }),
        'empty', '{}',
        'encrypted', JSON.stringify(cipher.encrypt({ private: 'already protected' }, 'account:encrypted:storage'))
    ]);

    assert.deepEqual(await migrateLegacyAccountStorage(pool, cipher), { found: 1, migrated: 0, blocked: 0 });
    assert.match(JSON.stringify((await pool.query("SELECT storage FROM aura_accounts WHERE id='legacy'")).rows[0]), /do not store/);
    assert.deepEqual(await migrateLegacyAccountStorage(pool, cipher, { apply: true }), { found: 1, migrated: 1, blocked: 0 });
    const migrated = (await pool.query("SELECT storage FROM aura_accounts WHERE id='legacy'")).rows[0].storage;
    assert.equal(migrated.alg, 'A256GCM');
    assert.deepEqual(cipher.decrypt(migrated, 'account:legacy:storage'), { private: 'do not store in plaintext' });
});

test('hosted storage migration rotates rows only with the matching previous key', async () => {
    const pool = new (newDb().adapters.createPg().Pool)();
    const oldCipher = createDataCipher(Buffer.alloc(32, 3).toString('base64'), 'old');
    const newCipher = createDataCipher(Buffer.alloc(32, 4).toString('base64'), 'new');
    await pool.query('CREATE TABLE aura_accounts (id text PRIMARY KEY, storage jsonb NOT NULL)');
    await pool.query('INSERT INTO aura_accounts (id, storage) VALUES ($1,$2::jsonb)', [
        'rotating', JSON.stringify(oldCipher.encrypt({ private: 'rotate me' }, 'account:rotating:storage'))
    ]);
    assert.deepEqual(await migrateLegacyAccountStorage(pool, newCipher), { found: 0, migrated: 0, blocked: 1 });
    await assert.rejects(migrateLegacyAccountStorage(pool, newCipher, { apply: true }), /previous key/);
    assert.deepEqual(
        await migrateLegacyAccountStorage(pool, newCipher, { apply: true, previousCipher: oldCipher }),
        { found: 1, migrated: 1, blocked: 0 }
    );
});
