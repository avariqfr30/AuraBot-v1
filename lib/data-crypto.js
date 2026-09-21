'use strict';

const crypto = require('node:crypto');

const ALGORITHM = 'aes-256-gcm';
const AAD_PREFIX = 'aura-hosted-data-v1';

function associatedData(context) {
    const value = String(context || '').trim();
    if (!value || value.length > 300) throw new Error('Encryption context is required');
    return Buffer.from(`${AAD_PREFIX}:${value}`);
}

function decodeEncryptionKey(encodedKey) {
    const encoded = String(encodedKey || '').trim();
    const key = Buffer.from(encoded, 'base64');
    if (key.length !== 32 || key.toString('base64') !== encoded) {
        throw new Error('AURA_DATA_ENCRYPTION_KEY must be canonical base64 for exactly 32 bytes');
    }
    return key;
}

function createDataCipher(encodedKey, keyId = 'primary') {
    const key = decodeEncryptionKey(encodedKey);
    const kid = String(keyId || '').trim();
    if (!kid || kid.length > 80) throw new Error('A valid encryption key ID is required');
    return {
        keyId: kid,
        encrypt(value, context) {
            const iv = crypto.randomBytes(12);
            const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
            cipher.setAAD(associatedData(context));
            const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
            return {
                v: 1,
                alg: 'A256GCM',
                kid,
                iv: iv.toString('base64'),
                tag: cipher.getAuthTag().toString('base64'),
                data: data.toString('base64')
            };
        },
        decrypt(envelope, context) {
            if (
                envelope?.v !== 1 || envelope?.alg !== 'A256GCM' || envelope?.kid !== kid ||
                !envelope.iv || !envelope.tag || !envelope.data
            ) throw new Error('Invalid or unsupported encrypted data envelope');
            const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, 'base64'));
            decipher.setAAD(associatedData(context));
            decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
            const plaintext = Buffer.concat([
                decipher.update(Buffer.from(envelope.data, 'base64')),
                decipher.final()
            ]).toString('utf8');
            return JSON.parse(plaintext);
        }
    };
}

function createDataKeyring(encodedKey, keyId, previousEncodedKey, previousKeyId) {
    if (Boolean(previousEncodedKey) !== Boolean(previousKeyId)) {
        throw new Error('Previous encryption key and key ID must be configured together');
    }
    const current = createDataCipher(encodedKey, keyId);
    const previous = previousEncodedKey ? createDataCipher(previousEncodedKey, previousKeyId) : null;
    return {
        keyId: current.keyId,
        encrypt: (value, context) => current.encrypt(value, context),
        decrypt(envelope, context) {
            if (envelope?.kid === current.keyId) return current.decrypt(envelope, context);
            if (previous && envelope?.kid === previous.keyId) return previous.decrypt(envelope, context);
            throw new Error('Invalid or unsupported encrypted data envelope');
        }
    };
}

module.exports = { createDataCipher, createDataKeyring, decodeEncryptionKey };
