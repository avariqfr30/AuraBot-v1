'use strict';

const { normalizeProfileId } = require('./profile-scope');

function required(env, name) {
    const value = String(env[name] || '').trim();
    if (!value) throw new Error(`${name} is required in hosted mode`);
    return value;
}

function secureUrl(value, name, allowPath = false) {
    let url;
    try {
        url = new URL(value);
    } catch (_error) {
        throw new Error(`${name} must be a valid HTTPS URL`);
    }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || (!allowPath && url.pathname !== '/')) {
        throw new Error(`${name} must be a valid HTTPS URL${allowPath ? '' : ' without a path'}`);
    }
    return url;
}

function modelList(value) {
    return [...new Set(String(value || '').split(',').map((model) => model.trim()).filter(Boolean))];
}

function looksCloudHosted(model) {
    return /(?:^|[:/_-])cloud(?:$|[:/_-])/i.test(model);
}

function loopbackServiceUrl(value, name) {
    let url;
    try {
        url = new URL(required({ [name]: value }, name));
    } catch (_error) {
        throw new Error(`${name} must be a loopback HTTP URL`);
    }
    if (
        !['http:', 'https:'].includes(url.protocol) ||
        !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
        url.username || url.password || url.search || url.hash
    ) throw new Error(`${name} must be a loopback HTTP URL`);
    return url.href.replace(/\/$/, '');
}

function resolveHostedConfig(env = process.env) {
    if (env.AURA_MODE !== 'hosted') return { enabled: false };
    const publicOrigin = secureUrl(required(env, 'AURA_PUBLIC_ORIGIN'), 'AURA_PUBLIC_ORIGIN');
    const issuer = secureUrl(required(env, 'OIDC_ISSUER'), 'OIDC_ISSUER', true);
    const databaseUrl = required(env, 'DATABASE_URL');
    if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) throw new Error('DATABASE_URL must be a PostgreSQL URL');
    const clientId = required(env, 'OIDC_CLIENT_ID');
    const clientSecret = required(env, 'OIDC_CLIENT_SECRET');
    const localModels = modelList(required(env, 'AURA_LOCAL_MODELS'));
    const cloudModels = modelList(required(env, 'AURA_CLOUD_MODELS'));
    if (!cloudModels.includes('gpt-oss:120b-cloud')) {
        throw new Error('AURA_CLOUD_MODELS must include Aura primary model gpt-oss:120b-cloud');
    }
    if (localModels.some(looksCloudHosted) || localModels.some((model) => cloudModels.includes(model))) {
        throw new Error('AURA_LOCAL_MODELS must not contain cloud models');
    }
    const embeddingModel = required(env, 'EMBEDDING_MODEL');
    if (looksCloudHosted(embeddingModel)) throw new Error('EMBEDDING_MODEL must run locally in hosted mode');
    return {
        enabled: true,
        publicOrigin: publicOrigin.origin,
        issuer: issuer.href,
        databaseUrl,
        clientId,
        clientSecret,
        localModels,
        cloudModels,
        embeddingModel,
        ollamaUrl: loopbackServiceUrl(env.OLLAMA_URL, 'OLLAMA_URL'),
        chromaUrl: loopbackServiceUrl(env.CHROMA_URL, 'CHROMA_URL')
    };
}

function authorizeProfile(profileId, profiles) {
    const id = normalizeProfileId(profileId);
    return Boolean(id && Array.isArray(profiles) && profiles.some((profile) => (
        normalizeProfileId(typeof profile === 'string' ? profile : profile?.id) === id
    )));
}

function authorizeModel(config, modelName) {
    const name = String(modelName || '').trim();
    if (!config?.enabled || !name) return null;
    if (config.localModels.includes(name)) return 'local';
    if (config.cloudModels.includes(name)) return 'cloud';
    return null;
}

function filterHostedModels(config, payload) {
    const allowed = new Set([
        ...config.localModels,
        ...config.cloudModels
    ]);
    return {
        ...(payload && typeof payload === 'object' ? payload : {}),
        models: (Array.isArray(payload?.models) ? payload.models : [])
            .filter((model) => allowed.has(String(model?.name || model?.model || '')))
    };
}

module.exports = { resolveHostedConfig, authorizeProfile, authorizeModel, filterHostedModels };
