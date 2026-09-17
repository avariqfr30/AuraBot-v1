const assert = require('node:assert/strict');
const http = require('node:http');

const {
    HEARTBEAT_PATH,
    checkChromaHealth,
    waitForChromaReady
} = require('../lib/chroma-health');

function startMockServer(handler) {
    const server = http.createServer(handler);
    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            server.removeListener('error', reject);
            resolve({ server, port: server.address().port });
        });
    });
}

function stopMockServer(server) {
    if (typeof server.closeAllConnections === 'function') {
        server.closeAllConnections();
    }
    return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
    });
}

async function withMockServer(handler, callback) {
    const { server, port } = await startMockServer(handler);
    try {
        return await callback(port);
    } finally {
        await stopMockServer(server);
    }
}

(async () => {
    let requestedPath = '';
    await withMockServer((request, response) => {
        requestedPath = request.url;
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ 'nanosecond heartbeat': 123456789 }));
    }, async (port) => {
        const result = await checkChromaHealth({ port, timeoutMs: 200 });

        assert.equal(result.ok, true);
        assert.equal(result.statusCode, 200);
        assert.equal(result.payload['nanosecond heartbeat'], 123456789);
    });
    assert.equal(requestedPath, HEARTBEAT_PATH);

    await withMockServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.write('{"nanosecond heartbeat":');
    }, async (port) => {
        const startedAt = Date.now();
        const result = await checkChromaHealth({ port, timeoutMs: 40 });
        const elapsedMs = Date.now() - startedAt;

        assert.equal(result.ok, false);
        assert.equal(result.reason, 'timeout');
        assert.ok(elapsedMs < 500, `heartbeat timeout took ${elapsedMs}ms`);
    });

    await withMockServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'ok' }));
    }, async (port) => {
        const result = await checkChromaHealth({ port, timeoutMs: 100 });
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'invalid_heartbeat');

        const readiness = await waitForChromaReady({
            port,
            timeoutMs: 25,
            maxWaitMs: 90,
            retryDelayMs: 10
        });
        assert.equal(readiness.ok, false);
        assert.equal(readiness.reason, 'startup_timeout');
        assert.ok(readiness.attempts >= 1);
        assert.ok(readiness.lastAttempt);
    });

    await withMockServer((_request, response) => {
        response.writeHead(200, { 'content-type': 'text/plain' });
        response.end(JSON.stringify({ 'nanosecond heartbeat': 123456789 }));
    }, async (port) => {
        const result = await checkChromaHealth({ port, timeoutMs: 100 });
        assert.equal(result.ok, false);
        assert.equal(result.reason, 'invalid_content_type');
    });

    console.log('chroma health tests passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
