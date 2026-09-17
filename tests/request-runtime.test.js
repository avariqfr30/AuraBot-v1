const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createRuntime } = require('../public/js/request-runtime');

const never = () => new Promise(() => {});
const ok = (data) => ({ ok: true, status: 200, json: async () => data });

test('request deadline covers hung headers and hung response bodies', async () => {
    for (const fetchImpl of [never, async () => ({ ...ok(null), json: never })]) {
        const runtime = createRuntime({ fetchImpl, requestTimeoutMs: 20 });
        await assert.rejects(runtime.fetchJson('/api/test'), { name: 'TimeoutError' });
    }
});

test('stop aborts transport, rejects waiting response and permits a new turn', async () => {
    let signal;
    const runtime = createRuntime({ fetchImpl: async (_url, options) => {
        signal = options.signal;
        return never();
    } });
    runtime.beginTurn();
    const request = runtime.fetchJson('/api/generate');
    const rejection = assert.rejects(request, { name: 'AbortError' });
    runtime.cancelTurn();
    await rejection;
    assert.equal(signal.aborted, true);
    await assert.rejects(runtime.fetchJson('/api/continuation'), { name: 'AbortError' });
    runtime.endTurn();
    runtime.beginTurn();
    assert.equal(runtime.getTurnSignal().aborted, false);
    runtime.endTurn();
});

test('late completion cannot turn a canceled request into success', async () => {
    let finish;
    const runtime = createRuntime({ fetchImpl: () => new Promise((resolve) => { finish = resolve; }) });
    runtime.beginTurn();
    const request = runtime.fetchJson('/api/generate');
    const rejection = assert.rejects(request, { name: 'AbortError' });
    runtime.cancelTurn();
    finish(ok({ response: 'late reply' }));
    await rejection;
    runtime.endTurn();
});

test('optional retrieval times out, skips repeated requests during cooldown, then recovers', async () => {
    let now = 0;
    let calls = 0;
    const runtime = createRuntime({ retrievalTimeoutMs: 15, cooldownMs: 100, now: () => now });
    const fallback = { matches: [] };
    const stalled = () => { calls += 1; return never(); };
    assert.deepEqual(await runtime.retrieve(stalled, fallback), fallback);
    assert.equal(runtime.isRetrievalUnavailable(), true);
    assert.deepEqual(await runtime.retrieve(stalled, fallback), fallback);
    assert.equal(calls, 1);
    now = 101;
    const result = await runtime.retrieve(async () => ({ matches: ['recovered'] }), fallback);
    assert.deepEqual(result, { matches: ['recovered'] });
});

test('canceling retrieval propagates cancellation without disabling future retrieval', async () => {
    const runtime = createRuntime();
    runtime.beginTurn();
    const request = runtime.retrieve(never, {});
    const rejection = assert.rejects(request, { name: 'AbortError' });
    runtime.cancelTurn();
    await rejection;
    runtime.endTurn();
    runtime.beginTurn();
    assert.deepEqual(await runtime.retrieve(async () => ({ ready: true }), {}), { ready: true });
    runtime.endTurn();
});

test('overall turn deadline ends a stalled operation', async () => {
    const runtime = createRuntime({ turnTimeoutMs: 20 });
    runtime.beginTurn();
    await assert.rejects(runtime.waitFor(never), { name: 'TimeoutError' });
    runtime.endTurn();
});

test('background requests do not inherit a canceled turn', async () => {
    const runtime = createRuntime({ fetchImpl: async () => ok({ saved: true }) });
    runtime.beginTurn();
    runtime.cancelTurn();
    const result = await runtime.fetchJson('/api/store', { signal: null });
    assert.deepEqual(result.data, { saved: true });
    runtime.endTurn();
});
