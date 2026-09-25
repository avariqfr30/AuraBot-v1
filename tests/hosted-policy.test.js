'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    resolveHostedConfig,
    authorizeProfile,
    authorizeModel,
    filterHostedModels
} = require('../lib/hosted-policy');

const CONFIG = {
    AURA_MODE: 'hosted',
    AURA_PUBLIC_ORIGIN: 'https://aura.example',
    DATABASE_URL: 'postgres://aura@db/aura',
    OIDC_ISSUER: 'https://login.example',
    OIDC_CLIENT_ID: 'aura',
    OIDC_CLIENT_SECRET: 'not-a-real-secret',
    AURA_LOCAL_MODELS: 'medgemma1.5:4b',
    AURA_CLOUD_MODELS: 'gpt-oss:120b-cloud',
    AURA_PRIMARY_MODEL: 'gpt-oss:120b-cloud',
    AURA_MEDICAL_MODEL: 'medgemma1.5:4b',
    OLLAMA_URL: 'http://127.0.0.1:11434',
    CHROMA_URL: 'http://127.0.0.1:8000',
    EMBEDDING_MODEL: 'bge-m3:latest',
    AURA_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64')
};

test('hosted mode fails closed without identity, database, and HTTPS configuration', () => {
    for (const missing of ['AURA_PUBLIC_ORIGIN', 'DATABASE_URL', 'OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'AURA_DATA_ENCRYPTION_KEY']) {
        const env = { ...CONFIG };
        delete env[missing];
        assert.throws(() => resolveHostedConfig(env), new RegExp(missing));
    }
    assert.throws(() => resolveHostedConfig({ ...CONFIG, AURA_PUBLIC_ORIGIN: 'http://aura.example' }), /HTTPS/);
    assert.throws(() => resolveHostedConfig({ ...CONFIG, OIDC_ISSUER: 'http://login.example' }), /OIDC_ISSUER/);
    assert.throws(() => resolveHostedConfig({ ...CONFIG, AURA_LOCAL_MODELS: '' }), /AURA_LOCAL_MODELS/);
    assert.throws(() => resolveHostedConfig({ ...CONFIG, AURA_DATA_ENCRYPTION_KEY: `${CONFIG.AURA_DATA_ENCRYPTION_KEY}!` }), /canonical base64/);
    assert.throws(() => resolveHostedConfig({ ...CONFIG, HOSTED_INFERENCE_MONTHLY_UNITS: '0' }), /positive integer/);
});

test('model catalog is explicit and treats Ollama cloud aliases as cloud', () => {
    const config = resolveHostedConfig(CONFIG);
    assert.equal(config.primaryModel, 'gpt-oss:120b-cloud');
    assert.equal(config.medicalModel, 'medgemma1.5:4b');
    assert.equal(authorizeModel(config, 'medgemma1.5:4b', false), 'local');
    assert.equal(authorizeModel(config, 'gpt-oss:120b-cloud'), 'cloud');
    assert.equal(authorizeModel(config, 'bge-m3:latest'), null);
    assert.equal(authorizeModel(config, 'unexpected:cloud'), null);
    assert.throws(() => resolveHostedConfig({ ...CONFIG, AURA_LOCAL_MODELS: 'gpt-oss:120b-cloud' }), /cloud/i);
    assert.throws(() => resolveHostedConfig({ ...CONFIG, OLLAMA_URL: 'https://ollama.example' }), /OLLAMA_URL/);
    assert.throws(() => resolveHostedConfig({ ...CONFIG, CHROMA_URL: 'https://chroma.example' }), /CHROMA_URL/);
    assert.throws(() => resolveHostedConfig({ ...CONFIG, EMBEDDING_MODEL: 'embed:cloud' }), /EMBEDDING_MODEL/);
    const tags = { models: [
        { name: 'medgemma1.5:4b' },
        { name: 'gpt-oss:120b-cloud' },
        { name: 'bge-m3:latest' }
    ] };
    assert.deepEqual(filterHostedModels(config, tags, false).models.map((model) => model.name), [
        'medgemma1.5:4b', 'gpt-oss:120b-cloud'
    ]);
    assert.deepEqual(filterHostedModels(config, tags, true).models.map((model) => model.name), [
        'medgemma1.5:4b', 'gpt-oss:120b-cloud'
    ]);
});

test('each client can configure a local conversational model without cloud inference', () => {
    const localConfig = {
        ...CONFIG,
        AURA_LOCAL_MODELS: 'large-local:120b,medgemma1.5:4b',
        AURA_CLOUD_MODELS: '',
        AURA_PRIMARY_MODEL: 'large-local:120b'
    };
    const resolved = resolveHostedConfig(localConfig);
    assert.equal(resolved.primaryModel, 'large-local:120b');
    assert.equal(resolved.medicalModel, 'medgemma1.5:4b');
    assert.equal(authorizeModel(resolved, 'large-local:120b'), 'local');
    assert.equal(authorizeModel(resolved, 'gpt-oss:120b-cloud'), null);
    assert.throws(() => resolveHostedConfig({ ...localConfig, AURA_PRIMARY_MODEL: 'unlisted:120b' }), /AURA_PRIMARY_MODEL/);
    assert.throws(() => resolveHostedConfig({ ...localConfig, AURA_PRIMARY_MODEL: 'medgemma1.5:4b' }), /AURA_PRIMARY_MODEL/);
    assert.throws(() => resolveHostedConfig({ ...localConfig, AURA_MEDICAL_MODEL: 'unlisted:medical' }), /AURA_MEDICAL_MODEL/);
});

test('profile access requires membership in the authenticated account', () => {
    const ownProfile = 'profile-owner_12345678';
    const otherProfile = 'profile-other_12345678';
    assert.equal(authorizeProfile(ownProfile, [ownProfile]), true);
    assert.equal(authorizeProfile(otherProfile, [ownProfile]), false);
    assert.equal(authorizeProfile('', [ownProfile]), false);
});
