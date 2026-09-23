'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { after, before, test } = require('node:test');
const {
    DEFAULT_HOST,
    assertLoopbackHost,
    resolveServerConfig,
    startServer
} = require('../server');

const ROOT_DIR = path.resolve(__dirname, '..');
const SPA_MARKER = '<title>Aura AI Companion</title>';
const PRIVATE_PATHS = [
    '/server.js',
    '/package.json',
    '/package-lock.json',
    '/.env',
    '/lib/request-bounds.js',
    '/tests/model-routing.test.js',
    '/chroma.log',
    '/chroma-data/',
    '/scripts/chroma-up.js'
];

let server;
let baseUrl;
let boundHost;
let temporaryDataDir;

test('empty server configuration resolves to the loopback default', () => {
    const config = resolveServerConfig({});
    assert.equal(DEFAULT_HOST, '127.0.0.1');
    assert.deepEqual(config, { host: '127.0.0.1', port: 3000 });
});

test('local liveness reports local mode without exposing service URLs', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    assert.deepEqual(await response.json(), { status: 'ok', mode: 'local' });
});

before(async () => {
    temporaryDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-security-test-'));
    fs.mkdirSync(path.join(temporaryDataDir, 'chroma'), { recursive: true });
    fs.writeFileSync(path.join(temporaryDataDir, 'chroma.log'), 'representative private runtime log\n');
    fs.writeFileSync(path.join(temporaryDataDir, 'chroma', 'private.sqlite3'), 'representative private runtime database\n');

    const config = resolveServerConfig({});
    server = startServer({ host: config.host, port: 0 });
    await once(server, 'listening');
    const address = server.address();
    boundHost = address.address;
    baseUrl = `http://${address.address}:${address.port}`;
});

after(async () => {
    server.closeAllConnections?.();
    await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
    fs.rmSync(temporaryDataDir, { recursive: true, force: true });
});

test('default server binding is loopback-only', () => {
    assert.equal(boundHost, '127.0.0.1');
    assert.notEqual(boundHost, '0.0.0.0');
    assert.notEqual(boundHost, '::');
});

test('server rejects public network binding before opening a listener', () => {
    assert.throws(() => assertLoopbackHost('0.0.0.0'), /loopback/i);
    assert.throws(() => assertLoopbackHost('::'), /loopback/i);
    assert.equal(assertLoopbackHost('127.0.0.1'), '127.0.0.1');
});

test('root and expected browser assets are public', async () => {
    const paths = [
        '/',
        '/css/style.css',
        '/js/app.js',
        '/contents/concepts/thought-record-info.md'
    ];

    for (const publicPath of paths) {
        const response = await fetch(`${baseUrl}${publicPath}`);
        assert.equal(response.status, 200, `${publicPath} must be public`);
    }
});

test('browser responses set security headers and do not allow framing', async () => {
    const response = await fetch(`${baseUrl}/`);
    const contentSecurityPolicy = response.headers.get('content-security-policy') || '';
    assert.match(contentSecurityPolicy, /default-src 'self'/);
    assert.doesNotMatch(contentSecurityPolicy, /upgrade-insecure-requests/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
});

test('repository-private paths return genuine 404 responses without SPA HTML', async () => {
    for (const privatePath of PRIVATE_PATHS) {
        const response = await fetch(`${baseUrl}${privatePath}`);
        const body = await response.text();
        assert.equal(response.status, 404, `${privatePath} must return 404`);
        assert.doesNotMatch(body, new RegExp(SPA_MARKER), `${privatePath} must not return the SPA`);
    }
});

test('unknown API paths return JSON 404 responses', async () => {
    const response = await fetch(`${baseUrl}/api/not-a-real-route`);
    assert.equal(response.status, 404);
    assert.match(response.headers.get('content-type') || '', /^application\/json\b/);
    assert.deepEqual(await response.json(), { error: 'Not found' });
});

test('cross-origin wildcard headers are absent', async () => {
    const response = await fetch(`${baseUrl}/`, {
        headers: { Origin: 'https://attacker.example' }
    });
    assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('runtime data stays private even when representative files exist', async () => {
    for (const privatePath of ['/.aura-data/chroma.log', '/.aura-data/chroma/private.sqlite3']) {
        const response = await fetch(`${baseUrl}${privatePath}`);
        const body = await response.text();
        assert.equal(response.status, 404, `${privatePath} must return 404`);
        assert.doesNotMatch(body, /representative private runtime/);
        assert.doesNotMatch(body, new RegExp(SPA_MARKER));
    }
});
