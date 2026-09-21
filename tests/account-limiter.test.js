'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createAccountLimiter } = require('../lib/account-limiter');

test('limits request count and concurrency per account without coupling accounts', () => {
    let now = 0;
    const limiter = createAccountLimiter({ limit: 2, concurrent: 1, windowMs: 100, now: () => now });
    const releaseAlice = limiter.acquire('alice');
    assert.throws(() => limiter.acquire('alice'), (error) => error.code === 'AURA_CONCURRENCY_LIMIT');
    const releaseBob = limiter.acquire('bob');
    releaseBob();
    releaseAlice();
    const second = limiter.acquire('alice');
    second();
    assert.throws(() => limiter.acquire('alice'), (error) => error.code === 'AURA_RATE_LIMIT');
    now = 101;
    limiter.acquire('alice')();
});

test('release is idempotent', () => {
    const limiter = createAccountLimiter({ limit: 2, concurrent: 1, windowMs: 100 });
    const release = limiter.acquire('alice');
    release();
    release();
    limiter.acquire('alice')();
});
