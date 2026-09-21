'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { newDb } = require('pg-mem');
const { createHostedStore, validateHostedSnapshot } = require('../lib/hosted-store');

function profileStorage(profileId, name = 'My Profile') {
    return {
        aura_profiles_v1: JSON.stringify({
            version: 1,
            profiles: [{ id: profileId, name, personalIntelligenceState: 'not_enabled' }]
        }),
        aura_active_profile_id: profileId,
        [`aura_profile_state_v1:${profileId}`]: JSON.stringify({ chats: {}, activeChatId: null })
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
    const store = createHostedStore(pool());
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
    assert.notDeepEqual((await store.loadAccount(bob.id)).storage, data);
    await assert.rejects(store.saveSnapshot(alice.id, alice.version, data), /version conflict/);
    await store.saveSearchConsent(alice.id, true);
    assert.equal((await store.loadAccount(alice.id)).searchConsent, true);
    assert.equal((await store.loadAccount(bob.id)).searchConsent, false);
    assert.equal(await store.beginAccountDeletion(alice.id), true);
    assert.deepEqual(await store.ownedProfileIds(alice.id), []);
    await assert.rejects(store.saveSnapshot(alice.id, saved.version, data), /deletion/i);
    assert.equal(await store.cancelAccountDeletion(alice.id), true);
    await store.saveSearchConsent(alice.id, false);
    assert.equal((await store.loadAccount(alice.id)).searchConsent, false);
    await store.deleteAccount(alice.id);
    assert.equal(await store.loadAccount(alice.id), null);
    assert.ok(await store.loadAccount(bob.id));
});

test('sessions and login flows can be consumed and revoked', async () => {
    const store = createHostedStore(pool());
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
