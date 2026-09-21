require('dotenv').config({ quiet: true });

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const axios = require('axios');
const { ChromaClient } = require('chromadb');
const { Pool } = require('pg');
const { createHostedStore } = require('./lib/hosted-store');
const { createHostedAuth } = require('./lib/hosted-auth');
const { resolveHostedConfig, authorizeProfile, authorizeModel, filterHostedModels } = require('./lib/hosted-policy');
const { checkChromaHealth } = require('./lib/chroma-health');
const { createDataKeyring } = require('./lib/data-crypto');
const {
    RESPONSE_EXAMPLE_COLLECTION,
    PERSONAL_RESPONSE_EXAMPLE_COLLECTION,
    buildPersonalEmbeddingDocument,
    buildPersonalMetadata
} = require('./lib/response-examples');
const { buildMemoryMatches } = require('./lib/memory-results');
const {
    createRequestAbortController,
    fetchWithTimeout,
    getRequestSignal,
    isRequestAborted,
    isRequestTimeout,
    memoizeRecoverablePromise,
    normalizeTimeoutMs,
    runWithRequestContext
} = require('./lib/request-bounds');
const {
    normalizeProfileId,
    normalizeChatId,
    normalizeProfileDataScope,
    scopeMemoryMetadata,
    buildProfileWhere
} = require('./lib/profile-scope');

const app = express();
const hostedConfig = resolveHostedConfig();
let hostedRuntime = null;
let hostedMaintenanceTimer = null;
const pendingAccountWrites = new Map();

function trackAccountWrite(accountId, operation) {
    const promise = Promise.resolve().then(operation);
    if (!hostedConfig.enabled || !accountId) return promise;
    const pending = pendingAccountWrites.get(accountId) || new Set();
    pending.add(promise);
    pendingAccountWrites.set(accountId, pending);
    promise.finally(() => {
        pending.delete(promise);
        if (!pending.size) pendingAccountWrites.delete(accountId);
    }).catch(() => {});
    return promise;
}

async function waitForAccountWrites(accountId) {
    while (pendingAccountWrites.get(accountId)?.size) {
        await Promise.allSettled([...pendingAccountWrites.get(accountId)]);
    }
}

async function holdAccountRequest(accountId, res) {
    const releaseDurable = await hostedRuntime.store.beginAccountOperation(
        accountId,
        'personal_data',
        { leaseMs: REQUEST_TIMEOUT_MS + 30000 }
    );
    let finish;
    let released = false;
    const pending = new Promise((resolve) => { finish = resolve; });
    const operations = pendingAccountWrites.get(accountId) || new Set();
    operations.add(pending);
    pendingAccountWrites.set(accountId, operations);
    const release = () => {
        if (released) return;
        released = true;
        finish();
        operations.delete(pending);
        if (!operations.size) pendingAccountWrites.delete(accountId);
        releaseDurable().catch((error) => logOperationalError('account_operation_release_failed', error));
    };
    res.once('finish', release);
    res.once('close', release);
}

function logOperationalError(label, error) {
    console.error(JSON.stringify({
        event: label,
        status: Number(error?.response?.status) || undefined,
        code: typeof error?.code === 'string' ? error.code : undefined
    }));
}

async function completeHostedAccountDeletion(accountId) {
    const account = await hostedRuntime.store.loadAccount(accountId);
    if (!account?.deleting) return false;
    await waitForAccountWrites(accountId);
    if (!(await hostedRuntime.store.waitForAccountOperations(accountId))) {
        const error = new Error('Personal-data operations are still draining');
        error.code = 'AURA_ACCOUNT_OPERATIONS_PENDING';
        throw error;
    }
    if (!account.deletionMemoryDone) {
        const memory = await hostedRuntime.collections.getMemoryCollection();
        await memory.delete({ where: { ownerId: { $eq: accountId } } });
        await hostedRuntime.store.markAccountDeletionScope(accountId, 'memory');
    }
    if (!account.deletionExamplesDone) {
        const examples = await hostedRuntime.collections.getPersonalExampleCollection();
        await examples.delete({ where: { ownerId: { $eq: accountId } } });
        await hostedRuntime.store.markAccountDeletionScope(accountId, 'personal_examples');
    }
    return hostedRuntime.store.deleteAccount(accountId);
}

async function runHostedMaintenance() {
    await hostedRuntime.store.cleanupExpiredAuthRows();
    const pending = await hostedRuntime.store.pendingAccountDeletions();
    await Promise.allSettled(pending.map(async (account) => {
        try {
            await completeHostedAccountDeletion(account.id);
        } catch (error) {
            logOperationalError('hosted_account_deletion_retry_failed', error);
        }
    }));
}

async function initializeHostedRuntime({
    store,
    oidc,
    discovery,
    collections,
    ollamaGenerate,
    embeddingGenerate,
    readiness,
    maintenance = false
} = {}) {
    if (!hostedConfig.enabled) throw new Error('Hosted mode is not enabled');
    const cipher = createDataKeyring(
        hostedConfig.dataEncryptionKey,
        hostedConfig.dataKeyId,
        hostedConfig.previousDataEncryptionKey,
        hostedConfig.previousDataKeyId
    );
    const accountStore = store || createHostedStore(
        new Pool({ connectionString: hostedConfig.databaseUrl }),
        { cipher }
    );
    await accountStore.initialize();
    const oidcClient = oidc || await import('openid-client');
    const oidcDiscovery = discovery || await oidcClient.discovery(
        new URL(hostedConfig.issuer), hostedConfig.clientId, hostedConfig.clientSecret
    );
    hostedRuntime = {
        store: accountStore,
        collections: collections || {
            getMemoryCollection,
            getPersonalExampleCollection: getPersonalResponseExampleCollection
        },
        ollamaGenerate,
        embeddingGenerate: embeddingGenerate || ((texts) => ollamaEmbeddingFunction.generate(texts)),
        cipher,
        readiness: readiness || {
            database: () => accountStore.ping(),
            ollama: async () => {
                const response = await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 1500 });
                const available = new Set((response.data?.models || []).map((model) => String(model.name || model.model || '')));
                return response.status === 200 && hostedModels().every((model) => available.has(model));
            },
            chroma: async () => {
                const result = await checkChromaHealth({
                    host: chromaTarget.hostname,
                    port: Number(chromaTarget.port || 8000),
                    timeoutMs: 1500
                });
                return result.ok;
            }
        },
        auth: createHostedAuth({
            store: accountStore,
            config: hostedConfig,
            oidc: oidcClient,
            discovery: oidcDiscovery
        })
    };
    await accountStore.cleanupExpiredAuthRows();
    if (maintenance) {
        await runHostedMaintenance();
        hostedMaintenanceTimer = setInterval(() => {
            runHostedMaintenance().catch((error) => logOperationalError('hosted_maintenance_failed', error));
        }, 5 * 60 * 1000);
        hostedMaintenanceTimer.unref?.();
    }
    return hostedRuntime;
}

function accountWhere(profileId, chatId, accountId) {
    const where = buildProfileWhere(profileId, chatId);
    return accountId
        ? { $and: [where, { ownerId: { $eq: accountId } }] }
        : where;
}

function hostedModels() {
    return [
        ...hostedConfig.localModels,
        ...hostedConfig.cloudModels
    ];
}

const DEFAULT_HOST = '127.0.0.1';

function assertLoopbackHost(host) {
    if (!['127.0.0.1', '::1', 'localhost'].includes(host)) {
        throw new Error('Aura must listen on loopback behind an HTTPS reverse proxy. Set HOST=127.0.0.1.');
    }
    return host;
}

function resolveServerConfig(env = process.env) {
    return {
        host: env.HOST || DEFAULT_HOST,
        port: Number(env.PORT || 3000)
    };
}

const { host: HOST, port: PORT } = resolveServerConfig();
const APP_ROOT = __dirname;
const PUBLIC_DIR = path.join(APP_ROOT, 'public');
const REQUEST_TIMEOUT_MS = normalizeTimeoutMs(process.env.REQUEST_TIMEOUT_MS, 90000);
const CHROMA_TIMEOUT_MS = normalizeTimeoutMs(process.env.CHROMA_TIMEOUT_MS, 10000);
const EMBEDDING_TIMEOUT_MS = normalizeTimeoutMs(process.env.EMBEDDING_TIMEOUT_MS, 8000);
const CHROMA_URL = process.env.CHROMA_URL || 'http://127.0.0.1:8000';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'bge-m3:latest';
const SERPER_API_KEY = process.env.SERPER_API_KEY || '';
const HOSTED_MAX_PROMPT_CHARS = hostedConfig.enabled ? hostedConfig.maxPromptChars : 120000;
const HOSTED_INFERENCE_MONTHLY_UNITS = hostedConfig.enabled ? hostedConfig.inferenceMonthlyUnits : 2000000;
const HOSTED_SEARCH_MONTHLY_REQUESTS = hostedConfig.enabled ? hostedConfig.searchMonthlyRequests : 500;
const chromaTarget = new URL(CHROMA_URL);
const chroma = new ChromaClient({
    host: chromaTarget.hostname,
    port: Number(chromaTarget.port || 8000),
    ssl: chromaTarget.protocol === 'https:'
});
const configuredChromaFetch = chroma.apiClient.getConfig().fetch;
if (typeof configuredChromaFetch === 'function') {
    chroma.apiClient.setConfig({
        fetch: (input, init) => fetchWithTimeout(
            configuredChromaFetch,
            input,
            init,
            { timeoutMs: CHROMA_TIMEOUT_MS, label: 'Chroma request' }
        )
    });
}
let memoryCollectionPromise = null;
let responseExampleCollectionPromise = null;
let personalResponseExampleCollectionPromise = null;
const TAGS_CACHE_TTL_MS = 60 * 1000;
const OSINT_FRESH_CACHE_TTL_MS = 5 * 60 * 1000;
const OSINT_STABLE_CACHE_TTL_MS = 30 * 60 * 1000;
const responseCaches = {
    ollamaTags: new Map(),
    osint: new Map()
};

app.set('trust proxy', hostedConfig.enabled ? 1 : false);
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", 'data:'],
            connectSrc: ["'self'"],
            frameAncestors: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    referrerPolicy: { policy: 'no-referrer' },
    hsts: hostedConfig.enabled ? { maxAge: 31536000, includeSubDomains: true } : false
}));
app.use(express.json({ limit: hostedConfig.enabled ? '5mb' : '2mb' }));
if (hostedConfig.enabled) {
    const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
    const modelLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: 'draft-8', legacyHeaders: false });
    const searchLimiter = rateLimit({ windowMs: 60 * 1000, limit: 15, standardHeaders: 'draft-8', legacyHeaders: false });
    app.use('/api/auth/login', authLimiter);
    app.use('/api/ollama/generate', modelLimiter);
    app.use('/api/osint', searchLimiter);
    app.use('/api/auth', (req, res, next) => {
        if (!hostedRuntime) return res.status(503).json({ error: 'Hosted identity is unavailable.' });
        return hostedRuntime.auth.router(req, res, next);
    });
    app.use('/api', (req, res, next) => {
        if (req.path === '/health' || req.path === '/ready' || req.path === '/runtime') return next();
        if (!hostedRuntime) return res.status(503).json({ error: 'Hosted identity is unavailable.' });
        return hostedRuntime.auth.requireSession(req, res, (error) => {
            if (error) return next(error);
            if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
            return hostedRuntime.auth.requireCsrf(req, res, () => {
                const ownedPaths = new Set([
                    '/store_memory', '/search_memory', '/personal_examples/search',
                    '/personal_examples/upsert', '/personal_examples/delete', '/profile_data/delete'
                ]);
                if (!ownedPaths.has(req.path)) return next();
                const profileId = normalizeProfileId(req.body?.profileId);
                if (!profileId) return res.status(400).json({ error: 'A valid profile is required.' });
                return hostedRuntime.store.ownedProfileIds(req.accountId)
                    .then(async (ids) => {
                        if (!authorizeProfile(profileId, ids)) {
                            return res.status(403).json({ error: 'This profile is not available to your account.' });
                        }
                        req.ownedProfileId = profileId;
                        try {
                            await holdAccountRequest(req.accountId, res);
                        } catch (error) {
                            if (error?.code === 'AURA_ACCOUNT_DELETING') {
                                return res.status(409).json({ error: 'Account deletion is in progress.' });
                            }
                            throw error;
                        }
                        return next();
                    })
                    .catch(next);
            });
        });
    });
}
app.use(express.static(PUBLIC_DIR));
app.use((req, res, next) => {
    if (!req.path.startsWith('/api/')) return next();

    const requestAbort = createRequestAbortController(req, res);
    const cleanup = () => requestAbort.cleanup();
    res.once('finish', cleanup);
    res.once('close', cleanup);
    return runWithRequestContext(requestAbort.signal, next);
});

const ollamaEmbeddingFunction = {
    generate: async (texts) => {
        const requestSignal = getRequestSignal();
        const response = await axios.post(`${OLLAMA_URL}/api/embed`, {
            model: EMBEDDING_MODEL,
            input: texts
        }, {
            timeout: EMBEDDING_TIMEOUT_MS,
            ...(requestSignal ? { signal: requestSignal } : {})
        });
        return response.data.embeddings;
    }
};

function getMemoryCollection() {
    return memoizeRecoverablePromise(
        () => chroma.getOrCreateCollection({
            name: 'aura_long_term_memory',
            embeddingFunction: ollamaEmbeddingFunction
        }),
        () => memoryCollectionPromise,
        (value) => { memoryCollectionPromise = value; }
    );
}

function getResponseExampleCollection() {
    return memoizeRecoverablePromise(
        () => chroma.getOrCreateCollection({
            name: RESPONSE_EXAMPLE_COLLECTION,
            embeddingFunction: ollamaEmbeddingFunction
        }),
        () => responseExampleCollectionPromise,
        (value) => { responseExampleCollectionPromise = value; }
    );
}

function getPersonalResponseExampleCollection() {
    return memoizeRecoverablePromise(
        () => chroma.getOrCreateCollection({
            name: PERSONAL_RESPONSE_EXAMPLE_COLLECTION,
            embeddingFunction: ollamaEmbeddingFunction
        }),
        () => personalResponseExampleCollectionPromise,
        (value) => { personalResponseExampleCollectionPromise = value; }
    );
}

function normalizeExampleLimit(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 3;
    return Math.min(Math.max(Math.floor(parsed), 1), 4);
}

function normalizePersonalExample(value, profileId) {
    const safe = value && typeof value === 'object' ? value : {};
    const allowedRoutes = new Set([
        'GeneralFriendAgent',
        'CbtAnalystAgent',
        'PlannerAgent'
    ]);
    const id = String(safe.id || '').trim();
    const route = String(safe.route || '').trim();
    const userMessage = String(safe.userMessage || '').trim().slice(0, 4000);
    const idealResponse = String(safe.idealResponse || '').trim().slice(0, 8000);
    const preferredModel = ['gpt-oss', 'medgemma', 'either'].includes(safe.preferredModel)
        ? safe.preferredModel
        : 'either';

    if (
        !/^personal-[a-z0-9_-]{8,160}$/i.test(id) ||
        safe.domain !== 'companion' ||
        safe.risk !== 'low' ||
        !allowedRoutes.has(route) ||
        safe.task !== 'conversation' ||
        !userMessage ||
        !idealResponse
    ) {
        return null;
    }

    return {
        id,
        profileId,
        route,
        task: String(safe.task || 'conversation').trim().slice(0, 80) || 'conversation',
        preferredModel,
        userMessage,
        idealResponse,
        updatedAt: Date.now()
    };
}

function parseStoredExample(metadata, cipher = hostedRuntime?.cipher) {
    try {
        if (metadata?.encryptedDocument) {
            return cipher.decrypt(
                JSON.parse(metadata.encryptedDocument),
                `example:${metadata.ownerId}:${metadata.recordId}`
            );
        }
        const parsed = JSON.parse(metadata?.storedDocument || '');
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_error) {
        return null;
    }
}

function buildHostedMemoryMatches(results, cipher) {
    const ids = Array.isArray(results?.ids?.[0]) ? results.ids[0] : [];
    const distances = Array.isArray(results?.distances?.[0]) ? results.distances[0] : [];
    const metadatas = Array.isArray(results?.metadatas?.[0]) ? results.metadatas[0] : [];
    return ids.flatMap((id, index) => {
        const metadata = metadatas[index] || {};
        if (!id || !metadata.encryptedDocument) return [];
        const decrypted = cipher.decrypt(
            JSON.parse(metadata.encryptedDocument),
            `memory:${metadata.ownerId}:${id}`
        );
        const text = String(decrypted?.text || '').trim();
        if (!text) return [];
        const distance = Number(distances[index]);
        return [{
            id: String(id),
            text,
            distance: Number.isFinite(distance) ? distance : null,
            provenance: {
                source: 'conversation_vector',
                collection: 'aura_long_term_memory',
                chatId: String(metadata.chatId || ''),
                role: String(metadata.role || ''),
                timestamp: Number(metadata.timestamp) || 0
            }
        }];
    });
}

function cleanSearchQuery(value) {
    if (typeof value !== 'string') return '';

    return value
        .replace(/^(here is the query|query|search query):\s*/i, '')
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function normalizeSourceLink(item = {}) {
    return item.link || item.website || item.descriptionLink || null;
}

function readCache(cache, key, ttlMs) {
    const entry = cache.get(key);
    if (!entry) return null;
    if ((Date.now() - entry.createdAt) > ttlMs) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

function writeCache(cache, key, value) {
    cache.set(key, {
        createdAt: Date.now(),
        value
    });
    return value;
}

function hashCacheKey(parts) {
    return crypto
        .createHash('sha1')
        .update(JSON.stringify(parts))
        .digest('hex');
}

function isFreshnessSensitiveQuery(value) {
    const text = String(value || '').toLowerCase();
    if (!text.trim()) return false;

    return [
        /\btoday\b/,
        /\bcurrent\b/,
        /\blatest\b/,
        /\brecent\b/,
        /\bnews\b/,
        /\bnow\b/,
        /\bthis week\b/,
        /\bthis month\b/,
        /\bupdate\b/,
        /\b202[0-9]\b/
    ].some((pattern) => pattern.test(text));
}

function dedupeByLink(items) {
    const seen = new Set();

    return items.filter((item) => {
        const key = item.link || `${item.kind}:${item.title}:${item.query}`;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function pickOrganicResults(query, data) {
    return (data.organic || []).slice(0, 4).map((item, index) => ({
        kind: 'web',
        query,
        rank: item.position || index + 1,
        title: item.title || 'Untitled result',
        snippet: item.snippet || '',
        link: item.link || null,
        source: item.source || item.domain || null,
        date: item.date || null
    }));
}

function pickNewsResults(query, data) {
    return (data.news || []).slice(0, 4).map((item, index) => ({
        kind: 'news',
        query,
        rank: item.position || index + 1,
        title: item.title || 'Untitled article',
        snippet: item.snippet || '',
        link: item.link || null,
        source: item.source || null,
        date: item.date || null
    }));
}

function buildSearchBriefing(query, data) {
    const answerBox = data.answerBox
        ? {
              title: data.answerBox.title || data.answerBox.answer || 'Featured result',
              snippet: data.answerBox.snippet || data.answerBox.answer || data.answerBox.title || '',
              link: normalizeSourceLink(data.answerBox)
          }
        : null;

    const knowledgeGraph = data.knowledgeGraph
        ? {
              title: data.knowledgeGraph.title || '',
              type: data.knowledgeGraph.type || '',
              description: data.knowledgeGraph.description || '',
              website: data.knowledgeGraph.website || null,
              source: data.knowledgeGraph.descriptionSource || null,
              link: normalizeSourceLink(data.knowledgeGraph),
              attributes: data.knowledgeGraph.attributes || {}
          }
        : null;

    const peopleAlsoAsk = (data.peopleAlsoAsk || []).slice(0, 3).map((item) => ({
        question: item.question || '',
        snippet: item.snippet || '',
        link: item.link || null
    }));

    const places = (data.places || []).slice(0, 3).map((item, index) => ({
        kind: 'place',
        query,
        rank: item.position || index + 1,
        title: item.title || 'Untitled place',
        snippet: [item.address, item.description, item.phoneNumber].filter(Boolean).join(' | '),
        link: item.website || null,
        source: item.category || item.type || 'Local result',
        rating: item.rating || null
    }));

    const relatedSearches = (data.relatedSearches || []).slice(0, 5).map((item) => item.query).filter(Boolean);

    const organic = pickOrganicResults(query, data);

    return {
        query,
        answerBox,
        knowledgeGraph,
        peopleAlsoAsk,
        relatedSearches,
        organic,
        places
    };
}

async function requestSerper(endpoint, query) {
    const response = await axios.post(
        `https://google.serper.dev${endpoint}`,
        { q: query },
        {
            headers: {
                'X-API-KEY': SERPER_API_KEY,
                'Content-Type': 'application/json'
            },
            timeout: REQUEST_TIMEOUT_MS
        }
    );

    return response.data;
}

async function buildOsintReport({ primaryQuery, supportingQueries = [], includeNews = true }) {
    const cleanedPrimaryQuery = cleanSearchQuery(primaryQuery);
    const cleanedSupportingQueries = [...new Set((supportingQueries || []).map(cleanSearchQuery))]
        .filter(Boolean)
        .filter((query) => query !== cleanedPrimaryQuery)
        .slice(0, 4);

    if (!cleanedPrimaryQuery) {
        throw new Error('A primary query is required for OSINT research');
    }

    const freshnessSensitive = [cleanedPrimaryQuery, ...cleanedSupportingQueries]
        .some((query) => isFreshnessSensitiveQuery(query));
    const cacheKey = hashCacheKey({
        primaryQuery: cleanedPrimaryQuery,
        supportingQueries: cleanedSupportingQueries,
        includeNews: Boolean(includeNews)
    });
    const cacheTtl = freshnessSensitive ? OSINT_FRESH_CACHE_TTL_MS : OSINT_STABLE_CACHE_TTL_MS;
    const cached = hostedConfig.enabled ? null : readCache(responseCaches.osint, cacheKey, cacheTtl);
    if (cached) return cached;

    const webQueries = [cleanedPrimaryQuery, ...cleanedSupportingQueries];
    const webResponses = await Promise.all(webQueries.map((query) => requestSerper('/search', query)));
    const newsResponse = includeNews ? await requestSerper('/news', cleanedPrimaryQuery) : null;

    const searches = webResponses.map((data, index) => buildSearchBriefing(webQueries[index], data));
    const news = newsResponse ? pickNewsResults(cleanedPrimaryQuery, newsResponse) : [];

    const evidence = dedupeByLink(
        searches.flatMap((search) => [...search.organic, ...search.places]).concat(news)
    );

    const sources = evidence.slice(0, 12).map(({ kind, title, link, source, query, date }) => ({
        kind,
        title,
        link,
        source,
        query,
        date
    }));

    const report = {
        executedAt: new Date().toISOString(),
        primaryQuery: cleanedPrimaryQuery,
        supportingQueries: cleanedSupportingQueries,
        searches,
        news,
        sources,
        evidence
    };
    return hostedConfig.enabled ? report : writeCache(responseCaches.osint, cacheKey, report);
}

function hostedUsageOptions(kind, units = 1) {
    if (kind === 'inference') {
        return {
            limit: 30,
            concurrent: 2,
            windowMs: 60 * 1000,
            leaseMs: REQUEST_TIMEOUT_MS + 15000,
            units,
            budget: HOSTED_INFERENCE_MONTHLY_UNITS
        };
    }
    return {
        limit: 15,
        concurrent: 1,
        windowMs: 60 * 1000,
        leaseMs: REQUEST_TIMEOUT_MS + 15000,
        units: 1,
        budget: HOSTED_SEARCH_MONTHLY_REQUESTS
    };
}

function usageUnitsForPrompt(prompt) {
    return Math.max(1, Math.ceil(String(prompt || '').length / 4));
}

function respondWithUsageError(res, error) {
    const known = new Set(['AURA_CONCURRENCY_LIMIT', 'AURA_RATE_LIMIT', 'AURA_USAGE_BUDGET']);
    if (!known.has(error?.code)) throw error;
    return res.status(429).json({ code: error.code, error: error.message });
}

function respondWithUpstreamError(res, label, error) {
    if (isRequestAborted()) return;

    const status = error.response?.status || (isRequestTimeout(error) ? 504 : 500);
    logOperationalError(label, error);

    res.status(status).json({
        error: `${label} failed`
    });
}

function isChromaUnavailable(error) {
    const message = String(error?.message || '');
    const body = JSON.stringify(error?.response?.data || '');

    return (
        message.includes('Failed to connect to chromadb') ||
        message.includes('ECONNREFUSED') ||
        isRequestTimeout(error) ||
        message.includes('connect') ||
        body.includes('Failed to connect to chromadb')
    );
}

function isSerperUnauthorized(error) {
    const status = error.response?.status;
    return status === 401 || status === 403;
}

app.get('/api/health', async (_req, res) => {
    res.json({
        status: 'ok',
        mode: hostedConfig.enabled ? 'hosted' : 'local'
    });
});

app.get('/api/ready', async (_req, res) => {
    const checks = hostedConfig.enabled
        ? hostedRuntime?.readiness
        : {
            ollama: async () => (await axios.get(`${OLLAMA_URL}/api/tags`, { timeout: 1500 })).status === 200,
            chroma: async () => (await checkChromaHealth({
                host: chromaTarget.hostname,
                port: Number(chromaTarget.port || 8000),
                timeoutMs: 1500
            })).ok
        };
    if (!checks) return res.status(503).json({ status: 'degraded', dependencies: {} });
    const entries = await Promise.all(Object.entries(checks).map(async ([name, check]) => {
        try {
            return [name, (await check()) === true];
        } catch (_error) {
            return [name, false];
        }
    }));
    const dependencies = Object.fromEntries(entries);
    const ready = Object.values(dependencies).every(Boolean);
    return res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'degraded', dependencies });
});

app.get('/api/runtime', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({ mode: hostedConfig.enabled ? 'hosted' : 'local' });
});

if (hostedConfig.enabled) {
    app.get('/api/account/bootstrap', async (req, res) => {
        const account = await hostedRuntime.store.loadAccount(req.accountId);
        if (!account) return res.status(401).json({ error: 'Sign in to Aura first.' });
        return res.set('Cache-Control', 'no-store').json({
            mode: 'hosted',
            accountId: account.id,
            storage: account.storage,
            version: account.version,
            searchConsent: account.searchConsent,
            models: hostedModels(),
            csrfToken: req.csrfToken
        });
    });

    app.put('/api/account/state', async (req, res) => {
        try {
            const version = Number(req.body?.version);
            if (!Number.isSafeInteger(version) || version < 0) {
                return res.status(400).json({ error: 'A valid state version is required.' });
            }
            const saved = await hostedRuntime.store.saveSnapshot(req.accountId, version, req.body?.storage);
            return res.set('Cache-Control', 'no-store').json(saved);
        } catch (error) {
            if (/version conflict/i.test(error.message)) return res.status(409).json({ error: 'Account state changed on another device.' });
            if (/storage|profile|size limit/i.test(error.message)) return res.status(400).json({ error: error.message });
            throw error;
        }
    });

    app.put('/api/account/search-consent', async (req, res) => {
        if (typeof req.body?.enabled !== 'boolean') {
            return res.status(400).json({ error: 'Web-search consent must be true or false.' });
        }
        const enabled = await hostedRuntime.store.saveSearchConsent(req.accountId, req.body.enabled);
        return res.set('Cache-Control', 'no-store').json({ enabled });
    });


    app.delete('/api/account', async (req, res) => {
        const marked = await hostedRuntime.store.beginAccountDeletion(req.accountId);
        if (!marked) return res.status(409).json({ error: 'Account deletion is already in progress.' });
        try {
            await completeHostedAccountDeletion(req.accountId);
            res.set('Cache-Control', 'no-store').json({ deleted: true });
        } catch (error) {
            logOperationalError('hosted_account_deletion_deferred', error);
            return res.status(503).json({
                error: 'Account deletion is still in progress. Access remains locked and Aura will retry automatically.'
            });
        }
    });
}

app.get('/api/ollama/tags', async (_req, res) => {
    try {
        const cached = readCache(responseCaches.ollamaTags, 'default', TAGS_CACHE_TTL_MS);
        if (cached) {
            if (hostedConfig.enabled) {
                return res.json(filterHostedModels(hostedConfig, cached));
            }
            return res.json(cached);
        }

        const response = await axios.get(`${OLLAMA_URL}/api/tags`, {
            timeout: REQUEST_TIMEOUT_MS
        });
        const cachedPayload = writeCache(responseCaches.ollamaTags, 'default', response.data);
        if (hostedConfig.enabled) {
            return res.json(filterHostedModels(hostedConfig, cachedPayload));
        }
        return res.json(cachedPayload);
    } catch (error) {
        respondWithUpstreamError(res, 'Ollama tags request', error);
    }
});

app.post('/api/ollama/generate', async (req, res) => {
    let releaseAccountRequest = null;
    if (hostedConfig.enabled) {
        const model = String(req.body?.model || '');
        const modelLocation = authorizeModel(hostedConfig, model);
        if (!modelLocation) {
            return res.status(400).json({ error: 'This model is not available for hosted inference.' });
        }
        if (String(req.body?.prompt || '').length > HOSTED_MAX_PROMPT_CHARS) {
            return res.status(413).json({ error: 'This request is too large for hosted inference.' });
        }
        try {
            releaseAccountRequest = await hostedRuntime.store.acquireUsage(
                req.accountId,
                'inference',
                hostedUsageOptions('inference', usageUnitsForPrompt(req.body?.prompt))
            );
        } catch (error) {
            return respondWithUsageError(res, error);
        }
    }
    const requestAbort = createRequestAbortController(req, res);
    try {
        const response = hostedConfig.enabled && hostedRuntime.ollamaGenerate
            ? await hostedRuntime.ollamaGenerate(req.body, requestAbort.signal)
            : await axios.post(`${OLLAMA_URL}/api/generate`, req.body, {
                timeout: REQUEST_TIMEOUT_MS,
                signal: requestAbort.signal
            });
        if (requestAbort.wasClientAborted()) return;
        res.json(response.data);
    } catch (error) {
        if (requestAbort.wasClientAborted()) return;
        respondWithUpstreamError(res, 'Ollama generate request', error);
    } finally {
        requestAbort.cleanup();
        await releaseAccountRequest?.();
    }
});

app.post('/api/store_memory', async (req, res) => {
    try {
        const { text, metadata, id } = req.body || {};
        const profileId = normalizeProfileId(req.body?.profileId);

        if (!profileId || !String(text || '').trim()) {
            return res.status(400).json({ error: 'A valid local profile and memory text are required' });
        }

        const collection = hostedConfig.enabled
            ? await hostedRuntime.collections.getMemoryCollection()
            : await getMemoryCollection();
        const memoryId = hostedConfig.enabled ? `mem_${crypto.randomUUID()}` : (id || `mem_${Date.now()}`);
        const scopedMetadata = {
            ...scopeMemoryMetadata(metadata, profileId),
            ...(hostedConfig.enabled ? {
                ownerId: req.accountId,
                encryptedDocument: JSON.stringify(hostedRuntime.cipher.encrypt(
                    { text },
                    `memory:${req.accountId}:${memoryId}`
                ))
            } : {})
        };
        const writePayload = hostedConfig.enabled
            ? {
                ids: [memoryId],
                metadatas: [scopedMetadata],
                embeddings: await hostedRuntime.embeddingGenerate([text])
            }
            : {
                ids: [id || `mem_${Date.now()}`],
                metadatas: [scopedMetadata],
                documents: [text]
            };
        await trackAccountWrite(req.accountId, () => collection.add(writePayload));

        res.json({ success: true });
    } catch (error) {
        if (isChromaUnavailable(error)) {
            logOperationalError('vector_store_unavailable', error);
            return res.status(503).json({
                error: 'ChromaDB is unavailable',
                details: 'Start ChromaDB with `npm run chroma:up` in the project root, or set CHROMA_URL to a running server.'
            });
        }

        respondWithUpstreamError(res, 'Vector store', error);
    }
});

app.post('/api/search_memory', async (req, res) => {
    try {
        const { query, nResults = 3 } = req.body || {};
        const profileId = normalizeProfileId(req.body?.profileId);
        const rawChatId = req.body?.chatId;
        const chatId = normalizeChatId(rawChatId);

        if (!profileId || !String(query || '').trim()) {
            return res.status(400).json({ error: 'A valid local profile and search query are required' });
        }
        if (rawChatId !== undefined && !chatId) {
            return res.status(400).json({ error: 'Chat ID must be a valid local chat identifier' });
        }

        const collection = hostedConfig.enabled
            ? await hostedRuntime.collections.getMemoryCollection()
            : await getMemoryCollection();
        const queryPayload = {
            nResults,
            where: accountWhere(profileId, chatId, hostedConfig.enabled ? req.accountId : null),
            ...(hostedConfig.enabled
                ? { queryEmbeddings: await hostedRuntime.embeddingGenerate([query]) }
                : { queryTexts: [query] })
        };

        const results = await collection.query(queryPayload);

        res.json({
            results,
            matches: hostedConfig.enabled
                ? buildHostedMemoryMatches(results, hostedRuntime.cipher)
                : buildMemoryMatches(results)
        });
    } catch (error) {
        if (isChromaUnavailable(error)) {
            logOperationalError('vector_search_unavailable', error);
            return res.status(503).json({
                error: 'ChromaDB is unavailable',
                details: 'Start ChromaDB with `npm run chroma:up` in the project root, or set CHROMA_URL to a running server.'
            });
        }

        respondWithUpstreamError(res, 'Vector search', error);
    }
});

app.post('/api/search_examples', async (req, res) => {
    try {
        const {
            query,
            domain = 'medical',
            task = '',
            risk = 'low',
            modelFamily = 'either',
            limit = 3
        } = req.body || {};

        if (!String(query || '').trim()) {
            return res.status(400).json({ error: 'An example search query is required' });
        }

        if (risk === 'high') {
            return res.json({ examples: [] });
        }
        if (!['medical', 'companion'].includes(domain)) {
            return res.json({ examples: [] });
        }

        const resultLimit = normalizeExampleLimit(limit);
        const collection = await getResponseExampleCollection();
        const collectionCount = await collection.count();
        if (!collectionCount) {
            return res.json({ examples: [] });
        }
        const results = await collection.query({
            queryTexts: [String(query).slice(0, 4000)],
            nResults: Math.min(40, collectionCount),
            where: {
                $and: [
                    { status: { $eq: 'approved' } },
                    { domain: { $eq: domain } }
                ]
            }
        });
        const ids = results.ids?.[0] || [];
        const metadatas = results.metadatas?.[0] || [];
        const distances = results.distances?.[0] || [];
        const candidates = ids.map((id, index) => ({
            id,
            metadata: metadatas[index] || {},
            distance: Number(distances[index] ?? Number.POSITIVE_INFINITY)
        }));
        const allowedRisks = risk === 'medium' ? new Set(['low', 'medium']) : new Set(['low']);
        const compatible = candidates
            .filter(({ metadata }) => metadata.domain === domain)
            .filter(({ metadata }) => allowedRisks.has(metadata.risk))
            .filter(({ metadata }) => (
                metadata.preferredModel === 'either' ||
                modelFamily === 'either' ||
                metadata.preferredModel === modelFamily
            ))
            .map((candidate) => ({
                ...candidate,
                example: parseStoredExample(candidate.metadata),
                taskRank: candidate.metadata.task === task ? 0 : 1,
                riskRank: candidate.metadata.risk === risk ? 0 : 1
            }))
            .filter(({ example }) => Boolean(example))
            .sort((left, right) => (
                left.taskRank - right.taskRank ||
                left.riskRank - right.riskRank ||
                left.distance - right.distance
            ))
            .slice(0, resultLimit)
            .map(({ id, metadata, example }) => ({
                id,
                domain: metadata.domain,
                task: metadata.task,
                risk: metadata.risk,
                preferredModel: metadata.preferredModel,
                ...example
            }));

        return res.json({ examples: compatible });
    } catch (error) {
        if (isChromaUnavailable(error)) {
            logOperationalError('response_examples_unavailable', error);
            return res.status(503).json({
                error: 'Response example retrieval is unavailable',
                details: 'Start ChromaDB and seed examples with `npm run examples:seed`.'
            });
        }

        respondWithUpstreamError(res, 'Response example retrieval', error);
    }
});

app.post('/api/personal_examples/search', async (req, res) => {
    try {
        const {
            profileId: rawProfileId,
            query,
            modelFamily = 'either',
            limit = 2
        } = req.body || {};
        const profileId = normalizeProfileId(rawProfileId);

        if (!profileId || !String(query || '').trim()) {
            return res.status(400).json({ error: 'A local profile and search query are required' });
        }

        const collection = hostedConfig.enabled
            ? await hostedRuntime.collections.getPersonalExampleCollection()
            : await getPersonalResponseExampleCollection();
        const collectionCount = await collection.count();
        if (!collectionCount) return res.json({ examples: [] });

        const queryText = String(query).slice(0, 4000);
        const results = await collection.query({
            nResults: Math.min(20, collectionCount),
            ...(hostedConfig.enabled
                ? { queryEmbeddings: await hostedRuntime.embeddingGenerate([queryText]) }
                : { queryTexts: [queryText] }),
            where: {
                $and: [
                    { status: { $eq: 'approved' } },
                    { source: { $eq: 'local_feedback' } },
                    { profileId: { $eq: profileId } },
                    ...(hostedConfig.enabled ? [{ ownerId: { $eq: req.accountId } }] : [])
                ]
            }
        });
        const ids = results.ids?.[0] || [];
        const metadatas = results.metadatas?.[0] || [];
        const distances = results.distances?.[0] || [];
        const examples = ids
            .map((id, index) => ({
                id,
                metadata: metadatas[index] || {},
                distance: Number(distances[index] ?? Number.POSITIVE_INFINITY)
            }))
            .filter(({ metadata }) => (
                metadata.preferredModel === 'either' ||
                modelFamily === 'either' ||
                metadata.preferredModel === modelFamily
            ))
            .map((candidate) => ({
                ...candidate,
                example: parseStoredExample(candidate.metadata)
            }))
            .filter(({ example }) => Boolean(example))
            .sort((left, right) => left.distance - right.distance)
            .slice(0, normalizeExampleLimit(limit))
            .map(({ id, metadata, example }) => ({
                id,
                source: 'personal_feedback',
                domain: 'companion',
                task: metadata.task || 'conversation',
                risk: 'low',
                preferredModel: metadata.preferredModel || 'either',
                ...example
            }));

        return res.json({ examples });
    } catch (error) {
        if (isChromaUnavailable(error)) {
            return res.status(503).json({
                error: 'Personal response example retrieval is unavailable',
                details: 'Start ChromaDB to use local feedback examples.'
            });
        }
        respondWithUpstreamError(res, 'Personal response example retrieval', error);
    }
});

app.post('/api/personal_examples/upsert', async (req, res) => {
    try {
        const profileId = normalizeProfileId(req.body?.profileId);
        const example = normalizePersonalExample(req.body?.example, profileId);
        if (!profileId || !example) {
            return res.status(400).json({
                error: 'A valid low-risk local response example is required'
            });
        }

        if (hostedConfig.enabled) {
            example.id = `personal-${crypto.createHash('sha256')
                .update(`${req.accountId}:${example.id}`).digest('hex').slice(0, 40)}`;
        }

        const collection = hostedConfig.enabled
            ? await hostedRuntime.collections.getPersonalExampleCollection()
            : await getPersonalResponseExampleCollection();
        const embeddingDocument = buildPersonalEmbeddingDocument(example);
        const personalMetadata = buildPersonalMetadata(example);
        if (hostedConfig.enabled) {
            personalMetadata.ownerId = req.accountId;
            personalMetadata.recordId = example.id;
            personalMetadata.encryptedDocument = JSON.stringify(hostedRuntime.cipher.encrypt(
                JSON.parse(personalMetadata.storedDocument),
                `example:${req.accountId}:${example.id}`
            ));
            delete personalMetadata.storedDocument;
        }
        const examplePayload = {
            ids: [example.id],
            metadatas: [personalMetadata],
            ...(hostedConfig.enabled
                ? { embeddings: await hostedRuntime.embeddingGenerate([embeddingDocument]) }
                : { documents: [embeddingDocument] })
        };
        await trackAccountWrite(req.accountId, () => collection.upsert(examplePayload));
        return res.json({ stored: true, id: example.id });
    } catch (error) {
        if (isChromaUnavailable(error)) {
            return res.status(503).json({
                error: 'Personal response example storage is unavailable',
                details: 'Start ChromaDB to save local feedback examples.'
            });
        }
        respondWithUpstreamError(res, 'Personal response example storage', error);
    }
});

app.post('/api/personal_examples/delete', async (req, res) => {
    try {
        const profileId = normalizeProfileId(req.body?.profileId);
        const ids = [...new Set((Array.isArray(req.body?.ids) ? req.body.ids : [])
            .map((id) => String(id || '').trim())
            .filter((id) => /^personal-[a-z0-9_-]{8,160}$/i.test(id)))];
        if (!profileId) {
            return res.status(400).json({ error: 'A valid local profile is required' });
        }

        const collection = hostedConfig.enabled
            ? await hostedRuntime.collections.getPersonalExampleCollection()
            : await getPersonalResponseExampleCollection();
        await collection.delete({
            ...(ids.length ? { ids } : {}),
            where: accountWhere(profileId, null, hostedConfig.enabled ? req.accountId : null)
        });
        return res.json({ deleted: true, count: ids.length || null });
    } catch (error) {
        if (isChromaUnavailable(error)) {
            return res.status(503).json({
                error: 'Personal response example deletion is unavailable',
                details: 'Start ChromaDB to remove stored local examples.'
            });
        }
        respondWithUpstreamError(res, 'Personal response example deletion', error);
    }
});

app.post('/api/profile_data/delete', async (req, res) => {
    const completedScopes = [];
    try {
        const profileId = normalizeProfileId(req.body?.profileId);
        const scope = normalizeProfileDataScope(req.body?.scope);
        const rawChatId = req.body?.chatId;
        const chatId = normalizeChatId(rawChatId);
        if (!profileId || !scope) {
            return res.status(400).json({
                error: 'A valid local profile and deletion scope are required'
            });
        }
        if (rawChatId !== undefined && (!chatId || scope !== 'memory')) {
            return res.status(400).json({
                error: 'Chat-scoped deletion requires a valid chat ID and memory scope'
            });
        }

        if (scope === 'memory' || scope === 'all') {
            const memoryCollection = hostedConfig.enabled
                ? await hostedRuntime.collections.getMemoryCollection()
                : await getMemoryCollection();
            await memoryCollection.delete({ where: accountWhere(profileId, chatId, hostedConfig.enabled ? req.accountId : null) });
            completedScopes.push('memory');
        }

        if (scope === 'all') {
            const personalExampleCollection = hostedConfig.enabled
                ? await hostedRuntime.collections.getPersonalExampleCollection()
                : await getPersonalResponseExampleCollection();
            await personalExampleCollection.delete({ where: accountWhere(profileId, null, hostedConfig.enabled ? req.accountId : null) });
            completedScopes.push('personal_examples');
        }

        return res.json({
            deleted: true,
            scope,
            ...(chatId ? { chatId } : {}),
            completedScopes
        });
    } catch (error) {
        const unavailable = isChromaUnavailable(error);
        const details = 'Start ChromaDB to remove stored local profile data.';
        logOperationalError('profile_data_deletion_failed', error);
        return res.status(unavailable ? 503 : (error.response?.status || 500)).json({
            error: completedScopes.length
                ? 'Profile data deletion only partially completed'
                : 'Profile data deletion failed',
            ...(!hostedConfig.enabled && unavailable ? { details } : {}),
            partial: completedScopes.length > 0,
            completedScopes
        });
    }
});

app.post('/api/osint', async (req, res) => {
    if (hostedConfig.enabled && !(await hostedRuntime.store.loadAccount(req.accountId))?.searchConsent) {
        return res.status(403).json({
            code: 'SEARCH_CONSENT_REQUIRED',
            error: 'Enable external web research in Settings before Aura searches for you.'
        });
    }
    if (!SERPER_API_KEY) {
        return res.status(500).json({ error: 'Missing Serper API credentials' });
    }

    let releaseAccountRequest = null;
    try {
        if (hostedConfig.enabled) {
            try {
                releaseAccountRequest = await hostedRuntime.store.acquireUsage(
                    req.accountId,
                    'search',
                    hostedUsageOptions('search')
                );
            } catch (error) {
                return respondWithUsageError(res, error);
            }
        }
        const report = await buildOsintReport(req.body || {});
        res.json(report);
    } catch (error) {
        if (isSerperUnauthorized(error)) {
            logOperationalError('osint_authorization_failed', error);
            return res.status(403).json({
                error: 'Serper authorization failed',
                ...(!hostedConfig.enabled ? {
                    details: 'Check SERPER_API_KEY in your .env file. Make sure it is a real key from serper.dev and that the account still has access/credits.'
                } : {})
            });
        }

        respondWithUpstreamError(res, 'OSINT research', error);
    } finally {
        await releaseAccountRequest?.();
    }
});

app.get('/api/search', async (req, res) => {
    if (hostedConfig.enabled) {
        return res.status(405).json({ error: 'Use the consent-protected POST search endpoint.' });
    }
    if (!SERPER_API_KEY) {
        return res.status(500).json({ error: 'Missing Serper API credentials' });
    }

    try {
        const report = await buildOsintReport({
            primaryQuery: req.query.query,
            supportingQueries: [],
            includeNews: true
        });

        res.json(report);
    } catch (error) {
        if (isSerperUnauthorized(error)) {
            logOperationalError('search_authorization_failed', error);
            return res.status(403).json({
                error: 'Serper authorization failed',
                details: 'Check SERPER_API_KEY in your .env file. Make sure it is a real key from serper.dev and that the account still has access/credits.'
            });
        }

        respondWithUpstreamError(res, 'Search', error);
    }
});

app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ error: 'Not found' });
    }

    return res.status(404).type('text/plain').send('Not found');
});

app.use((error, req, res, _next) => {
    logOperationalError(`unhandled_${req.method}_${req.path}`, error);
    if (res.headersSent) return res.end();
    return res.status(500).json({ error: 'Aura could not complete this request.' });
});

function startServer({ host = HOST, port = PORT } = {}) {
    assertLoopbackHost(host);
    if (hostedConfig.enabled && !hostedRuntime) {
        throw new Error('Hosted identity and account storage must be initialized before listening');
    }
    return app.listen(port, host, function onListening() {
        const address = this.address();
        const listeningPort = typeof address === 'object' && address ? address.port : port;
        console.log(`Aura app server live on http://${host}:${listeningPort}`);
    });
}

if (require.main === module) {
    if (hostedConfig.enabled) {
        initializeHostedRuntime({ maintenance: true })
            .then(() => startServer())
            .catch((error) => {
                logOperationalError('hosted_startup_failed', error);
                process.exitCode = 1;
            });
    } else {
        startServer();
    }
}

module.exports = {
    APP_ROOT,
    DEFAULT_HOST,
    assertLoopbackHost,
    HOST,
    PORT,
    PUBLIC_DIR,
    app,
    initializeHostedRuntime,
    resolveServerConfig,
    startServer
};
