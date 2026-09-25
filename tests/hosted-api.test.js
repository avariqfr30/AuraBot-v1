'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { newDb } = require('pg-mem');
const { createHostedStore } = require('../lib/hosted-store');
const { createDataCipher } = require('../lib/data-crypto');
const chatRetention = require('../public/js/chat-retention');
const feedback = require('../public/js/feedback-learning');
const intelligence = require('../public/js/intelligence-bundle');

Object.assign(process.env, {
    AURA_MODE: 'hosted',
    AURA_PUBLIC_ORIGIN: 'https://aura.example',
    DATABASE_URL: 'postgres://aura@localhost/aura_test',
    OIDC_ISSUER: 'https://id.example',
    OIDC_CLIENT_ID: 'aura',
    OIDC_CLIENT_SECRET: 'test-secret',
    AURA_LOCAL_MODELS: 'medgemma1.5:4b',
    AURA_CLOUD_MODELS: 'gpt-oss:120b-cloud',
    AURA_PRIMARY_MODEL: 'gpt-oss:120b-cloud',
    AURA_MEDICAL_MODEL: 'medgemma1.5:4b',
    EMBEDDING_MODEL: 'bge-m3:latest',
    OLLAMA_URL: 'http://127.0.0.1:11434',
    CHROMA_URL: 'http://127.0.0.1:8000',
    SERPER_API_KEY: '',
    AURA_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64')
});
const { initializeHostedRuntime, startServer } = require('../server');

async function signIn(base, subject) {
    const login = await fetch(`${base}/api/auth/login`, { redirect: 'manual' });
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    const loginCookie = login.headers.get('set-cookie').split(';', 1)[0];
    const callback = await fetch(`${base}/api/auth/callback?code=${subject}&state=${state}`, {
        redirect: 'manual', headers: { Cookie: loginCookie }
    });
    return callback.headers.getSetCookie().find((value) => value.startsWith('__Host-aura=')).split(';', 1)[0];
}

test('hosted API protects account state, profile memory, and cloud inference', async () => {
    const pool = new (newDb().adapters.createPg().Pool)();
    const store = createHostedStore(pool, {
        cipher: createDataCipher(process.env.AURA_DATA_ENCRYPTION_KEY)
    });
    const oidc = {
        randomPKCECodeVerifier: () => 'verifier',
        calculatePKCECodeChallenge: async () => 'challenge',
        buildAuthorizationUrl: (_config, params) => new URL(`https://id.example/authorize?state=${params.state}`),
        authorizationCodeGrant: async (_config, url) => ({ claims: () => ({ sub: url.searchParams.get('code') }) })
    };
    const deletions = [];
    const memoryQueries = [];
    const exampleIds = [];
    const memoryAdds = [];
    const exampleWrites = [];
    let aliceAccountId = '';
    const generatedModels = [];
    let releaseMemoryWrite;
    let memoryWriteStarted;
    const memoryWriteBegan = new Promise((resolve) => { memoryWriteStarted = resolve; });
    await initializeHostedRuntime({
        store, oidc, discovery: {},
        ollamaGenerate: async (body) => {
            if (body.prompt === 'force-error') throw new Error('private upstream 127.0.0.1 detail');
            generatedModels.push(body.model);
            return { data: { response: 'Cloud response', done: true } };
        },
        embeddingGenerate: async (texts) => texts.map(() => [0.1, 0.2, 0.3]),
        readiness: {
            database: async () => true,
            ollama: async () => true,
            chroma: async () => true
        },
        collections: {
            getMemoryCollection: async () => ({
                add: async (query) => {
                    memoryAdds.push(query);
                    if (memoryAdds.length > 1) {
                        memoryWriteStarted();
                        await new Promise((resolve) => { releaseMemoryWrite = resolve; });
                    }
                },
                delete: async (query) => deletions.push(['memory', query.where]),
                query: async (query) => {
                    memoryQueries.push(query.where);
                    if (memoryAdds[0] && JSON.stringify(query.where).includes(aliceAccountId)) {
                        return {
                            ids: [[memoryAdds[0].ids[0]]],
                            documents: [[null]],
                            metadatas: [[memoryAdds[0].metadatas[0]]],
                            distances: [[0.12]]
                        };
                    }
                    return { ids: [[]], documents: [[]], metadatas: [[]], distances: [[]] };
                }
            }),
            getPersonalExampleCollection: async () => ({
                delete: async (query) => deletions.push(['examples', query.where]),
                upsert: async (query) => {
                    exampleIds.push(query.ids[0]);
                    exampleWrites.push(query);
                }
            })
        }
    });
    const server = startServer({ host: '127.0.0.1', port: 0 });
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (url, body, headers = {}) => fetch(`${base}${url}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://aura.example', ...headers },
        body: JSON.stringify(body)
    });
    try {
        assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { status: 'ok', mode: 'hosted' });
        assert.deepEqual(await (await fetch(`${base}/api/ready`)).json(), {
            status: 'ready', dependencies: { database: true, ollama: true, chroma: true }
        });
        assert.equal((await post('/api/search_memory', { profileId: 'profile-alice_12345678', query: 'private' })).status, 401);
        const a = await signIn(base, 'alice');
        const b = await signIn(base, 'bob');
        const alice = await (await fetch(`${base}/api/account/bootstrap`, { headers: { Cookie: a } })).json();
        assert.equal(alice.primaryModel, 'gpt-oss:120b-cloud');
        assert.equal(alice.medicalModel, 'medgemma1.5:4b');
        aliceAccountId = alice.accountId;
        const bob = await (await fetch(`${base}/api/account/bootstrap`, { headers: { Cookie: b } })).json();
        assert.notEqual(alice.accountId, bob.accountId);
        const profileId = 'profile-alice_12345678';
        const snapshot = {
            aura_profiles_v1: JSON.stringify({ version: 1, profiles: [{ id: profileId, name: 'Alice', personalIntelligenceState: 'active' }] }),
            aura_active_profile_id: profileId
        };
        const write = await fetch(`${base}/api/account/state`, {
            method: 'PUT',
            headers: { Cookie: a, Origin: 'https://aura.example', 'X-Aura-CSRF': alice.csrfToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ version: alice.version, storage: snapshot })
        });
        assert.equal(write.status, 200);
        assert.deepEqual((await (await fetch(`${base}/api/account/bootstrap`, { headers: { Cookie: a } })).json()).storage, snapshot);
        assert.notDeepEqual((await (await fetch(`${base}/api/account/bootstrap`, { headers: { Cookie: b } })).json()).storage, snapshot);
        assert.equal((await post('/api/search_memory', { profileId, query: 'private' }, { Cookie: b, 'X-Aura-CSRF': bob.csrfToken })).status, 403);
        assert.equal((await post('/api/profile_data/delete', { profileId, scope: 'all' }, { Cookie: b, 'X-Aura-CSRF': bob.csrfToken })).status, 403);
        const bobWrite = await fetch(`${base}/api/account/state`, {
            method: 'PUT',
            headers: { Cookie: b, Origin: 'https://aura.example', 'X-Aura-CSRF': bob.csrfToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ version: bob.version, storage: snapshot })
        });
        assert.equal(bobWrite.status, 200);
        const temporaryCanary = 'TEMPORARY_HOSTED_CANARY';
        const chatState = {
            chats: {
                saved: { id: 'saved', history: [{ role: 'user', content: 'Existing saved chat' }] },
                temporary: { id: 'temporary', retention: 'temporary', history: [{ role: 'user', content: temporaryCanary }] }
            },
            activeChatId: 'temporary',
            feedbackLearning: feedback.createState(),
            intelligenceBundle: intelligence.createBundle()
        };
        const stateKey = `aura_profile_state_v1:${profileId}`;
        const aliceBeforeTemporarySync = await (await fetch(`${base}/api/account/bootstrap`, { headers: { Cookie: a } })).json();
        const temporaryWrite = await fetch(`${base}/api/account/state`, {
            method: 'PUT',
            headers: { Cookie: a, Origin: 'https://aura.example', 'X-Aura-CSRF': alice.csrfToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version: aliceBeforeTemporarySync.version,
                storage: { ...snapshot, [stateKey]: JSON.stringify(chatRetention.projectForPersistence(chatState)) }
            })
        });
        assert.equal(temporaryWrite.status, 200);
        const afterTemporarySync = await (await fetch(`${base}/api/account/bootstrap`, { headers: { Cookie: a } })).json();
        assert.doesNotMatch(afterTemporarySync.storage[stateKey], /TEMPORARY_HOSTED_CANARY/);
        assert.match(afterTemporarySync.storage[stateKey], /Existing saved chat/);
        const savedWrite = await fetch(`${base}/api/account/state`, {
            method: 'PUT',
            headers: { Cookie: a, Origin: 'https://aura.example', 'X-Aura-CSRF': alice.csrfToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                version: afterTemporarySync.version,
                storage: {
                    ...snapshot,
                    [stateKey]: JSON.stringify(chatRetention.projectForPersistence({
                        ...chatState,
                        chats: {
                            ...chatState.chats,
                            temporary: { ...chatState.chats.temporary, retention: 'saved' }
                        }
                    }))
                }
            })
        });
        assert.equal(savedWrite.status, 200);
        const afterExplicitSave = await (await fetch(`${base}/api/account/bootstrap`, { headers: { Cookie: a } })).json();
        assert.match(afterExplicitSave.storage[stateKey], /TEMPORARY_HOSTED_CANARY/);
        assert.equal((await post('/api/store_memory', {
            profileId,
            text: 'unapproved memory',
            metadata: { chatId: 'chat1', role: 'user' }
        }, { Cookie: a, 'X-Aura-CSRF': alice.csrfToken })).status, 400);
        assert.equal((await post('/api/search_memory', {
            profileId,
            query: 'private'
        }, { Cookie: a, 'X-Aura-CSRF': alice.csrfToken })).status, 400);
        assert.equal(memoryAdds.length, 0);
        assert.equal((await post('/api/store_memory', {
            profileId,
            text: 'private memory plaintext',
            metadata: { chatId: 'chat1', role: 'user', approval: 'explicit' }
        }, { Cookie: a, 'X-Aura-CSRF': alice.csrfToken })).status, 200);
        assert.equal(memoryAdds[0].documents, undefined);
        assert.deepEqual(memoryAdds[0].embeddings, [[0.1, 0.2, 0.3]]);
        assert.doesNotMatch(JSON.stringify(memoryAdds[0].metadatas), /private memory plaintext/);
        assert.match(memoryAdds[0].metadatas[0].encryptedDocument, /"alg":"A256GCM"/);
        const aliceMemory = await post('/api/search_memory', { profileId, query: 'private', approvedOnly: true }, { Cookie: a, 'X-Aura-CSRF': alice.csrfToken });
        assert.equal(aliceMemory.status, 200);
        assert.equal((await aliceMemory.json()).matches[0].text, 'private memory plaintext');
        const bobMemory = await post('/api/search_memory', { profileId, query: 'private', approvedOnly: true }, { Cookie: b, 'X-Aura-CSRF': bob.csrfToken });
        assert.equal(bobMemory.status, 200);
        assert.deepEqual((await bobMemory.json()).matches, []);
        assert.deepEqual(memoryQueries, [
            { $and: [{ profileId: { $eq: profileId } }, { ownerId: { $eq: alice.accountId } }, { approval: { $eq: 'explicit' } }] },
            { $and: [{ profileId: { $eq: profileId } }, { ownerId: { $eq: bob.accountId } }, { approval: { $eq: 'explicit' } }] }
        ]);
        const example = {
            id: 'personal-shared_12345678', domain: 'companion', risk: 'low',
            route: 'GeneralFriendAgent', task: 'conversation', preferredModel: 'either',
            userMessage: 'Plan my morning', idealResponse: 'Start with one small step.'
        };
        assert.equal((await post('/api/personal_examples/upsert', { profileId, example }, { Cookie: a, 'X-Aura-CSRF': alice.csrfToken })).status, 200);
        assert.equal((await post('/api/personal_examples/upsert', { profileId, example }, { Cookie: b, 'X-Aura-CSRF': bob.csrfToken })).status, 200);
        assert.notEqual(exampleIds[0], exampleIds[1]);
        assert.equal(exampleWrites[0].documents, undefined);
        assert.equal(exampleWrites[0].metadatas[0].storedDocument, undefined);
        assert.doesNotMatch(JSON.stringify(exampleWrites[0]), /Plan my morning|Start with one small step/);
        const cloudReply = await post('/api/ollama/generate', { model: 'gpt-oss:120b-cloud', prompt: 'private', stream: false }, { Cookie: a, 'X-Aura-CSRF': alice.csrfToken });
        assert.equal(cloudReply.status, 200);
        assert.deepEqual(await cloudReply.json(), { response: 'Cloud response', done: true });
        assert.deepEqual(generatedModels, ['gpt-oss:120b-cloud']);
        const failedReply = await post('/api/ollama/generate', {
            model: 'gpt-oss:120b-cloud', prompt: 'force-error', stream: false
        }, { Cookie: a, 'X-Aura-CSRF': alice.csrfToken });
        assert.equal(failedReply.status, 500);
        const failedBody = await failedReply.json();
        assert.deepEqual(failedBody, { error: 'Ollama generate request failed' });
        assert.doesNotMatch(JSON.stringify(failedBody), /127\.0\.0\.1|private upstream/);
        assert.equal((await post('/api/ollama/generate', { model: 'unlisted:cloud', prompt: 'private' }, { Cookie: a, 'X-Aura-CSRF': alice.csrfToken })).status, 400);
        assert.equal((await post('/api/ollama/generate', {
            model: 'gpt-oss:120b-cloud', prompt: 'x'.repeat(120001)
        }, { Cookie: a, 'X-Aura-CSRF': alice.csrfToken })).status, 413);
        const searchDenied = await post('/api/osint', { primaryQuery: 'private topic' }, { Cookie: a, 'X-Aura-CSRF': alice.csrfToken });
        assert.equal(searchDenied.status, 403);
        assert.equal((await searchDenied.json()).code, 'SEARCH_CONSENT_REQUIRED');
        const consentWrite = await fetch(`${base}/api/account/search-consent`, {
            method: 'PUT',
            headers: { Cookie: a, Origin: 'https://aura.example', 'X-Aura-CSRF': alice.csrfToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled: true })
        });
        assert.equal(consentWrite.status, 200);
        assert.deepEqual(await consentWrite.json(), { enabled: true });
        const changedAccount = await (await fetch(`${base}/api/account/bootstrap`, { headers: { Cookie: a } })).json();
        assert.equal(changedAccount.searchConsent, true);
        const otherAccount = await (await fetch(`${base}/api/account/bootstrap`, { headers: { Cookie: b } })).json();
        assert.equal(otherAccount.searchConsent, false);
        const pendingWrite = post('/api/store_memory', {
            profileId,
            text: 'A pending memory write',
            metadata: { chatId: 'chat1', approval: 'explicit' }
        }, { Cookie: a, 'X-Aura-CSRF': alice.csrfToken });
        await memoryWriteBegan;
        let deletionFinished = false;
        const removedRequest = fetch(`${base}/api/account`, {
            method: 'DELETE', headers: { Cookie: a, Origin: 'https://aura.example', 'X-Aura-CSRF': alice.csrfToken }
        }).then((response) => {
            deletionFinished = true;
            return response;
        });
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(deletionFinished, false, 'account deletion must wait for pending personal writes');
        releaseMemoryWrite();
        assert.equal((await pendingWrite).status, 200);
        const removed = await removedRequest;
        assert.equal(removed.status, 200);
        assert.deepEqual(deletions, [
            ['memory', { ownerId: { $eq: alice.accountId } }],
            ['examples', { ownerId: { $eq: alice.accountId } }]
        ]);
        assert.equal((await fetch(`${base}/api/account/bootstrap`, { headers: { Cookie: a } })).status, 401);
        assert.equal((await fetch(`${base}/api/account/bootstrap`, { headers: { Cookie: b } })).status, 200);
    } finally {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
    }
});
