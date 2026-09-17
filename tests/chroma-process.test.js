'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');

const {
    hasExpectedProcessToken,
    parsePidRecord
} = require('../lib/chroma-process');

const TOKEN = 'sample-process-token';

test('recognizes only the process carrying the PID file ownership token', () => {
    assert.equal(hasExpectedProcessToken(
        `/opt/bin/chroma run --path /tmp/chroma AURA_CHROMA_PROCESS_TOKEN=${TOKEN}`,
        TOKEN
    ), true);
    assert.equal(hasExpectedProcessToken(
        '/usr/bin/node unrelated.js AURA_CHROMA_PROCESS_TOKEN=another-token',
        TOKEN
    ), false);
    assert.equal(hasExpectedProcessToken('/opt/bin/chroma run --path /tmp/chroma', TOKEN), false);
});

test('parses tokenized PID records and treats legacy PID files as unverified', () => {
    assert.deepEqual(parsePidRecord(JSON.stringify({ pid: 1234, token: TOKEN })), {
        pid: 1234,
        token: TOKEN
    });
    assert.deepEqual(parsePidRecord('1234\n'), { pid: 1234, token: '' });
    assert.deepEqual(parsePidRecord('not-a-pid'), { pid: 0, token: '' });
});
