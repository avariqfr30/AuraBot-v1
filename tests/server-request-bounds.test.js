'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { ChromaClient } = require('chromadb');

const {
    RequestTimeoutError,
    createRequestAbortController,
    fetchWithTimeout,
    getRequestSignal,
    isRequestTimeout,
    memoizeRecoverablePromise,
    normalizeTimeoutMs,
    runWithRequestContext
} = require('../lib/request-bounds');

assert.equal(normalizeTimeoutMs('8', 100), 8);
assert.equal(normalizeTimeoutMs('invalid', 100), 100);
assert.equal(isRequestTimeout(new RequestTimeoutError('test', 10)), true);

async function startServer(handler) {
    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return server;
}

async function stopServer(server) {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
}

async function run() {
    const emptyResponse = await fetchWithTimeout(
        async () => new Response(null, { status: 204 }),
        'http://example.test'
    );
    assert.equal(emptyResponse.status, 204, 'transport wrapper must preserve no-content responses');

    const disconnected = new AbortController();
    disconnected.abort(new Error('browser disconnected'));
    let latePhaseStarted = false;
    await runWithRequestContext(disconnected.signal, async () => {
        assert.equal(getRequestSignal(), disconnected.signal);
        await assert.rejects(fetchWithTimeout(async () => {
            latePhaseStarted = true;
            return new Response('{}');
        }, 'http://example.test'), /browser disconnected/);
    });
    assert.equal(latePhaseStarted, false, 'a disconnected request must not start a later Chroma phase');
    assert.equal(getRequestSignal(), undefined, 'request cancellation must not leak to another request');

    const healthyServer = await startServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
    });
    try {
        const address = healthyServer.address();
        const response = await fetchWithTimeout(
            globalThis.fetch,
            `http://127.0.0.1:${address.port}`,
            {},
            { timeoutMs: 250, label: 'healthy test request' }
        );
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { ok: true });
    } finally {
        await stopServer(healthyServer);
    }

    let resolveStalledSocketClosed;
    const stalledSocketClosed = new Promise((resolve) => {
        resolveStalledSocketClosed = resolve;
    });
    const stalledServer = await startServer((_req, res) => {
        res.on('close', () => resolveStalledSocketClosed(true));
        res.writeHead(200, { 'content-type': 'application/json' });
        res.write('{"ok":');
    });
    try {
        const address = stalledServer.address();
        const startedAt = Date.now();
        await assert.rejects(
            fetchWithTimeout(
                globalThis.fetch,
                `http://127.0.0.1:${address.port}`,
                {},
                { timeoutMs: 60, label: 'stalled test request' }
            ),
            (error) => isRequestTimeout(error) && error.timeoutMs === 60
        );
        assert.ok(Date.now() - startedAt < 1000, 'stalled response must have a bounded body wait');
        const bodyClosed = await Promise.race([
            stalledSocketClosed,
            new Promise((resolve) => setTimeout(() => resolve(false), 500))
        ]);
        assert.equal(bodyClosed, true, 'timed out response body should be cancelled');
    } finally {
        await stopServer(stalledServer);
    }

    const parent = new AbortController();
    let sawAbort = false;
    const waitingFetch = (_input, init) => new Promise((_resolve, reject) => {
        if (init.signal.aborted) {
            sawAbort = true;
            reject(init.signal.reason);
            return;
        }
        init.signal.addEventListener('abort', () => {
            sawAbort = true;
            reject(init.signal.reason);
        }, { once: true });
    });
    const pending = fetchWithTimeout(
        waitingFetch,
        'http://example.test',
        { signal: parent.signal },
        { timeoutMs: 250, label: 'parent abort test' }
    );
    parent.abort(new Error('caller stopped request'));
    await assert.rejects(pending, /caller stopped request/);
    assert.equal(sawAbort, true);

    const preAborted = new AbortController();
    preAborted.abort(new Error('already stopped'));
    let preAbortedFetchCalled = false;
    await assert.rejects(
        fetchWithTimeout(
            () => {
                preAbortedFetchCalled = true;
                return Promise.resolve(new Response('{}'));
            },
            'http://example.test',
            { signal: preAborted.signal },
            { timeoutMs: 250, label: 'pre-aborted test' }
        ),
        /already stopped/
    );
    assert.equal(preAbortedFetchCalled, false, 'pre-aborted request must not invoke the transport');

    const scheduledAbort = new AbortController();
    const scheduledPending = fetchWithTimeout(
        (_input, init) => new Promise((_resolve, reject) => {
            if (init.signal.aborted) {
                reject(init.signal.reason);
                return;
            }
            init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
        }),
        'http://example.test',
        { signal: scheduledAbort.signal },
        { timeoutMs: 250, label: 'scheduled abort test' }
    );
    scheduledAbort.abort(new Error('stopped before transport start'));
    await assert.rejects(scheduledPending, /stopped before transport start/);

    const chromaServer = await startServer((_req, res) => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ 'nanosecond heartbeat': 123 }));
    });
    try {
        const address = chromaServer.address();
        const chroma = new ChromaClient({ host: '127.0.0.1', port: address.port });
        const sdkFetch = chroma.apiClient.getConfig().fetch;
        assert.equal(typeof sdkFetch, 'function');
        chroma.apiClient.setConfig({
            fetch: (input, init) => fetchWithTimeout(
                sdkFetch,
                input,
                init,
                { timeoutMs: 250, label: 'Chroma heartbeat test' }
            )
        });
        assert.equal(await chroma.heartbeat(), 123);
    } finally {
        await stopServer(chromaServer);
    }

    let current = null;
    let attempts = 0;
    const first = memoizeRecoverablePromise(
        async () => {
            attempts += 1;
            throw new Error('temporary collection failure');
        },
        () => current,
        (value) => { current = value; }
    );
    await assert.rejects(first, /temporary collection failure/);
    assert.equal(current, null, 'rejected collection promise must be evicted');
    const second = memoizeRecoverablePromise(
        async () => {
            attempts += 1;
            return { recovered: true };
        },
        () => current,
        (value) => { current = value; }
    );
    assert.deepEqual(await second, { recovered: true });
    assert.equal(attempts, 2);

    const req = new EventEmitter();
    const res = new EventEmitter();
    res.writableEnded = false;
    const requestAbort = createRequestAbortController(req, res);
    req.emit('aborted');
    assert.equal(requestAbort.signal.aborted, true);
    assert.equal(requestAbort.wasClientAborted(), true);
    requestAbort.cleanup();
    assert.equal(req.listenerCount('aborted'), 0);
    assert.equal(res.listenerCount('close'), 0);

    const serverJs = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
    assert.match(serverJs, /apiClient\.getConfig\(\)\.fetch/);
    assert.match(serverJs, /fetchWithTimeout\(/);
    assert.match(serverJs, /EMBEDDING_TIMEOUT_MS/);
    assert.match(serverJs, /memoizeRecoverablePromise\(/);
    assert.match(serverJs, /signal: requestAbort\.signal/);

    console.log('server request bounds tests passed');
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
