'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const { newDb } = require('pg-mem');
const { createHostedStore } = require('../lib/hosted-store');
const { createDataCipher } = require('../lib/data-crypto');
const { createHostedAuth } = require('../lib/hosted-auth');

const config = {
    enabled: true,
    publicOrigin: 'https://aura.example',
    issuer: 'https://id.example/',
    clientId: 'aura',
    clientSecret: 'example'
};

async function fixture() {
    const pool = new (newDb().adapters.createPg().Pool)();
    const store = createHostedStore(pool, {
        cipher: createDataCipher(Buffer.alloc(32, 6).toString('base64'))
    });
    await store.initialize();
    const oidc = {
        randomPKCECodeVerifier: () => 'verifier',
        calculatePKCECodeChallenge: async () => 'challenge',
        buildAuthorizationUrl: (_config, params) => new URL(`https://id.example/authorize?state=${params.state}`),
        authorizationCodeGrant: async (_config, url) => ({ claims: () => ({ sub: url.searchParams.get('code') }) })
    };
    const auth = createHostedAuth({ store, config, oidc, discovery: {} });
    const app = express();
    app.use('/api/auth', auth.router);
    app.get('/api/account/bootstrap', auth.requireSession, (req, res) => {
        res.json({ accountId: req.accountId, csrfToken: req.csrfToken });
    });
    app.post('/api/account/change', auth.requireSession, auth.requireCsrf, (_req, res) => res.json({ ok: true }));
    const server = app.listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    return { base: `http://127.0.0.1:${server.address().port}`, server };
}

async function signIn(base, subject) {
    const login = await fetch(`${base}/api/auth/login`, { redirect: 'manual' });
    assert.equal(login.status, 302);
    assert.match(login.headers.get('set-cookie'), /Path=\/(?:;|$)/);
    assert.doesNotMatch(login.headers.get('set-cookie'), /Path=\/api\/auth/);
    const state = new URL(login.headers.get('location')).searchParams.get('state');
    const stateCookie = login.headers.get('set-cookie').split(';', 1)[0];
    const callback = await fetch(`${base}/api/auth/callback?code=${subject}&state=${state}`, {
        redirect: 'manual', headers: { Cookie: stateCookie }
    });
    assert.equal(callback.status, 302);
    const sessionCookie = callback.headers.getSetCookie().find((value) => value.startsWith('__Host-aura='));
    assert.match(sessionCookie, /HttpOnly/);
    assert.match(sessionCookie, /Secure/);
    return sessionCookie.split(';', 1)[0];
}

test('hosted authentication creates isolated accounts and requires CSRF for writes', async () => {
    const { base, server } = await fixture();
    try {
        const a = await signIn(base, 'alice');
        const b = await signIn(base, 'bob');
        assert.equal((await fetch(`${base}/api/account/bootstrap`)).status, 401);
        const alice = await (await fetch(`${base}/api/account/bootstrap`, { headers: { Cookie: a } })).json();
        const bob = await (await fetch(`${base}/api/account/bootstrap`, { headers: { Cookie: b } })).json();
        assert.notEqual(alice.accountId, bob.accountId);
        assert.equal((await fetch(`${base}/api/account/change`, { method: 'POST', headers: { Cookie: a } })).status, 403);
        assert.equal((await fetch(`${base}/api/account/change`, {
            method: 'POST',
            headers: { Cookie: a, Origin: config.publicOrigin, 'X-Aura-CSRF': alice.csrfToken }
        })).status, 200);
        assert.equal((await fetch(`${base}/api/account/change`, {
            method: 'POST',
            headers: { Cookie: a, Origin: config.publicOrigin, 'X-Aura-CSRF': bob.csrfToken }
        })).status, 403);
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
});
