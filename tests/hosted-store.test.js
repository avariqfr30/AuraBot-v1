'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { newDb } = require('pg-mem');
const { createHostedStore, validateHostedSnapshot } = require('../lib/hosted-store');
const { createDataCipher } = require('../lib/data-crypto');
const CIPHER = createDataCipher(Buffer.alloc(32, 8).toString('base64'));

function profileStorage(profileId, name = 'My Profile') {
    return {
        aura_profiles_v1: JSON.stringify({
            version: 1,
            profiles: [{ id: profileId, name, personalIntelligenceState: 'not_enabled' }]
        }),
        aura_active_profile_id: profileId,
        [`aura_profile_state_v1:${profileId}`]: JSON.stringify({
            chats: { chat1: { history: [{ role: 'user', content: 'private synced conversation' }] } },
            activeChatId: 'chat1'
        })
    };
}

function pool() {
    const database = newDb();
    return new (database.adapters.createPg().Pool)();
}

test('hosted snapshots accept owned profile keys and reject arbitrary storage keys', () => {
    const id = 'profile-owner_12345678';
    assert.deepEqual(validateHostedSnapshot(profileStorage(id)), [id]);
    assert.throws(() => validateHostedSnapshot({ ...profileStorage(id), aura_system_prompt: 'hidden' }), /storage key/);
    assert.throws(() => validateHostedSnapshot({ ...profileStorage(id), [`aura_profile_state_v1:profile-other_12345678`]: '{}' }), /profile/);
    assert.throws(() => validateHostedSnapshot({ ...profileStorage(id), aura_active_profile_id: 'profile-other_12345678' }), /active profile/);
});

test('accounts are isolated, versioned, and external search defaults to off', async () => {
    const dbPool = pool();
    const store = createHostedStore(dbPool, { cipher: CIPHER });
    await store.initialize();
    assert.equal(await store.ping(), true);
    const alice = await store.accountForIdentity('https://id.example', 'alice');
    const bob = await store.accountForIdentity('https://id.example', 'bob');
    assert.notEqual(alice.id, bob.id);
    assert.equal(alice.searchConsent, false);
    assert.equal((await store.accountForIdentity('https://id.example', 'alice')).id, alice.id);

    const data = profileStorage('profile-alice_12345678', 'Alice');
    const saved = await store.saveSnapshot(alice.id, alice.version, data);
    assert.equal(saved.version, alice.version + 1);
    assert.deepEqual((await store.loadAccount(alice.id)).storage, data);
    const raw = await dbPool.query('SELECT storage FROM aura_accounts WHERE id=$1', [alice.id]);
    assert.doesNotMatch(JSON.stringify(raw.rows[0].storage), /private synced conversation/);
    assert.notDeepEqual((await store.loadAccount(bob.id)).storage, data);
    await assert.rejects(store.saveSnapshot(alice.id, alice.version, data), /version conflict/);
    await store.saveSearchConsent(alice.id, true);
    assert.equal((await store.loadAccount(alice.id)).searchConsent, true);
    assert.equal((await store.loadAccount(bob.id)).searchConsent, false);
    assert.equal(await store.beginAccountDeletion(alice.id), true);
    assert.deepEqual(await store.ownedProfileIds(alice.id), []);
    await assert.rejects(store.saveSnapshot(alice.id, saved.version, data), /deletion/i);
    assert.deepEqual((await store.pendingAccountDeletions()).map((account) => account.id), [alice.id]);
    assert.equal(await store.markAccountDeletionScope(alice.id, 'memory'), true);
    assert.equal(await store.markAccountDeletionScope(alice.id, 'personal_examples'), true);
    assert.equal((await store.loadAccount(alice.id)).deletionMemoryDone, true);
    assert.equal((await store.loadAccount(alice.id)).deletionExamplesDone, true);
    await store.deleteAccount(alice.id);
    assert.equal(await store.loadAccount(alice.id), null);
    assert.ok(await store.loadAccount(bob.id));
});

test('sessions and login flows can be consumed and revoked', async () => {
    const store = createHostedStore(pool(), { cipher: CIPHER });
    await store.initialize();
    const user = await store.accountForIdentity('https://id.example', 'alice');
    await store.createLoginFlow('state-hash', 'verifier', new Date(Date.now() + 60000));
    assert.equal((await store.consumeLoginFlow('state-hash')).verifier, 'verifier');
    assert.equal(await store.consumeLoginFlow('state-hash'), null);

    await store.issueSession('session-hash', user.id, 'csrf-hash', new Date(Date.now() + 60000));
    assert.equal((await store.resolveSession('session-hash')).accountId, user.id);
    await store.revokeSession('session-hash');
    assert.equal(await store.resolveSession('session-hash'), null);
});

test('usage limits and concurrency leases are shared through PostgreSQL', async () => {
    const dbPool = pool();
    const first = createHostedStore(dbPool, { cipher: CIPHER });
    const second = createHostedStore(dbPool, { cipher: CIPHER });
    await first.initialize();
    const alice = await first.accountForIdentity('https://id.example', 'usage-alice');
    const bob = await first.accountForIdentity('https://id.example', 'usage-bob');
    const options = {
        limit: 2,
        concurrent: 1,
        windowMs: 60000,
        leaseMs: 60000,
        units: 10,
        budget: 25,
        now: new Date('2026-09-21T00:00:00Z')
    };
    const release = await first.acquireUsage(alice.id, 'inference', options);
    await assert.rejects(second.acquireUsage(alice.id, 'inference', options), (error) => (
        error.code === 'AURA_CONCURRENCY_LIMIT'
    ));
    await second.acquireUsage(bob.id, 'inference', options).then((done) => done());
    await release();
    await second.acquireUsage(alice.id, 'inference', options).then((done) => done());
    await assert.rejects(first.acquireUsage(alice.id, 'inference', options), (error) => (
        error.code === 'AURA_RATE_LIMIT'
    ));
});

test('account deletion blocks new durable writes and waits for existing operations', async () => {
    const store = createHostedStore(pool(), { cipher: CIPHER });
    await store.initialize();
    const account = await store.accountForIdentity('https://id.example', 'deletion-race');
    const release = await store.beginAccountOperation(account.id, 'personal_data', { leaseMs: 60000 });
    assert.equal(await store.beginAccountDeletion(account.id), true);
    await assert.rejects(
        store.beginAccountOperation(account.id, 'personal_data'),
        (error) => error.code === 'AURA_ACCOUNT_DELETING'
    );
    assert.equal(await store.waitForAccountOperations(account.id, { timeoutMs: 5, pollMs: 1 }), false);
    await release();
    assert.equal(await store.waitForAccountOperations(account.id, { timeoutMs: 20, pollMs: 1 }), true);
});
