require('dotenv').config({ quiet: true });

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const axios = require('axios');
const { ChromaClient } = require('chromadb');
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

const DEFAULT_HOST = '127.0.0.1';

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

app.use(express.json({ limit: '2mb' }));
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

function parseStoredExample(metadata) {
    try {
        const parsed = JSON.parse(metadata?.storedDocument || '');
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_error) {
        return null;
    }
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
    const cached = readCache(responseCaches.osint, cacheKey, cacheTtl);
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

    return writeCache(responseCaches.osint, cacheKey, {
        executedAt: new Date().toISOString(),
        primaryQuery: cleanedPrimaryQuery,
        supportingQueries: cleanedSupportingQueries,
        searches,
        news,
        sources,
        evidence
    });
}

function respondWithUpstreamError(res, label, error) {
    if (isRequestAborted()) return;

    const status = error.response?.status || (isRequestTimeout(error) ? 504 : 500);
    const details = error.response?.data || error.message;

    console.error(`[${label}]`, details);

    res.status(status).json({
        error: `${label} failed`,
        details
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
        port: PORT,
        hostedMode: true,
        services: {
            ollama: OLLAMA_URL,
            chroma: CHROMA_URL,
            serperConfigured: Boolean(SERPER_API_KEY)
        }
    });
});

app.get('/api/ollama/tags', async (_req, res) => {
    try {
        const cached = readCache(responseCaches.ollamaTags, 'default', TAGS_CACHE_TTL_MS);
        if (cached) {
            return res.json(cached);
        }

        const response = await axios.get(`${OLLAMA_URL}/api/tags`, {
            timeout: REQUEST_TIMEOUT_MS
        });
        return res.json(writeCache(responseCaches.ollamaTags, 'default', response.data));
    } catch (error) {
        respondWithUpstreamError(res, 'Ollama tags request', error);
    }
});

app.post('/api/ollama/generate', async (req, res) => {
    const requestAbort = createRequestAbortController(req, res);
    try {
        const response = await axios.post(`${OLLAMA_URL}/api/generate`, req.body, {
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
    }
});

app.post('/api/store_memory', async (req, res) => {
    try {
        const { text, metadata, id } = req.body || {};
        const profileId = normalizeProfileId(req.body?.profileId);

        if (!profileId || !String(text || '').trim()) {
            return res.status(400).json({ error: 'A valid local profile and memory text are required' });
        }

        const collection = await getMemoryCollection();
        await collection.add({
            ids: [id || `mem_${Date.now()}`],
            metadatas: [scopeMemoryMetadata(metadata, profileId)],
            documents: [text]
        });

        res.json({ success: true });
    } catch (error) {
        if (isChromaUnavailable(error)) {
            console.error('[Vector store]', error.message);
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

        const collection = await getMemoryCollection();
        const queryPayload = {
            queryTexts: [query],
            nResults,
            where: buildProfileWhere(profileId, chatId)
        };

        const results = await collection.query(queryPayload);

        res.json({
            results,
            matches: buildMemoryMatches(results)
        });
    } catch (error) {
        if (isChromaUnavailable(error)) {
            console.error('[Vector search]', error.message);
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
            console.error('[Response examples]', error.message);
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

        const collection = await getPersonalResponseExampleCollection();
        const collectionCount = await collection.count();
        if (!collectionCount) return res.json({ examples: [] });

        const results = await collection.query({
            queryTexts: [String(query).slice(0, 4000)],
            nResults: Math.min(20, collectionCount),
            where: {
                $and: [
                    { status: { $eq: 'approved' } },
                    { source: { $eq: 'local_feedback' } },
                    { profileId: { $eq: profileId } }
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

        const collection = await getPersonalResponseExampleCollection();
        await collection.upsert({
            ids: [example.id],
            documents: [buildPersonalEmbeddingDocument(example)],
            metadatas: [buildPersonalMetadata(example)]
        });
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

        const collection = await getPersonalResponseExampleCollection();
        await collection.delete({
            ...(ids.length ? { ids } : {}),
            where: buildProfileWhere(profileId)
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
            const memoryCollection = await getMemoryCollection();
            await memoryCollection.delete({ where: buildProfileWhere(profileId, chatId) });
            completedScopes.push('memory');
        }

        if (scope === 'all') {
            const personalExampleCollection = await getPersonalResponseExampleCollection();
            await personalExampleCollection.delete({ where: buildProfileWhere(profileId) });
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
        const details = unavailable
            ? 'Start ChromaDB to remove stored local profile data.'
            : (error.response?.data || error.message);
        console.error('[Profile data deletion]', details);
        return res.status(unavailable ? 503 : (error.response?.status || 500)).json({
            error: completedScopes.length
                ? 'Profile data deletion only partially completed'
                : 'Profile data deletion failed',
            details,
            partial: completedScopes.length > 0,
            completedScopes
        });
    }
});

app.post('/api/osint', async (req, res) => {
    if (!SERPER_API_KEY) {
        return res.status(500).json({ error: 'Missing Serper API credentials' });
    }

    try {
        const report = await buildOsintReport(req.body || {});
        res.json(report);
    } catch (error) {
        if (isSerperUnauthorized(error)) {
            console.error('[OSINT research]', error.response?.data || error.message);
            return res.status(403).json({
                error: 'Serper authorization failed',
                details: 'Check SERPER_API_KEY in your .env file. Make sure it is a real key from serper.dev and that the account still has access/credits.'
            });
        }

        respondWithUpstreamError(res, 'OSINT research', error);
    }
});

app.get('/api/search', async (req, res) => {
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
            console.error('[Search]', error.response?.data || error.message);
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

function startServer({ host = HOST, port = PORT } = {}) {
    return app.listen(port, host, function onListening() {
        const address = this.address();
        const listeningPort = typeof address === 'object' && address ? address.port : port;
        console.log(`Aura app server live on http://${host}:${listeningPort}`);
    });
}

if (require.main === module) {
    startServer();
}

module.exports = {
    APP_ROOT,
    DEFAULT_HOST,
    HOST,
    PORT,
    PUBLIC_DIR,
    app,
    resolveServerConfig,
    startServer
};
