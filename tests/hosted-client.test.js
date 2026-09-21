'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHostedClient } = require('../public/js/hosted-client');

class Storage {
    constructor(initial = {}) { this.values = new Map(Object.entries(initial)); }
    get length() { return this.values.size; }
    key(index) { return [...this.values.keys()][index] || null; }
    getItem(key) { return this.values.get(key) ?? null; }
    setItem(key, value) { this.values.set(key, String(value)); }
    removeItem(key) { this.values.delete(key); }
}

function response(status, body) {
    return { ok: status >= 200 && status < 300, status, json: async () => body };
}

test('hosted bootstrap uses account state and syncs versioned changes across devices', async () => {
    const server = { version: 3, storage: { aura_profiles_v1: 'server-registry' }, searchConsent: false };
    const requests = [];
    const fetchImpl = async (url, options = {}) => {
        requests.push({ url, options });
        if (url === '/api/runtime') return response(200, { mode: 'hosted' });
        if (url === '/api/account/bootstrap') return response(200, {
            ...server,
            accountId: 'account-one',
            csrfToken: 'csrf-one',
            models: ['medgemma1.5:4b', 'gpt-oss:120b-cloud']
        });
        if (url === '/api/account/state') {
            const body = JSON.parse(options.body);
            if (body.version !== server.version) return response(409, { error: 'conflict' });
            server.storage = body.storage;
            server.version += 1;
            return response(200, { version: server.version });
        }
        if (url === '/api/account/search-consent') {
            server.searchConsent = JSON.parse(options.body).enabled;
            return response(200, { enabled: server.searchConsent });
        }
        throw new Error(`Unexpected request: ${url}`);
    };
    const rawStorage = new Storage({ aura_profiles_v1: 'old-device-registry' });
    const client = createHostedClient({ fetchImpl, localStorage: rawStorage });
    await client.initialize();
    assert.equal(client.storage.getItem('aura_profiles_v1'), 'server-registry');
    assert.equal(rawStorage.getItem('aura_profiles_v1'), 'old-device-registry');
    assert.deepEqual(client.allowedModels, ['medgemma1.5:4b', 'gpt-oss:120b-cloud']);
    client.storage.setItem('aura_profiles_v1', 'new-server-registry');
    await client.waitForSync();
    assert.equal(server.storage.aura_profiles_v1, 'new-server-registry');
    assert.equal(client.version, 4);
    assert.equal(JSON.parse(requests.find((entry) => entry.url === '/api/account/state').options.body).version, 3);
    await client.setSearchConsent(true);
    assert.equal(client.searchConsent, true);
    assert.equal(server.searchConsent, true);
    const second = createHostedClient({ fetchImpl, localStorage: new Storage() });
    await second.initialize();
    assert.equal(second.storage.getItem('aura_profiles_v1'), 'new-server-registry');
});

test('hosted sync preserves local unsent state and reports version conflicts', async () => {
    const notices = [];
    const client = createHostedClient({
        localStorage: new Storage(),
        onStatus: (message) => notices.push(message),
        fetchImpl: async (url) => url === '/api/runtime'
            ? response(200, { mode: 'hosted' })
            : url === '/api/account/bootstrap'
                ? response(200, { accountId: 'one', storage: {}, version: 0, csrfToken: 'csrf', searchConsent: false })
                : response(409, { error: 'conflict' })
    });
    await client.initialize();
    client.storage.setItem('aura_profiles_v1', 'unsent');
    await assert.rejects(client.waitForSync(), /changed on another device/i);
    assert.equal(client.storage.getItem('aura_profiles_v1'), 'unsent');
    assert.ok(notices.some((message) => /changed on another device/i.test(message)));
});

test('hosted per-account device settings never use another account namespace', async () => {
    const raw = new Storage();
    const client = createHostedClient({
        localStorage: raw,
        fetchImpl: async (url) => url === '/api/runtime'
            ? response(200, { mode: 'hosted' })
            : response(200, { accountId: 'alice', storage: {}, version: 0, csrfToken: 'csrf', searchConsent: false })
    });
    await client.initialize();
    client.settingsStorage.setItem('aura_system_prompt', 'Alice private preference');
    assert.equal(raw.getItem('aura_system_prompt'), null);
    assert.equal(raw.getItem('aura_device_setting_v1:alice:aura_system_prompt'), 'Alice private preference');
});

test('explicit profile import uploads chats as a paused profile without stale promoted examples', async () => {
    const existingId = 'profile-existing_12345678';
    const server = {
        version: 1,
        storage: {
            aura_profiles_v1: JSON.stringify({
                version: 1,
                profiles: [{ id: existingId, name: 'Existing', personalIntelligenceState: 'not_enabled' }]
            }),
            aura_active_profile_id: existingId
        }
    };
    let writes = 0;
    const client = createHostedClient({
        localStorage: new Storage(),
        fetchImpl: async (url, options = {}) => {
            if (url === '/api/runtime') return response(200, { mode: 'hosted' });
            if (url === '/api/account/bootstrap') return response(200, {
                ...server, accountId: 'account-one', csrfToken: 'csrf', searchConsent: false
            });
            if (url === '/api/account/state') {
                writes += 1;
                const body = JSON.parse(options.body);
                server.storage = body.storage;
                return response(200, { version: ++server.version });
            }
            throw new Error(`Unexpected request: ${url}`);
        }
    });
    await client.initialize();
    assert.equal(writes, 0, 'old browser data must not upload automatically');
    const imported = await client.importProfileExport({
        version: 'aura-profile-export-v3',
        profile: { name: 'Old device' },
        personalIntelligenceState: 'active',
        state: {
            chats: { chat1: { history: [{ role: 'user', content: 'Hello' }] } },
            activeChatId: 'chat1',
            feedbackLearning: { entries: { msg1: { rating: 'helpful', promotedExampleId: 'personal-old' } } }
        },
        settings: { experienceStyle: 'practical', locationEnabled: true }
    });
    assert.equal(writes, 1);
    const registry = JSON.parse(server.storage.aura_profiles_v1);
    const profile = registry.profiles.find((entry) => entry.id === imported.id);
    assert.equal(profile.name, 'Old device');
    assert.equal(profile.personalIntelligenceState, 'paused');
    const importedState = JSON.parse(server.storage[`aura_profile_state_v1:${imported.id}`]);
    assert.equal(importedState.chats.chat1.history[0].content, 'Hello');
    assert.equal(importedState.feedbackLearning.entries.msg1.promotedExampleId, '');
    assert.equal(server.storage[`aura_profile_setting_v1:${imported.id}:aura_location_enabled`], 'false');
});

test('account deletion clears synced state and this account device settings only', async () => {
    const raw = new Storage({
        'aura_device_setting_v1:alice:aura_theme': 'dark',
        'aura_device_setting_v1:bob:aura_theme': 'light',
        aura_profiles_v1: 'older local export'
    });
    let deleted = false;
    const client = createHostedClient({
        localStorage: raw,
        fetchImpl: async (url, options = {}) => {
            if (url === '/api/runtime') return response(200, { mode: 'hosted' });
            if (url === '/api/account/bootstrap') return response(200, {
                accountId: 'alice', csrfToken: 'csrf', version: 0, searchConsent: false, storage: {}
            });
            if (url === '/api/account') {
                assert.equal(options.method, 'DELETE');
                assert.equal(options.headers['X-Aura-CSRF'], 'csrf');
                deleted = true;
                return response(200, { deleted: true });
            }
            throw new Error(`Unexpected request: ${url}`);
        }
    });
    await client.initialize();
    await client.deleteAccount();
    assert.equal(deleted, true);
    assert.equal(client.enabled, false);
    assert.equal(raw.getItem('aura_device_setting_v1:alice:aura_theme'), null);
    assert.equal(raw.getItem('aura_device_setting_v1:bob:aura_theme'), 'light');
    assert.equal(raw.getItem('aura_profiles_v1'), 'older local export');
});
