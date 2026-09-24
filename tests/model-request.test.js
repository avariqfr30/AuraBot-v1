'use strict';

const assert = require('node:assert/strict');
const { createClient } = require('../public/js/model-request');
const sanitizer = require('../public/js/response-sanitizer');

function makeClient(responses, calls) {
    return createClient({
        postJson: async (endpoint, body, options) => {
            calls.push({ endpoint, body, options });
            return responses.shift();
        },
        endpoint: '/generate',
        responseRuntime: { getTurnSignal: () => undefined },
        modelRouting: { resolveInferencePolicy: () => ({ maxTokens: 512, think: 'high' }) },
        getBackgroundModelName: () => 'gpt-oss:120b-cloud',
        getThinkingModeKey: () => 'auto',
        getModelGenerationOptions: () => ({ temperature: 0.2 }),
        normalizeReplyWhitespace: sanitizer.normalizeReplyWhitespace,
        stripModelReasoningTokens: sanitizer.stripModelReasoningTokens
    });
}

(async () => {
    const calls = [];
    const client = makeClient([
        { response: 'A thoughtful answer that continues because', done_reason: 'length' },
        { response: 'the model reached its limit.' }
    ], calls);
    const reply = await client.callLLM('Question', { signal: 'turn-signal' });
    assert.equal(reply, 'A thoughtful answer that continues because the model reached its limit.');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.options.num_predict, 512);
    assert.equal(calls[0].body.think, 'high');
    assert.equal(calls[1].options.signal, 'turn-signal');
    assert.match(calls[1].body.prompt, /Continue from exactly where it stopped/);

    const emptyCalls = [];
    const emptyClient = makeClient([
        { response: '', thinking: 'private reasoning', done_reason: 'length' },
        { response: 'We can take one small step toward your goal today.' }
    ], emptyCalls);
    assert.equal(await emptyClient.callLLM('Help with the current goal', { signal: 'same-turn' }),
        'We can take one small step toward your goal today.');
    assert.equal(emptyCalls.length, 2);
    assert.match(emptyCalls[1].body.prompt, /Help with the current goal/);
    assert.match(emptyCalls[1].body.prompt, /visible final answer/);
    assert.doesNotMatch(emptyCalls[1].body.prompt, /private reasoning/);
    assert.equal(emptyCalls[1].options.signal, 'same-turn');

    const jsonCalls = [];
    const jsonClient = makeClient([{ response: '{"ok":true}', done_reason: 'length' }], jsonCalls);
    assert.equal(await jsonClient.callLLM('Classify', { format: 'json' }), '{"ok":true}');
    assert.equal(jsonCalls.length, 1);
    assert.equal(jsonCalls[0].body.format, 'json');

    const aborted = createClient({
        endpoint: '/generate',
        responseRuntime: { getTurnSignal: () => undefined },
        modelRouting: { resolveInferencePolicy: () => ({ maxTokens: 512 }) },
        getBackgroundModelName: () => 'gpt-oss:120b-cloud',
        getThinkingModeKey: () => 'auto',
        getModelGenerationOptions: () => ({}),
        normalizeReplyWhitespace: sanitizer.normalizeReplyWhitespace,
        stripModelReasoningTokens: sanitizer.stripModelReasoningTokens,
        postJson: async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }); }
    });
    await assert.rejects(aborted.callLLM('Question'), { name: 'AbortError' });

    console.log('model request tests passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
