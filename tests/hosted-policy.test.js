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
    OLLAMA_URL: 'http://127.0.0.1:11434',
    CHROMA_URL: 'http://127.0.0.1:8000',
    EMBEDDING_MODEL: 'bge-m3:latest'
};

test('hosted mode fails closed without identity, database, and HTTPS configuration', () => {
    for (const missing of ['AURA_PUBLIC_ORIGIN', 'DATABASE_URL', 'OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET']) {
        const env = { ...CONFIG };
        delete env[missing];
        assert.throws(() => resolveHostedConfig(env), new RegExp(missing));
    }
    assert.throws(() => resolveHostedConfig({ ...CONFIG, AURA_PUBLIC_ORIGIN: 'http://aura.example' }), /HTTPS/);
    assert.throws(() => resolveHostedConfig({ ...CONFIG, OIDC_ISSUER: 'http://login.example' }), /OIDC_ISSUER/);
    assert.throws(() => resolveHostedConfig({ ...CONFIG, AURA_LOCAL_MODELS: '' }), /AURA_LOCAL_MODELS/);
});

test('model catalog is explicit and treats Ollama cloud aliases as cloud', () => {
    const config = resolveHostedConfig(CONFIG);
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

test('profile access requires membership in the authenticated account', () => {
    const ownProfile = 'profile-owner_12345678';
    const otherProfile = 'profile-other_12345678';
    assert.equal(authorizeProfile(ownProfile, [ownProfile]), true);
    assert.equal(authorizeProfile(otherProfile, [ownProfile]), false);
    assert.equal(authorizeProfile('', [ownProfile]), false);
});
