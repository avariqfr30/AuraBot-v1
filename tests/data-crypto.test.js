'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createDataCipher, createDataKeyring } = require('../lib/data-crypto');

const KEY = Buffer.alloc(32, 7).toString('base64');

test('encrypts authenticated JSON without plaintext and detects tampering', () => {
    const cipher = createDataCipher(KEY, 'key-1');
    const value = { message: 'private health note', nested: { count: 2 } };
    const encrypted = cipher.encrypt(value, 'account:alice:storage');
    assert.equal(encrypted.alg, 'A256GCM');
    assert.equal(encrypted.kid, 'key-1');
    assert.doesNotMatch(JSON.stringify(encrypted), /private health note/);
    assert.deepEqual(cipher.decrypt(encrypted, 'account:alice:storage'), value);
    assert.throws(() => cipher.decrypt(encrypted, 'account:bob:storage'));
    const tampered = { ...encrypted, data: `${encrypted.data.slice(0, -2)}AA` };
    assert.throws(() => cipher.decrypt(tampered, 'account:alice:storage'));
});

test('keyring reads the previous key and writes only with the active key', () => {
    const oldKey = Buffer.alloc(32, 6).toString('base64');
    const keyring = createDataKeyring(KEY, 'active', oldKey, 'previous');
    const oldCipher = createDataCipher(oldKey, 'previous');
    const context = 'account:alice:storage';
    assert.deepEqual(keyring.decrypt(oldCipher.encrypt({ value: 1 }, context), context), { value: 1 });
    assert.equal(keyring.encrypt({ value: 2 }, context).kid, 'active');
});

test('rejects weak keys and unexpected envelopes', () => {
    assert.throws(() => createDataCipher(Buffer.alloc(16).toString('base64')), /32 bytes/);
    assert.throws(() => createDataCipher(`${KEY}!`), /canonical base64/);
    const cipher = createDataCipher(KEY);
    assert.throws(() => cipher.decrypt({ alg: 'unknown' }, 'account:alice:storage'), /envelope/);
});
