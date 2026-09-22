const STORAGE_KEYS = {
    STATE: 'aura_app_state',
    PROMPT: 'aura_system_prompt',
    PROMPT_OVERRIDE_ENABLED: 'aura_prompt_override_enabled',
    MODEL: 'aura_model_name',
    THEME: 'aura_theme',
    LOCATION_ENABLED: 'aura_location_enabled',
    LOCATION_CONTEXT: 'aura_location_context',
    USER_MEMORY_ENABLED: 'aura_user_memory_enabled',
    EXPERIENCE_STYLE: 'aura_experience_style',
    RESPONSE_DETAIL: 'aura_response_detail',
    THINKING_MODE: 'aura_thinking_mode',
    FEEDBACK_PROFILE_ID: 'aura_feedback_profile_id'
};

const localStorage = {
    getItem(key) {
        return (window.AURA_HOSTED?.enabled ? window.AURA_HOSTED.settingsStorage : window.localStorage).getItem(key);
    },
    setItem(key, value) {
        return (window.AURA_HOSTED?.enabled ? window.AURA_HOSTED.settingsStorage : window.localStorage).setItem(key, value);
    },
    removeItem(key) {
        return (window.AURA_HOSTED?.enabled ? window.AURA_HOSTED.settingsStorage : window.localStorage).removeItem(key);
    }
};

const API_ENDPOINTS = {
    ollamaGenerate: `${window.AURA_CONFIG.ollamaBaseUrl}/generate`,
    storeMemory: `${window.AURA_CONFIG.apiBaseUrl}/store_memory`,
    searchMemory: `${window.AURA_CONFIG.apiBaseUrl}/search_memory`,
    searchExamples: `${window.AURA_CONFIG.apiBaseUrl}/search_examples`,
    searchPersonalExamples: `${window.AURA_CONFIG.apiBaseUrl}/personal_examples/search`,
    upsertPersonalExample: `${window.AURA_CONFIG.apiBaseUrl}/personal_examples/upsert`,
    deletePersonalExamples: `${window.AURA_CONFIG.apiBaseUrl}/personal_examples/delete`,
    osint: `${window.AURA_CONFIG.apiBaseUrl}/osint`
};

const TOOL_TAG_PATTERN = /<tool_(?:create|offer)\b[^>]*\/?>/gi;
const {
    TOOL_TYPES,
    LOW_RISK_PROACTIVE_TYPES,
    CRISIS_ROUTE_PROACTIVE_TYPES
} = window.AURA_TOOL_DECISION;
const DETAIL_LEVELS = new Set(['brief', 'balanced', 'detailed']);
const REASSURANCE_LEVELS = new Set(['low', 'medium', 'high']);
const TECHNICAL_LEVELS = new Set(['plain', 'mixed', 'technical']);
const STRUCTURE_LEVELS = new Set(['paragraphs', 'mixed', 'stepwise']);
const DIRECTNESS_LEVELS = new Set(['soft', 'balanced', 'direct']);
const FOLLOW_UP_LEVELS = new Set(['none', 'gentle', 'active']);
const ROUTE_NAMES = new Set([
    'CrisisAgent',
    'CbtAnalystAgent',
    'PlannerAgent',
    'KnowledgeAgent',
    'SearchAgent',
    'GeneralFriendAgent'
]);
const SESSION_CACHE_TTL_MS = 10 * 60 * 1000;
const analysisCaches = {
    sourceNeed: new Map(),
    searchPlan: new Map(),
    evidenceRewrite: new Map(),
    turnSupport: new Map()
};

function clearAnalysisCaches() {
    Object.keys(analysisCaches).forEach((cacheName) => analysisCaches[cacheName].clear());
}

const DEFAULT_RESPONSE_PREFERENCES = {
    detailLevel: 'balanced',
    reassuranceLevel: 'medium',
    technicalLevel: 'plain',
    structureLevel: 'paragraphs',
    directnessLevel: 'balanced',
    followUpLevel: 'gentle',
    likelyTone: 'neutral'
};

const EXPERIENCE_STYLE_PRESETS = {
    balanced: {
        label: 'Balanced',
        preferences: {}
    },
    gentle: {
        label: 'Gentle Support',
        preferences: {
            reassuranceLevel: 'high',
            directnessLevel: 'soft',
            followUpLevel: 'active',
            likelyTone: 'gentle'
        }
    },
    practical: {
        label: 'Step-by-Step',
        preferences: {
            detailLevel: 'balanced',
            structureLevel: 'stepwise',
            directnessLevel: 'balanced',
            followUpLevel: 'active',
            likelyTone: 'practical'
        }
    },
    research: {
        label: 'Research-Minded',
        preferences: {
            detailLevel: 'detailed',
            structureLevel: 'mixed',
            technicalLevel: 'mixed',
            followUpLevel: 'active',
            likelyTone: 'curious'
        }
    },
    direct: {
        label: 'Clear and Direct',
        preferences: {
            detailLevel: 'balanced',
            directnessLevel: 'direct',
            structureLevel: 'mixed',
            followUpLevel: 'gentle',
            likelyTone: 'direct'
        }
    }
};

const THINKING_MODE_PRESETS = {
    auto: {
        label: 'Auto',
        prompt: 'Match reasoning effort to task complexity and risk.',
        defaultOptions: {},
        analysisOptions: {},
        cleanupOptions: {},
        jsonOptions: {}
    },
    fast: {
        label: 'Fast',
        prompt: 'Use a quick internal pass. Prefer speed for simple, low-risk questions.',
        defaultOptions: { num_ctx: 6144, num_predict: 768 },
        analysisOptions: { num_ctx: 4096, num_predict: 256 },
        cleanupOptions: { num_ctx: 4096, num_predict: 320 },
        jsonOptions: { num_ctx: 4096, num_predict: 384 }
    },
    balanced: {
        label: 'Balanced',
        prompt: 'Use normal internal care. Balance speed, context, and completeness.',
        defaultOptions: {},
        analysisOptions: {},
        cleanupOptions: {},
        jsonOptions: {}
    },
    deep: {
        label: 'Deep',
        prompt: 'Use a more careful internal pass. Check context, evidence needs, safety, and practical implications before answering.',
        defaultOptions: { num_ctx: 12288, num_predict: 1792 },
        analysisOptions: { num_ctx: 8192, num_predict: 640 },
        cleanupOptions: { num_ctx: 8192, num_predict: 640 },
        jsonOptions: { num_ctx: 8192, num_predict: 768 }
    }
};

const PROMPTS = window.AURA_PROMPTS;

function safeParseJson(value, fallback = null) {
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (_error) {
        return fallback;
    }
}

function getSessionCacheEntry(cache, key) {
    const entry = cache.get(key);
    if (!entry) return null;
    if ((Date.now() - entry.createdAt) > SESSION_CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return entry.value;
}

function setSessionCacheEntry(cache, key, value) {
    cache.set(key, {
        createdAt: Date.now(),
        value
    });
    return value;
}

function buildSessionCacheKey(parts = []) {
    return parts
        .map((part) => String(part || '').trim())
        .join('::')
        .slice(0, 4000);
}

function getModelPreference() {
    return localStorage.getItem(STORAGE_KEYS.MODEL) ||
        window.AURA_CONFIG.defaultModelPreference ||
        'auto';
}

function getConfiguredRoutingModels() {
    return {
        gptModel: window.AURA_CONFIG.modelRouting?.gptModel || 'gpt-oss:120b-cloud',
        medModel: window.AURA_CONFIG.modelRouting?.medModel || window.AURA_CONFIG.defaultModel
    };
}

function getAvailableModelNames() {
    const discovered = Array.isArray(window.AURA_AVAILABLE_MODELS)
        ? window.AURA_AVAILABLE_MODELS.filter(Boolean)
        : [];
    if (discovered.length) return discovered;
    return window.AURA_HOSTED?.enabled ? window.AURA_HOSTED.allowedModels : [];
}

function getBackgroundModelName() {
    const preference = getModelPreference();
    if (preference !== 'auto') return preference;
    return getConfiguredRoutingModels().gptModel;
}

function isMedGemmaModel(modelName = '') {
    return /(^|[/:_-])medgemma/i.test(modelName);
}

function buildResponseSystemPrompt(basePrompt, modelName) {
    const styleAnchoredPrompt = [basePrompt, PROMPTS.RESPONSE_STYLE_CONTRACT].join('\n\n');
    if (!isMedGemmaModel(modelName)) return styleAnchoredPrompt;

    return [styleAnchoredPrompt, PROMPTS.MEDGEMMA_CLINICAL_APPENDIX].join('\n\n');
}

function getEffectiveSystemPrompt() {
    const overrideEnabled = localStorage.getItem(STORAGE_KEYS.PROMPT_OVERRIDE_ENABLED) === 'true';
    const overridePrompt = String(localStorage.getItem(STORAGE_KEYS.PROMPT) || '').trim();
    return overrideEnabled && overridePrompt ? overridePrompt : PROMPTS.DEFAULT_SYSTEM;
}

function buildAuraGenerationSystemPrompt(modelName) {
    const base = `You are Aura, a calm, sincere AI companion with independent judgment for everyday support, learning, planning, and health questions.
Write only the final user-facing answer. Do not write thought, analysis, planning, or hidden notes.`;

    if (!isMedGemmaModel(modelName)) return base;
    return [base, PROMPTS.MEDGEMMA_CLINICAL_APPENDIX].join('\n\n');
}

function deriveHeuristicRoute(userMessage) {
    const text = String(userMessage || '').toLowerCase().trim();
    if (!text) return 'GeneralFriendAgent';

    if (/\b(suicid|kill myself|end my life|hurt myself|self[- ]harm|can't stay safe|cannot stay safe|want to die)\b/.test(text)) {
        return 'CrisisAgent';
    }

    if (requiresSourceBackedRouting(userMessage) || /\b(latest|current|today|news|verify|fact-check|source|citation)\b/.test(text)) {
        return 'SearchAgent';
    }

    if (/\b(plan|steps|checklist|organize|schedule|routine|goal|what should i do|how do i start)\b/.test(text)) {
        return 'PlannerAgent';
    }

    if (/\b(everyone thinks|i'm doomed|worthless|i'm a failure|not good enough|catastroph|spiral)\b/.test(text) ||
        /\b(always|never)\b.{0,40}\b(fail|wrong|bad|hate|judge|succeed|work out)\b/.test(text)) {
        return 'CbtAnalystAgent';
    }

    if (/\b(what is|what are|explain|define|tell me about|help me understand|symptoms?|causes?|treatment|diagnosis|types?|classes?|difference|compare)\b/.test(text)) {
        return 'KnowledgeAgent';
    }

    return 'GeneralFriendAgent';
}

function buildAuraTurnProfile({
    route,
    sourceDecision,
    preferences,
    turnSupport,
    turnPolicy = null,
    documentText = null
} = {}) {
    const safeRoute = route || 'GeneralFriendAgent';
    const safePreferences = sanitizeResponsePreferences(preferences, DEFAULT_RESPONSE_PREFERENCES);
    const safeTurn = sanitizeTurnSupportDecision(turnSupport);
    const sourceMode = sourceDecision?.needsSources ? 'Use external evidence when answering factual claims.' : 'Use normal conversation and memory unless evidence is clearly needed.';
    const experienceMode = buildExperienceStyleContext();
    const thinkingMode = buildThinkingModeContext();

    return [
        `Intent route: ${safeRoute}`,
        `Experience style: ${experienceMode}`,
        `Thinking mode: ${thinkingMode}`,
        `Support mode: ${safeTurn.primaryMode}${safeTurn.secondaryMode !== 'none' ? ` + ${safeTurn.secondaryMode}` : ''}`,
        `Follow-up intent: ${safeTurn.followUpIntent}`,
        turnPolicy?.continuity ? `Continuity: ${turnPolicy.continuity.mode} (${turnPolicy.continuity.reason})` : '',
        turnPolicy?.stance ? `Relationship stance: ${turnPolicy.stance.mode}, ${turnPolicy.stance.intensity} (${turnPolicy.stance.reason})` : '',
        turnPolicy?.initiative ? `Initiative: ${turnPolicy.initiative.mode} (${turnPolicy.initiative.reason})` : '',
        `Distress level: ${safeTurn.distressLevel}`,
        `Depth: ${safePreferences.detailLevel}`,
        `Tone: ${safeTurn.reassuranceNeed === 'high' || safePreferences.reassuranceLevel === 'high' ? 'especially gentle' : 'grounded and natural'}`,
        `Structure: ${safeTurn.structureNeed === 'high' ? 'stepwise' : safePreferences.structureLevel}`,
        `Directness: ${safeTurn.directnessTolerance !== 'balanced' ? safeTurn.directnessTolerance : safePreferences.directnessLevel}`,
        `Cognitive bandwidth: ${safeTurn.cognitiveBandwidth}`,
        `Questioning: ${safeTurn.questioningLevel}`,
        `Professional bridge: ${safeTurn.professionalBridge}`,
        `Evidence mode: ${sourceMode}`,
        documentText ? 'Attached document: use it when it helps answer the user.' : '',
        safeTurn.responseGoals?.length ? `Goals: ${safeTurn.responseGoals.join(' | ')}` : 'Goals: answer clearly, naturally, and usefully.'
    ].filter(Boolean).join('\n');
}

function buildAuraMemoryContext(profileStr, conversationSummary) {
    return [
        conversationSummary || 'No older summary needed.',
        profileStr ? `Known preferences and context: ${profileStr}` : ''
    ].filter(Boolean).join('\n\n') || 'No stored context yet.';
}

function buildAuraDirectPrompt({
    systemPrompt,
    turnProfile,
    runtimeContext,
    memoryContext,
    continuityContext,
    history,
    vectorContext,
    exampleContext,
    toolGuidance,
    userMessage,
    documentText
}) {
    const prompt = PROMPTS.AURA_DIRECT_REPLY
        .replace('%SYSTEM_PROMPT%', systemPrompt)
        .replace('%COMPANION_CONTRACT%', PROMPTS.AURA_COMPANION_CONTRACT)
        .replace('%TURN_PROFILE%', turnProfile)
        .replace('%RUNTIME%', runtimeContext || 'Unavailable.')
        .replace('%MEMORY%', memoryContext || 'No stored context yet.')
        .replace('%CONTINUITY%', continuityContext || 'No active thread yet.')
        .replace('%HISTORY%', history || 'No recent chat yet.')
        .replace('%VECTOR_CONTEXT%', vectorContext || 'No specific recalled context.')
        .replace('%EXAMPLE_CONTEXT%', exampleContext || 'No response examples retrieved for this turn.')
        .replace('%TOOL_GUIDANCE%', toolGuidance || '')
        .replace('%MESSAGE%', userMessage || '');

    if (!documentText) return prompt;
    return `${prompt}\n\nAttached document content:\n${documentText}`;
}

function buildAuraEvidencePrompt({
    systemPrompt,
    turnProfile,
    runtimeContext,
    memoryContext,
    continuityContext,
    history,
    vectorContext,
    exampleContext,
    evidenceCatalog,
    userMessage
}) {
    return PROMPTS.AURA_EVIDENCE_REPLY
        .replace('%SYSTEM_PROMPT%', systemPrompt)
        .replace('%COMPANION_CONTRACT%', PROMPTS.AURA_COMPANION_CONTRACT)
        .replace('%TURN_PROFILE%', turnProfile)
        .replace('%RUNTIME%', runtimeContext || 'Unavailable.')
        .replace('%MEMORY%', memoryContext || 'No stored context yet.')
        .replace('%CONTINUITY%', continuityContext || 'No active thread yet.')
        .replace('%HISTORY%', history || 'No recent chat yet.')
        .replace('%VECTOR_CONTEXT%', vectorContext || 'No specific recalled context.')
        .replace('%EXAMPLE_CONTEXT%', exampleContext || 'No response examples retrieved for this turn.')
        .replace('%EVIDENCE%', JSON.stringify(evidenceCatalog || [], null, 2))
        .replace('%MESSAGE%', userMessage || '');
}

function getConfiguredOllamaOptions(format = null, callType = 'default') {
    const configured = window.AURA_CONFIG?.ollamaOptions || {};
    if (format === 'json') return configured.json || {};
    if (callType === 'analysis') return configured.analysis || {};
    if (callType === 'cleanup') return configured.cleanup || {};
    return configured.default || {};
}

function getThinkingModeKey(value = null) {
    const raw = String(value || localStorage.getItem(STORAGE_KEYS.THINKING_MODE) || 'auto').trim();
    return Object.prototype.hasOwnProperty.call(THINKING_MODE_PRESETS, raw) ? raw : 'auto';
}

function getThinkingModePreset(mode = null) {
    return THINKING_MODE_PRESETS[getThinkingModeKey(mode)] || THINKING_MODE_PRESETS.auto;
}

function getThinkingModeOptions(format = null, callType = 'default') {
    const preset = getThinkingModePreset();
    if (format === 'json') return preset.jsonOptions || {};
    if (callType === 'analysis') return preset.analysisOptions || {};
    if (callType === 'cleanup') return preset.cleanupOptions || {};
    return preset.defaultOptions || {};
}

function buildThinkingModeContext(mode = null) {
    const key = getThinkingModeKey(mode);
    const preset = getThinkingModePreset(key);
    return `${preset.label}: ${preset.prompt}`;
}

function applyThinkingMode(mode) {
    const key = getThinkingModeKey(mode);
    localStorage.setItem(STORAGE_KEYS.THINKING_MODE, key);
    return key;
}

window.applyThinkingMode = applyThinkingMode;
window.getThinkingModeKey = getThinkingModeKey;
window.THINKING_MODE_PRESETS = THINKING_MODE_PRESETS;

function getModelGenerationOptions(modelName, format = null, callType = 'default') {
    const configuredOptions = {
        ...getConfiguredOllamaOptions(format, callType),
        ...getThinkingModeOptions(format, callType)
    };

    if (format === 'json') {
        return {
            ...configuredOptions,
            ...(isMedGemmaModel(modelName)
                ? { temperature: 0, top_p: 0.9 }
                : { temperature: 0 })
        };
    }

    if (callType === 'analysis' || callType === 'cleanup') {
        return {
            ...configuredOptions,
            ...(isMedGemmaModel(modelName)
                ? { temperature: 0, top_p: 0.9 }
                : { temperature: 0 })
        };
    }

    if (!isMedGemmaModel(modelName)) return configuredOptions;

    const thinkingMode = getThinkingModeKey();
    return {
        ...configuredOptions,
        num_predict: thinkingMode === 'fast'
            ? (Number(configuredOptions.num_predict) || 896)
            : Math.max(Number(configuredOptions.num_predict) || 0, 1536),
        temperature: 0.28,
        top_p: 0.9,
        repeat_penalty: 1.05
    };
}

function isLikelyIncompleteReply(text) {
    const value = normalizeReplyWhitespace(text);
    if (!value) return false;
    if (value.length < 60) return false;
    if (/[.!?]"?$/.test(value)) return false;
    if (/[,:;]\s*$/.test(value)) return true;
    if (/\b(and|or|but|because|while|which|that|with|including|such as|like)\s*$/i.test(value)) return true;
    if (/\.\.\.|…/.test(value)) return true;
    return true;
}

function buildContinuationPrompt(prompt, partialReply) {
    return `${prompt}

[Previous reply was cut off. Continue from exactly where it stopped.]
- Do not restart from the beginning.
- Do not repeat earlier sentences.
- Continue naturally with the same tone and topic.

[Partial reply]
${partialReply}`;
}

function buildFinalAnswerRetryPrompt(prompt) {
    return `${prompt}

The previous attempt did not produce a visible final answer.
Return only Aura's final user-facing answer now.
Do not include thought, analysis, planning, labels, or hidden notes.`;
}

function buildChatTitle(content) {
    if (!content) return 'New Chat';
    return content.length > 24 ? `${content.slice(0, 24)}...` : content;
}

function sanitizeSearchQuery(value) {
    if (typeof value !== 'string') return '';

    return value
        .replace(/^(here is the query|query|search query):\s*/i, '')
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function sanitizeRouteName(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    return ROUTE_NAMES.has(trimmed) ? trimmed : '';
}

function sanitizeSourceNeedDecision(candidate, fallback = null) {
    const base = fallback && typeof fallback === 'object'
        ? fallback
        : { needsSources: false, confidence: 0, reason: '' };
    const safe = candidate && typeof candidate === 'object' ? candidate : {};
    const rawConfidence = Number(safe.confidence);

    return {
        needsSources: Boolean(safe.needsSources),
        confidence: Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : base.confidence,
        reason: typeof safe.reason === 'string' ? safe.reason.trim().slice(0, 240) : (base.reason || '')
    };
}

function isEmotionalSupportIntent(message) {
    const text = String(message || '').toLowerCase();
    if (!text.trim()) return false;

    const emotionalSignals = [
        /\bi feel\b/,
        /\bi'm feeling\b/,
        /\bi am feeling\b/,
        /\bi'm anxious\b/,
        /\bi am anxious\b/,
        /\bi'm overwhelmed\b/,
        /\bi am overwhelmed\b/,
        /\bi need support\b/,
        /\bcan you listen\b/,
        /\bi feel alone\b/,
        /\bi feel lost\b/
    ];

    const factualSignals = [
        /\bwhat is\b/,
        /\bwho is\b/,
        /\bwhen did\b/,
        /\bwhere is\b/,
        /\bhow does\b/,
        /\bresearch\b/,
        /\bcitations?\b/,
        /\bevidence\b/,
        /\bsource-backed\b/,
        /\blatest\b/,
        /\bcurrent\b/
    ];

    return emotionalSignals.some((pattern) => pattern.test(text)) &&
        !factualSignals.some((pattern) => pattern.test(text));
}

function requiresSourceBackedRouting(message) {
    const text = String(message || '').toLowerCase();
    if (!text.trim()) return false;

    return [
        /\bsource-backed\b/,
        /\bwith sources\b/,
        /\bcite(?:d|s|)\b/,
        /\bcitations?\b/,
        /\bresearch\b/,
        /\bverify\b/,
        /\bfact-check\b/,
        /\bevidence\b/,
        /\blatest\b/,
        /\bcurrent\b/,
        /\bnews\b/
    ].some((pattern) => pattern.test(text));
}

function resolveAgentRoute(userMessage, modelRoute) {
    const safeModelRoute = sanitizeRouteName(modelRoute);
    if (requiresSourceBackedRouting(userMessage)) return 'SearchAgent';
    return safeModelRoute || 'GeneralFriendAgent';
}

function deriveHeuristicSourceNeed(userMessage, route) {
    const text = String(userMessage || '').toLowerCase();
    if (!text.trim()) {
        return { needsSources: false, confidence: 0, reason: 'Empty message.' };
    }

    if (route.includes('Search')) {
        return { needsSources: true, confidence: 0.95, reason: 'Search route selected.' };
    }

    if (route.includes('Crisis') || route.includes('Cbt') || isEmotionalSupportIntent(userMessage)) {
        return { needsSources: false, confidence: 0.9, reason: 'Support-oriented intent.' };
    }

    const factualPatterns = [
        /\b(what|who|when|where|why|how)\b/,
        /\b(compare|difference|versus|vs\.?|pros and cons)\b/,
        /\b(statistics?|rate|risk|prevalence|odds)\b/,
        /\b(study|studies|guideline|evidence|research)\b/,
        /\b(symptoms?|causes?|treatment|diagnosis|prognosis)\b/,
        /\b(law|policy|regulation|standard)\b/,
        /\b(company|organization|country|city|president|ceo)\b/,
        /\b(latest|current|today|recent|news|update)\b/,
        /\b(verify|fact-check|source|citation)\b/
    ];
    const factualHits = factualPatterns.filter((pattern) => pattern.test(text)).length;
    const hasQuestion = /\?/.test(text);
    const hasYear = /\b(19|20)\d{2}\b/.test(text);
    const strongSourceSignal = requiresSourceBackedRouting(userMessage);

    if (strongSourceSignal) {
        return { needsSources: true, confidence: 0.95, reason: 'Explicit source/research intent.' };
    }

    if (factualHits >= 2 || (factualHits >= 1 && (hasQuestion || hasYear))) {
        return { needsSources: true, confidence: 0.82, reason: 'Likely factual/external claim request.' };
    }

    return { needsSources: false, confidence: 0.55, reason: 'No strong external-evidence signals.' };
}

function shouldUseSearchEvidence(route, sourceDecision) {
    if (route.includes('Search')) return true;
    if (!sourceDecision?.needsSources) return false;
    if (route.includes('Crisis') || route.includes('Cbt')) return false;
    if (route.includes('Planner')) return sourceDecision.confidence >= 0.82;
    return sourceDecision.confidence >= 0.6;
}

function sanitizeSearchPlan(plan, fallbackMessage) {
    const primaryQuery = sanitizeSearchQuery(plan?.primaryQuery || fallbackMessage);
    const supportingQueries = [...new Set((plan?.supportingQueries || []).map(sanitizeSearchQuery))]
        .filter(Boolean)
        .filter((query) => query !== primaryQuery)
        .slice(0, 4);

    return {
        primaryQuery,
        supportingQueries,
        includeNews: Boolean(plan?.includeNews),
        reason: typeof plan?.reason === 'string' ? plan.reason.trim() : ''
    };
}

function refineSearchPlanForMedicalQuestion(plan, userMessage) {
    const text = String(userMessage || '').toLowerCase();
    const refined = { ...plan };

    if (/\bbipolar\b/.test(text) && /\b(classes?|types?|kinds?|categories?)\b/.test(text)) {
        refined.primaryQuery = 'bipolar disorder types bipolar I bipolar II cyclothymic disorder NIMH Mayo Clinic';
        refined.supportingQueries = [
            'bipolar disorder diagnostic types NIMH',
            'bipolar disorder types Mayo Clinic',
            'bipolar disorder ICD DSM types cyclothymic disorder'
        ];
        refined.includeNews = false;
    }

    return refined;
}

function didUserRequestLocalCrisisResources(message) {
    const text = String(message || '').toLowerCase();
    if (!text.trim()) return false;

    const directResourceTerms = /\b(988|911|hotline|crisis line|helpline|support line|suicide prevention)\b/;
    const locationTerms = /\b(near me|nearby|local|in my area)\b/;
    const crisisTerms = /\b(crisis|emergency|suicid|self[- ]harm|mental health help)\b/;
    const lookupTerms = /\b(find|lookup|search|get|show|where|number|contact)\b/;

    return directResourceTerms.test(text) || ((locationTerms.test(text) || lookupTerms.test(text)) && crisisTerms.test(text));
}

function inferHighRiskSafetyRecommendations(message) {
    const text = String(message || '').toLowerCase();
    if (!text.trim()) return [];
    const hasPersonalContext = /\b(i|my|me|i'm|im|right now|currently)\b/.test(text);

    const recommendations = [];
    const addRecommendation = (id, pattern, line) => {
        if (!pattern.test(text)) return;
        if (recommendations.some((entry) => entry.id === id)) return;
        recommendations.push({ id, line });
    };

    addRecommendation(
        'imminent_self_harm',
        /\b(suicid|kill myself|end my life|hurt myself|self[- ]harm|can't stay safe|cannot stay safe|want to die)\b/,
        "If you might hurt yourself or feel you can't stay safe right now, contact your local emergency number immediately. If you want, I can help find crisis resources near you."
    );
    addRecommendation(
        'acute_medical_emergency',
        /\b(chest pain|pressure in (my )?chest|shortness of breath|face droop|slurred speech|one-sided weakness|unconscious|not waking|severe bleeding|seizure)\b/,
        'These symptoms can be an emergency. Please contact your local emergency number right now. If you want, I can help you find the nearest urgent resources.'
    );
    addRecommendation(
        'poison_or_overdose',
        /\b(overdose|took too much|too many pills|poison|poisoned|swallowed cleaner|chemical exposure)\b/,
        'Possible poisoning or overdose can escalate quickly. Contact emergency services now, and if you want, I can help locate poison support resources for your area.'
    );
    addRecommendation(
        'immediate_personal_safety',
        /\b(domestic violence|abuse|partner hit|unsafe at home|threatened at home|being stalked|violent partner)\b/,
        "If you're in immediate danger, contact local emergency services now. If you want, I can help you find a confidential support hotline in your area."
    );

    const personalOnlyIds = new Set(['acute_medical_emergency', 'poison_or_overdose', 'immediate_personal_safety']);
    const filtered = recommendations.filter((entry) => !personalOnlyIds.has(entry.id) || hasPersonalContext);
    return filtered.slice(0, 2);
}

const {
    sanitizeToolTheme,
    sanitizeOpportunity: sanitizeToolOpportunity,
    isInformationalExplanationRequest
} = window.AURA_TOOL_DECISION;

function getRecentConversationText(limit = 4, chatId = window.chatManager?.getActiveChatId()) {
    if (typeof window === 'undefined' || !window.chatManager) return '';
    return window.chatManager
        .getChatHistory(chatId)
        .slice(-limit)
        .map((message) => sanitizeContentForModelContext(message.content))
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function deriveExplicitToolRequest(userMessage, chatId = window.chatManager?.getActiveChatId()) {
    return window.AURA_TOOL_DECISION.deriveExplicit(
        userMessage,
        getRecentConversationText(4, chatId)
    );
}

function containsToolTag(text) {
    return /<tool_(?:create|offer)\b[^>]*\/?>/i.test(String(text || ''));
}

function buildProactiveToolGuidance(recommendation) {
    if (!recommendation) return '';

    const delivery = recommendation.delivery === 'create' ? 'create' : 'offer';
    const tag = `<tool_${delivery} type="${recommendation.type}" theme="${recommendation.theme}" />`;
    const instruction = delivery === 'create'
        ? 'The user explicitly requested this tool, or immediate grounding is useful. State the action plainly without asking permission.'
        : 'The tool may help, but the user has not asked for it. Do not say it was created; let the offer card ask for permission.';
    return [
        `[Proactive Tool Guidance]`,
        instruction,
        `Type: ${recommendation.type}`,
        `Theme: ${recommendation.theme}`,
        `Reason: ${recommendation.reason || 'High immediate utility.'}`,
        `Answer the user normally first, then include exactly this tag once: ${tag}`
    ].join('\n');
}

function attachProactiveToolTag(reply, recommendation) {
    if (!recommendation) return reply;
    if (!reply) return reply;

    const cleanReply = normalizeReplyWhitespace(stripToolTags(reply));
    const delivery = recommendation.delivery === 'create' ? 'create' : 'offer';
    const tag = `<tool_${delivery} type="${recommendation.type}" theme="${recommendation.theme}" />`;
    if (delivery === 'offer') return normalizeReplyWhitespace(`${cleanReply}\n\n${tag}`);

    const line = recommendation.userLine ||
        'I’m opening a quick interactive tool to make this easier right now.';

    return normalizeReplyWhitespace(`${cleanReply}\n\n${line} ${tag}`);
}

function attachHighRiskSafetyRecommendations(reply, recommendations = []) {
    const baseReply = String(reply || '').trim();
    if (!baseReply) return baseReply;
    if (!Array.isArray(recommendations) || recommendations.length === 0) return baseReply;

    const dedupePatterns = {
        imminent_self_harm: /\b(cannot stay safe|can't stay safe|crisis resources|emergency number)\b/i,
        acute_medical_emergency: /\b(these symptoms can be an emergency|call emergency|local emergency number)\b/i,
        poison_or_overdose: /\b(poison|overdose|poison support)\b/i,
        immediate_personal_safety: /\b(immediate danger|confidential support hotline|unsafe at home)\b/i
    };

    const missingLines = recommendations
        .filter((entry) => !dedupePatterns[entry.id] || !dedupePatterns[entry.id].test(baseReply))
        .map((entry) => entry.line)
        .filter(Boolean);

    if (!missingLines.length) return baseReply;
    return normalizeReplyWhitespace(`${baseReply}\n\n${missingLines.join('\n\n')}`);
}

function sanitizeResponsePreferences(candidate, fallback = DEFAULT_RESPONSE_PREFERENCES) {
    const safe = candidate && typeof candidate === 'object' ? candidate : {};
    const merged = {
        ...fallback,
        ...safe
    };

    return {
        detailLevel: DETAIL_LEVELS.has(merged.detailLevel) ? merged.detailLevel : fallback.detailLevel,
        reassuranceLevel: REASSURANCE_LEVELS.has(merged.reassuranceLevel) ? merged.reassuranceLevel : fallback.reassuranceLevel,
        technicalLevel: TECHNICAL_LEVELS.has(merged.technicalLevel) ? merged.technicalLevel : fallback.technicalLevel,
        structureLevel: STRUCTURE_LEVELS.has(merged.structureLevel) ? merged.structureLevel : fallback.structureLevel,
        directnessLevel: DIRECTNESS_LEVELS.has(merged.directnessLevel) ? merged.directnessLevel : fallback.directnessLevel,
        followUpLevel: FOLLOW_UP_LEVELS.has(merged.followUpLevel) ? merged.followUpLevel : fallback.followUpLevel,
        likelyTone: typeof merged.likelyTone === 'string' && merged.likelyTone.trim()
            ? merged.likelyTone.trim().slice(0, 48)
            : fallback.likelyTone
    };
}

function getExperienceStyleKey(value = null) {
    const storedStyle = window.chatManager
        ? window.chatManager.getProfileSetting(STORAGE_KEYS.EXPERIENCE_STYLE, 'balanced')
        : localStorage.getItem(STORAGE_KEYS.EXPERIENCE_STYLE);
    const raw = String(value || storedStyle || 'balanced').trim();
    return Object.prototype.hasOwnProperty.call(EXPERIENCE_STYLE_PRESETS, raw) ? raw : 'balanced';
}

function getExperienceStylePreset(style = null) {
    return EXPERIENCE_STYLE_PRESETS[getExperienceStyleKey(style)] || EXPERIENCE_STYLE_PRESETS.balanced;
}

function getExplicitResponsePreferenceOverrides() {
    const preset = getExperienceStylePreset();
    const configuredDetail = window.chatManager
        ? window.chatManager.getProfileSetting(STORAGE_KEYS.RESPONSE_DETAIL, null)
        : null;
    return {
        ...preset.preferences,
        ...(DETAIL_LEVELS.has(configuredDetail) ? { detailLevel: configuredDetail } : {})
    };
}

function getStoredExperienceResponsePreferences() {
    return sanitizeResponsePreferences(
        {
            ...DEFAULT_RESPONSE_PREFERENCES,
            ...getExplicitResponsePreferenceOverrides()
        },
        DEFAULT_RESPONSE_PREFERENCES
    );
}

function buildExperienceStyleContext(style = null) {
    const key = getExperienceStyleKey(style);
    const preset = getExperienceStylePreset(key);

    const guidance = {
        balanced: 'Balanced warmth, clarity, and practical help.',
        gentle: 'Lead with reassurance and emotional steadiness before advice.',
        practical: 'Make the reply easy to act on with clear next steps.',
        research: 'Give fuller explanations and quietly use evidence when useful.',
        direct: 'Be concise, plain, and direct without becoming cold.'
    };

    return `${preset.label}: ${guidance[key] || guidance.balanced}`;
}

function applyExperienceStyle(style) {
    const key = getExperienceStyleKey(style);

    if (typeof window !== 'undefined' && window.chatManager) {
        window.chatManager.setProfileSetting(STORAGE_KEYS.EXPERIENCE_STYLE, key);
    }

    return key;
}

window.applyExperienceStyle = applyExperienceStyle;
window.getExperienceStyleKey = getExperienceStyleKey;
window.EXPERIENCE_STYLE_PRESETS = EXPERIENCE_STYLE_PRESETS;

function deriveHeuristicResponsePreferences(message, base = DEFAULT_RESPONSE_PREFERENCES) {
    const text = String(message || '').toLowerCase();
    const derived = { ...base };

    if (/\b(short|brief|concise|tldr)\b/.test(text)) derived.detailLevel = 'brief';
    if (/\b(detailed|detail|thorough|deep dive|in depth)\b/.test(text)) derived.detailLevel = 'detailed';

    if (/\b(step by step|walk me through|how exactly|break it down)\b/.test(text)) derived.structureLevel = 'stepwise';
    if (/\b(just tell me|straight answer)\b/.test(text)) derived.directnessLevel = 'direct';

    if (/\b(anxious|worried|scared|panic|overwhelmed|stressed|unsure)\b/.test(text)) {
        derived.reassuranceLevel = 'high';
        derived.followUpLevel = 'active';
        derived.directnessLevel = 'soft';
    }

    if (/\b(code|api|stack trace|schema|regex|typescript|javascript|python|sql|nginx|docker)\b/.test(text)) {
        derived.technicalLevel = 'technical';
        if (derived.detailLevel === 'balanced') derived.detailLevel = 'detailed';
    }

    if (/\b(explain like i'm five|simple terms|plain english)\b/.test(text)) {
        derived.technicalLevel = 'plain';
        derived.structureLevel = 'paragraphs';
    }

    if (requiresSourceBackedRouting(message)) {
        derived.detailLevel = 'detailed';
        if (derived.structureLevel === 'paragraphs') derived.structureLevel = 'mixed';
        derived.followUpLevel = 'active';
    }

    if (/\?$/.test(text.trim())) {
        derived.followUpLevel = derived.followUpLevel === 'active' ? 'active' : 'gentle';
    } else {
        derived.followUpLevel = derived.followUpLevel === 'active' ? 'active' : 'none';
    }

    const intensity = (text.match(/!/g) || []).length;
    if (intensity >= 2 && derived.reassuranceLevel !== 'high') {
        derived.reassuranceLevel = 'medium';
    }

    if (/\bthank you|thanks|got it|perfect\b/.test(text)) {
        derived.detailLevel = 'brief';
        if (derived.followUpLevel !== 'active') derived.followUpLevel = 'none';
    }

    return sanitizeResponsePreferences(derived, base);
}

function getRecentChatSnippet(history, maxMessages = 8) {
    return (history || [])
        .slice(-maxMessages)
        .map((message) => `${message.role}: ${sanitizeContentForModelContext(message.content).slice(0, 600)}`)
        .join('\n');
}

function sanitizeContentForModelContext(content) {
    const raw = String(content || '');
    if (!raw.trim()) return '';

    const sanitized = normalizeReplyWhitespace(
        stripInlineSourceLine(
            stripPlanningScaffold(
                stripMetaPreface(
                    stripToolTags(raw)
                )
            )
        )
    );

    if (sanitized && !looksLikeLeakedReasoning(sanitized)) return sanitized;
    return normalizeReplyWhitespace(stripInlineSourceLine(stripToolTags(raw))).slice(0, 1200);
}

function buildModelSafeHistoryString(history, maxMessages = 20) {
    return (history || [])
        .slice(-maxMessages)
        .map((message) => `${message.role}: ${sanitizeContentForModelContext(message.content)}`)
        .filter((line) => !/: $/.test(line))
        .join('\n');
}

function getLatestMessageByRole(history = [], role) {
    return [...(history || [])]
        .reverse()
        .find((message) => message.role === role && String(message.content || '').trim());
}

function getRecentThreadPairs(history = [], maxPairs = 4) {
    const pairs = [];
    let pendingUser = null;

    (history || []).forEach((message) => {
        const content = sanitizeContentForModelContext(message.content);
        if (!content) return;

        if (message.role === 'user') {
            pendingUser = content;
            return;
        }

        if (message.role === 'ai' && pendingUser) {
            pairs.push({
                user: pendingUser,
                assistant: content
            });
            pendingUser = null;
        }
    });

    return pairs.slice(-maxPairs);
}

function inferActiveThreadLabel(history = [], currentMessage = '') {
    const text = [
        currentMessage,
        ...getRecentThreadPairs(history, 3).flatMap((pair) => [pair.user, pair.assistant])
    ].join(' ').toLowerCase();

    const topicPatterns = [
        { label: 'bipolar disorder', pattern: /\bbipolar\b/ },
        { label: 'ADHD and anxiety', pattern: /\badhd\b.*\banxiety\b|\banxiety\b.*\badhd\b/ },
        { label: 'panic or anxiety symptoms', pattern: /\banxiety\b|\bpanic\b/ },
        { label: 'medication safety', pattern: /\bmedication|meds|dose|prescription|side effect|interaction\b/ },
        { label: 'mood and emotional support', pattern: /\bmood|feel|feeling|sad|angry|overwhelmed|stressed|lonely\b/ },
        { label: 'planning and follow-through', pattern: /\bplan|steps|routine|schedule|organize|goal|task\b/ }
    ];

    return topicPatterns.find((entry) => entry.pattern.test(text))?.label || 'the current conversation thread';
}

function buildContinuityContext(history = [], currentMessage = '', turnSupport = null) {
    const cleanCurrent = sanitizeContentForModelContext(currentMessage);
    const safeTurn = sanitizeTurnSupportDecision(turnSupport);
    const isNewTopic = safeTurn.topicShift || safeTurn.followUpIntent === 'new_topic';
    if (isNewTopic) {
        return [
            'Current turn: new topic or standalone question.',
            'Topic shift: yes. Do not use prior turns to infer missing details or force continuity.',
            `Current focus: ${cleanCurrent || 'Answer the current message directly.'}`
        ].join('\n');
    }

    const latestUser = getLatestMessageByRole(history, 'user');
    const latestAi = getLatestMessageByRole(history, 'ai');
    const recentPairs = getRecentThreadPairs(history, 4);
    const topic = inferActiveThreadLabel(history, cleanCurrent);

    const lines = [
        `Active thread: ${topic}.`,
        `Current turn: ${safeTurn.followUpIntent === 'new_topic' ? 'new topic or standalone question' : `follow-up (${safeTurn.followUpIntent})`}.`,
        safeTurn.topicShift ? 'Topic shift: yes. Do not force old context.' : 'Topic shift: no. Preserve the thread and resolve pronouns from recent context.',
        latestUser ? `Previous user turn: ${sanitizeContentForModelContext(latestUser.content).slice(0, 500)}` : '',
        latestAi ? `Previous Aura turn: ${sanitizeContentForModelContext(latestAi.content).slice(0, 650)}` : '',
        recentPairs.length
            ? `Recent thread arc:\n${recentPairs.map((pair, index) => `${index + 1}. User: ${pair.user.slice(0, 240)}\n   Aura: ${pair.assistant.slice(0, 280)}`).join('\n')}`
            : '',
        'Continuity rule: answer the current turn as part of this thread, avoid restarting the whole topic, do not repeat the previous Aura turn verbatim, and carry forward useful unresolved context.'
    ].filter(Boolean);

    return lines.join('\n');
}

function buildChatScopedProfile() {
    return {
        communicationStyle: 'Not yet established.',
        moodPatterns: [],
        potentialLapses: [],
        behavioralFacts: [],
        responsePreferences: getStoredExperienceResponsePreferences()
    };
}

function sanitizeChatScopedProfile(profile, fallback = buildChatScopedProfile()) {
    const safe = profile && typeof profile === 'object' ? profile : fallback;
    return {
        communicationStyle: safe.communicationStyle || fallback.communicationStyle,
        moodPatterns: Array.isArray(safe.moodPatterns) ? safe.moodPatterns : fallback.moodPatterns,
        potentialLapses: Array.isArray(safe.potentialLapses) ? safe.potentialLapses : fallback.potentialLapses,
        behavioralFacts: Array.isArray(safe.behavioralFacts) ? safe.behavioralFacts : fallback.behavioralFacts,
        responsePreferences: sanitizeResponsePreferences(
            safe.responsePreferences,
            fallback.responsePreferences
        )
    };
}

function buildConversationSummaryContext(summaryData) {
    if (!summaryData || typeof summaryData !== 'object') return '';

    const lines = [];
    if (summaryData.summary) lines.push(`Summary: ${summaryData.summary}`);
    if (Array.isArray(summaryData.activeTopics) && summaryData.activeTopics.length) {
        lines.push(`Active topics: ${summaryData.activeTopics.join(' | ')}`);
    }
    if (Array.isArray(summaryData.openLoops) && summaryData.openLoops.length) {
        lines.push(`Open loops: ${summaryData.openLoops.join(' | ')}`);
    }
    if (Array.isArray(summaryData.durableUserContext) && summaryData.durableUserContext.length) {
        lines.push(`Durable user context: ${summaryData.durableUserContext.join(' | ')}`);
    }

    return lines.join('\n');
}

function isUserMemoryEnabled() {
    return Boolean(window.chatManager?.isPersonalIntelligenceActive());
}

function mergeUniqueStrings(...lists) {
    const seen = new Set();
    const merged = [];

    lists.flat().forEach((item) => {
        const value = String(item || '').trim();
        const key = value.toLowerCase();
        if (!value || seen.has(key)) return;
        seen.add(key);
        merged.push(value);
    });

    return merged;
}

function buildCombinedProfileStore(chatStore, userStore, includeUserMemory = false) {
    const safeChat = sanitizeChatScopedProfile(chatStore, buildChatScopedProfile());
    const safeUser = sanitizeChatScopedProfile(userStore, buildChatScopedProfile());
    if (!includeUserMemory) return safeChat;

    return {
        communicationStyle: safeChat.communicationStyle !== 'Not yet established.'
            ? safeChat.communicationStyle
            : safeUser.communicationStyle,
        moodPatterns: mergeUniqueStrings(safeChat.moodPatterns, safeUser.moodPatterns).slice(0, 8),
        potentialLapses: mergeUniqueStrings(safeChat.potentialLapses, safeUser.potentialLapses).slice(0, 8),
        behavioralFacts: mergeUniqueStrings(safeChat.behavioralFacts, safeUser.behavioralFacts).slice(0, 10),
        responsePreferences: sanitizeResponsePreferences(
            {
                ...safeUser.responsePreferences,
                ...safeChat.responsePreferences
            },
            DEFAULT_RESPONSE_PREFERENCES
        )
    };
}

function sanitizeTurnSupportDecision(candidate, fallback = null) {
    const base = fallback && typeof fallback === 'object'
        ? fallback
        : {
              primaryMode: 'clarify',
              secondaryMode: 'none',
              followUpIntent: 'new_topic',
              topicShift: false,
              distressLevel: 'low',
              reassuranceNeed: 'medium',
              structureNeed: 'low',
              directnessTolerance: 'balanced',
              cognitiveBandwidth: 'medium',
              questioningLevel: 'one_if_needed',
              professionalBridge: 'none',
              responseGoals: []
          };
    const safe = candidate && typeof candidate === 'object' ? candidate : {};
    const modeValues = new Set(['clarify', 'soothe', 'coach', 'reflect', 'research', 'none']);
    const followValues = new Set(['new_topic', 'deepen', 'clarify', 'challenge', 'correct', 'continue']);
    const levelValues = new Set(['low', 'medium', 'high']);
    const directValues = new Set(['soft', 'balanced', 'direct']);
    const bandwidthValues = new Set(['low', 'medium', 'high']);
    const questioningValues = new Set(['none', 'one_if_needed', 'exploratory']);
    const bridgeValues = new Set(['none', 'consider', 'early']);

    return {
        primaryMode: modeValues.has(safe.primaryMode) ? safe.primaryMode : base.primaryMode,
        secondaryMode: modeValues.has(safe.secondaryMode) ? safe.secondaryMode : base.secondaryMode,
        followUpIntent: followValues.has(safe.followUpIntent) ? safe.followUpIntent : base.followUpIntent,
        topicShift: typeof safe.topicShift === 'boolean' ? safe.topicShift : base.topicShift,
        distressLevel: levelValues.has(safe.distressLevel) ? safe.distressLevel : base.distressLevel,
        reassuranceNeed: levelValues.has(safe.reassuranceNeed) ? safe.reassuranceNeed : base.reassuranceNeed,
        structureNeed: levelValues.has(safe.structureNeed) ? safe.structureNeed : base.structureNeed,
        directnessTolerance: directValues.has(safe.directnessTolerance) ? safe.directnessTolerance : base.directnessTolerance,
        cognitiveBandwidth: bandwidthValues.has(safe.cognitiveBandwidth) ? safe.cognitiveBandwidth : base.cognitiveBandwidth,
        questioningLevel: questioningValues.has(safe.questioningLevel) ? safe.questioningLevel : base.questioningLevel,
        professionalBridge: bridgeValues.has(safe.professionalBridge) ? safe.professionalBridge : base.professionalBridge,
        responseGoals: Array.isArray(safe.responseGoals)
            ? safe.responseGoals.map((goal) => String(goal || '').trim()).filter(Boolean).slice(0, 4)
            : base.responseGoals
    };
}

function deriveHeuristicTurnSupport(userMessage, route, history = [], turnPolicy = null) {
    return sanitizeTurnSupportDecision(window.AURA_RESPONSE_ADAPTATION.resolve({
        message: userMessage,
        route,
        history,
        continuity: turnPolicy?.continuity,
        stance: turnPolicy?.stance
    }));
}

function buildTurnSupportContext(turnSupport) {
    const safe = sanitizeTurnSupportDecision(turnSupport);
    return [
        '[Turn Support Guidance]',
        `Primary mode: ${safe.primaryMode}`,
        `Secondary mode: ${safe.secondaryMode}`,
        `Follow-up intent: ${safe.followUpIntent}`,
        `Topic shift: ${safe.topicShift ? 'yes' : 'no'}`,
        `Distress level: ${safe.distressLevel}`,
        `Reassurance need: ${safe.reassuranceNeed}`,
        `Structure need: ${safe.structureNeed}`,
        `Directness tolerance: ${safe.directnessTolerance}`,
        `Cognitive bandwidth: ${safe.cognitiveBandwidth}`,
        `Questioning: ${safe.questioningLevel}`,
        `Professional bridge: ${safe.professionalBridge}`,
        `Goals: ${safe.responseGoals.join(' | ') || 'Answer clearly and naturally.'}`,
        'Rules:',
        '- Use this to shape how you answer, not to narrate your process.',
        '- Stay aligned with the current question before broadening out.',
        '- Avoid repeating prior explanations unless the user is clearly asking for that.'
    ].join('\n');
}

function isAmbiguousFollowUpMessage(message) {
    const text = String(message || '').trim();
    if (!text) return false;
    const tokenCount = text.split(/\s+/).filter(Boolean).length;
    const ambiguousPronouns = /\b(it|this|that|them|those|these|they|he|she|its|their|there)\b/i;
    return tokenCount <= 18 && ambiguousPronouns.test(text);
}

function buildContextualUserMessage(userMessage, history, turnSupport = null) {
    const cleanMessage = String(userMessage || '').trim();
    if (!cleanMessage) return '';
    const shouldUseFollowUpContext =
        !turnSupport?.topicShift &&
        (
            isAmbiguousFollowUpMessage(cleanMessage) ||
            ['deepen', 'clarify', 'challenge', 'correct', 'continue'].includes(turnSupport?.followUpIntent)
        );
    if (!shouldUseFollowUpContext) return cleanMessage;

    const scopedHistory = [...(history || [])];
    const latestMessage = scopedHistory[scopedHistory.length - 1];
    if (
        latestMessage?.role === 'user' &&
        sanitizeContentForModelContext(latestMessage.content) === sanitizeContentForModelContext(cleanMessage)
    ) {
        scopedHistory.pop();
    }

    const priorUserMessages = scopedHistory
        .filter((message) => message.role === 'user' && String(message.content || '').trim())
        .map((message) => sanitizeContentForModelContext(message.content))
        .filter(Boolean);
    const latestPriorUser = priorUserMessages.length ? priorUserMessages[priorUserMessages.length - 1] : '';

    const priorAiMessages = scopedHistory
        .filter((message) => message.role === 'ai' && String(message.content || '').trim())
        .map((message) => sanitizeContentForModelContext(message.content))
        .filter(Boolean);
    const latestPriorAi = priorAiMessages.length ? priorAiMessages[priorAiMessages.length - 1] : '';

    const references = [
        latestPriorUser ? `Previous user message: "${latestPriorUser.slice(0, 380)}"` : '',
        latestPriorAi ? `Previous assistant message: "${latestPriorAi.slice(0, 380)}"` : ''
    ].filter(Boolean);

    if (!references.length) return cleanMessage;

    return [
        cleanMessage,
        '[Follow-up context]',
        turnSupport ? `Follow-up intent: ${turnSupport.followUpIntent}` : '',
        ...references
    ].filter(Boolean).join('\n');
}

function deriveHeuristicToolOpportunity(
    userMessage,
    route,
    chatId = window.chatManager?.getActiveChatId()
) {
    return window.AURA_TOOL_DECISION.deriveCandidate(
        userMessage,
        route,
        getRecentConversationText(4, chatId)
    );
}

function isExplicitToolCreationRequest(userMessage) {
    return window.AURA_TURN_POLICY.isExplicitToolRequest(userMessage);
}

function shouldSuppressProactiveToolOpportunity(userMessage, route) {
    return window.AURA_TOOL_DECISION.shouldSuppress({
        message: userMessage,
        route,
        explicitToolRequest: isExplicitToolCreationRequest(userMessage),
        toolRefusal: window.AURA_TURN_POLICY.hasToolRefusal(userMessage)
    });
}

async function inferProactiveToolOpportunity(
    userMessage,
    route,
    adaptivePreferences,
    chatId = chatManager.getActiveChatId()
) {
    if (shouldSuppressProactiveToolOpportunity(userMessage, route)) return null;

    const candidate = deriveHeuristicToolOpportunity(userMessage, route, chatId);

    if (!candidate.shouldUseTool) return null;
    if (shouldSuppressProactiveToolOpportunity(userMessage, route)) return null;
    if (!LOW_RISK_PROACTIVE_TYPES.has(candidate.type)) return null;
    if (route.includes('Crisis') && !CRISIS_ROUTE_PROACTIVE_TYPES.has(candidate.type)) return null;
    if (candidate.confidence < 0.65) return null;
    const immediateGrounding = candidate.type === 'breathing_exercise' &&
        window.AURA_TURN_POLICY.hasImmediateGroundingNeed(userMessage);
    if (
        !isExplicitToolCreationRequest(userMessage) &&
        !immediateGrounding &&
        !chatManager.canUseProactiveTool(candidate.type, 90 * 1000, chatId)
    ) return null;

    return candidate;
}

const {
    extractToolTags,
    stripToolTags,
    normalizeReplyWhitespace,
    splitReplyArtifacts,
    reassembleReplyArtifacts,
    stripModelReasoningTokens,
    stripPlanningScaffold,
    stripMetaPreface,
    looksLikeLeakedReasoning,
    finalizeAssistantReply,
    getDisplaySafeAssistantContent,
    stripInlineSourceLine
} = window.AURA_RESPONSE_SANITIZER;
window.getDisplaySafeAssistantContent = getDisplaySafeAssistantContent;

function extractErrorMessage(errorPayload, fallbackMessage) {
    if (!errorPayload) return fallbackMessage;
    if (typeof errorPayload === 'string') return errorPayload;
    if (typeof errorPayload.error === 'string') return errorPayload.error;
    if (typeof errorPayload.details === 'string') return errorPayload.details;
    return fallbackMessage;
}

function formatLocationContext(locationContext) {
    if (!locationContext) return 'Unavailable.';

    const parts = [];
    if (locationContext.label) parts.push(locationContext.label);
    if (locationContext.timestamp) {
        const capturedAt = new Date(locationContext.timestamp);
        if (!Number.isNaN(capturedAt.getTime())) {
            parts.push(`Last refreshed ${capturedAt.toLocaleString()}`);
        }
    }

    return parts.join(' | ') || 'Unavailable.';
}

function getRuntimeContextString() {
    const now = new Date();
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
    const locationEnabled = Boolean(
        window.chatManager?.getProfileSetting(STORAGE_KEYS.LOCATION_ENABLED, false)
    );
    const locationContext = window.chatManager?.getProfileSetting(
        STORAGE_KEYS.LOCATION_CONTEXT,
        null
    );

    return [
        '[System Context]',
        `Date: ${now.toLocaleDateString(undefined, { dateStyle: 'full' })}`,
        `Time: ${now.toLocaleTimeString(undefined, { timeStyle: 'long' })}`,
        `Timezone: ${timezone}`,
        `Locale: ${navigator.language || 'Unknown'}`,
        `Location access enabled: ${locationEnabled ? 'Yes' : 'No'}`,
        `Location context: ${locationEnabled ? formatLocationContext(locationContext) : 'Disabled by user.'}`,
        'Use this context only when it helps. Keep references to time or place casual and human.'
    ].join('\n');
}

const responseRuntime = window.AURA_REQUEST_RUNTIME.createRuntime();

async function requestJson(url, options = {}) {
    const hosted = window.AURA_HOSTED;
    const { response, data } = await responseRuntime.fetchJson(url, {
        headers: {
            'Content-Type': 'application/json',
            ...(hosted?.enabled ? { 'X-Aura-CSRF': hosted.csrfToken } : {}),
            ...(options.headers || {})
        },
        ...options
    });

    if (!response.ok) {
        const error = new Error(extractErrorMessage(data, `Request failed with status ${response.status}`));
        error.code = data?.code;
        throw error;
    }

    return data;
}

async function postJson(url, body, options = {}) {
    if (window.AURA_HOSTED?.enabled) await window.AURA_HOSTED.waitForSync();
    const requestOptions = {
        method: 'POST',
        body: JSON.stringify(body),
        ...options
    };
    if ([API_ENDPOINTS.searchMemory, API_ENDPOINTS.searchExamples, API_ENDPOINTS.searchPersonalExamples].includes(url)) {
        return responseRuntime.retrieve(
            (signal) => requestJson(url, { ...requestOptions, signal }),
            { matches: [], examples: [] }
        );
    }
    return requestJson(url, requestOptions);
}

function deriveResponseExampleTask(message, classification = {}, documentText = null) {
    const text = String(message || '').toLowerCase();
    if (classification.task === 'medical_document' || documentText) return 'medical_document';
    if (/\b(medication|medicine|meds|dose|dosage|pill|prescription|interaction|side effect|supplement|antibiotic|steroid)\b/.test(text)) {
        return 'medication_safety';
    }
    if (/\b(lab|blood test|hba1c|hemoglobin|tsh|creatinine|egfr|potassium|cholesterol|ldl|ferritin|alt|ast)\b/.test(text)) {
        return 'lab_interpretation';
    }
    if (/\b(appointment|visit|doctor|clinician|second opinion|what should i ask|prepare)\b/.test(text)) {
        return 'appointment_preparation';
    }
    if (/\b(what disease|do i have|diagnose me|screening test|normal test|risk statistic|doubles? the risk)\b/.test(text)) {
        return 'medical_uncertainty';
    }
    return 'symptom_education';
}

function deriveCompanionExampleTask(message, turnPolicy = {}, proactiveRecommendation = null) {
    const text = String(message || '').toLowerCase();
    if (/\b(that(?:'s| is) not what i meant|you misunderstood|you misread|not what i asked|i said)\b/.test(text)) {
        return 'repair_after_misread';
    }
    if (window.AURA_TURN_POLICY.hasToolRefusal(message)) return 'tool_suppression';
    if (proactiveRecommendation?.delivery === 'offer') return 'tool_offer';
    if (turnPolicy?.stance?.mode === 'challenge') return 'supportive_disagreement';
    if (turnPolicy?.stance?.mode === 'explore' && /\b(i think|i assume|maybe|probably|seems like|must mean|might mean)\b/.test(text)) {
        return 'uncertainty_clarification';
    }
    if (
        turnPolicy?.stance?.validateEmotionFirst ||
        /\b(i feel|i'm hurt|i am hurt|lonely|grieving|ashamed|overwhelmed|scared|anxious)\b/.test(text)
    ) {
        return 'emotional_presence';
    }
    if (turnPolicy?.continuity?.mode === 'new_topic' && turnPolicy.continuity.confidence < 1) {
        return 'topic_transition';
    }
    if (isInformationalExplanationRequest(message)) return 'tool_suppression';
    return '';
}

function buildResponseExampleContext(examples = []) {
    return examples
        .slice(0, 3)
        .map((entry, index) => {
            const avoid = Array.isArray(entry.avoid) ? entry.avoid.filter(Boolean).slice(0, 4) : [];
            const label = entry.source === 'personal_feedback'
                ? `Personal example ${index + 1}`
                : `Example ${index + 1}`;
            return [
                `[${label}: ${entry.task || 'conversation'}]`,
                entry.source === 'personal_feedback'
                    ? 'This response pattern was explicitly approved by this user on this device.'
                    : '',
                `Example user request: ${String(entry.userMessage || '').slice(0, 700)}`,
                `Preferred response pattern: ${String(entry.idealResponse || '').slice(0, 1200)}`,
                avoid.length ? `Avoid: ${avoid.join(' | ')}` : ''
            ].filter(Boolean).join('\n');
        })
        .join('\n\n');
}

async function searchResponseExamples({
    message,
    modelDecision,
    documentText = null,
    turnPolicy = null,
    proactiveRecommendation = null,
    highRisk = false
} = {}) {
    const classification = modelDecision?.classification;
    if (!classification || highRisk || classification.risk === 'high') return '';
    const sourceProfileId = chatManager.getActiveProfileId();
    const sourceContextEpoch = chatManager.getPersonalContextEpoch();
    const personalSearchActive = chatManager.isPersonalIntelligenceActive();

    try {
        const isMedical = classification.domain === 'medical';
        const domain = isMedical ? 'medical' : 'companion';
        const task = isMedical
            ? deriveResponseExampleTask(message, classification, documentText)
            : deriveCompanionExampleTask(message, turnPolicy, proactiveRecommendation);
        const modelFamily = window.AURA_MODEL_ROUTING.getModelFamily(modelDecision.primaryModel);
        const activePersonalIds = isMedical || !personalSearchActive
            ? []
            : chatManager.getActivePersonalExampleIds();
        const curatedRequest = task
            ? postJson(API_ENDPOINTS.searchExamples, {
                query: message,
                domain,
                task,
                risk: classification.risk,
                modelFamily,
                limit: isMedical ? 3 : 2
            })
            : Promise.resolve({ examples: [] });
        const personalRequest = activePersonalIds.length
            ? postJson(API_ENDPOINTS.searchPersonalExamples, {
                profileId: sourceProfileId,
                query: message,
                modelFamily,
                limit: 2
            })
            : Promise.resolve({ examples: [] });
        const [curatedResult, personalResult] = await Promise.allSettled([
            curatedRequest,
            personalRequest
        ]);
        const curatedExamples = curatedResult.status === 'fulfilled'
            ? (curatedResult.value.examples || [])
            : [];
        const personalResultsStillValid = personalSearchActive &&
            chatManager.isPersonalIntelligenceActive() &&
            sourceProfileId === chatManager.getActiveProfileId() &&
            sourceContextEpoch === chatManager.getPersonalContextEpoch();
        const personalExamples = personalResultsStillValid && personalResult.status === 'fulfilled'
            ? (personalResult.value.examples || []).filter((entry) => (
                activePersonalIds.includes(entry.id)
            ))
            : [];
        const combined = [...personalExamples, ...curatedExamples]
            .filter((entry, index, entries) => (
                entries.findIndex((candidate) => candidate.id === entry.id) === index
            ));
        return buildResponseExampleContext(combined);
    } catch (_error) {
        responseRuntime.throwIfAborted();
        return '';
    }
}

async function _callLLM(prompt, {
    modelName = getBackgroundModelName(),
    format = null,
    callType = 'default',
    thinkingMode = getThinkingModeKey(),
    routeDecision = null,
    signal = responseRuntime.getTurnSignal()
} = {}) {
    const inferencePolicy = window.AURA_MODEL_ROUTING.resolveInferencePolicy({
        modelName,
        requestedMode: thinkingMode,
        callType: format === 'json' ? 'json' : callType,
        routeDecision
    });
    const options = {
        ...getModelGenerationOptions(modelName, format, callType),
        num_predict: inferencePolicy.maxTokens
    };

    try {
        const data = await postJson(API_ENDPOINTS.ollamaGenerate, {
            model: modelName,
            prompt,
            stream: false,
            ...(inferencePolicy.think ? { think: inferencePolicy.think } : {}),
            ...(Object.keys(options).length ? { options } : {}),
            ...(format ? { format } : {})
        }, { signal });

        let rawReply = data.response?.trim() || null;
        const doneReason = String(data.done_reason || data.doneReason || '').toLowerCase();
        const allowContinuation = !format && callType === 'default';

        const firstVisibleReply = stripModelReasoningTokens(rawReply);
        const needsReasoningContinuation = rawReply && !firstVisibleReply && /<unused94>\s*thought/i.test(rawReply);

        const visibleWordCount = firstVisibleReply
            ? firstVisibleReply.split(/\s+/).filter(Boolean).length
            : 0;
        const visibleLooksCutOff = firstVisibleReply && visibleWordCount < 60 && isLikelyIncompleteReply(firstVisibleReply);

        if (allowContinuation && rawReply && (needsReasoningContinuation || doneReason === 'length' || visibleLooksCutOff)) {
            let attempts = 0;
            while (attempts < 3) {
                const visibleSoFar = stripModelReasoningTokens(rawReply);
                const stillHiddenOnly = rawReply && !visibleSoFar && /<unused94>\s*thought/i.test(rawReply);
                const shouldContinue =
                    stillHiddenOnly ||
                    (attempts === 0 && (doneReason === 'length' || visibleLooksCutOff));
                if (!shouldContinue) break;

                const continuationData = await postJson(API_ENDPOINTS.ollamaGenerate, {
                    model: modelName,
                    prompt: stillHiddenOnly
                        ? buildFinalAnswerRetryPrompt(prompt)
                        : buildContinuationPrompt(prompt, rawReply),
                    stream: false,
                    ...(inferencePolicy.think ? { think: inferencePolicy.think } : {}),
                    ...(Object.keys(options).length ? { options } : {})
                }, { signal });
                const continuation = continuationData.response?.trim() || '';
                if (!continuation) break;
                rawReply = normalizeReplyWhitespace(`${rawReply} ${continuation}`);
                if (stripModelReasoningTokens(rawReply)) break;
                attempts += 1;
            }
        }

        const reply = stripModelReasoningTokens(rawReply);
        return reply;
    } catch (error) {
        if (error.name === 'AbortError' || error.name === 'TimeoutError') throw error;
        console.error('LLM Call Failed:', error);
        return null;
    }
}

async function fetchMarkdownContent(slug) {
    const mapping = {
        'thought-record-info': 'concepts',
        grounding: 'techniques',
        'grounding-techniques': 'techniques',
        'mindfulness-deep-breathing': 'techniques'
    };
    const folder = mapping[slug] || 'distortions';

    try {
        return await responseRuntime.waitFor(async (signal) => {
            const response = await fetch(`contents/${folder}/${slug}.md`, { signal });
            return response.ok ? await response.text() : null;
        });
    } catch (error) {
        responseRuntime.throwIfAborted();
        console.error(`Failed to fetch ${slug}.md`, error);
        return null;
    }
}

function createLocalIdentifier(prefix = 'local') {
    const randomPart = globalThis.crypto?.randomUUID
        ? globalThis.crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    return `${prefix}-${randomPart}`;
}

function buildInferenceRouteSnapshot(modelDecision, route) {
    const classification = modelDecision?.classification || {};
    return window.AURA_FEEDBACK.normalizeRouteSnapshot({
        modelName: modelDecision?.primaryModel,
        modelFamily: window.AURA_MODEL_ROUTING.getModelFamily(modelDecision?.primaryModel),
        reviewerModel: modelDecision?.reviewerModel,
        route,
        task: classification.task,
        domain: classification.domain,
        risk: classification.risk,
        thinkingMode: getThinkingModeKey(),
        source: modelDecision?.source
    });
}

class ChatManager {
    constructor() {
        this.profileManager = window.AURA_PERSONAL_INTELLIGENCE.createManager(
            window.AURA_HOSTED?.enabled ? window.AURA_HOSTED.storage : window.localStorage
        );
        this.pendingResponseMetadata = new Map();
        this.pendingVectorWrites = new Map();
        this.behaviorAnalysisVersions = new Map();
        this.personalContextEpoch = 0;
        this.state = this.ensureStateShape(this.loadState() || this.getInitialState());
        if (!this.state.activeChatId) this.createNewChat();
        this.saveState();
    }

    getInitialState() {
        return {
            chats: {},
            activeChatId: null,
            localContentStore: buildChatScopedProfile(),
            intelligenceBundle: window.AURA_INTELLIGENCE_BUNDLE.createBundle(),
            feedbackLearning: window.AURA_FEEDBACK.createState()
        };
    }

    ensureStateShape(state) {
        const safeState = state && typeof state === 'object' ? state : this.getInitialState();
        safeState.chats = safeState.chats && typeof safeState.chats === 'object' ? safeState.chats : {};
        const hadIntelligenceBundle = Boolean(
            safeState.intelligenceBundle && typeof safeState.intelligenceBundle === 'object'
        );
        const legacyGlobalStore = sanitizeChatScopedProfile(
            safeState.localContentStore,
            this.getInitialState().localContentStore
        );
        Object.values(safeState.chats).forEach((chat) => {
            if (!chat || typeof chat !== 'object') return;
            chat.history = (Array.isArray(chat.history) ? chat.history : []).map((message) => {
                if (!message || typeof message !== 'object') return message;
                const normalizedMessage = {
                    ...message,
                    id: String(message.id || createLocalIdentifier('msg'))
                };
                if (message.routeSnapshot) {
                    normalizedMessage.routeSnapshot = window.AURA_FEEDBACK.normalizeRouteSnapshot(
                        message.routeSnapshot
                    );
                }
                const toolOffer = window.AURA_TOOL_ARTIFACTS.normalizeToolOffer(
                    normalizedMessage.toolOffer
                );
                if (!toolOffer) {
                    const { toolOffer: _discardedOffer, ...cleanMessage } = normalizedMessage;
                    return cleanMessage;
                }
                return {
                    ...normalizedMessage,
                    toolOffer: toolOffer.status === 'creating'
                        ? { ...toolOffer, status: 'pending' }
                        : toolOffer
                };
            });
            chat.tools = chat.tools && typeof chat.tools === 'object' ? chat.tools : {};
            chat.completed_tasks = Array.isArray(chat.completed_tasks) ? chat.completed_tasks : [];
            chat.isHeightenedAwareness = Boolean(chat.isHeightenedAwareness);
            chat.lastUserMessageTimestamp = Number(chat.lastUserMessageTimestamp) || Date.now();
            chat.lastReengagementAt = Number(chat.lastReengagementAt) || 0;
            chat.lastProactiveToolAt = Number(chat.lastProactiveToolAt) || 0;
            chat.lastProactiveToolType = typeof chat.lastProactiveToolType === 'string' ? chat.lastProactiveToolType : '';
            chat.localContentStore = sanitizeChatScopedProfile(
                chat.localContentStore,
                buildChatScopedProfile()
            );
            chat.contextSummary = chat.contextSummary && typeof chat.contextSummary === 'object' ? chat.contextSummary : null;
            chat.contextSummaryAnchor = typeof chat.contextSummaryAnchor === 'string' ? chat.contextSummaryAnchor : '';
        });
        safeState.localContentStore = legacyGlobalStore;
        safeState.intelligenceBundle = window.AURA_INTELLIGENCE_BUNDLE.normalizeBundle(
            safeState.intelligenceBundle
        );
        if (!hadIntelligenceBundle) {
            safeState.intelligenceBundle = window.AURA_INTELLIGENCE_BUNDLE.migrateLegacyContext(
                safeState.intelligenceBundle,
                legacyGlobalStore
            );
        }
        const feedbackState = safeState.feedbackLearning &&
            typeof safeState.feedbackLearning === 'object'
            ? safeState.feedbackLearning
            : {};
        const migratedFeedbackEntries = Object.fromEntries(
            Object.entries(
                feedbackState.entries && typeof feedbackState.entries === 'object'
                    ? feedbackState.entries
                    : {}
            ).map(([key, candidate]) => {
                if (
                    !candidate ||
                    typeof candidate !== 'object' ||
                    Object.prototype.hasOwnProperty.call(candidate, 'learningEligible')
                ) return [key, candidate];
                return [key, {
                    ...candidate,
                    learningEligible: window.AURA_FEEDBACK.resolveFeedbackLearningEligibility(
                        undefined,
                        this.isPersonalIntelligenceActive(),
                        candidate.routeSnapshot
                    )
                }];
            })
        );
        safeState.feedbackLearning = {
            ...feedbackState,
            entries: migratedFeedbackEntries
        };
        safeState.feedbackLearning = window.AURA_FEEDBACK.normalizeState(safeState.feedbackLearning);

        return safeState;
    }

    loadState() {
        try {
            return this.profileManager.loadProfileState();
        } catch (_error) {
            return null;
        }
    }

    saveState() {
        return this.profileManager.saveProfileState(this.state);
    }

    listProfiles() {
        return this.profileManager.listProfiles();
    }

    getActiveProfile() {
        return this.profileManager.getActiveProfile();
    }

    getActiveProfileId() {
        return this.profileManager.getActiveProfileId();
    }

    getPersonalContextEpoch() {
        return this.personalContextEpoch;
    }

    advancePersonalContextEpoch() {
        this.personalContextEpoch += 1;
        return this.personalContextEpoch;
    }

    createProfile(name) {
        const profile = this.profileManager.createProfile(name);
        return profile ? this.switchProfile(profile.id) : null;
    }

    renameProfile(profileId, name) {
        return this.profileManager.renameProfile(profileId, name);
    }

    switchProfile(profileId) {
        this.saveState();
        const selected = this.profileManager.switchProfile(profileId);
        if (!selected) return null;

        this.advancePersonalContextEpoch();
        this.pendingResponseMetadata.clear();
        this.behaviorAnalysisVersions.clear();
        clearAnalysisCaches();
        this.state = this.ensureStateShape(this.loadState() || this.getInitialState());
        if (!this.state.activeChatId) this.createNewChat();
        this.saveState();
        return selected;
    }

    deleteProfileLocal(profileId) {
        const previousActiveId = this.getActiveProfileId();
        this.saveState();
        const deleted = this.profileManager.deleteProfile(profileId);
        if (!deleted) return false;

        if (this.getActiveProfileId() !== previousActiveId) {
            this.advancePersonalContextEpoch();
            this.pendingResponseMetadata.clear();
            this.behaviorAnalysisVersions.clear();
            clearAnalysisCaches();
            this.state = this.ensureStateShape(this.loadState() || this.getInitialState());
            if (!this.state.activeChatId) this.createNewChat();
            this.saveState();
        }
        return true;
    }

    getPersonalIntelligenceState() {
        return this.profileManager.getPersonalIntelligenceState();
    }

    setPersonalIntelligenceEnabled(enabled) {
        const previousState = this.getPersonalIntelligenceState();
        const state = this.profileManager.setPersonalIntelligenceEnabled(enabled);
        if (state !== previousState) {
            this.advancePersonalContextEpoch();
            this.pendingResponseMetadata.clear();
            this.behaviorAnalysisVersions.clear();
            clearAnalysisCaches();
        }
        return state;
    }

    isPersonalIntelligenceActive() {
        return this.profileManager.isPersonalIntelligenceActive();
    }

    getProfileSetting(setting, fallbackValue = null) {
        return this.profileManager.getProfileSetting(setting, fallbackValue);
    }

    setProfileSetting(setting, value) {
        return this.profileManager.setProfileSetting(setting, value);
    }

    removeProfileSetting(setting) {
        return this.profileManager.removeProfileSetting(setting);
    }

    createNewChat() {
        const id = Date.now().toString();

        this.state.chats[id] = {
            id,
            title: 'New Chat',
            history: [],
            tools: {},
            completed_tasks: [],
            isHeightenedAwareness: false,
            lastUserMessageTimestamp: Date.now(),
            lastReengagementAt: 0,
            lastProactiveToolAt: 0,
            lastProactiveToolType: '',
            localContentStore: buildChatScopedProfile(),
            contextSummary: null,
            contextSummaryAnchor: ''
        };
        this.state.activeChatId = id;
        this.saveState();
    }

    setActiveChat(id) {
        if (!this.state.chats[id]) return;
        this.state.activeChatId = id;
        this.saveState();
    }

    deleteChat(id) {
        if (!this.state.chats[id]) return [];
        this.advancePersonalContextEpoch();
        const promotedExampleIds = Object.values(this.state.feedbackLearning.entries)
            .filter((entry) => entry.chatId === id && entry.promotedExampleId)
            .map((entry) => entry.promotedExampleId);
        const remainingFeedback = Object.fromEntries(
            Object.entries(this.state.feedbackLearning.entries)
                .filter(([, entry]) => entry.chatId !== id)
        );
        this.state.feedbackLearning = window.AURA_FEEDBACK.normalizeState({
            ...this.state.feedbackLearning,
            entries: remainingFeedback
        });
        this.state.intelligenceBundle = window.AURA_INTELLIGENCE_BUNDLE.removeChatContributions(
            this.state.intelligenceBundle,
            id
        );
        this.behaviorAnalysisVersions.delete(id);
        delete this.state.chats[id];

        const remainingChatIds = Object.keys(this.state.chats);
        this.state.activeChatId = remainingChatIds.length ? remainingChatIds[0] : null;

        if (!this.state.activeChatId) this.createNewChat();
        this.saveState();
        return promotedExampleIds;
    }

    addMessageToActiveChat(role, content, metadata = {}) {
        return this.addMessageToChat(this.state.activeChatId, role, content, metadata);
    }

    addMessageToChat(chatId, role, content, metadata = {}) {
        const chat = this.state.chats[chatId];
        if (!chat) return -1;

        const timestamp = Date.now();
        const message = {
            id: createLocalIdentifier('msg'),
            role,
            content,
            timestamp
        };
        const toolOffer = role === 'ai'
            ? window.AURA_TOOL_ARTIFACTS.normalizeToolOffer(metadata.toolOffer)
            : null;
        if (toolOffer) message.toolOffer = toolOffer;
        if (role === 'ai' && metadata.routeSnapshot) {
            message.routeSnapshot = window.AURA_FEEDBACK.normalizeRouteSnapshot(
                metadata.routeSnapshot
            );
        }
        if (role === 'ai' && metadata.retryOfMessageId) {
            message.retryOfMessageId = String(metadata.retryOfMessageId);
        }
        if (role === 'user' && metadata.feedbackRetryFor) {
            message.feedbackRetryFor = String(metadata.feedbackRetryFor);
            message.source = 'feedback_retry';
        }
        chat.history.push(message);
        const messageIndex = chat.history.length - 1;

        if (chat.history.length === 1 && role === 'user') {
            chat.title = buildChatTitle(content);
        }

        if (role === 'user') {
            chat.lastUserMessageTimestamp = timestamp;
            this.recordExplicitPreferenceSignals(content, chat.id, message.id);
            const normalUserTurnCount = chat.history.filter((entry) => (
                entry?.role === 'user' && entry.source !== 'feedback_retry'
            )).length;
            if (
                message.source !== 'feedback_retry' &&
                normalUserTurnCount % 2 === 0 &&
                this.isPersonalIntelligenceActive()
            ) {
                this.runBehaviorAnalyzer(chatId).catch((error) => {
                    console.warn('Background preference analysis unavailable:', error.name);
                });
            }
        }

        this.saveState();
        return messageIndex;
    }

    async vectorizeData(text, metadata = {}) {
        if (
            !text ||
            !this.isPersonalIntelligenceActive() ||
            metadata?.approval !== 'explicit'
        ) return false;
        const sourceProfileId = this.getActiveProfileId();
        const request = postJson(API_ENDPOINTS.storeMemory, {
            profileId: sourceProfileId,
            text,
            metadata
        }, { signal: null });
        this.pendingVectorWrites.set(request, sourceProfileId);

        try {
            await request;
            return true;
        } catch (error) {
            console.error('Vector DB Store Error', error);
            return false;
        } finally {
            this.pendingVectorWrites.delete(request);
        }
    }

    async waitForPendingVectorWrites(profileId = null) {
        const targetProfileId = profileId ? String(profileId) : '';
        const pending = [...this.pendingVectorWrites.entries()]
            .filter(([, sourceProfileId]) => (
                !targetProfileId || sourceProfileId === targetProfileId
            ))
            .map(([request]) => request);
        if (pending.length) await Promise.allSettled(pending);
    }

    async searchRelevantVectorData(query, turnPolicy = null, chatId = this.state.activeChatId) {
        if (!query || !this.isPersonalIntelligenceActive()) return '';
        const sourceProfileId = this.getActiveProfileId();
        const sourceContextEpoch = this.getPersonalContextEpoch();

        try {
            const data = await postJson(API_ENDPOINTS.searchMemory, {
                profileId: sourceProfileId,
                query,
                approvedOnly: true
            });
            if (
                sourceProfileId !== this.getActiveProfileId() ||
                sourceContextEpoch !== this.getPersonalContextEpoch() ||
                !this.isPersonalIntelligenceActive()
            ) return '';
            const matches = Array.isArray(data.matches) ? data.matches : [];
            const explicitRecall = /\b(remember|earlier|before|last time|previously|did i tell you)\b/i.test(query);
            const selected = window.AURA_TURN_POLICY.selectRelevantMemories({
                query,
                matches,
                explicitRecall,
                continuity: turnPolicy?.continuity,
                maxItems: 2
            });

            if (!selected.length) return '';
            return [
                '[Relevant recalled context]',
                ...selected.map((entry) => (
                    `- ${sanitizeContentForModelContext(entry.text)} ` +
                    `(source: personal conversation memory; relevance: ${entry.relevance})`
                )),
                'Use only when it directly helps the current message. If it conflicts with the current turn, ignore it.'
            ].join('\n');
        } catch (_error) {
            responseRuntime.throwIfAborted();
            return '';
        }
    }

    async runBehaviorAnalyzer(chatId = this.state.activeChatId) {
        if (!this.isPersonalIntelligenceActive()) return;
        const analysisVersion = (this.behaviorAnalysisVersions.get(chatId) || 0) + 1;
        this.behaviorAnalysisVersions.set(chatId, analysisVersion);
        const sourceProfileId = this.getActiveProfileId();
        const sourceContextEpoch = this.getPersonalContextEpoch();
        const chat = this.state.chats[chatId];
        const normalUserTurns = chat?.history?.filter((message) => (
            message?.role === 'user' && message.source !== 'feedback_retry'
        )) || [];
        if (!chat || normalUserTurns.length < 2) return;
        const currentStore = sanitizeChatScopedProfile(
            chat.localContentStore,
            this.state.localContentStore
        );

        const historyStr = chat.history
            .slice(-8)
            .map((message) => `${message.role}: ${sanitizeContentForModelContext(message.content)}`)
            .join('\n');

        const prompt = PROMPTS.BEHAVIOR_ANALYZER
            .replace('%STORE%', JSON.stringify(currentStore))
            .replace('%HISTORY%', historyStr);

        const response = await _callLLM(prompt, { format: 'json', callType: 'analysis', signal: null });
        if (
            sourceProfileId !== this.getActiveProfileId() ||
            sourceContextEpoch !== this.getPersonalContextEpoch() ||
            !this.isPersonalIntelligenceActive() ||
            this.behaviorAnalysisVersions.get(chatId) !== analysisVersion
        ) return;
        const parsed = safeParseJson(response, null);

        if (parsed && typeof parsed === 'object') {
            if (!this.state.chats[chatId]) return;
            const latestStore = this.getContentStoreForChat(chatId);
            const previousPreferences = sanitizeResponsePreferences(
                latestStore.responsePreferences,
                DEFAULT_RESPONSE_PREFERENCES
            );
            const nextStore = sanitizeChatScopedProfile(parsed, latestStore);
            nextStore.responsePreferences = sanitizeResponsePreferences(
                parsed.responsePreferences,
                previousPreferences
            );
            this.recordInteractionPreferenceSignals(
                previousPreferences,
                nextStore.responsePreferences,
                chatId,
                normalUserTurns[normalUserTurns.length - 1]?.id
            );
            this.state.chats[chatId].localContentStore = nextStore;
            this.saveState();
        }
    }

    getChat(chatId = this.state.activeChatId) {
        return this.state.chats[chatId] || null;
    }

    getActiveChat() {
        return this.getChat();
    }

    getContentStoreForChat(chatId = this.state.activeChatId) {
        const chat = this.getChat(chatId);
        return sanitizeChatScopedProfile(chat?.localContentStore, this.state.localContentStore);
    }

    getActiveContentStore() {
        return this.getContentStoreForChat();
    }

    getInferenceContentStore(chatId = this.state.activeChatId) {
        if (this.isPersonalIntelligenceActive()) {
            return this.getContentStoreForChat(chatId);
        }

        return {
            ...buildChatScopedProfile(),
            responsePreferences: getStoredExperienceResponsePreferences()
        };
    }

    getUserMemoryStore() {
        const approvedMemories = window.AURA_INTELLIGENCE_BUNDLE.getActiveSignals(
            this.state.intelligenceBundle,
            { kind: 'approved_memory' }
        ).map((signal) => signal.value);
        return {
            ...buildChatScopedProfile(),
            behavioralFacts: approvedMemories,
            responsePreferences: sanitizeResponsePreferences({
                ...DEFAULT_RESPONSE_PREFERENCES,
                ...window.AURA_INTELLIGENCE_BUNDLE.buildPreferenceOverrides(
                    this.state.intelligenceBundle
                )
            }, DEFAULT_RESPONSE_PREFERENCES)
        };
    }

    getProfileIntelligenceBundle() {
        return window.AURA_INTELLIGENCE_BUNDLE.normalizeBundle(this.state.intelligenceBundle);
    }

    getLegacyMemoryReview() {
        return window.AURA_INTELLIGENCE_BUNDLE.getReviewRequiredMemories(
            this.state.intelligenceBundle
        );
    }

    recordInteractionPreferenceSignals(previousPreferences, nextPreferences, chatId, messageId = '') {
        if (!this.isPersonalIntelligenceActive()) return;
        const previous = sanitizeResponsePreferences(previousPreferences, DEFAULT_RESPONSE_PREFERENCES);
        const next = sanitizeResponsePreferences(nextPreferences, previous);
        [
            'detailLevel',
            'reassuranceLevel',
            'technicalLevel',
            'structureLevel',
            'directnessLevel',
            'followUpLevel'
        ].forEach((key) => {
            if (next[key] === previous[key]) return;
            this.state.intelligenceBundle = window.AURA_INTELLIGENCE_BUNDLE.recordSignal(
                this.state.intelligenceBundle,
                {
                    kind: 'interaction_preference',
                    key,
                    value: next[key],
                    confidence: 0.72,
                    source: {
                        type: 'behavior_analysis',
                        chatId,
                        messageId
                    }
                }
            );
        });
    }

    recordExplicitPreferenceSignals(message, chatId, messageId = '') {
        if (!this.isPersonalIntelligenceActive()) return;
        window.AURA_INTELLIGENCE_BUNDLE.inferExplicitPreferenceSignals(message)
            .forEach((preference) => {
                this.state.intelligenceBundle = window.AURA_INTELLIGENCE_BUNDLE.recordSignal(
                    this.state.intelligenceBundle,
                    {
                        kind: 'interaction_preference',
                        key: preference.key,
                        value: preference.value,
                        confidence: 0.99,
                        source: {
                            type: 'explicit_instruction',
                            chatId,
                            messageId
                        }
                    }
                );
            });
    }

    rememberUserFact(text) {
        if (!this.isPersonalIntelligenceActive()) return false;
        const value = String(text || '').trim();
        if (!value) return false;

        const chatId = this.state.activeChatId;
        const latestUser = [...(this.getChat(chatId)?.history || [])]
            .reverse()
            .find((message) => message?.role === 'user');
        this.state.intelligenceBundle = window.AURA_INTELLIGENCE_BUNDLE.recordSignal(
            this.state.intelligenceBundle,
            {
                kind: 'approved_memory',
                key: 'memory',
                value,
                confidence: 1,
                consent: 'explicit',
                source: {
                    type: 'memory_request',
                    chatId,
                    messageId: latestUser?.id || ''
                }
            }
        );
        const store = sanitizeChatScopedProfile(this.state.localContentStore, buildChatScopedProfile());
        store.behavioralFacts = mergeUniqueStrings(store.behavioralFacts, [value]).slice(0, 20);
        this.state.localContentStore = store;
        this.vectorizeData(value, {
            role: 'user',
            timestamp: Date.now(),
            sourceChatId: chatId,
            approval: 'explicit'
        });
        this.saveState();
        return true;
    }

    getCombinedContentStore(chatId = this.state.activeChatId) {
        return buildCombinedProfileStore(
            this.getContentStoreForChat(chatId),
            this.getUserMemoryStore(),
            isUserMemoryEnabled()
        );
    }

    clearUserMemoryStore() {
        this.advancePersonalContextEpoch();
        this.state.localContentStore = buildChatScopedProfile();
        this.state.intelligenceBundle = window.AURA_INTELLIGENCE_BUNDLE.clearApprovedMemories(
            this.state.intelligenceBundle
        );
        this.saveState();
    }

    clearLearnedPreferences() {
        this.advancePersonalContextEpoch();
        this.state.intelligenceBundle = window.AURA_INTELLIGENCE_BUNDLE.clearInteractionPreferences(
            this.state.intelligenceBundle
        );
        Object.values(this.state.chats).forEach((chat) => {
            if (!chat || typeof chat !== 'object') return;
            chat.localContentStore = {
                ...sanitizeChatScopedProfile(chat.localContentStore, buildChatScopedProfile()),
                responsePreferences: { ...DEFAULT_RESPONSE_PREFERENCES }
            };
        });
        clearAnalysisCaches();
        this.saveState();
    }

    getFeedbackProfileId() {
        return this.getActiveProfileId();
    }

    setPendingResponseMetadata(chatId, metadata = {}) {
        if (!chatId || !this.state.chats[chatId]) return;
        this.pendingResponseMetadata.set(chatId, {
            ...metadata,
            routeSnapshot: metadata.routeSnapshot
                ? window.AURA_FEEDBACK.normalizeRouteSnapshot(metadata.routeSnapshot)
                : null
        });
    }

    consumePendingResponseMetadata(chatId) {
        const metadata = this.pendingResponseMetadata.get(chatId) || {};
        this.pendingResponseMetadata.delete(chatId);
        return metadata;
    }

    getResponseFeedback(chatId, messageId) {
        const entry = this.state.feedbackLearning.entries[String(messageId || '')];
        return entry?.chatId === chatId ? { ...entry } : null;
    }

    getFeedbackSummary() {
        return { ...this.state.feedbackLearning.summary };
    }

    getFeedbackPreferenceOverrides() {
        if (!this.isPersonalIntelligenceActive()) return {};
        return { ...this.state.feedbackLearning.preferenceOverrides };
    }

    prefersFewerToolOffers() {
        return this.isPersonalIntelligenceActive() &&
            this.state.feedbackLearning.toolOfferMode === 'explicit_only';
    }

    findRelatedUserMessage(chatId, assistantMessage) {
        const chat = this.getChat(chatId);
        if (!chat || !assistantMessage) return null;
        const originalAssistant = assistantMessage.retryOfMessageId
            ? chat.history.find((message) => message.id === assistantMessage.retryOfMessageId)
            : assistantMessage;
        const assistantIndex = chat.history.findIndex((message) => message.id === originalAssistant?.id);
        if (assistantIndex < 0) return null;

        for (let index = assistantIndex - 1; index >= 0; index -= 1) {
            const message = chat.history[index];
            if (message?.role === 'user' && message.source !== 'feedback_retry') return message;
        }
        return null;
    }

    saveResponseFeedback(chatId, messageId, patch = {}) {
        const chat = this.getChat(chatId);
        const assistantMessage = chat?.history?.find((message) => message.id === messageId);
        if (!assistantMessage || assistantMessage.role !== 'ai') return null;
        const existing = this.getResponseFeedback(chatId, messageId);
        const userMessage = this.findRelatedUserMessage(chatId, assistantMessage);
        const routeSnapshot = assistantMessage.routeSnapshot || existing?.routeSnapshot;

        this.state.feedbackLearning = window.AURA_FEEDBACK.upsertFeedback(
            this.state.feedbackLearning,
            {
                ...existing,
                ...patch,
                chatId,
                messageId,
                learningEligible: window.AURA_FEEDBACK.resolveFeedbackLearningEligibility(
                    existing?.learningEligible,
                    this.isPersonalIntelligenceActive(),
                    routeSnapshot
                ),
                userMessageId: userMessage?.id || existing?.userMessageId || '',
                routeSnapshot
            }
        );
        this.saveState();
        return this.getResponseFeedback(chatId, messageId);
    }

    deleteResponseFeedback(chatId, messageId) {
        const existing = this.getResponseFeedback(chatId, messageId);
        if (!existing) return '';
        this.state.feedbackLearning = window.AURA_FEEDBACK.removeFeedback(
            this.state.feedbackLearning,
            messageId
        );
        this.saveState();
        return existing.promotedExampleId || '';
    }

    getFeedbackRetryContext(chatId, messageId) {
        const chat = this.getChat(chatId);
        const assistantMessage = chat?.history?.find((message) => message.id === messageId);
        const feedback = this.getResponseFeedback(chatId, messageId);
        const userMessage = this.findRelatedUserMessage(chatId, assistantMessage);
        const request = window.AURA_FEEDBACK.buildRetryRequest(feedback, userMessage?.content);
        if (!assistantMessage || !feedback || !request) return null;

        return {
            assistantMessage,
            feedback,
            userMessage,
            ...request
        };
    }

    markFeedbackRetried(chatId, messageId, retryMessageId) {
        if (!this.getResponseFeedback(chatId, messageId)) return;
        this.state.feedbackLearning = window.AURA_FEEDBACK.markRetried(
            this.state.feedbackLearning,
            messageId,
            retryMessageId
        );
        this.saveState();
    }

    getPersonalExampleCandidate(chatId, messageId) {
        if (!this.isPersonalIntelligenceActive()) return null;
        const chat = this.getChat(chatId);
        const assistantMessage = chat?.history?.find((message) => message.id === messageId);
        const feedback = this.getResponseFeedback(chatId, messageId);
        const userMessage = this.findRelatedUserMessage(chatId, assistantMessage);
        if (!window.AURA_FEEDBACK.canPromotePersonalExample({
            feedback,
            userMessage: userMessage?.content,
            assistantMessage: assistantMessage?.content
        })) return null;

        return {
            id: `personal-${messageId}`,
            task: feedback.routeSnapshot.task || 'conversation',
            route: feedback.routeSnapshot.route,
            domain: 'companion',
            risk: 'low',
            preferredModel: 'either',
            userMessage: String(userMessage.content || '').slice(0, 4000),
            idealResponse: String(assistantMessage.content || '').slice(0, 8000)
        };
    }

    canPromoteResponseFeedback(chatId, messageId) {
        return Boolean(this.getPersonalExampleCandidate(chatId, messageId));
    }

    markFeedbackPromoted(chatId, messageId, exampleId) {
        if (!this.isPersonalIntelligenceActive() || !this.getResponseFeedback(chatId, messageId)) return;
        this.state.feedbackLearning = window.AURA_FEEDBACK.markPromoted(
            this.state.feedbackLearning,
            messageId,
            exampleId
        );
        this.saveState();
    }

    markFeedbackUnpromoted(chatId, messageId) {
        if (!this.getResponseFeedback(chatId, messageId)) return;
        this.state.feedbackLearning = window.AURA_FEEDBACK.markUnpromoted(
            this.state.feedbackLearning,
            messageId
        );
        this.saveState();
    }

    getActivePersonalExampleIds() {
        return Object.values(this.state.feedbackLearning.entries)
            .filter((entry) => (
                entry.learningEligible &&
                window.AURA_FEEDBACK.isFeedbackLearningRouteEligible(entry.routeSnapshot)
            ))
            .map((entry) => entry.promotedExampleId)
            .filter(Boolean);
    }

    getPromotedExampleIdsForChat(chatId) {
        return Object.values(this.state.feedbackLearning.entries)
            .filter((entry) => entry.chatId === String(chatId || ''))
            .map((entry) => entry.promotedExampleId)
            .filter(Boolean);
    }

    isPersonalExampleActive(exampleId) {
        return this.getActivePersonalExampleIds().includes(String(exampleId || ''));
    }

    clearFeedbackLearning() {
        this.advancePersonalContextEpoch();
        const promotedExampleIds = this.getActivePersonalExampleIds();
        this.state.feedbackLearning = window.AURA_FEEDBACK.createState();
        this.saveState();
        return promotedExampleIds;
    }

    exportLocalData() {
        return {
            exportedAt: new Date().toISOString(),
            version: 'aura-profile-export-v3',
            profile: this.getActiveProfile(),
            personalIntelligenceState: this.getPersonalIntelligenceState(),
            state: this.state,
            settings: {
                theme: localStorage.getItem(STORAGE_KEYS.THEME),
                model: localStorage.getItem(STORAGE_KEYS.MODEL),
                experienceStyle: this.getProfileSetting(STORAGE_KEYS.EXPERIENCE_STYLE, 'balanced'),
                responseDetail: this.getProfileSetting(STORAGE_KEYS.RESPONSE_DETAIL, null),
                thinkingMode: localStorage.getItem(STORAGE_KEYS.THINKING_MODE),
                prompt: localStorage.getItem(STORAGE_KEYS.PROMPT),
                promptOverrideEnabled: localStorage.getItem(STORAGE_KEYS.PROMPT_OVERRIDE_ENABLED) === 'true',
                locationEnabled: Boolean(this.getProfileSetting(STORAGE_KEYS.LOCATION_ENABLED, false)),
                locationContext: this.getProfileSetting(STORAGE_KEYS.LOCATION_CONTEXT, null)
            }
        };
    }

    async deleteAllLocalData() {
        await this.waitForPendingVectorWrites();
        this.advancePersonalContextEpoch();
        clearAnalysisCaches();
        this.profileManager.clearAllProfileData();
        Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
        this.pendingResponseMetadata.clear();
        this.pendingVectorWrites.clear();
        this.behaviorAnalysisVersions.clear();
        this.state = this.getInitialState();
        this.createNewChat();
        this.saveState();
    }

    getStoredResponsePreferencesForChat(chatId = this.state.activeChatId) {
        return sanitizeResponsePreferences(
            this.getContentStoreForChat(chatId).responsePreferences,
            DEFAULT_RESPONSE_PREFERENCES
        );
    }

    getResponsePreferencesForChat(chatId = this.state.activeChatId) {
        return sanitizeResponsePreferences(
            {
                ...window.AURA_INTELLIGENCE_BUNDLE.buildPreferenceOverrides(
                    this.state.intelligenceBundle
                ),
                ...this.getStoredResponsePreferencesForChat(chatId),
                ...this.getFeedbackPreferenceOverrides()
            },
            DEFAULT_RESPONSE_PREFERENCES
        );
    }

    getInferenceResponsePreferences(chatId = this.state.activeChatId) {
        const preferences = this.isPersonalIntelligenceActive()
            ? this.getResponsePreferencesForChat(chatId)
            : getStoredExperienceResponsePreferences();
        return sanitizeResponsePreferences(
            {
                ...preferences,
                ...getExplicitResponsePreferenceOverrides()
            },
            DEFAULT_RESPONSE_PREFERENCES
        );
    }

    getActiveResponsePreferences() {
        return this.getResponsePreferencesForChat();
    }

    updateResponsePreferences(nextPreferences, chatId = this.state.activeChatId) {
        const chat = this.getChat(chatId);
        if (!chat) return;
        chat.localContentStore = {
            ...this.getContentStoreForChat(chatId),
            responsePreferences: sanitizeResponsePreferences(
                nextPreferences,
                this.getStoredResponsePreferencesForChat(chatId)
            )
        };
        this.saveState();
    }

    async getConversationSummary(historyOverride = null, chatId = this.state.activeChatId) {
        if (!this.isPersonalIntelligenceActive()) return '';
        const sourceProfileId = this.getActiveProfileId();
        const sourceContextEpoch = this.getPersonalContextEpoch();
        const chat = this.getChat(chatId);
        if (!chat) return '';
        const history = Array.isArray(historyOverride) ? historyOverride : chat.history;
        if (history.length <= 10) return '';

        const olderHistory = history.slice(0, -8);
        const anchor = olderHistory.map((message) => `${message.role}:${message.timestamp || 0}`).join('|');
        if (chat.contextSummary && chat.contextSummaryAnchor === anchor) {
            return buildConversationSummaryContext(chat.contextSummary);
        }

        const historyStr = olderHistory
            .map((message) => `${message.role}: ${sanitizeContentForModelContext(message.content).slice(0, 500)}`)
            .join('\n');
        if (!historyStr.trim()) return '';

        const response = await _callLLM(
            PROMPTS.CONVERSATION_SUMMARIZER.replace('%HISTORY%', historyStr),
            { format: 'json', callType: 'analysis' }
        );
        if (
            sourceProfileId !== this.getActiveProfileId() ||
            sourceContextEpoch !== this.getPersonalContextEpoch() ||
            !this.isPersonalIntelligenceActive() ||
            !this.state.chats[chatId]
        ) return '';
        const parsed = safeParseJson(response, null);
        if (!parsed || typeof parsed !== 'object') return '';

        chat.contextSummary = {
            summary: typeof parsed.summary === 'string' ? parsed.summary.trim().slice(0, 1200) : '',
            activeTopics: Array.isArray(parsed.activeTopics) ? parsed.activeTopics.filter(Boolean).slice(0, 6) : [],
            openLoops: Array.isArray(parsed.openLoops) ? parsed.openLoops.filter(Boolean).slice(0, 6) : [],
            durableUserContext: Array.isArray(parsed.durableUserContext) ? parsed.durableUserContext.filter(Boolean).slice(0, 6) : []
        };
        chat.contextSummaryAnchor = anchor;
        this.saveState();
        return buildConversationSummaryContext(chat.contextSummary);
    }

    canUseProactiveTool(type, minCooldownMs = 90 * 1000, chatId = this.state.activeChatId) {
        return window.AURA_CHAT_TOOL_STATE.canUseProactiveTool(
            this.state.chats[chatId],
            type,
            { minCooldownMs, prefersFewerTools: this.prefersFewerToolOffers() }
        );
    }

    hasActiveToolType(type, chatId = this.state.activeChatId) {
        return window.AURA_CHAT_TOOL_STATE.hasActiveToolType(this.state.chats[chatId], type);
    }

    wasToolRecentlyDeclined(type, windowMs = 30 * 60 * 1000, chatId = this.state.activeChatId) {
        return window.AURA_CHAT_TOOL_STATE.wasToolRecentlyDeclined(
            this.state.chats[chatId],
            type,
            { windowMs }
        );
    }

    markProactiveToolUsed(type, chatId = this.state.activeChatId) {
        const chat = this.state.chats[chatId];
        if (!window.AURA_CHAT_TOOL_STATE.markProactiveToolUsed(chat, type)) return;
        this.saveState();
    }

    addOrUpdateToolInActiveChat(toolName, toolData) {
        return this.addOrUpdateToolInChat(this.state.activeChatId, toolName, toolData);
    }

    addOrUpdateToolInChat(chatId, toolName, toolData) {
        const chat = this.state.chats[chatId];
        if (!window.AURA_CHAT_TOOL_STATE.addTool(chat, toolName, toolData)) return;
        this.saveState();
    }

    transitionToolOffer(chatId, messageIndex, action, createdToolId = null) {
        const nextOffer = window.AURA_CHAT_TOOL_STATE.transitionOffer(
            this.state.chats[chatId],
            messageIndex,
            action,
            window.AURA_TOOL_ARTIFACTS.transitionToolOffer,
            Date.now(),
            createdToolId
        );
        if (!nextOffer) return null;
        this.saveState();
        return nextOffer;
    }

    logMoodToTracker(mood) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!window.AURA_CHAT_TOOL_STATE.logMood(chat, mood)) return;
        this.saveState();
    }

    completeAndRemoveChecklistItem(toolId, itemIndex, toolType = 'checklist', itemKey = 'items') {
        const completedLabel = window.AURA_CHAT_TOOL_STATE.completeChecklistItem(
            this.state.chats[this.state.activeChatId],
            toolId,
            itemIndex,
            toolType,
            itemKey
        );
        if (!completedLabel) return null;
        this.saveState();
        return completedLabel;
    }

    updateThoughtRecord(toolId, data) {
        if (!window.AURA_CHAT_TOOL_STATE.updateThoughtRecord(
            this.state.chats[this.state.activeChatId],
            toolId,
            data
        )) return;
        this.saveState();
    }

    getChatTools(chatId = this.state.activeChatId) {
        return window.AURA_CHAT_TOOL_STATE.getTools(this.state.chats[chatId]);
    }

    getActiveChatTools() {
        return this.getChatTools();
    }

    getChatHistory(chatId = this.state.activeChatId) {
        return this.state.chats[chatId]?.history || [];
    }

    getActiveChatHistory() {
        return this.getChatHistory();
    }

    getActiveChatId() {
        return this.state.activeChatId;
    }

    async preScreenMessage(message, chatId = this.state.activeChatId) {
        if (!this.state.chats[chatId]?.isHeightenedAwareness) return 'OK';
        const response = await _callLLM(
            PROMPTS.CRISIS_DETECTION.replace('%MESSAGE%', message),
            { callType: 'analysis' }
        );
        return response?.includes('CRISIS') ? 'CRISIS' : 'OK';
    }

    async triggerSafetyIntervention(message, chatId = this.state.activeChatId) {
        this.addOrUpdateToolInChat(
            chatId,
            'breathing_exercise',
            await createToolByType('breathing_exercise')
        );

        const activeModel = getConfiguredRoutingModels().gptModel;
        this.setPendingResponseMetadata(chatId, {
            routeSnapshot: {
                modelName: activeModel,
                modelFamily: window.AURA_MODEL_ROUTING.getModelFamily(activeModel),
                reviewerModel: '',
                route: 'CrisisAgent',
                task: 'safety_support',
                domain: 'medical',
                risk: 'high',
                thinkingMode: 'balanced',
                source: 'safety'
            }
        });
        const responseSystemPrompt = buildResponseSystemPrompt(
            getEffectiveSystemPrompt(),
            activeModel
        );
        const prompt = `${responseSystemPrompt}
        ${PROMPTS.CRISIS_SUPPORT_REPLY.replace('%MESSAGE%', message)}`;
        const rawReply = await _callLLM(prompt, {
            modelName: activeModel,
            callType: 'default',
            thinkingMode: 'balanced'
        });
        const recommendations = inferHighRiskSafetyRecommendations(message);
        const finalized = normalizeReplyWhitespace(
            stripToolTags(await finalizeAssistantReply(rawReply, message))
        ) ||
            "I hear you. Let's do a short breathing reset now. If you want, I can also look up nearby crisis resources.";
        return attachHighRiskSafetyRecommendations(finalized, recommendations);
    }

    checkForWithdrawalPattern(chatId = this.state.activeChatId) {
        const chat = this.state.chats[chatId];
        if (!chat?.lastUserMessageTimestamp) return false;

        return window.AURA_TURN_POLICY.resolveReEngagement({
            lastUserMessageAt: chat.lastUserMessageTimestamp,
            lastReengagementAt: chat.lastReengagementAt
        }) || false;
    }

    async triggerReEngagement(pattern, chatId = this.state.activeChatId) {
        const prompt = PROMPTS.RE_ENGAGEMENT
            .replace('%DAYS%', pattern.days)
            .replace('%REASON%', pattern.reason);

        const activeModel = getBackgroundModelName();
        this.setPendingResponseMetadata(chatId, {
            routeSnapshot: {
                modelName: activeModel,
                modelFamily: window.AURA_MODEL_ROUTING.getModelFamily(activeModel),
                route: 'GeneralFriendAgent',
                task: 'reengagement',
                domain: 'general',
                risk: 'low',
                thinkingMode: getThinkingModeKey(),
                source: 'background'
            }
        });
        const rawReply = await _callLLM(prompt, {
            modelName: activeModel,
            callType: 'default'
        });
        const cleaned = normalizeReplyWhitespace(
            stripToolTags(await finalizeAssistantReply(rawReply, ''))
        );
        const chat = this.state.chats[chatId];
        if (chat) {
            chat.lastReengagementAt = Date.now();
            this.saveState();
        }
        return cleaned;
    }
}

window.AURA_CHAT_READY = (window.AURA_HOSTED_READY || Promise.resolve()).then(() => {
    window.chatManager = new ChatManager();
    return window.chatManager;
});

async function createToolByType(type, theme = '') {
    const safeTheme = sanitizeToolTheme(theme, 'Quick support');
    const templates = {
        mood_tracker: `{ "type": "mood_tracker", "id": "m-${Date.now()}", "title": "Mood Tracker", "options": ["Happy", "Okay", "Neutral", "Sad", "Angry"] }`,
        checklist: `{ "type": "checklist", "id": "c-${Date.now()}", "title": "${safeTheme || 'Tasks'}", "items": [{"text": "First step", "done": false}] }`,
        thought_record: `{ "type": "thought_record", "id": "tr-${Date.now()}", "title": "Thought Record", "situation": "${safeTheme}" }`,
        affirmation_card: `{ "type": "affirmation_card", "id": "a-${Date.now()}", "title": "Affirmation", "text": ["You got this."] }`,
        breathing_exercise: `{ "type": "breathing_exercise", "id": "b-${Date.now()}", "title": "Breathe", "cycle": {"inhale":4, "hold":4, "exhale":6} }`,
        safety_plan: `{ "type": "safety_plan", "id": "sp-${Date.now()}", "title": "Personal Safety Plan", "warningSigns": ["When I stop sleeping", "When thoughts spiral"], "groundingSteps": ["Drink water", "5-minute breathing reset"], "peopleToContact": [{"name":"Trusted person","contact":"Add contact"}], "saferEnvironment": ["Move away from triggering objects", "Stay in a brighter shared space"], "professionalSupport": ["Therapist or clinician", "Local crisis support"], "reasonsToStay": ["One person I care about", "One future event I want to reach"] }`,
        medication_checklist: `{ "type": "medication_checklist", "id": "mc-${Date.now()}", "title": "Medication Safety Checklist", "medicationName": "${safeTheme || 'Medication'}", "checks": [{"text":"Confirm label instructions", "done": false}, {"text":"Do not double-dose unless instructed", "done": false}, {"text":"Check interaction warnings", "done": false}], "notes": "Use this as organization support, then confirm medical decisions with a clinician or pharmacist." }`,
        appointment_prep: `{ "type": "appointment_prep", "id": "ap-${Date.now()}", "title": "Appointment Prep", "summary": "${safeTheme || 'What I need help with'}", "symptomTimeline": ["When it started", "What changed"], "questions": ["What is most likely happening?", "What red flags should prompt urgent care?", "What should I monitor at home?"], "medsToMention": ["Current medications", "Recent dose changes"] }`,
        follow_up_plan: `{ "type": "follow_up_plan", "id": "fu-${Date.now()}", "title": "Follow-up Plan", "checkpoints": [{"when":"Today", "action":"Take one small step", "done": false}, {"when":"Tomorrow", "action":"Quick check-in on progress", "done": false}] }`
    };

    if (!templates[type]) return null;

    const prompt = `Output ONLY this exact JSON object structure, filling in realistic data for the theme "${safeTheme}": ${templates[type]}`;
    const response = await _callLLM(prompt, { format: 'json', callType: 'analysis' });
    const parsed = safeParseJson(response, null);
    const fallback = safeParseJson(templates[type], null);

    return parsed && typeof parsed === 'object' ? parsed : fallback;
}

async function buildSearchPlan(userMessage, profileStr, runtimeContext) {
    const crisisLookupPolicy = didUserRequestLocalCrisisResources(userMessage)
        ? 'Allowed: the user explicitly asked for crisis resources. If relevant, use a local crisis resource query.'
        : 'Not allowed: do not switch to crisis-hotline/resource lookup unless the user explicitly asks.';
    const cacheKey = buildSessionCacheKey([
        'searchPlan',
        userMessage,
        crisisLookupPolicy,
        profileStr.slice(0, 1000)
    ]);
    const cached = getSessionCacheEntry(analysisCaches.searchPlan, cacheKey);
    if (cached) return cached;

    const response = await _callLLM(
        PROMPTS.SEARCH_PLAN
            .replace('%PROFILE%', profileStr)
            .replace('%RUNTIME%', runtimeContext)
            .replace('%CRISIS_LOOKUP_POLICY%', crisisLookupPolicy)
            .replace('%MESSAGE%', userMessage),
        { format: 'json', callType: 'analysis' }
    );

    const sanitizedPlan = refineSearchPlanForMedicalQuestion(
        sanitizeSearchPlan(safeParseJson(response, null), userMessage),
        userMessage
    );

    return setSessionCacheEntry(
        analysisCaches.searchPlan,
        cacheKey,
        sanitizedPlan
    );
}

const {
    buildEvidenceCatalog,
    normalizeComparisonText,
    buildHumanFallbackAnswer,
    buildDeterministicSearchFallback,
    buildMinimumEvidenceAnswer
} = window.AURA_EVIDENCE_UTILS;


function removeImmediateAssistantEcho(reply, chatId = chatManager.getActiveChatId()) {
    const artifacts = splitReplyArtifacts(reply);
    const body = normalizeReplyWhitespace(artifacts.body);
    if (!body || typeof window === 'undefined' || !window.chatManager) return reply;

    const latestAi = getLatestMessageByRole(window.chatManager.getChatHistory(chatId), 'ai');
    const previousBody = sanitizeContentForModelContext(latestAi?.content || '');
    if (!previousBody) return reply;

    const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
    if (paragraphs.length < 2) return reply;

    const firstParagraph = paragraphs[0];
    const normalizedFirst = normalizeComparisonText(firstParagraph);
    const normalizedPrevious = normalizeComparisonText(previousBody);
    if (!normalizedFirst || normalizedFirst.length < 40 || !normalizedPrevious.includes(normalizedFirst)) {
        return reply;
    }

    return reassembleReplyArtifacts({
        body: paragraphs.slice(1).join('\n\n'),
        toolTags: artifacts.toolTags,
        sourceLines: artifacts.sourceLines
    });
}

async function finalizeReplyWithProactiveTool(
    rawReply,
    userMessage,
    recommendation = null,
    route = 'GeneralFriendAgent',
    preferences = DEFAULT_RESPONSE_PREFERENCES,
    turnSupport = null,
    chatId = chatManager.getActiveChatId()
) {
    const cleanReply = removeImmediateAssistantEcho(
        await finalizeAssistantReply(rawReply, userMessage),
        chatId
    );
    if (!cleanReply) return null;
    if (!recommendation) return normalizeReplyWhitespace(stripToolTags(cleanReply));

    const augmented = attachProactiveToolTag(cleanReply, recommendation);
    if (containsToolTag(augmented)) {
        chatManager.markProactiveToolUsed(recommendation.type, chatId);
    }

    return augmented;
}

async function finalizeAgenticReply(
    rawReply,
    userMessage,
    proactiveRecommendation = null,
    highRiskRecommendations = [],
    route = 'GeneralFriendAgent',
    preferences = DEFAULT_RESPONSE_PREFERENCES,
    turnSupport = null,
    chatId = chatManager.getActiveChatId()
) {
    const cleanReply = await finalizeReplyWithProactiveTool(
        rawReply,
        userMessage,
        proactiveRecommendation,
        route,
        preferences,
        turnSupport,
        chatId
    );
    if (!cleanReply) return null;
    return attachHighRiskSafetyRecommendations(cleanReply, highRiskRecommendations);
}

function buildAgentWorkflowLine(stages = []) {
    const names = stages
        .map((stage) => stage?.name)
        .filter(Boolean);
    if (!names.length) return 'Silent workflow: direct response composition.';
    return `Silent workflow: ${names.join(' -> ')}. Use these handoffs internally; never mention them to the user.`;
}

function runReceptionAgent(userMessage, chatHistory) {
    const baseRoute = deriveHeuristicRoute(userMessage);
    const turnPolicy = window.AURA_TURN_POLICY.resolveTurnPolicy({
        message: userMessage,
        route: baseRoute,
        history: chatHistory
    });
    const turnSupport = deriveHeuristicTurnSupport(
        userMessage,
        baseRoute,
        chatHistory,
        turnPolicy
    );
    const contextualUserMessage = buildContextualUserMessage(userMessage, chatHistory, turnSupport);
    const route = deriveHeuristicRoute(contextualUserMessage);

    return {
        name: 'ReceptionAgent',
        baseRoute,
        turnPolicy,
        turnSupport,
        contextualUserMessage,
        route
    };
}

function runPreferenceAgent(contextualUserMessage, chatId = chatManager.getActiveChatId()) {
    const adaptivePreferences = deriveHeuristicResponsePreferences(
        contextualUserMessage,
        chatManager.getInferenceResponsePreferences(chatId)
    );
    if (chatManager.isPersonalIntelligenceActive()) {
        const learnedPreferences = deriveHeuristicResponsePreferences(
            contextualUserMessage,
            chatManager.getStoredResponsePreferencesForChat(chatId)
        );
        chatManager.updateResponsePreferences(learnedPreferences, chatId);
    }

    return {
        name: 'PreferenceAgent',
        adaptivePreferences
    };
}

function runEvidenceDecisionAgent(contextualUserMessage, route) {
    const sourceNeedDecision = sanitizeSourceNeedDecision(
        deriveHeuristicSourceNeed(contextualUserMessage, route),
        { needsSources: false, confidence: 0, reason: '' }
    );
    const effectiveRoute = shouldUseSearchEvidence(route, sourceNeedDecision) ? 'SearchAgent' : route;

    return {
        name: 'EvidenceDecisionAgent',
        sourceNeedDecision,
        effectiveRoute
    };
}

function runSafetyAgent(userMessage) {
    return {
        name: 'SafetyAgent',
        highRiskRecommendations: inferHighRiskSafetyRecommendations(userMessage)
    };
}

function runModelRoutingAgent({
    userMessage,
    effectiveRoute,
    sourceNeedDecision,
    documentText,
    highRiskRecommendations
}) {
    const { gptModel, medModel } = getConfiguredRoutingModels();
    const modelDecision = window.AURA_MODEL_ROUTING.resolveModelRoute({
        preference: getModelPreference(),
        availableModels: getAvailableModelNames(),
        gptModel,
        medModel,
        message: userMessage,
        effectiveRoute,
        sourceNeedDecision,
        documentText,
        highRiskRecommendations
    });

    return {
        name: 'ModelRoutingAgent',
        modelDecision
    };
}

async function runToolUseAgent(
    userMessage,
    effectiveRoute,
    adaptivePreferences,
    chatHistory,
    baseTurnPolicy,
    chatId = chatManager.getActiveChatId()
) {
    const candidate = await inferProactiveToolOpportunity(
        userMessage,
        effectiveRoute,
        adaptivePreferences,
        chatId
    );
    const explicitToolRequest = isExplicitToolCreationRequest(userMessage);
    const immediateSupportNeed = Boolean(
        candidate?.type === 'breathing_exercise' &&
        window.AURA_TURN_POLICY.hasImmediateGroundingNeed(userMessage)
    );
    const turnPolicy = candidate
        ? window.AURA_TURN_POLICY.resolveTurnPolicy({
            message: userMessage,
            route: effectiveRoute,
            history: chatHistory,
            toolCandidate: candidate,
            explicitToolRequest,
            immediateSupportNeed,
            hasActiveTool: chatManager.hasActiveToolType(candidate.type, chatId),
            recentlyDeclinedTool: chatManager.wasToolRecentlyDeclined(
                candidate.type,
                30 * 60 * 1000,
                chatId
            )
        })
        : baseTurnPolicy;
    const proactiveRecommendation = candidate && turnPolicy?.tool?.mode !== 'none'
        ? { ...candidate, delivery: turnPolicy.tool.mode }
        : null;

    return {
        name: 'ToolUseAgent',
        turnPolicy,
        proactiveRecommendation,
        proactiveToolGuidance: buildProactiveToolGuidance(proactiveRecommendation)
    };
}

async function runMemoryAgent({
    profileStr,
    conversationSummary,
    chatHistory,
    contextualUserMessage,
    userMessage,
    modelHistoryStr,
    turnSupport,
    turnPolicy,
    chatId = chatManager.getActiveChatId()
}) {
    const effectiveUserMessage = contextualUserMessage || userMessage;
    const usePriorTurn = Boolean(turnPolicy?.continuity?.usePriorTurn);

    return {
        name: 'MemoryAgent',
        vectorContext: await chatManager.searchRelevantVectorData(
            userMessage,
            turnPolicy,
            chatId
        ),
        historyStr: usePriorTurn
            ? modelHistoryStr
            : 'Recent chat omitted because this turn begins a new topic.',
        memoryContext: buildAuraMemoryContext(
            profileStr,
            usePriorTurn ? conversationSummary : ''
        ),
        continuityContext: buildContinuityContext(chatHistory, effectiveUserMessage, turnSupport)
    };
}

async function runResponseExampleAgent({
    contextualUserMessage,
    userMessage,
    modelDecision,
    documentText,
    turnPolicy,
    proactiveRecommendation,
    highRiskRecommendations
}) {
    return {
        name: 'ResponseExampleAgent',
        exampleContext: await searchResponseExamples({
            message: contextualUserMessage || userMessage,
            modelDecision,
            documentText,
            turnPolicy,
            proactiveRecommendation,
            highRisk: Array.isArray(highRiskRecommendations) && highRiskRecommendations.length > 0
        })
    };
}

function runTurnProfileAgent({
    effectiveRoute,
    sourceNeedDecision,
    adaptivePreferences,
    turnSupport,
    turnPolicy,
    documentText,
    workflowStages
}) {
    const turnProfile = [
        buildAuraTurnProfile({
            route: effectiveRoute,
            sourceDecision: sourceNeedDecision,
            preferences: adaptivePreferences,
            turnSupport,
            turnPolicy,
            documentText
        }),
        buildAgentWorkflowLine(workflowStages)
    ].filter(Boolean).join('\n');

    return {
        name: 'TurnProfileAgent',
        turnProfile
    };
}

async function buildAuraAgentContext(
    userMessage,
    documentText = null,
    chatId = chatManager.getActiveChatId()
) {
    const runtimeContext = getRuntimeContextString();
    const storedChatHistory = chatManager.getChatHistory(chatId);
    const chatHistory = window.AURA_TURN_POLICY.excludeCurrentTurn(
        storedChatHistory,
        userMessage,
        { forceTrailingUser: true }
    );
    const conversationSummary = await chatManager.getConversationSummary(chatHistory, chatId);
    const modelHistoryStr = buildModelSafeHistoryString(chatHistory);
    const workflowStages = [];

    const reception = runReceptionAgent(userMessage, chatHistory);
    workflowStages.push(reception);
    const profileStr = JSON.stringify(
        window.AURA_TURN_POLICY.buildRelevantProfileBundle({
            query: userMessage,
            activeProfile: chatManager.getInferenceContentStore(chatId),
            durableProfile: chatManager.getUserMemoryStore(),
            includeDurable: isUserMemoryEnabled()
        }),
        null,
        2
    );

    const preference = runPreferenceAgent(reception.contextualUserMessage, chatId);
    workflowStages.push(preference);

    const evidence = runEvidenceDecisionAgent(reception.contextualUserMessage, reception.route);
    workflowStages.push(evidence);

    const safety = runSafetyAgent(userMessage);
    workflowStages.push(safety);

    const modelRouting = runModelRoutingAgent({
        userMessage: reception.contextualUserMessage,
        effectiveRoute: evidence.effectiveRoute,
        sourceNeedDecision: evidence.sourceNeedDecision,
        documentText,
        highRiskRecommendations: safety.highRiskRecommendations
    });
    workflowStages.push(modelRouting);

    const activeModel = modelRouting.modelDecision.primaryModel;
    const responseSystemPrompt = buildResponseSystemPrompt(
        getEffectiveSystemPrompt(),
        modelRouting.modelDecision.primaryModel
    );

    const toolUse = await runToolUseAgent(
        userMessage,
        evidence.effectiveRoute,
        preference.adaptivePreferences,
        chatHistory,
        reception.turnPolicy,
        chatId
    );
    workflowStages.push(toolUse);
    const effectiveTurnPolicy = toolUse.turnPolicy || reception.turnPolicy;

    const [memory, responseExamples] = await Promise.all([
        runMemoryAgent({
            profileStr,
            conversationSummary,
            chatHistory,
            contextualUserMessage: reception.contextualUserMessage,
            userMessage,
            modelHistoryStr,
            turnSupport: reception.turnSupport,
            turnPolicy: effectiveTurnPolicy,
            chatId
        }),
        runResponseExampleAgent({
            contextualUserMessage: reception.contextualUserMessage,
            userMessage,
            modelDecision: modelRouting.modelDecision,
            documentText,
            turnPolicy: effectiveTurnPolicy,
            proactiveRecommendation: toolUse.proactiveRecommendation,
            highRiskRecommendations: safety.highRiskRecommendations
        })
    ]);
    workflowStages.push(memory);
    workflowStages.push(responseExamples);

    const profile = runTurnProfileAgent({
        effectiveRoute: evidence.effectiveRoute,
        sourceNeedDecision: evidence.sourceNeedDecision,
        adaptivePreferences: preference.adaptivePreferences,
        turnSupport: reception.turnSupport,
        turnPolicy: effectiveTurnPolicy,
        documentText,
        workflowStages
    });
    workflowStages.push(profile);

    const context = {
        chatId,
        activeModel,
        modelDecision: modelRouting.modelDecision,
        responseSystemPrompt,
        profileStr,
        runtimeContext,
        chatHistory,
        conversationSummary,
        modelHistoryStr,
        baseRoute: reception.baseRoute,
        turnPolicy: effectiveTurnPolicy,
        turnSupport: reception.turnSupport,
        contextualUserMessage: reception.contextualUserMessage,
        route: reception.route,
        adaptivePreferences: preference.adaptivePreferences,
        sourceNeedDecision: evidence.sourceNeedDecision,
        effectiveRoute: evidence.effectiveRoute,
        highRiskRecommendations: safety.highRiskRecommendations,
        proactiveRecommendation: toolUse.proactiveRecommendation,
        proactiveToolGuidance: toolUse.proactiveToolGuidance,
        vectorContext: memory.vectorContext,
        exampleContext: responseExamples.exampleContext,
        historyStr: memory.historyStr,
        memoryContext: memory.memoryContext,
        continuityContext: memory.continuityContext,
        turnProfile: profile.turnProfile,
        documentText,
        workflowStages
    };
    chatManager.setPendingResponseMetadata(chatId, {
        routeSnapshot: buildInferenceRouteSnapshot(
            modelRouting.modelDecision,
            evidence.effectiveRoute
        )
    });
    return context;
}

async function callPrimaryWithFallback(prompt, context, overrides = {}) {
    const primaryReply = await _callLLM(prompt, {
        modelName: context.activeModel,
        routeDecision: context.modelDecision,
        ...overrides
    });
    if (primaryReply) return primaryReply;

    const fallbackModel = getConfiguredRoutingModels().gptModel;
    if (fallbackModel === context.activeModel) return null;

    return _callLLM(prompt, {
        modelName: fallbackModel,
        routeDecision: { ...context.modelDecision, reviewerModel: null },
        ...overrides
    });
}

async function reviewMedicalReplyIfNeeded({ context, prompt, draft }) {
    const primaryPolicy = window.AURA_MODEL_ROUTING.resolveInferencePolicy({
        modelName: context.activeModel,
        requestedMode: getThinkingModeKey(),
        callType: 'default',
        routeDecision: context.modelDecision
    });
    const useMedGemmaSelfReview =
        window.AURA_MODEL_ROUTING.getModelFamily(context.activeModel) === 'medgemma' &&
        context.modelDecision?.classification?.domain === 'medical' &&
        primaryPolicy.passes === 2;
    const reviewerModel = context.modelDecision?.reviewerModel ||
        (useMedGemmaSelfReview ? context.activeModel : null);
    if (!draft || !reviewerModel) return draft;

    const reviewRaw = await _callLLM(
        PROMPTS.MEDICAL_RESPONSE_REVIEW
            .replace('%MESSAGE%', context.originalUserMessage || context.contextualUserMessage)
            .replace('%DRAFT%', draft),
        {
            modelName: reviewerModel,
            format: 'json',
            callType: 'analysis',
            thinkingMode: 'fast',
            routeDecision: context.modelDecision
        }
    );
    const review = safeParseJson(reviewRaw, null);
    if (!review?.requiresRevision || !review.revisionGuidance) return draft;

    const revised = await _callLLM(
        `${prompt}\n\n[Medical reviewer feedback]\n${String(review.revisionGuidance).slice(0, 1600)}\nRevise the draft to address only material safety or correctness issues. Return only the corrected user-facing answer.\n\n[Draft]\n${draft}`,
        {
            modelName: context.activeModel,
            callType: 'default',
            thinkingMode: 'deep',
            routeDecision: context.modelDecision
        }
    );

    return revised || draft;
}

async function runKnowledgeComposerAgent(context) {
    if (!context.effectiveRoute.includes('Knowledge')) return null;

    const key = await _callLLM(
        PROMPTS.KNOWLEDGE_MAPPER.replace('%MESSAGE%', context.contextualUserMessage),
        { callType: 'analysis' }
    );

    if (key && key !== 'NULL') {
        const content = await fetchMarkdownContent(key.toLowerCase());
        if (content) {
            const prompt = buildAuraDirectPrompt({
                systemPrompt: context.responseSystemPrompt,
                turnProfile: context.turnProfile,
                runtimeContext: context.runtimeContext,
                memoryContext: `${context.memoryContext}\n\nKnowledge base material:\n${content}`,
                continuityContext: context.continuityContext,
                history: context.historyStr,
                vectorContext: context.vectorContext,
                exampleContext: context.exampleContext,
                toolGuidance: context.proactiveToolGuidance,
                userMessage: context.contextualUserMessage,
                documentText: context.documentText
            });
            const draft = await callPrimaryWithFallback(prompt, context);
            const reviewedDraft = await reviewMedicalReplyIfNeeded({ context, prompt, draft });
            return (
                (await finalizeAgenticReply(
                    reviewedDraft,
                    context.originalUserMessage || context.contextualUserMessage,
                    context.proactiveRecommendation,
                    context.highRiskRecommendations,
                    context.effectiveRoute,
                    context.adaptivePreferences,
                    context.turnSupport,
                    context.chatId
                )) || attachHighRiskSafetyRecommendations(
                    buildHumanFallbackAnswer(context.contextualUserMessage, context.effectiveRoute),
                    context.highRiskRecommendations
                )
            );
        }
    }

    return null;
}

async function runEvidenceComposerAgent(context) {
    if (!context.effectiveRoute.includes('Search')) return null;

    try {
        const searchPlan = await buildSearchPlan(
            context.contextualUserMessage,
            context.profileStr,
            context.runtimeContext
        );
        const osintReport = await postJson(API_ENDPOINTS.osint, searchPlan);
        const evidenceCatalog = buildEvidenceCatalog(osintReport);
        const evidencePrompt = evidenceCatalog.length
            ? buildAuraEvidencePrompt({
                systemPrompt: context.responseSystemPrompt,
                turnProfile: context.turnProfile,
                runtimeContext: context.runtimeContext,
                memoryContext: context.memoryContext,
                continuityContext: context.continuityContext,
                history: context.historyStr,
                vectorContext: context.vectorContext,
                exampleContext: context.exampleContext,
                evidenceCatalog,
                userMessage: context.contextualUserMessage
            })
            : null;
        const draft = evidencePrompt
            ? await callPrimaryWithFallback(evidencePrompt, context)
            : null;
        const reviewedDraft = evidencePrompt
            ? await reviewMedicalReplyIfNeeded({ context, prompt: evidencePrompt, draft })
            : null;
        const renderedReplyBody = reviewedDraft ||
            buildDeterministicSearchFallback(
                context.contextualUserMessage,
                evidenceCatalog,
                context.adaptivePreferences
            );
        const safeRenderedBody = normalizeReplyWhitespace(renderedReplyBody) ||
            buildMinimumEvidenceAnswer(context.contextualUserMessage, evidenceCatalog);
        const sourcesLine = buildSourcesLineFromEvidenceIds(
            evidenceCatalog.filter((entry) => entry.url).slice(0, 5).map((entry) => entry.id),
            evidenceCatalog
        );
        const renderedReply = normalizeReplyWhitespace(
            [safeRenderedBody, sourcesLine].filter(Boolean).join('\n\n')
        );

        return (
            (await finalizeAgenticReply(
                renderedReply,
                context.originalUserMessage || context.contextualUserMessage,
                context.proactiveRecommendation,
                context.highRiskRecommendations,
                context.effectiveRoute,
                context.adaptivePreferences,
                context.turnSupport,
                context.chatId
            )) ||
            attachHighRiskSafetyRecommendations(
                buildHumanFallbackAnswer(context.contextualUserMessage, context.effectiveRoute),
                context.highRiskRecommendations
            )
        );
    } catch (error) {
        if (error.code === 'SEARCH_CONSENT_REQUIRED') throw error;
        responseRuntime.throwIfAborted();
        console.error('[SearchAgent] Full failure details:', error);
        return attachHighRiskSafetyRecommendations(
            buildHumanFallbackAnswer(context.contextualUserMessage, context.effectiveRoute),
            context.highRiskRecommendations
        );
    }
}

async function runDirectComposerAgent(context) {
    const finalPrompt = buildAuraDirectPrompt({
        systemPrompt: context.responseSystemPrompt,
        turnProfile: context.turnProfile,
        runtimeContext: context.runtimeContext,
        memoryContext: context.memoryContext,
        continuityContext: context.continuityContext,
        history: context.historyStr,
        vectorContext: context.vectorContext,
        exampleContext: context.exampleContext,
        toolGuidance: context.proactiveToolGuidance,
        userMessage: context.contextualUserMessage || context.originalUserMessage,
        documentText: context.documentText
    });
    const draft = await callPrimaryWithFallback(finalPrompt, context);
    const reviewedDraft = await reviewMedicalReplyIfNeeded({
        context,
        prompt: finalPrompt,
        draft
    });

    return (await finalizeAgenticReply(
        reviewedDraft,
        context.originalUserMessage || context.contextualUserMessage,
        context.proactiveRecommendation,
        context.highRiskRecommendations,
        context.effectiveRoute,
        context.adaptivePreferences,
        context.turnSupport,
        context.chatId
    )) || attachHighRiskSafetyRecommendations(
        buildHumanFallbackAnswer(context.contextualUserMessage || context.originalUserMessage, context.effectiveRoute),
        context.highRiskRecommendations
    );
}

async function runToolFollowUpAgent(
    toolFollowUp,
    chatId = chatManager.getActiveChatId()
) {
    const activeModel = getBackgroundModelName();
    chatManager.setPendingResponseMetadata(chatId, {
        routeSnapshot: {
            modelName: activeModel,
            modelFamily: window.AURA_MODEL_ROUTING.getModelFamily(activeModel),
            route: 'GeneralFriendAgent',
            task: 'tool_follow_up',
            domain: 'general',
            risk: 'low',
            thinkingMode: getThinkingModeKey(),
            source: 'tool_follow_up'
        }
    });
    const responseSystemPrompt = buildResponseSystemPrompt(getEffectiveSystemPrompt(), activeModel);
    const profileStr = JSON.stringify(chatManager.getInferenceContentStore(chatId), null, 2);
    const runtimeContext = getRuntimeContextString();
    const chatHistory = chatManager.getChatHistory(chatId);
    const conversationSummary = await chatManager.getConversationSummary(null, chatId);
    const modelHistoryStr = buildModelSafeHistoryString(chatHistory);
    const turnSupport = deriveHeuristicTurnSupport('', 'GeneralFriendAgent', chatHistory);
    const toolPreferences = chatManager.getInferenceResponsePreferences(chatId);
    const turnProfile = [
        buildAuraTurnProfile({
            route: 'GeneralFriendAgent',
            sourceDecision: { needsSources: false, confidence: 0.9, reason: 'Tool follow-up.' },
            preferences: toolPreferences,
            turnSupport
        }),
        buildAgentWorkflowLine([
            { name: 'ToolEventAgent' },
            { name: 'MemoryAgent' },
            { name: 'FollowThroughComposerAgent' }
        ])
    ].join('\n');

    const prompt = buildAuraDirectPrompt({
        systemPrompt: responseSystemPrompt,
        turnProfile,
        runtimeContext,
        memoryContext: buildAuraMemoryContext(profileStr, conversationSummary),
        continuityContext: buildContinuityContext(chatHistory, 'Respond to the tool interaction and help the user continue.', turnSupport),
        history: modelHistoryStr,
        vectorContext: '',
        toolGuidance: `The user interacted with an Aura tool: ${JSON.stringify(toolFollowUp)}. Respond naturally to that interaction.`,
        userMessage: 'Respond to the tool interaction and help the user continue.',
        documentText: null
    });

    const rawReply = await _callLLM(prompt, {
        modelName: activeModel,
        callType: 'default'
    });
    return (await finalizeReplyWithProactiveTool(
        rawReply,
        '',
        null,
        'GeneralFriendAgent',
        toolPreferences,
        turnSupport,
        chatId
    )) ||
        "Nice progress. If you want, we can build on this and handle the next step together.";
}

async function runAuraAgentPipeline(
    userMessage,
    documentText = null,
    chatId = chatManager.getActiveChatId()
) {
    const context = await buildAuraAgentContext(userMessage, documentText, chatId);
    responseRuntime.throwIfAborted();
    context.originalUserMessage = userMessage;

    const knowledgeReply = await runKnowledgeComposerAgent(context);
    if (knowledgeReply) return knowledgeReply;

    const evidenceReply = await runEvidenceComposerAgent(context);
    if (evidenceReply) return evidenceReply;

    return runDirectComposerAgent(context);
}

async function getOllamaResponse(
    userMessage,
    toolFollowUp = null,
    documentText = null,
    chatId = chatManager.getActiveChatId()
) {
    if (toolFollowUp) return runToolFollowUpAgent(toolFollowUp, chatId);
    return runAuraAgentPipeline(userMessage, documentText, chatId);
}
