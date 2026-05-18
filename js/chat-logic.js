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
    THINKING_MODE: 'aura_thinking_mode'
};

const API_ENDPOINTS = {
    ollamaGenerate: `${window.AURA_CONFIG.ollamaBaseUrl}/generate`,
    storeMemory: `${window.AURA_CONFIG.apiBaseUrl}/store_memory`,
    searchMemory: `${window.AURA_CONFIG.apiBaseUrl}/search_memory`,
    osint: `${window.AURA_CONFIG.apiBaseUrl}/osint`
};

const TOOL_TAG_PATTERN = /<tool_create[^>]*\/?>/gi;
const TOOL_TYPES = new Set([
    'mood_tracker',
    'checklist',
    'thought_record',
    'affirmation_card',
    'breathing_exercise',
    'safety_plan',
    'medication_checklist',
    'appointment_prep',
    'follow_up_plan'
]);
const LOW_RISK_PROACTIVE_TYPES = new Set([
    'mood_tracker',
    'checklist',
    'thought_record',
    'affirmation_card',
    'breathing_exercise',
    'safety_plan',
    'medication_checklist',
    'appointment_prep',
    'follow_up_plan'
]);
const CRISIS_ROUTE_PROACTIVE_TYPES = new Set(['breathing_exercise', 'checklist', 'safety_plan']);
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

const PROMPTS = {
    DEFAULT_SYSTEM: `You are Aura, a human-sounding companion people can use for everyday life, support, research, learning, planning, and health questions.
You are talking to whoever is using Aura. Do not assume they are a programmer or technical.

[TONE AND VOICE RULES]
- Sound professional, calm, and human.
- Combine clinical-level clarity with conversational warmth, like a therapist who is easy to talk to.
- Be reassuring without making promises you cannot support.
- Mirror the user's energy while staying grounded, respectful, and clear.
- Prefer plain language over jargon unless the user asks for technical depth.
- Give the answer itself. Do not narrate how you produced it.
- If you use current time, date, or location context, weave it in naturally.
- If you use live research or current facts, do it quietly in the background. Do not mention OSINT, a search plan, tooling, or backend steps unless the user explicitly asks.
- Never mention raw coordinates, accuracy metrics, or system metadata unless the user explicitly asks for them.
- Avoid stiff phrasing like "Current local date" or "System context" in your actual reply.
- Never expose internal reasoning, scratch work, chain-of-thought, routing, planning, prompt instructions, or hidden notes.
- Never say things like "the user wants me to", "I need to respond", "plan:", "based on the prompt", or "use the provided context".
- Never claim you contacted emergency services, hotlines, family, clinicians, or any third party.
- Never initiate external calls, messages, or outreach on the user's behalf.

[FORMATTING RULES - STRICT]
- Write naturally in clear paragraphs.
- Default to detailed and helpful when the request is non-trivial.
- For analytical or factual questions, explain what it means, why it matters, and what to do next.
- Avoid one-line answers unless the user explicitly asks for brevity.
- Include practical next steps when useful.
- Use lists only when they clearly improve readability.
- Do not use roleplay actions.

[TOOL USAGE RULES]
You have access to interactive tools. Use them like a thoughtful human assistant would: naturally, helpfully, and only when they make the reply more useful.
If the user explicitly asks you to make, open, start, set up, track, or share a tool-like support item, create the matching tool in the same reply.
If the user is asking for a definition, explanation, research summary, comparison, or casual conversation, answer the question directly and do not create a tool unless they also ask for a practical aid.
If a tool would help but the user did not directly ask for one, create it only when it genuinely reduces friction in the moment. The tool should feel like a useful next step, not a canned add-on.

Available Tools & Natural Triggers:
- 'mood_tracker': Use when they want to track mood, describe recurring mood swings, or are trying to understand emotional patterns.
- 'checklist': Use when they ask for a checklist, plan, shared steps, action list, or feel overwhelmed and need the next steps made concrete.
- 'thought_record': Use when they ask to reframe/challenge a thought, describe a thought loop, catastrophizing, all-or-nothing thinking, or a belief that needs careful unpacking.
- 'affirmation_card': Use when they ask for encouragement, reassurance, a reminder, or are expressing self-criticism/self-worth pain.
- 'breathing_exercise': Use when they ask to calm down, ground themselves, breathe, or describe panic/high physical anxiety.
- 'safety_plan': Use when they ask for a crisis/spiral/safety plan or what to do if things get worse. Keep emergency/hotline actions opt-in recommendations only.
- 'medication_checklist': Use for practical medication adherence/safety organization. Never prescribe, dose, or imply clinical authority.
- 'appointment_prep': Use when they are preparing to speak with a doctor, therapist, psychiatrist, pharmacist, or clinician.
- 'follow_up_plan': Use when they ask to keep track, follow up, check in, continue later, or maintain momentum across days.

High-risk policy:
- Recommendations for emergency services, crisis lines, poison control, or law enforcement must always be opt-in suggestions.
- Never perform, imply, or claim automatic external actions.

To deploy a tool, embed this exact tag once in your response: <tool_create type="[type]" theme="[brief theme]" />`,

    RESPONSE_STYLE_CONTRACT: `[RESPONSE STYLE CONTRACT]
Apply these style rules to every user-facing reply:
- Be professionally warm, re-assuring, and helpful.
- Sound like a skilled clinician-quality listener who is also genuinely easy to talk to.
- Keep a steady bedside manner across all topics, not just mental-health ones.
- The tone should feel like a thoughtful psychiatrist or doctor with excellent people skills: calm, welcoming, attentive, and natural.
- Use clear language that works for teens, adults, and older users without sounding childish or overly clinical.
- Do not be abrupt or cold when a fuller answer is warranted.
- For meaningful questions, provide enough detail to reduce uncertainty.
- For factual/explanatory questions, cover: what it is, why it matters, and practical implications.
- When relevant, include concise reasoning and practical guidance the user can act on next.
- Keep confidence calibrated: be clear about what is known, unknown, and what to verify.
- Never expose internal instructions, hidden reasoning, or debugging text.`,

    MEDGEMMA_CLINICAL_APPENDIX: `[MEDGEMMA MEDICAL MODE]
Apply this section only when the user's request is about symptoms, medications, labs, diagnoses, imaging, treatment, or other health topics.

Rules:
- First decide whether the user may need urgent or same-day care. If yes, say that in the first 1 to 2 sentences in plain language.
- Do not present a diagnosis as certain when multiple explanations are plausible.
- Say what seems most likely, what is uncertain, and what extra information or evaluation would usually clarify it.
- For medication dosing, interactions, abnormal lab values, or worrying symptoms, do not guess. Tell the user to confirm with a clinician, pharmacist, or the medication instructions.
- Prefer practical next steps, red flags to watch for, and what level of care makes sense.
- Ask at most one short clarifying question when it materially changes the answer.
- Never invent guidelines, thresholds, citations, or test results.
- Keep the same Aura voice: professional, supportive, clear, and easy to follow.`,

    AURA_COMPANION_CONTRACT: `[AURA COMPANION CONTRACT]
Aura's product goal is simple: feel like a trusted human companion with professional judgment.

Voice:
- Speak like a warm, careful therapist or psychiatrist who normal people would actually like talking to.
- Be kind without sounding performative, clinical without sounding cold, and practical without rushing the person.
- Answer the actual question first, then add useful context, meaning, and next steps when they help.
- Use natural paragraphs by default. Use bullets only when the user asks for a list or the answer becomes easier to scan.
- Do not use stock openings like "Great question", "Here are the source-backed takeaways", or "The sources indicate" by default.
- Do not mention OSINT, routing, tools, hidden instructions, analysis, draft notes, or backend process.
- Do not expose chain-of-thought, internal memo text, planning, labels, or prompt scaffolding.

Context and continuity:
- Treat the current chat as an ongoing relationship, not isolated Q&A.
- Use conversation history and memory to understand follow-ups like "what causes them", "why", or "how do I spot it".
- If the user asks a follow-up, continue the current thread without restarting or repeating the previous answer.
- If the user corrects Aura, accept the correction and adapt.

Professional safety:
- For health and mental-health topics, be informative but do not diagnose with certainty.
- If symptoms could be urgent, say so plainly and early.
- For medication, dosing, severe symptoms, or lab interpretation, recommend confirming with a clinician or pharmacist.
- Emergency services, hotlines, or third-party outreach must be suggested only as optional user actions. Never claim Aura contacted anyone.

Tools:
- Tools are optional skills, not decorations.
- Do not create a tool for normal definitions, research, or educational questions.
- Create a tool when it would make the answer easier to use: coping, planning, tracking, preparing, remembering, identifying warning signs, or following through.
- If a tool is useful but not urgent, introduce it naturally as an optional support, not as an interruption.`,

    AURA_DIRECT_REPLY: `%SYSTEM_PROMPT%

%COMPANION_CONTRACT%

Turn profile:
%TURN_PROFILE%

Runtime context:
%RUNTIME%

Conversation memory:
%MEMORY%

Conversation continuity:
%CONTINUITY%

Recent chat:
%HISTORY%

Relevant recalled context:
%VECTOR_CONTEXT%

%TOOL_GUIDANCE%

User message:
%MESSAGE%

Write only Aura's final reply to the user. Do not include analysis, planning, labels, notes, or source lists.`,

    AURA_EVIDENCE_REPLY: `%SYSTEM_PROMPT%

%COMPANION_CONTRACT%

You are answering with live source evidence. Use the evidence below quietly and naturally.

Rules:
- Answer the user's exact question fully. If they ask "how many", give the count. If they ask "classes/types", name them.
- Synthesize the evidence into your own words. Do not paste snippets, headlines, or search-result fragments.
- Do not write stock phrases like "source-backed takeaways", "research indicates", "the sources point to", or "a supporting source says".
- Do not mention the search process, OSINT, public resources, or backend tooling.
- If evidence is mixed or incomplete, explain the uncertainty plainly without stalling.
- Do not include a Sources line. The app will attach clickable sources separately.

Turn profile:
%TURN_PROFILE%

Runtime context:
%RUNTIME%

Conversation memory:
%MEMORY%

Conversation continuity:
%CONTINUITY%

Recent chat:
%HISTORY%

Relevant recalled context:
%VECTOR_CONTEXT%

Evidence catalog:
%EVIDENCE%

User message:
%MESSAGE%

Write only Aura's final reply to the user.`,

    BEHAVIOR_ANALYZER: `You are Aura's background profiling agent.
Update the user's behavioral profile based on the recent chat history.
Focus on updating: communicationStyle, moodPatterns, potentialLapses, and behavioralFacts.
[Current Profile]: %STORE%
[Recent Chat]: %HISTORY%
Respond ONLY with the updated JSON object matching the input structure.`,

    USER_MEMORY_ANALYZER: `You are Aura's durable user-memory agent.
Update the user's cross-chat memory using only information that is stable and useful across conversations.

[Current Durable User Memory]
%STORE%

[Active Chat Profile]
%CHAT_PROFILE%

[Recent Chat]
%HISTORY%

Return ONLY the JSON object with this exact shape:
{
  "communicationStyle": "string",
  "moodPatterns": ["string"],
  "potentialLapses": ["string"],
  "behavioralFacts": ["string"],
  "responsePreferences": {
    "detailLevel": "balanced",
    "reassuranceLevel": "medium",
    "technicalLevel": "plain",
    "structureLevel": "paragraphs",
    "directnessLevel": "balanced",
    "followUpLevel": "gentle",
    "likelyTone": "neutral"
  }
}

Rules:
- Store only durable preferences, recurring patterns, and stable support needs.
- Do not store one-off topics unless they are clearly recurring or personally important.
- Do not invent facts.
- No markdown, no commentary, no code fences.`,

    CONVERSATION_SUMMARIZER: `You are Aura's conversation memory summarizer.
Summarize the older part of this one chat so Aura can continue the conversation without losing context.

[Older Chat History]
%HISTORY%

Return ONLY valid JSON with this exact shape:
{
  "summary": "string",
  "activeTopics": ["string"],
  "openLoops": ["string"],
  "durableUserContext": ["string"]
}

Rules:
- Keep it specific to this chat only.
- Focus on durable context, not every detail.
- Include unresolved questions or threads that still matter.
- Do not invent facts.
- No markdown, no commentary, no code fences.`,

    SEARCH_PLAN: `You are Aura's OSINT planning agent.
Turn the user message into a compact JSON search plan.

[Behavioral Profile]: %PROFILE%
[Runtime Context]: %RUNTIME%
[User Message]: "%MESSAGE%"
[Crisis Resource Policy]: %CRISIS_LOOKUP_POLICY%

Return ONLY valid JSON with this exact shape:
{
  "primaryQuery": "string",
  "supportingQueries": ["string"],
  "includeNews": true,
  "reason": "string"
}

Rules:
- Keep the primary query concise and specific.
- supportingQueries must contain 0 to 4 distinct strings that add missing context or verification angles.
- Set includeNews to true when freshness matters.
- Never default to crisis-hotline lookups unless the Crisis Resource Policy explicitly allows it.
- Do not include markdown, commentary, or code fences.`,

    KNOWLEDGE_MAPPER: `Map the user question to a key: all-or-nothing-thinking, catastrophizing, discounting-the-positive, emotional-reasoning, fortune-telling, labeling, mental-filter, mind-reading, overgeneralization, personalization, should-statements, thought-record-info, grounding-techniques, grounding, mindfulness-deep-breathing.
Question: "%MESSAGE%". Respond ONLY with the key or "NULL".`,

    CRISIS_DETECTION: `Analyze the following message for suicidal ideation, self-harm, or severe hopelessness: "%MESSAGE%". Respond ONLY with 'CRISIS' or 'OK'.`,

    CRISIS_SUPPORT_REPLY: `You are Aura supporting someone in active distress.
User message: "%MESSAGE%"

Rules:
- Keep a calm, human tone.
- Acknowledge distress and offer one immediate grounding step.
- If there may be immediate danger, clearly advise contacting local emergency services right now.
- Do not claim that you contacted anyone.
- Do not initiate or imply automatic hotline calls.
- Offer resource lookup only as opt-in, e.g. ask if they want nearby crisis resources.`,

    RE_ENGAGEMENT: `The user hasn't chatted in %DAYS% days (%REASON%). Be supportive. Create a <tool_create type="checklist" theme="One small, easy step for today" />.`
};

const MEDGEMMA_FEW_SHOTS = [
    {
        user: 'I have crushing chest pain and shortness of breath right now. Could it just be anxiety?',
        assistant: `That combo can be serious, so I would not treat it like a wait-and-see thing. If it's happening right now, get urgent medical help now, especially if the pain spreads to your arm, back, jaw, or you feel faint or sweaty.

Anxiety can overlap with some of those symptoms, but chest pain plus shortness of breath needs real-world evaluation first.`
    },
    {
        user: 'My HbA1c came back 8.4%. What does that usually mean?',
        assistant: `In general, that suggests your average blood sugar has been running above target over the last 2 to 3 months. It is useful, but it is still one piece of the picture, so I would look at it alongside your meds, food, activity, and any home glucose data instead of overreading one number.`
    },
    {
        user: 'I missed one dose of my antidepressant. Should I double the next one?',
        assistant: `I would not assume doubling is safe. The right next step depends on the medication, the dose, and how close you are to the next scheduled dose, so the safest move is to check the label instructions or ask your pharmacist or prescriber before changing it.`
    }
];

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

function getSelectedModelName() {
    return localStorage.getItem(STORAGE_KEYS.MODEL) || window.AURA_CONFIG.defaultModel;
}

function isMedGemmaModel(modelName = '') {
    return /(^|[/:_-])medgemma/i.test(modelName);
}

function buildFewShotBlock(examples = []) {
    return examples
        .map(
            (example, index) => `[Example ${index + 1}]
User: ${example.user}
Aura: ${example.assistant}`
        )
        .join('\n\n');
}

function buildResponseSystemPrompt(basePrompt, modelName) {
    const styleAnchoredPrompt = [basePrompt, PROMPTS.RESPONSE_STYLE_CONTRACT].join('\n\n');
    if (!isMedGemmaModel(modelName)) return styleAnchoredPrompt;

    return [
        styleAnchoredPrompt,
        PROMPTS.MEDGEMMA_CLINICAL_APPENDIX,
        '[Few-shot examples]',
        buildFewShotBlock(MEDGEMMA_FEW_SHOTS)
    ].join('\n\n');
}

function getEffectiveSystemPrompt() {
    const overrideEnabled = localStorage.getItem(STORAGE_KEYS.PROMPT_OVERRIDE_ENABLED) === 'true';
    const overridePrompt = String(localStorage.getItem(STORAGE_KEYS.PROMPT) || '').trim();
    return overrideEnabled && overridePrompt ? overridePrompt : PROMPTS.DEFAULT_SYSTEM;
}

function buildAuraGenerationSystemPrompt(modelName) {
    const base = `You are Aura, a professional but warm AI companion for everyday support, learning, planning, and health questions.
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

    if (/\b(always|never|everyone thinks|i'm doomed|worthless|failure|not good enough|catastroph|spiral)\b/.test(text)) {
        return 'CbtAnalystAgent';
    }

    if (/\b(what is|what are|explain|define|tell me about|help me understand|symptoms?|causes?|treatment|diagnosis|types?|classes?|difference|compare)\b/.test(text)) {
        return 'KnowledgeAgent';
    }

    return 'GeneralFriendAgent';
}

function buildAuraTurnProfile({ route, sourceDecision, preferences, turnSupport, documentText = null } = {}) {
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
        `Distress level: ${safeTurn.distressLevel}`,
        `Depth: ${safePreferences.detailLevel}`,
        `Tone: ${safePreferences.reassuranceLevel === 'high' ? 'extra reassuring' : 'warm and professional'}`,
        `Structure: ${safePreferences.structureLevel}`,
        `Directness: ${safePreferences.directnessLevel}`,
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
    const raw = String(value || localStorage.getItem(STORAGE_KEYS.THINKING_MODE) || 'balanced').trim();
    return Object.prototype.hasOwnProperty.call(THINKING_MODE_PRESETS, raw) ? raw : 'balanced';
}

function getThinkingModePreset(mode = null) {
    return THINKING_MODE_PRESETS[getThinkingModeKey(mode)] || THINKING_MODE_PRESETS.balanced;
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

function sanitizeToolTheme(theme, fallback = 'Quick support') {
    const clean = String(theme || '')
        .replace(/["<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    return clean || fallback;
}

function sanitizeToolOpportunity(candidate) {
    const base = {
        shouldUseTool: false,
        type: 'checklist',
        theme: 'Quick support',
        reason: '',
        confidence: 0,
        userLine: ''
    };

    const safe = candidate && typeof candidate === 'object' ? candidate : {};
    const type = TOOL_TYPES.has(safe.type) ? safe.type : base.type;
    const rawConfidence = Number(safe.confidence);
    const confidence = Number.isFinite(rawConfidence) ? Math.max(0, Math.min(1, rawConfidence)) : 0;

    return {
        shouldUseTool: Boolean(safe.shouldUseTool) && TOOL_TYPES.has(type) && LOW_RISK_PROACTIVE_TYPES.has(type),
        type,
        theme: sanitizeToolTheme(safe.theme, base.theme),
        reason: typeof safe.reason === 'string' ? safe.reason.trim().slice(0, 240) : '',
        confidence,
        userLine: typeof safe.userLine === 'string' ? safe.userLine.trim().slice(0, 240) : ''
    };
}

function makeToolOpportunity(type, theme, reason, confidence, userLine) {
    return sanitizeToolOpportunity({
        shouldUseTool: true,
        type,
        theme,
        reason,
        confidence,
        userLine
    });
}

function getRecentConversationText(limit = 4) {
    if (typeof window === 'undefined' || !window.chatManager) return '';
    return window.chatManager
        .getActiveChatHistory()
        .slice(-limit)
        .map((message) => sanitizeContentForModelContext(message.content))
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function inferToolThemeFromConversation(userMessage, fallback = 'Quick support') {
    const text = `${String(userMessage || '').toLowerCase()} ${getRecentConversationText(4)}`;

    if (/\bpanic|anxiety attack|breath|heart racing\b/.test(text)) return 'Panic support';
    if (/\badhd|focus|executive|task|procrastinat\b/.test(text)) return 'ADHD support';
    if (/\bbipolar|mood swing|mania|hypomania|depression\b/.test(text)) return 'Mood support';
    if (/\bmedication|meds|dose|pill|prescription\b/.test(text)) return 'Medication safety';
    if (/\bdoctor|clinician|therapist|psychiatrist|appointment\b/.test(text)) return 'Appointment prep';
    if (/\bshare|send|them|together\b/.test(text)) return 'Shared support';

    return fallback;
}

function deriveExplicitToolRequest(userMessage) {
    const text = String(userMessage || '').toLowerCase();
    if (!text.trim()) return sanitizeToolOpportunity(null);

    const explicitAction = /\b(can you|could you|can we|could we|please|let'?s|make|create|build|set up|open|give me|start|add|prepare|prep|help me make|help me create|help me set up|help me prepare|help me prep)\b/;
    const wantsShared = /\b(share|send|them|together|track it together|track together|use together)\b/.test(text);

    if (explicitAction.test(text) && /\b(medication checklist|med checklist|meds checklist|pill checklist|track meds|medication tracker)\b/.test(text)) {
        return makeToolOpportunity(
            'medication_checklist',
            'Medication safety',
            'The user explicitly asked for medication organization support.',
            0.96,
            'I’ll open a medication safety checklist so this is organized clearly.'
        );
    }

    if (explicitAction.test(text) && /\b(appointment prep|doctor prep|therapist prep|psychiatrist prep|questions for (my )?(doctor|therapist|psychiatrist|clinician)|prepare questions.*(doctor|therapist|psychiatrist|clinician|appointment)|prepare.*(doctor|therapist|psychiatrist|clinician|appointment))\b/.test(text)) {
        return makeToolOpportunity(
            'appointment_prep',
            'Appointment prep',
            'The user explicitly asked to prepare for a clinician conversation.',
            0.96,
            'I’ll set up an appointment prep card so the key questions are ready.'
        );
    }

    if (explicitAction.test(text) && /\b(checklist|check list|to-do|todo|task list|action list)\b/.test(text)) {
        const theme = wantsShared
            ? `${inferToolThemeFromConversation(userMessage, 'Shared support')} checklist`
            : `${inferToolThemeFromConversation(userMessage, 'Personal support')} checklist`;
        return makeToolOpportunity(
            'checklist',
            theme,
            'The user explicitly asked for a checklist.',
            0.98,
            wantsShared
                ? 'I’ll make that as a checklist so you can use it and track it together.'
                : 'I’ll make that as a checklist so it is easier to follow.'
        );
    }

    if (explicitAction.test(text) && /\b(mood tracker|track my mood|mood log|log my mood|monitor my mood)\b/.test(text)) {
        return makeToolOpportunity(
            'mood_tracker',
            `${inferToolThemeFromConversation(userMessage, 'Mood')} tracker`,
            'The user explicitly asked to track mood.',
            0.97,
            'I’ll open a mood tracker so we can follow the pattern together.'
        );
    }

    if (explicitAction.test(text) && /\b(thought record|thought log|reframe|challenge my thought|challenge these thoughts|cognitive distortion)\b/.test(text)) {
        return makeToolOpportunity(
            'thought_record',
            'Thought reframing',
            'The user explicitly asked to work through a thought pattern.',
            0.96,
            'I’ll open a thought record so we can work through it step by step.'
        );
    }

    if (explicitAction.test(text) && /\b(affirmation|affirmation card|encouragement card|self-worth card|kind reminder)\b/.test(text)) {
        return makeToolOpportunity(
            'affirmation_card',
            'Grounding encouragement',
            'The user explicitly asked for encouragement support.',
            0.94,
            'I’ll make a short affirmation card for this moment.'
        );
    }

    if (explicitAction.test(text) && /\b(breathing exercise|breathing reset|breathwork|grounding exercise|calm me down|ground me)\b/.test(text)) {
        return makeToolOpportunity(
            'breathing_exercise',
            'Calming reset',
            'The user explicitly asked for grounding or breathing support.',
            0.98,
            'I’ll open a short breathing reset you can use right now.'
        );
    }

    if (explicitAction.test(text) && /\b(safety plan|crisis plan|spiral plan|if things get worse|stay safe plan)\b/.test(text)) {
        return makeToolOpportunity(
            'safety_plan',
            'Personal safety plan',
            'The user explicitly asked for a safety-oriented plan.',
            0.96,
            'I’ll make a safety plan card so the next steps are clear when things spike.'
        );
    }

    if (explicitAction.test(text) && /\b(follow-up plan|follow up plan|check-in plan|check in plan|track this|track it|keep track|keep me on track)\b/.test(text)) {
        return makeToolOpportunity(
            'follow_up_plan',
            'Track and follow up',
            'The user explicitly asked for ongoing follow-through.',
            0.95,
            'I’ll set up a follow-up plan so we can keep track of it together.'
        );
    }

    return sanitizeToolOpportunity(null);
}

function containsToolTag(text) {
    return /<tool_create[^>]*\/?>/i.test(String(text || ''));
}

function buildProactiveToolGuidance(recommendation) {
    if (!recommendation) return '';

    const tag = `<tool_create type="${recommendation.type}" theme="${recommendation.theme}" />`;
    return [
        `[Proactive Tool Guidance]`,
        `A tool will materially help in this specific moment.`,
        `Type: ${recommendation.type}`,
        `Theme: ${recommendation.theme}`,
        `Reason: ${recommendation.reason || 'High immediate utility.'}`,
        `Answer the user normally first, then include exactly this tag once where it feels natural: ${tag}`
    ].join('\n');
}

function attachProactiveToolTag(reply, recommendation) {
    if (!recommendation) return reply;
    if (!reply || containsToolTag(reply)) return reply;

    const tag = `<tool_create type="${recommendation.type}" theme="${recommendation.theme}" />`;
    const line = recommendation.userLine ||
        'I can spin up a quick interactive tool to make this easier right now.';

    return normalizeReplyWhitespace(`${reply}\n\n${line} ${tag}`);
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
    const raw = String(value || localStorage.getItem(STORAGE_KEYS.EXPERIENCE_STYLE) || 'balanced').trim();
    return Object.prototype.hasOwnProperty.call(EXPERIENCE_STYLE_PRESETS, raw) ? raw : 'balanced';
}

function getExperienceStylePreset(style = null) {
    return EXPERIENCE_STYLE_PRESETS[getExperienceStyleKey(style)] || EXPERIENCE_STYLE_PRESETS.balanced;
}

function getStoredExperienceResponsePreferences() {
    const preset = getExperienceStylePreset();
    return sanitizeResponsePreferences(
        {
            ...DEFAULT_RESPONSE_PREFERENCES,
            ...preset.preferences
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
    localStorage.setItem(STORAGE_KEYS.EXPERIENCE_STYLE, key);

    if (typeof window !== 'undefined' && window.chatManager) {
        window.chatManager.updateResponsePreferences({
            ...window.chatManager.getActiveResponsePreferences(),
            ...getExperienceStylePreset(key).preferences
        });
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
    const latestUser = getLatestMessageByRole(history, 'user');
    const latestAi = getLatestMessageByRole(history, 'ai');
    const recentPairs = getRecentThreadPairs(history, 4);
    const topic = inferActiveThreadLabel(history, cleanCurrent);
    const safeTurn = sanitizeTurnSupportDecision(turnSupport);

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
    return localStorage.getItem(STORAGE_KEYS.USER_MEMORY_ENABLED) === 'true';
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
              responseGoals: []
          };
    const safe = candidate && typeof candidate === 'object' ? candidate : {};
    const modeValues = new Set(['clarify', 'soothe', 'coach', 'reflect', 'research', 'none']);
    const followValues = new Set(['new_topic', 'deepen', 'clarify', 'challenge', 'correct', 'continue']);
    const levelValues = new Set(['low', 'medium', 'high']);
    const directValues = new Set(['soft', 'balanced', 'direct']);

    return {
        primaryMode: modeValues.has(safe.primaryMode) ? safe.primaryMode : base.primaryMode,
        secondaryMode: modeValues.has(safe.secondaryMode) ? safe.secondaryMode : base.secondaryMode,
        followUpIntent: followValues.has(safe.followUpIntent) ? safe.followUpIntent : base.followUpIntent,
        topicShift: typeof safe.topicShift === 'boolean' ? safe.topicShift : base.topicShift,
        distressLevel: levelValues.has(safe.distressLevel) ? safe.distressLevel : base.distressLevel,
        reassuranceNeed: levelValues.has(safe.reassuranceNeed) ? safe.reassuranceNeed : base.reassuranceNeed,
        structureNeed: levelValues.has(safe.structureNeed) ? safe.structureNeed : base.structureNeed,
        directnessTolerance: directValues.has(safe.directnessTolerance) ? safe.directnessTolerance : base.directnessTolerance,
        responseGoals: Array.isArray(safe.responseGoals)
            ? safe.responseGoals.map((goal) => String(goal || '').trim()).filter(Boolean).slice(0, 4)
            : base.responseGoals
    };
}

function deriveHeuristicTurnSupport(userMessage, route, history = []) {
    const text = String(userMessage || '').toLowerCase().trim();
    const previousAi = [...(history || [])]
        .reverse()
        .find((message) => message.role === 'ai' && String(message.content || '').trim());
    const followUpSignal = text.split(/\s+/).filter(Boolean).length <= 20 ||
        /^(what about|and what|but what|so what|why|how|can you|what if|then what)\b/i.test(text);

    let primaryMode = route.includes('Search') ? 'research' : 'clarify';
    let secondaryMode = 'none';
    let followUpIntent = 'new_topic';
    let topicShift = false;
    let distressLevel = 'low';
    let reassuranceNeed = 'medium';
    let structureNeed = 'low';
    let directnessTolerance = 'balanced';

    if (/\b(anxious|panic|scared|overwhelmed|spiral|hopeless|stressed)\b/.test(text)) {
        distressLevel = 'high';
        reassuranceNeed = 'high';
        primaryMode = 'soothe';
        secondaryMode = route.includes('Search') ? 'research' : 'clarify';
        directnessTolerance = 'soft';
    } else if (/\b(feel|feeling|emotion|lonely|sad|hurt)\b/.test(text)) {
        primaryMode = 'reflect';
        secondaryMode = 'clarify';
        reassuranceNeed = 'high';
        distressLevel = 'medium';
        directnessTolerance = 'soft';
    } else if (/\b(plan|steps|what should i do|how do i|help me do)\b/.test(text)) {
        primaryMode = 'coach';
        secondaryMode = 'clarify';
        structureNeed = 'high';
    }

    if (route.includes('Search')) primaryMode = primaryMode === 'soothe' ? primaryMode : 'research';
    if (route.includes('Knowledge') && primaryMode === 'clarify') secondaryMode = 'none';

    if (/\b(exactly|more|deeper|elaborate|expand|go on)\b/.test(text)) followUpIntent = 'deepen';
    if (/\b(i mean|to be clear|clarify|what i meant)\b/.test(text)) followUpIntent = 'clarify';
    if (/\b(no|not quite|that's wrong|incorrect|i meant)\b/.test(text)) followUpIntent = 'correct';
    if (/\b(are you sure|really|but isn't|that seems wrong|why would)\b/.test(text)) followUpIntent = 'challenge';
    if (followUpSignal && followUpIntent === 'new_topic' && previousAi) followUpIntent = 'continue';

    if (/\b(new topic|something else|different question|unrelated)\b/.test(text)) topicShift = true;
    if (!topicShift && /^\b(also|and|what about|how about|why|how)\b/i.test(text) && previousAi) {
        topicShift = false;
    }

    const responseGoals = [];
    if (primaryMode === 'research') responseGoals.push('Answer with evidence-backed clarity');
    if (primaryMode === 'clarify') responseGoals.push('Explain directly in plain language');
    if (primaryMode === 'soothe') responseGoals.push('Regulate distress before expanding');
    if (primaryMode === 'reflect') responseGoals.push('Show understanding before guidance');
    if (primaryMode === 'coach') responseGoals.push('Turn the answer into usable next steps');
    if (followUpIntent !== 'new_topic') responseGoals.push('Honor the ongoing thread without repetition');
    if (structureNeed === 'high') responseGoals.push('Make the structure easy to follow');

    return sanitizeTurnSupportDecision({
        primaryMode,
        secondaryMode,
        followUpIntent,
        topicShift,
        distressLevel,
        reassuranceNeed,
        structureNeed,
        directnessTolerance,
        responseGoals
    });
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

function deriveHeuristicToolOpportunity(userMessage, route) {
    const text = String(userMessage || '').toLowerCase();

    if (!text.trim()) return sanitizeToolOpportunity(null);

    const explicitTool = deriveExplicitToolRequest(userMessage);
    if (explicitTool.shouldUseTool) return explicitTool;

    if (
        /\b(make|create|build|set up|open|give)\b.*\b(checklist|check list)\b/.test(text) ||
        /\b(checklist|check list)\b.*\b(share|send|give|track together|track it together|use together)\b/.test(text)
    ) {
        return sanitizeToolOpportunity({
            shouldUseTool: true,
            type: 'checklist',
            theme: /\bshare|send|them|together\b/.test(text) ? 'Shared checklist' : 'Personal checklist',
            reason: 'The user explicitly asked for a checklist they can use and track.',
            confidence: 0.96,
            userLine: 'I’ll make that as a checklist so you can use it and track it together.'
        });
    }

    if (
        /\b(identify|spot|recognize|notice|tell if|warning signs|red flags)\b/.test(text) &&
        /\b(panic|anxiety attack|episode|spiral|crisis)\b/.test(text) &&
        !/\b(right now|currently|happening now|can't breathe|hyperventilat|heart racing)\b/.test(text)
    ) {
        return sanitizeToolOpportunity({
            shouldUseTool: true,
            type: 'checklist',
            theme: 'Signs and next steps',
            reason: 'A recognition checklist turns information into something usable in the moment.',
            confidence: 0.82,
            userLine: 'I can also open a quick signs-and-next-steps checklist so this is easier to use in real life.'
        });
    }

    if (/\b(panic|panic attack|anxiety attack|can't breathe|hyperventilat|heart racing right now|calm down right now)\b/.test(text)) {
        return sanitizeToolOpportunity({
            shouldUseTool: true,
            type: 'breathing_exercise',
            theme: 'Calming reset',
            reason: 'Immediate physiological regulation can help.',
            confidence: 0.9,
            userLine: 'Let me open a short breathing reset you can use right now.'
        });
    }

    if (/\b(safety plan|what should i do if i spiral|plan for crisis|if i get worse|in case i panic again|what to do if this happens again)\b/.test(text)) {
        return makeToolOpportunity(
            'safety_plan',
            'Personal safety plan',
            'A written safety plan improves follow-through under stress.',
            0.86,
            'I can create a personal safety plan card so the next steps are clear if things spike.'
        );
    }

    if (/\b(medication|meds|pill|prescription|dose|missed dose|side effect|interaction|remember to take)\b/.test(text) && /\b(i|my|me|organize|track|checklist)\b/.test(text)) {
        return makeToolOpportunity(
            'medication_checklist',
            'Medication safety organization',
            'A practical checklist reduces avoidable medication errors.',
            0.82,
            'I can open a medication safety checklist so we can organize this clearly.'
        );
    }

    if (/\b(doctor|clinician|appointment|visit|follow-up visit|specialist|therapist|psychiatrist)\b/.test(text) && /\b(prepare|prep|questions|what should i ask|before|bring up|talk to)\b/.test(text)) {
        return makeToolOpportunity(
            'appointment_prep',
            'Clinician appointment prep',
            'Structured prep leads to better clinical visits.',
            0.82,
            'I can set up an appointment prep card so you have the key questions and details ready.'
        );
    }

    if (/\b(check in|check-in|follow up|follow-up|keep me on track|remind me to|keep momentum|next few days|next week)\b/.test(text)) {
        return makeToolOpportunity(
            'follow_up_plan',
            'Follow-up plan',
            'A lightweight follow-up structure improves continuity.',
            0.8,
            'I can create a follow-up plan card so we keep momentum without overwhelm.'
        );
    }

    if (/\b(overwhelmed|too much|can't keep up|i'm stuck|need a plan|organize|break this down|step by step|what should i do next|help me start|make a plan)\b/.test(text)) {
        return sanitizeToolOpportunity({
            shouldUseTool: true,
            type: 'checklist',
            theme: 'One-step-at-a-time plan',
            reason: 'Task decomposition reduces overload and improves execution.',
            confidence: 0.85,
            userLine: 'I can set up a quick checklist so this feels more manageable immediately.'
        });
    }

    if (/\b(how can i|how do i|help me)\b/.test(text) && /\b(identify|spot|recognize|notice|tell if|warning signs|red flags)\b/.test(text)) {
        return sanitizeToolOpportunity({
            shouldUseTool: true,
            type: 'checklist',
            theme: 'Signs and next steps',
            reason: 'A recognition checklist turns information into something usable in the moment.',
            confidence: 0.78,
            userLine: 'I can also open a quick signs-and-next-steps checklist so this is easier to use in real life.'
        });
    }

    if (/\b(i'm worthless|i hate myself|i'm a failure|not good enough|can't do anything right)\b/.test(text)) {
        return makeToolOpportunity(
            'affirmation_card',
            'Self-worth reinforcement',
            'Helpful for active self-critical loops.',
            0.82,
            'I can also create a short grounding affirmation card for this moment.'
        );
    }

    if (/\b(always|never|everyone thinks|i know it will fail|i'm doomed|i keep thinking|can't stop thinking|thought loop)\b/.test(text)) {
        return makeToolOpportunity(
            'thought_record',
            'Reality-check reframing',
            'Useful when cognitive distortion patterns are active.',
            0.8,
            'I can open a quick thought-record to help unpack this pattern step by step.'
        );
    }

    if (/\b(feel terrible|really low|sad all day|angry all day|my mood|mood swings|mood has been|tracking my mood)\b/.test(text)) {
        return makeToolOpportunity(
            'mood_tracker',
            'Mood trend check-in',
            'Tracking can clarify patterns and triggers.',
            0.76,
            'I can open a quick mood tracker so we can spot patterns.'
        );
    }

    if (/\b(can you help me remember|can we keep track|track this|track it|track them|track together|monitor this|monitor it|log this|log it)\b/.test(text)) {
        return makeToolOpportunity(
            'follow_up_plan',
            'Track and follow up',
            'Tracking and follow-up help keep the conversation useful beyond one answer.',
            0.78,
            'I can set up a small follow-up card so we can keep track of this together.'
        );
    }

    if (route.includes('Search') || route.includes('Knowledge')) return sanitizeToolOpportunity(null);

    return sanitizeToolOpportunity(null);
}

function isInformationalExplanationRequest(userMessage) {
    const text = String(userMessage || '').toLowerCase().trim();
    if (!text) return false;

    return [
        /\bwhat is\b/,
        /\bwhat are\b/,
        /\bexplain\b/,
        /\bdefine\b/,
        /\btell me about\b/,
        /\bhelp me understand\b/,
        /\bresearch\b/,
        /\bsource-backed\b/,
        /\bwith sources\b/,
        /\bsummarize\b/,
        /\bsummary\b/,
        /\bcompare\b/,
        /\bdifference\b/,
        /\bcauses?\b/,
        /\bsymptoms?\b/
    ].some((pattern) => pattern.test(text));
}

function hasActivePersonalNeedSignal(userMessage) {
    const text = String(userMessage || '').toLowerCase();
    if (!text.trim()) return false;

    return [
        /\bi feel\b/,
        /\bi'm\b/,
        /\bi am\b/,
        /\bmy\b/,
        /\bme\b/,
        /\bright now\b/,
        /\bcurrently\b/,
        /\bpanic\b/,
        /\boverwhelmed\b/,
        /\bneed help\b/,
        /\bhelp me cope\b/,
        /\bhelp me through\b/,
        /\bwhat should i do\b/,
        /\bmake me a\b/,
        /\bgive me a plan\b/
    ].some((pattern) => pattern.test(text));
}

function hasActionableToolIntent(userMessage) {
    const text = String(userMessage || '').toLowerCase();
    if (!text.trim()) return false;

    return [
        /\b(what should i do|what do i do|how do i deal|how can i cope|help me cope|calm down|ground me)\b/,
        /\b(plan|steps|checklist|check list|routine|organize|prepare|prep|track|track it together|monitor|log|remember|follow up|check in|share)\b/,
        /\b(identify|spot|recognize|warning signs|red flags|tell if)\b/,
        /\b(make me|make|create|build|set up|open|give me)\b/
    ].some((pattern) => pattern.test(text));
}

function isExplicitToolCreationRequest(userMessage) {
    const text = String(userMessage || '').toLowerCase();
    if (!text.trim()) return false;

    return [
        /\b(make|create|build|set up|open|give|start|add)\b.*\b(checklist|check list|tracker|card|plan|tool|breathing exercise|thought record|mood log|appointment prep)\b/,
        /\b(can you|could you|can we|could we|please|let'?s)\b.*\b(make|create|build|set up|open|give|start|add|track|share|prepare|prep)\b/,
        /\b(mood tracker|thought record|breathing exercise|safety plan|crisis plan|medication checklist|meds checklist|appointment prep|follow-up plan|follow up plan)\b/,
        /\bwe can track (it|this|them) together\b/
    ].some((pattern) => pattern.test(text));
}

function shouldSuppressProactiveToolOpportunity(userMessage, route) {
    const actionable = hasActionableToolIntent(userMessage);
    if ((route.includes('Search') || route.includes('Knowledge')) && !actionable && !hasActivePersonalNeedSignal(userMessage)) {
        return true;
    }
    if (isInformationalExplanationRequest(userMessage) && !actionable && !hasActivePersonalNeedSignal(userMessage)) return true;
    return false;
}

async function inferProactiveToolOpportunity(userMessage, route, adaptivePreferences) {
    if (shouldSuppressProactiveToolOpportunity(userMessage, route)) return null;

    const candidate = deriveHeuristicToolOpportunity(userMessage, route);

    if (!candidate.shouldUseTool) return null;
    if (shouldSuppressProactiveToolOpportunity(userMessage, route)) return null;
    if (!LOW_RISK_PROACTIVE_TYPES.has(candidate.type)) return null;
    if (route.includes('Crisis') && !CRISIS_ROUTE_PROACTIVE_TYPES.has(candidate.type)) return null;
    if (candidate.confidence < 0.65) return null;
    if (!isExplicitToolCreationRequest(userMessage) && !chatManager.canUseProactiveTool(candidate.type)) return null;

    return candidate;
}

function extractToolTags(text) {
    return [...String(text || '').matchAll(TOOL_TAG_PATTERN)].map((match) => match[0]);
}

function stripToolTags(text) {
    return String(text || '').replace(TOOL_TAG_PATTERN, ' ').trim();
}

function normalizeReplyWhitespace(text) {
    return String(text || '')
        .replace(/\r/g, '')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function splitReplyArtifacts(text) {
    const raw = String(text || '');
    const toolTags = extractToolTags(raw);
    const sourceLines = raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^\s*Sources:\s*/i.test(line));
    const body = normalizeReplyWhitespace(stripInlineSourceLine(stripToolTags(raw)));

    return {
        body,
        toolTags,
        sourceLines
    };
}

function reassembleReplyArtifacts({ body = '', toolTags = [], sourceLines = [] } = {}) {
    return normalizeReplyWhitespace(
        [
            normalizeReplyWhitespace(body),
            ...sourceLines.filter(Boolean),
            ...toolTags.filter(Boolean)
        ].filter(Boolean).join('\n\n')
    );
}

function stripModelReasoningTokens(text) {
    let value = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, ' ');
    const gemmaFinal = value.match(/<unused95>\s*([\s\S]*)/i);
    if (gemmaFinal) {
        return gemmaFinal[1]
            .replace(/<unused9[45]>/gi, ' ')
            .replace(/\[(?:end of )?medgemma medical mode\]/gi, ' ')
            .trim();
    }
    value = value.replace(/<unused94>\s*thought[\s\S]*$/gi, ' ');
    return value
        .replace(/<unused9[45]>/gi, ' ')
        .replace(/\[(?:end of )?medgemma medical mode\]/gi, ' ')
        .trim();
}

function stripThinkingTags(text) {
    return stripModelReasoningTokens(text);
}

function stripPlanningScaffold(text) {
    const cleaned = normalizeReplyWhitespace(text);
    if (!cleaned) return '';

    const lines = cleaned.split('\n');
    const filtered = lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;

        return ![
            /^\[[^\]]*(?:thought|analysis|reasoning|plan|思考|分析|推理|计划|計劃)[^\]]*\]\s*/i,
            /^identify (?:the )?(?:core )?request\b[:\s-]/i,
            /^identify (?:the )?(?:core )?question\b[:\s-]/i,
            /^structure (?:the )?response\b[:\s-]/i,
            /^structure (?:the )?answer\b[:\s-]/i,
            /^gather information\b[:\s-]/i,
            /^formulate (?:the )?response\b[:\s-]/i,
            /^formulate (?:the )?answer\b[:\s-]/i,
            /^review to ensure\b[:\s-]/i,
            /^self-?correction\b[:\s-]/i,
            /^\(self-?correction\/?refinement\)/i,
            /^plan\b[:\s-]/i,
            /^recall (?:the )?previous context\b[:\s-]/i,
            /^determine (?:the )?scope\b[:\s-]/i,
            /^access knowledge\b[:\s-]/i,
            /^synthesize (?:the )?answer\b[:\s-]/i,
            /^refine (?:the )?language\b[:\s-]/i,
            /^check against rules\b[:\s-]/i,
            /^final check\b[:\s-]/i,
            /^draft(?:ing)? (?:the )?response\b[:\s-]/i,
            /^avoid overly technical\b[:\s-]/i,
            /^steps?\b[:\s-]/i,
            /^approach\b[:\s-]/i,
            /^core request\b[:\s-]/i,
            /^the user is asking\b[:\s-]/i,
            /^the original draft\b[:\s-]/i,
            /^the goal is to\b[:\s-]/i,
            /^drafting(?:\s*-\s*iteration\s*\d+)?\b[:\s-]/i,
            /^iteration\s*\d+\b[:\s-]/i,
            /^responding to the user\b[:\s-]/i
        ].some((pattern) => pattern.test(trimmed));
    });

    let result = normalizeReplyWhitespace(filtered.join('\n'));
    if (!result) return '';

    const conversationalAnchor = result.match(
        /(?:^|\n|["“])\s*(?:hi\b|hello\b|hey\b|okay[,! ]+let'?s|let'?s\b|here'?s\b|short answer[:\-]|quick answer[:\-])/i
    );

    if (conversationalAnchor && conversationalAnchor.index > 0) {
        result = normalizeReplyWhitespace(result.slice(conversationalAnchor.index).replace(/^["“]+/, ''));
    }

    return result;
}

function extractLikelyUserFacingSegment(text) {
    const normalized = normalizeReplyWhitespace(stripToolTags(stripThinkingTags(text)));
    if (!normalized) return '';

    const anchors = [
        /(?:^|\n|["“])\s*(?:hi\b|hello\b|hey\b|okay[,! ]+let'?s|let'?s\b|here'?s\b|short answer[:\-]|quick answer[:\-])/i,
        /(?:^|\n)\s*[A-Z][A-Za-z0-9\s'()\/&-]{3,80}:\s*$/m
    ];

    for (const pattern of anchors) {
        const match = normalized.match(pattern);
        if (match && typeof match.index === 'number') {
            const candidate = normalizeReplyWhitespace(normalized.slice(match.index).replace(/^["“]+/, ''));
            if (candidate) return candidate;
        }
    }

    return normalized;
}

function isMetaInstructionLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return true;

    return [
        /^\[[^\]]*(?:thought|analysis|reasoning|plan|思考|分析|推理|计划|計劃)[^\]]*\]\s*/i,
        /^(?:thought|analysis|reasoning|plan)\b[:\s-]/i,
        /^(?:思考|分析|推理|计划|計劃)\b[:\s-]/i,
        /^the user wants me to\b/i,
        /^the user is asking\b/i,
        /^i need to\b/i,
        /^i should\b/i,
        /^i must\b/i,
        /^start with\b/i,
        /^acknowledge\b/i,
        /^express\b/i,
        /^keep it concise\b/i,
        /^avoid\b/i,
        /^use the provided\b/i,
        /^respond only\b/i,
        /^return only\b/i,
        /^focus on\b/i,
        /^identify (?:the )?(?:core )?request\b/i,
        /^identify (?:the )?(?:core )?question\b/i,
        /^structure (?:the )?response\b/i,
        /^structure (?:the )?answer\b/i,
        /^gather information\b/i,
        /^formulate (?:the )?response\b/i,
        /^formulate (?:the )?answer\b/i,
        /^review to ensure\b/i,
        /^self-?correction\b/i,
        /^\(self-?correction\/?refinement\)/i,
        /^recall (?:the )?previous context\b/i,
        /^determine (?:the )?scope\b/i,
        /^access knowledge\b/i,
        /^synthesize (?:the )?answer\b/i,
        /^refine (?:the )?language\b/i,
        /^check against rules\b/i,
        /^final check\b/i,
        /^draft(?:ing)? (?:the )?response\b/i,
        /^drafting(?:\s*-\s*iteration\s*\d+)?\b/i,
        /^the original draft\b/i,
        /^the goal is to\b/i,
        /^core request\b[:\s-]/i,
        /^\[?(?:behavioral profile|runtime context|system context|current session history|relevant past memories|current profile|recent chat|draft reply|user message)\]?[:\]]/i
    ].some((pattern) => pattern.test(trimmed));
}

function stripMetaPreface(text) {
    const cleaned = normalizeReplyWhitespace(stripThinkingTags(text));
    const lines = cleaned.split('\n');
    const keptLines = [];
    let started = false;
    const strongMetaBoundary = /^(?:thought|analysis|reasoning|plan|思考|分析|推理|计划|計劃)\b[:\s-]|^\[[^\]]*(?:thought|analysis|reasoning|plan|思考|分析|推理|计划|計劃)[^\]]*\]\s*|^(?:the user is asking|the original draft|the goal is to|drafting(?:\s*-\s*iteration\s*\d+)?)\b[:\s-]?|^\[?(?:behavioral profile|runtime context|system context|current session history|relevant past memories|current profile|recent chat|draft reply|user message)\]?[:\]]/i;

    for (const line of lines) {
        const trimmed = line.trim();

        if (!started) {
            if (isMetaInstructionLine(trimmed)) continue;
            started = true;
        }

        if (started && strongMetaBoundary.test(trimmed)) break;

        if (started && trimmed) {
            keptLines.push(line);
        } else if (started && !trimmed) {
            keptLines.push(line);
        }
    }

    return normalizeReplyWhitespace(keptLines.join('\n'));
}

function looksLikeLeakedReasoning(text) {
    const sample = normalizeReplyWhitespace(stripToolTags(stripThinkingTags(text))).slice(0, 1200);
    if (!sample) return false;

    return [
        /(?:^|\n)\s*\[[^\]]*(?:thought|analysis|reasoning|plan|思考|分析|推理|计划|計劃)[^\]]*\]/i,
        /(?:^|\n)\s*(?:thought|analysis|reasoning|plan)\b[:\s-]/i,
        /(?:^|\n)\s*(?:思考|分析|推理|计划|計劃)\b[:\s-]/i,
        /\bthe user wants me to\b/i,
        /\bthe user is asking\b/i,
        /\bi need to respond\b/i,
        /\bi should respond\b/i,
        /\bi must\b/i,
        /\buse the provided html structure\b/i,
        /\bbased on the prompt\b/i,
        /\bidentify (?:the )?(?:core )?request\b/i,
        /\bidentify (?:the )?(?:core )?question\b/i,
        /\bstructure (?:the )?response\b/i,
        /\bstructure (?:the )?answer\b/i,
        /\bgather information\b/i,
        /\bformulate (?:the )?response\b/i,
        /\bformulate (?:the )?answer\b/i,
        /\breview to ensure\b/i,
        /\bself-?correction\b/i,
        /\brecall (?:the )?previous context\b/i,
        /\bdetermine (?:the )?scope\b/i,
        /\baccess knowledge\b/i,
        /\bsynthesize (?:the )?answer\b/i,
        /\brefine (?:the )?language\b/i,
        /\bcheck against rules\b/i,
        /\bfinal check\b/i,
        /\bdrafting (?:the )?response\b/i,
        /\bdrafting(?:\s*-\s*iteration\s*\d+)?\b/i,
        /\bthe original draft\b/i,
        /\bthe goal is to\b/i,
        /\bbehavioral profile\b/i,
        /\bruntime context\b/i,
        /\bsystem context\b/i,
        /\brespond only\b/i,
        /\breturn only\b/i
    ].some((pattern) => pattern.test(sample));
}

async function finalizeAssistantReply(rawReply, userMessage = '') {
    if (!rawReply) return null;

    const toolTags = extractToolTags(rawReply);
    let cleanedBody = stripRoboticSourcePreamble(stripPlanningScaffold(stripMetaPreface(stripToolTags(rawReply))));

    if (looksLikeLeakedReasoning(rawReply) || looksLikeLeakedReasoning(cleanedBody)) {
        cleanedBody = stripRoboticSourcePreamble(stripPlanningScaffold(stripMetaPreface(extractLikelyUserFacingSegment(rawReply))));
    }

    if (!cleanedBody || looksLikeLeakedReasoning(cleanedBody)) {
        cleanedBody = stripRoboticSourcePreamble(stripPlanningScaffold(stripMetaPreface(extractLikelyUserFacingSegment(rawReply))));
    }

    if (!cleanedBody || looksLikeLeakedReasoning(cleanedBody)) {
        const tailCandidate = normalizeReplyWhitespace(
            String(rawReply || '')
                .split('\n')
                .slice(-12)
                .join('\n')
        );
        cleanedBody = stripRoboticSourcePreamble(stripPlanningScaffold(stripMetaPreface(stripToolTags(tailCandidate))));
    }

    if (!cleanedBody || looksLikeLeakedReasoning(cleanedBody)) {
        cleanedBody = '';
    }

    const finalReply = normalizeReplyWhitespace(
        [cleanedBody, ...toolTags.filter((tag) => !cleanedBody.includes(tag))].filter(Boolean).join('\n')
    );

    return finalReply || null;
}

function getDisplaySafeAssistantContent(content) {
    return stripToolTags(stripMetaPreface(content));
}

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
    const locationEnabled = localStorage.getItem(STORAGE_KEYS.LOCATION_ENABLED) === 'true';
    const locationContext = safeParseJson(localStorage.getItem(STORAGE_KEYS.LOCATION_CONTEXT), null);

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

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(extractErrorMessage(data, `Request failed with status ${response.status}`));
    }

    return data;
}

async function postJson(url, body) {
    return requestJson(url, {
        method: 'POST',
        body: JSON.stringify(body)
    });
}

async function _callLLM(prompt, format = null, callType = 'default') {
    const model = getSelectedModelName();
    const options = getModelGenerationOptions(model, format, callType);

    try {
        const data = await postJson(API_ENDPOINTS.ollamaGenerate, {
            model,
            prompt,
            stream: false,
            ...(Object.keys(options).length ? { options } : {}),
            ...(format ? { format } : {})
        });

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
                    model,
                    prompt: stillHiddenOnly
                        ? buildFinalAnswerRetryPrompt(prompt)
                        : buildContinuationPrompt(prompt, rawReply),
                    stream: false,
                    ...(Object.keys(options).length ? { options } : {})
                });
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
        const response = await fetch(`contents/${folder}/${slug}.md`);
        return response.ok ? await response.text() : null;
    } catch (error) {
        console.error(`Failed to fetch ${slug}.md`, error);
        return null;
    }
}

class ChatManager {
    constructor() {
        this.state = this.ensureStateShape(this.loadState() || this.getInitialState());
        if (!this.state.activeChatId) this.createNewChat();
    }

    getInitialState() {
        return {
            chats: {},
            activeChatId: null,
            localContentStore: buildChatScopedProfile()
        };
    }

    ensureStateShape(state) {
        const safeState = state && typeof state === 'object' ? state : this.getInitialState();
        safeState.chats = safeState.chats && typeof safeState.chats === 'object' ? safeState.chats : {};
        const globalFallbackStore = sanitizeChatScopedProfile(
            safeState.localContentStore,
            this.getInitialState().localContentStore
        );
        Object.values(safeState.chats).forEach((chat) => {
            if (!chat || typeof chat !== 'object') return;
            chat.history = Array.isArray(chat.history) ? chat.history : [];
            chat.tools = chat.tools && typeof chat.tools === 'object' ? chat.tools : {};
            chat.completed_tasks = Array.isArray(chat.completed_tasks) ? chat.completed_tasks : [];
            chat.isHeightenedAwareness = Boolean(chat.isHeightenedAwareness);
            chat.lastUserMessageTimestamp = Number(chat.lastUserMessageTimestamp) || Date.now();
            chat.lastProactiveToolAt = Number(chat.lastProactiveToolAt) || 0;
            chat.lastProactiveToolType = typeof chat.lastProactiveToolType === 'string' ? chat.lastProactiveToolType : '';
            chat.localContentStore = sanitizeChatScopedProfile(chat.localContentStore, globalFallbackStore);
            chat.contextSummary = chat.contextSummary && typeof chat.contextSummary === 'object' ? chat.contextSummary : null;
            chat.contextSummaryAnchor = typeof chat.contextSummaryAnchor === 'string' ? chat.contextSummaryAnchor : '';
        });
        safeState.localContentStore = globalFallbackStore;

        return safeState;
    }

    loadState() {
        try {
            return safeParseJson(localStorage.getItem(STORAGE_KEYS.STATE), null);
        } catch (_error) {
            return null;
        }
    }

    saveState() {
        localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(this.state));
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
        delete this.state.chats[id];

        const remainingChatIds = Object.keys(this.state.chats);
        this.state.activeChatId = remainingChatIds.length ? remainingChatIds[0] : null;

        if (!this.state.activeChatId) this.createNewChat();
        this.saveState();
    }

    addMessageToActiveChat(role, content) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat) return;

        chat.history.push({ role, content, timestamp: Date.now() });

        if (chat.history.length === 1 && role === 'user') {
            chat.title = buildChatTitle(content);
        }

        if (role === 'user') {
            const timestamp = Date.now();
            chat.lastUserMessageTimestamp = timestamp;
            this.vectorizeData(content, {
                role: 'user',
                timestamp,
                chatId: chat.id
            });

            if (chat.history.length % 4 === 0) {
                this.runBehaviorAnalyzer();
            }
        }

        this.saveState();
    }

    async vectorizeData(text, metadata = {}) {
        if (!text) return;

        try {
            await postJson(API_ENDPOINTS.storeMemory, { text, metadata });
        } catch (error) {
            console.error('Vector DB Store Error', error);
        }
    }

    async searchVectorData(query) {
        if (!query) return '';

        try {
            const data = await postJson(API_ENDPOINTS.searchMemory, {
                query,
                chatId: this.getActiveChatId()
            });
            return data.results?.documents?.[0]?.join('\n\n') || '';
        } catch (_error) {
            return '';
        }
    }

    async runBehaviorAnalyzer() {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat || chat.history.length < 4) return;

        const historyStr = chat.history
            .slice(-8)
            .map((message) => `${message.role}: ${sanitizeContentForModelContext(message.content)}`)
            .join('\n');

        const prompt = PROMPTS.BEHAVIOR_ANALYZER
            .replace('%STORE%', JSON.stringify(this.getActiveContentStore()))
            .replace('%HISTORY%', historyStr);

        const response = await _callLLM(prompt, 'json');
        const parsed = safeParseJson(response, null);

        if (parsed && typeof parsed === 'object') {
            const previousPreferences = this.getActiveResponsePreferences();
            const nextStore = sanitizeChatScopedProfile(parsed, this.getActiveContentStore());
            nextStore.responsePreferences = sanitizeResponsePreferences(
                parsed.responsePreferences,
                previousPreferences
            );
            chat.localContentStore = nextStore;

            if (isUserMemoryEnabled()) {
                const durableResponse = await _callLLM(
                    PROMPTS.USER_MEMORY_ANALYZER
                        .replace('%STORE%', JSON.stringify(this.getUserMemoryStore(), null, 2))
                        .replace('%CHAT_PROFILE%', JSON.stringify(nextStore, null, 2))
                        .replace('%HISTORY%', historyStr),
                    'json',
                    'analysis'
                );
                const durableParsed = safeParseJson(durableResponse, null);
                if (durableParsed && typeof durableParsed === 'object') {
                    this.state.localContentStore = sanitizeChatScopedProfile(
                        durableParsed,
                        this.getUserMemoryStore()
                    );
                }
            }
            this.saveState();
        }
    }

    getActiveChat() {
        return this.state.chats[this.state.activeChatId] || null;
    }

    getActiveContentStore() {
        const chat = this.getActiveChat();
        return sanitizeChatScopedProfile(chat?.localContentStore, this.state.localContentStore);
    }

    getUserMemoryStore() {
        return sanitizeChatScopedProfile(this.state.localContentStore, buildChatScopedProfile());
    }

    rememberUserFact(text) {
        const value = String(text || '').trim();
        if (!value) return false;

        const store = sanitizeChatScopedProfile(this.state.localContentStore, buildChatScopedProfile());
        store.behavioralFacts = mergeUniqueStrings(store.behavioralFacts, [value]).slice(0, 20);
        this.state.localContentStore = store;
        this.saveState();
        return true;
    }

    getCombinedContentStore() {
        return buildCombinedProfileStore(
            this.getActiveContentStore(),
            this.getUserMemoryStore(),
            isUserMemoryEnabled()
        );
    }

    clearUserMemoryStore() {
        this.state.localContentStore = buildChatScopedProfile();
        this.saveState();
    }

    exportLocalData() {
        return {
            exportedAt: new Date().toISOString(),
            version: 'aura-local-export-v1',
            state: this.state,
            settings: {
                theme: localStorage.getItem(STORAGE_KEYS.THEME),
                model: localStorage.getItem(STORAGE_KEYS.MODEL),
                experienceStyle: localStorage.getItem(STORAGE_KEYS.EXPERIENCE_STYLE),
                thinkingMode: localStorage.getItem(STORAGE_KEYS.THINKING_MODE),
                locationEnabled: localStorage.getItem(STORAGE_KEYS.LOCATION_ENABLED) === 'true',
                userMemoryEnabled: localStorage.getItem(STORAGE_KEYS.USER_MEMORY_ENABLED) === 'true'
            }
        };
    }

    deleteAllLocalData() {
        Object.values(STORAGE_KEYS).forEach((key) => localStorage.removeItem(key));
        this.state = this.getInitialState();
        this.createNewChat();
        this.saveState();
    }

    getActiveResponsePreferences() {
        return sanitizeResponsePreferences(
            this.getActiveContentStore().responsePreferences,
            DEFAULT_RESPONSE_PREFERENCES
        );
    }

    updateResponsePreferences(nextPreferences) {
        const chat = this.getActiveChat();
        if (!chat) return;
        chat.localContentStore = {
            ...this.getActiveContentStore(),
            responsePreferences: sanitizeResponsePreferences(
            nextPreferences,
            this.getActiveResponsePreferences()
            )
        };
        this.saveState();
    }

    async getConversationSummary() {
        const chat = this.getActiveChat();
        if (!chat) return '';
        if (chat.history.length <= 10) return '';

        const olderHistory = chat.history.slice(0, -8);
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
            'json',
            'analysis'
        );
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

    canUseProactiveTool(type, minCooldownMs = 90 * 1000) {
        if (!TOOL_TYPES.has(type)) return false;
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat) return false;

        const now = Date.now();
        if (chat.lastProactiveToolAt && (now - chat.lastProactiveToolAt) < minCooldownMs) return false;

        const currentCount = Array.isArray(chat.tools?.[type]) ? chat.tools[type].length : 0;
        const maxPerType = type === 'checklist' ? 4 : (type === 'follow_up_plan' ? 3 : 2);
        return currentCount < maxPerType;
    }

    markProactiveToolUsed(type) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat) return;

        chat.lastProactiveToolAt = Date.now();
        chat.lastProactiveToolType = type;
        this.saveState();
    }

    addOrUpdateToolInActiveChat(toolName, toolData) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat || !toolData) return;

        if (!chat.tools[toolName]) chat.tools[toolName] = [];
        chat.tools[toolName].push(toolData);
        this.saveState();
    }

    logMoodToTracker(mood) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat?.tools?.mood_tracker?.[0]) return;

        chat.tools.mood_tracker[0].history = chat.tools.mood_tracker[0].history || [];
        chat.tools.mood_tracker[0].history.push({ mood, timestamp: new Date().toISOString() });
        chat.isHeightenedAwareness = ['Sad', 'Angry'].includes(mood);
        this.saveState();
    }

    completeAndRemoveChecklistItem(toolId, itemIndex, toolType = 'checklist', itemKey = 'items') {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat?.tools?.[toolType]) return null;

        const toolIndex = chat.tools[toolType].findIndex((entry) => entry.id === toolId);
        if (toolIndex === -1) return null;
        const list = chat.tools[toolType][toolIndex][itemKey];
        if (!Array.isArray(list)) return null;

        const [item] = list.splice(itemIndex, 1);
        if (!item) return null;

        if (list.length === 0) {
            chat.tools[toolType].splice(toolIndex, 1);
        }

        chat.completed_tasks = chat.completed_tasks || [];
        const completedLabel = item.text || item.action || item.when || 'Completed step';
        chat.completed_tasks.push(completedLabel);
        this.saveState();
        return completedLabel;
    }

    updateThoughtRecord(toolId, data) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat?.tools?.thought_record) return;

        const recordIndex = chat.tools.thought_record.findIndex((record) => record.id === toolId);
        if (recordIndex === -1) return;

        chat.tools.thought_record[recordIndex] = {
            ...chat.tools.thought_record[recordIndex],
            ...data
        };
        this.saveState();
    }

    getActiveChatTools() {
        return this.state.chats[this.state.activeChatId]?.tools || {};
    }

    getActiveChatHistory() {
        return this.state.chats[this.state.activeChatId]?.history || [];
    }

    getActiveChatId() {
        return this.state.activeChatId;
    }

    async preScreenMessage(message) {
        if (!this.state.chats[this.state.activeChatId]?.isHeightenedAwareness) return 'OK';
        const response = await _callLLM(PROMPTS.CRISIS_DETECTION.replace('%MESSAGE%', message), null, 'analysis');
        return response?.includes('CRISIS') ? 'CRISIS' : 'OK';
    }

    async triggerSafetyIntervention(message) {
        this.addOrUpdateToolInActiveChat(
            'breathing_exercise',
            await createToolByType('breathing_exercise')
        );

        const activeModel = getSelectedModelName();
        const responseSystemPrompt = buildResponseSystemPrompt(
            getEffectiveSystemPrompt(),
            activeModel
        );
        const prompt = `${responseSystemPrompt}
        ${PROMPTS.CRISIS_SUPPORT_REPLY.replace('%MESSAGE%', message)}`;
        const rawReply = await _callLLM(prompt);
        const recommendations = inferHighRiskSafetyRecommendations(message);
        const finalized = (await finalizeAssistantReply(rawReply, message)) ||
            "I hear you. Let's do a short breathing reset now. If you want, I can also look up nearby crisis resources.";
        return attachHighRiskSafetyRecommendations(finalized, recommendations);
    }

    checkForWithdrawalPattern() {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat?.lastUserMessageTimestamp) return false;

        const days = (Date.now() - chat.lastUserMessageTimestamp) / 86400000;
        return days > 3 ? { days: Math.round(days), reason: 'inactive' } : false;
    }

    async triggerReEngagement(pattern) {
        const prompt = PROMPTS.RE_ENGAGEMENT
            .replace('%DAYS%', pattern.days)
            .replace('%REASON%', pattern.reason);

        const rawReply = await _callLLM(prompt);
        const cleaned = await finalizeAssistantReply(rawReply, '');
        return cleaned;
    }
}

window.chatManager = new ChatManager();

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
    const response = await _callLLM(prompt, 'json');
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
        'json'
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

function buildEvidenceCatalog(report) {
    const rawEvidence = Array.isArray(report?.evidence) ? report.evidence : [];
    const fallbackEvidence = rawEvidence.length
        ? []
        : [
              ...(report?.searches || []).flatMap((search) => [
                  ...(search?.organic || []),
                  ...(search?.places || [])
              ]),
              ...(report?.news || [])
          ];
    const sourceEvidence = rawEvidence.length ? rawEvidence : fallbackEvidence;
    const deduped = [];
    const seen = new Set();

    sourceEvidence.forEach((entry) => {
        const url = entry?.link || null;
        const title = String(entry?.title || '').trim();
        const snippet = String(entry?.snippet || '').trim();
        if (!url && !title && !snippet) return;

        const dedupeKey = url || `${title}:${snippet}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        deduped.push({
            title: title || 'Untitled source',
            snippet,
            url,
            source: String(entry?.source || '').trim(),
            kind: String(entry?.kind || '').trim(),
            date: entry?.date || null,
            query: entry?.query || report?.primaryQuery || ''
        });
    });

    return deduped.slice(0, 12).map((entry, index) => ({
        id: index + 1,
        ...entry
    }));
}

function stripInlineSourceLine(text) {
    return normalizeReplyWhitespace(
        String(text || '')
            .split('\n')
            .filter((line) => !/^\s*Sources:\s*/i.test(line))
            .join('\n')
    );
}

function stripRoboticSourcePreamble(text) {
    return normalizeReplyWhitespace(
        String(text || '')
            .replace(/^\s*based on (?:the )?(?:information|sources|evidence|results)(?:\s+from\s+[^,.]+)?[,.]\s*/i, '')
            .replace(/\[(?:end of )?medgemma medical mode\]/gi, ' ')
    );
}

function normalizeComparisonText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function claimLooksSnippetLike(text, evidenceCatalog, evidenceIds = []) {
    const raw = String(text || '').trim();
    if (!raw) return true;
    if (raw.length < 24) return true;
    if (/\.{3,}|…/.test(raw)) return true;
    if (/[\|]/.test(raw)) return true;
    if (/^(see|read|learn|click)\b/i.test(raw)) return true;

    const normalizedClaim = normalizeComparisonText(raw);
    if (!normalizedClaim || normalizedClaim.length < 20) return true;

    const relevantEvidence = evidenceIds.length
        ? evidenceCatalog.filter((entry) => evidenceIds.includes(entry.id))
        : evidenceCatalog;
    const claimTokens = normalizedClaim.split(' ');
    const claimTokenSet = new Set(claimTokens);

    for (const entry of relevantEvidence) {
        const normalizedSnippet = normalizeComparisonText(entry?.snippet || '');
        const normalizedTitle = normalizeComparisonText(entry?.title || '');

        for (const sourceText of [normalizedSnippet, normalizedTitle]) {
            if (!sourceText) continue;
            if (sourceText.includes(normalizedClaim) && normalizedClaim.length >= 36) return true;

            const sourceTokens = sourceText.split(' ');
            if (!sourceTokens.length) continue;
            const shared = sourceTokens.filter((token) => claimTokenSet.has(token)).length;
            const overlapRatio = shared / Math.max(1, claimTokens.length);
            if (claimTokens.length >= 9 && overlapRatio >= 0.88) return true;
        }
    }

    return false;
}

function cleanEvidenceSnippet(value) {
    return normalizeReplyWhitespace(
        String(value || '')
            .replace(/\.{3,}|…/g, '.')
            .replace(/\s+\|\s+.*$/g, '')
            .replace(/\b(read more|learn more|click here)\b.*$/i, '')
    );
}

function getQuestionFocus(message = '') {
    const text = String(message || '').toLowerCase();
    if (/\b(cause|causes|caused|why|risk factor|risk factors)\b/.test(text)) return 'causes';
    if (/\b(symptom|symptoms|identify|spot|recognize|tell if|warning signs|red flags)\b/.test(text)) return 'signs';
    if (/\b(treat|treatment|therapy|medication|manage|help)\b/.test(text)) return 'care';
    if (/\b(types?|classes?|kinds?|categories?|how many)\b/.test(text)) return 'types';
    if (/\b(link|relationship|connection|related|overlap)\b/.test(text)) return 'relationship';
    return 'general';
}

function evidenceMatchesFocus(text, focus) {
    const value = String(text || '').toLowerCase();
    const focusPatterns = {
        causes: /\b(cause|causes|caused|risk|genetic|family|brain|chemical|environment|stress|trigger)\b/,
        signs: /\b(symptom|sign|heart|breath|sweat|trembl|fear|dizziness|chest|nausea|episode|attack)\b/,
        care: /\b(treat|treatment|therapy|medication|manage|support|care|doctor|clinician)\b/,
        types: /\b(type|class|bipolar i|bipolar ii|cyclothym|category|categories)\b/,
        relationship: /\b(link|relationship|connection|comorbid|overlap|associated|risk)\b/,
        general: /./
    };
    return (focusPatterns[focus] || focusPatterns.general).test(value);
}

function extractEvidenceFactCandidates(userMessage, evidenceCatalog) {
    const focus = getQuestionFocus(userMessage);
    const candidates = [];
    const seen = new Set();

    (evidenceCatalog || []).forEach((entry) => {
        const sourceText = cleanEvidenceSnippet(entry.snippet || entry.title || '');
        if (!sourceText) return;

        const fragments = sourceText
            .split(/(?<=[.!?])\s+|;\s+/)
            .map((fragment) => cleanEvidenceSnippet(fragment))
            .filter((fragment) => fragment.length >= 45)
            .filter((fragment) => evidenceMatchesFocus(fragment, focus));

        const usableFragments = fragments.length ? fragments : [sourceText].filter((fragment) => fragment.length >= 45);
        usableFragments.forEach((fragment) => {
            const key = normalizeComparisonText(fragment).slice(0, 160);
            if (!key || seen.has(key)) return;
            seen.add(key);
            candidates.push(fragment);
        });
    });

    return candidates.slice(0, 4);
}

function makeSentence(value) {
    const text = normalizeReplyWhitespace(value);
    if (!text) return '';
    return /[.!?]$/.test(text) ? text : `${text}.`;
}

function buildEvidenceAnswerFromFragments(userMessage, evidenceCatalog) {
    const facts = extractEvidenceFactCandidates(userMessage, evidenceCatalog)
        .map(makeSentence)
        .filter(Boolean);

    if (!facts.length) return '';

    const focus = getQuestionFocus(userMessage);
    const openingByFocus = {
        causes: "It usually is not one single cause. The clearest picture is a mix of vulnerability and triggers.",
        signs: "The main thing to look for is a sudden shift: the person may seem intensely frightened or overwhelmed, and their body may look like it has gone into alarm mode.",
        care: "The useful way to think about treatment is that it usually needs both symptom relief and prevention, not just a one-time fix.",
        types: "The cleanest way to answer it is by separating the main categories first, then looking at what makes each one different.",
        relationship: "The relationship is real, but it is not usually a simple one-way cause. It is more of an overlap where each condition can make the other harder to manage.",
        general: "The most useful way to frame it is this:"
    };

    return normalizeReplyWhitespace([
        openingByFocus[focus] || openingByFocus.general,
        facts.slice(0, 3).join(' '),
        facts.length > 3 ? facts[3] : ''
    ].filter(Boolean).join('\n\n'));
}

function cleanSourceLabel(label) {
    return String(label || '')
        .replace(/[\[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildSourcesLineFromEvidenceIds(evidenceIds, evidenceCatalog) {
    const links = evidenceIds
        .map((id) => evidenceCatalog.find((entry) => entry.id === id))
        .filter(Boolean)
        .filter((entry) => entry.url)
        .map((entry) => {
            const label = cleanSourceLabel(entry.source || entry.title || `Source ${entry.id}`);
            return `[${label}](${entry.url})`;
        });

    if (links.length === 0) return '';
    return `Sources: ${links.join(', ')}`;
}

function buildHumanFallbackAnswer(userMessage, route = 'GeneralFriendAgent') {
    const focus = getQuestionFocus(userMessage);
    const text = String(userMessage || '').toLowerCase();

    if (focus === 'signs') {
        return "Look for a sudden change from the person’s normal state. With panic or intense anxiety, that can look like fast breathing, shaking, sweating, chest tightness, dizziness, nausea, a racing heart, feeling trapped, or saying they feel like they might die or lose control.\n\nThe most helpful response is usually calm and simple: stay with them, lower stimulation if you can, remind them it will pass, and help them slow their breathing. If symptoms look medically serious, especially chest pain, fainting, one-sided weakness, severe shortness of breath, or this is new for them, treat it as a medical concern and get urgent help.";
    }

    if (focus === 'causes') {
        return "It is usually not one single cause. A better way to think about it is vulnerability plus triggers: biology, family history, sleep, stress, substances, health changes, and life events can all interact.\n\nThat matters because it means the goal is not blame. The useful move is to look for patterns: when it happens, what changed beforehand, how sleep has been, what stressors are active, and whether anything makes it better or worse.";
    }

    if (focus === 'types') {
        return "The cleanest way to answer is to separate the main categories first, then explain what makes each one different. In mental-health topics, those categories usually depend on the pattern, duration, severity, and how much daily life is affected.\n\nA clinician would not rely on the label alone. They would look at the timeline, symptoms, sleep, functioning, risk, and whether there have been episodes before.";
    }

    if (focus === 'care') {
        return "The practical approach is usually two-part: handle what is happening right now, then reduce the chance it keeps happening. That can mean calming the immediate symptoms, tracking patterns, protecting sleep, reducing obvious triggers, and getting professional help when symptoms are recurring, risky, or disrupting daily life.";
    }

    if (route.includes('Search')) {
        return "I do not want to pretend certainty where details matter. The safest way to answer is to separate what is stable from what needs checking: the broad pattern can be explained, but anything current, local, legal, or very specific should be verified before acting on it.";
    }

    return "The useful way to think about it is to stay with the actual pattern rather than jump to a label. What changed, how intense it is, how long it lasts, what makes it better or worse, and whether it affects safety or daily life usually matter more than a quick one-line answer.";
}

function buildDeterministicSearchFallback(userMessage, evidenceCatalog, preferences = DEFAULT_RESPONSE_PREFERENCES) {
    if (!evidenceCatalog.length) {
        return buildHumanFallbackAnswer(userMessage, 'SearchAgent');
    }

    const fragmentAnswer = buildEvidenceAnswerFromFragments(userMessage, evidenceCatalog);
    if (fragmentAnswer) {
        const sourcesLine = buildSourcesLineFromEvidenceIds(
            evidenceCatalog.filter((entry) => entry.url).slice(0, 4).map((entry) => entry.id),
            evidenceCatalog
        );
        return normalizeReplyWhitespace(`${fragmentAnswer}${sourcesLine ? `\n\n${sourcesLine}` : ''}`);
    }

    const topEvidence = evidenceCatalog[0];
    const topSnippet = String(topEvidence.snippet || '').trim();
    const naturalFallback = topSnippet && !claimLooksSnippetLike(topSnippet, evidenceCatalog, [topEvidence.id])
        ? topSnippet
        : buildMinimumEvidenceAnswer(userMessage, evidenceCatalog);
    const sourcesLine = buildSourcesLineFromEvidenceIds(
        evidenceCatalog.filter((entry) => entry.url).slice(0, 4).map((entry) => entry.id),
        evidenceCatalog
    );

    return normalizeReplyWhitespace(
        `${naturalFallback}${sourcesLine ? `\n\n${sourcesLine}` : ''}`
    );
}

function buildMinimumEvidenceAnswer(userMessage, evidenceCatalog) {
    return buildEvidenceAnswerFromFragments(userMessage, evidenceCatalog) ||
        "I would treat this as something that needs a careful, plain-English answer rather than a quick guess. The safest read from the available information is that there are several moving parts, so the next step is to look at the pattern, timing, severity, and what changed recently.";
}

function removeImmediateAssistantEcho(reply) {
    const artifacts = splitReplyArtifacts(reply);
    const body = normalizeReplyWhitespace(artifacts.body);
    if (!body || typeof window === 'undefined' || !window.chatManager) return reply;

    const latestAi = getLatestMessageByRole(window.chatManager.getActiveChatHistory(), 'ai');
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
    turnSupport = null
) {
    const cleanReply = removeImmediateAssistantEcho(await finalizeAssistantReply(rawReply, userMessage));
    if (!cleanReply) return null;
    if (!recommendation) return cleanReply;

    const augmented = attachProactiveToolTag(cleanReply, recommendation);
    if (!containsToolTag(cleanReply) && containsToolTag(augmented)) {
        chatManager.markProactiveToolUsed(recommendation.type);
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
    turnSupport = null
) {
    const cleanReply = await finalizeReplyWithProactiveTool(
        rawReply,
        userMessage,
        proactiveRecommendation,
        route,
        preferences,
        turnSupport
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
    const turnSupport = deriveHeuristicTurnSupport(userMessage, baseRoute, chatHistory);
    const contextualUserMessage = buildContextualUserMessage(userMessage, chatHistory, turnSupport);
    const route = deriveHeuristicRoute(contextualUserMessage);

    return {
        name: 'ReceptionAgent',
        baseRoute,
        turnSupport,
        contextualUserMessage,
        route
    };
}

function runPreferenceAgent(contextualUserMessage) {
    const adaptivePreferences = deriveHeuristicResponsePreferences(
        contextualUserMessage,
        chatManager.getActiveResponsePreferences()
    );
    chatManager.updateResponsePreferences(adaptivePreferences);

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

async function runToolUseAgent(userMessage, effectiveRoute, adaptivePreferences) {
    const proactiveRecommendation = await inferProactiveToolOpportunity(
        userMessage,
        effectiveRoute,
        adaptivePreferences
    );

    return {
        name: 'ToolUseAgent',
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
    turnSupport
}) {
    const effectiveUserMessage = contextualUserMessage || userMessage;

    return {
        name: 'MemoryAgent',
        vectorContext: await chatManager.searchVectorData(effectiveUserMessage),
        historyStr: modelHistoryStr,
        memoryContext: buildAuraMemoryContext(profileStr, conversationSummary),
        continuityContext: buildContinuityContext(chatHistory, effectiveUserMessage, turnSupport)
    };
}

function runTurnProfileAgent({
    effectiveRoute,
    sourceNeedDecision,
    adaptivePreferences,
    turnSupport,
    documentText,
    workflowStages
}) {
    const turnProfile = [
        buildAuraTurnProfile({
            route: effectiveRoute,
            sourceDecision: sourceNeedDecision,
            preferences: adaptivePreferences,
            turnSupport,
            documentText
        }),
        buildAgentWorkflowLine(workflowStages)
    ].filter(Boolean).join('\n');

    return {
        name: 'TurnProfileAgent',
        turnProfile
    };
}

async function buildAuraAgentContext(userMessage, documentText = null) {
    const activeModel = getSelectedModelName();
    const responseSystemPrompt = buildResponseSystemPrompt(getEffectiveSystemPrompt(), activeModel);
    const profileStr = JSON.stringify(chatManager.getCombinedContentStore(), null, 2);
    const runtimeContext = getRuntimeContextString();
    const chatHistory = chatManager.getActiveChatHistory();
    const conversationSummary = await chatManager.getConversationSummary();
    const modelHistoryStr = buildModelSafeHistoryString(chatHistory);
    const workflowStages = [];

    const reception = runReceptionAgent(userMessage, chatHistory);
    workflowStages.push(reception);

    const preference = runPreferenceAgent(reception.contextualUserMessage);
    workflowStages.push(preference);

    const evidence = runEvidenceDecisionAgent(reception.contextualUserMessage, reception.route);
    workflowStages.push(evidence);

    const safety = runSafetyAgent(userMessage);
    workflowStages.push(safety);

    const toolUse = await runToolUseAgent(
        userMessage,
        evidence.effectiveRoute,
        preference.adaptivePreferences
    );
    workflowStages.push(toolUse);

    const memory = await runMemoryAgent({
        profileStr,
        conversationSummary,
        chatHistory,
        contextualUserMessage: reception.contextualUserMessage,
        userMessage,
        modelHistoryStr,
        turnSupport: reception.turnSupport
    });
    workflowStages.push(memory);

    const profile = runTurnProfileAgent({
        effectiveRoute: evidence.effectiveRoute,
        sourceNeedDecision: evidence.sourceNeedDecision,
        adaptivePreferences: preference.adaptivePreferences,
        turnSupport: reception.turnSupport,
        documentText,
        workflowStages
    });
    workflowStages.push(profile);

    return {
        activeModel,
        responseSystemPrompt,
        profileStr,
        runtimeContext,
        chatHistory,
        conversationSummary,
        modelHistoryStr,
        baseRoute: reception.baseRoute,
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
        historyStr: memory.historyStr,
        memoryContext: memory.memoryContext,
        continuityContext: memory.continuityContext,
        turnProfile: profile.turnProfile,
        documentText,
        workflowStages
    };
}

async function runKnowledgeComposerAgent(context) {
    if (!context.effectiveRoute.includes('Knowledge')) return null;

    const key = await _callLLM(
        PROMPTS.KNOWLEDGE_MAPPER.replace('%MESSAGE%', context.contextualUserMessage),
        null,
        'analysis'
    );

    if (key && key !== 'NULL') {
        const content = await fetchMarkdownContent(key.toLowerCase());
        if (content) {
            return (
                (await finalizeAgenticReply(
                    await _callLLM(buildAuraDirectPrompt({
                        systemPrompt: context.responseSystemPrompt,
                        turnProfile: context.turnProfile,
                        runtimeContext: context.runtimeContext,
                        memoryContext: `${context.memoryContext}\n\nKnowledge base material:\n${content}`,
                        continuityContext: context.continuityContext,
                        history: context.historyStr,
                        vectorContext: context.vectorContext,
                        toolGuidance: context.proactiveToolGuidance,
                        userMessage: context.contextualUserMessage,
                        documentText: context.documentText
                    })),
                    context.originalUserMessage || context.contextualUserMessage,
                    context.proactiveRecommendation,
                    context.highRiskRecommendations,
                    context.effectiveRoute,
                    context.adaptivePreferences,
                    context.turnSupport
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
        const renderedReplyBody = evidenceCatalog.length
            ? await _callLLM(buildAuraEvidencePrompt({
                systemPrompt: context.responseSystemPrompt,
                turnProfile: context.turnProfile,
                runtimeContext: context.runtimeContext,
                memoryContext: context.memoryContext,
                continuityContext: context.continuityContext,
                history: context.historyStr,
                vectorContext: context.vectorContext,
                evidenceCatalog,
                userMessage: context.contextualUserMessage
            }))
            : buildDeterministicSearchFallback(
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
                context.turnSupport
            )) ||
            attachHighRiskSafetyRecommendations(
                buildHumanFallbackAnswer(context.contextualUserMessage, context.effectiveRoute),
                context.highRiskRecommendations
            )
        );
    } catch (error) {
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
        toolGuidance: context.proactiveToolGuidance,
        userMessage: context.contextualUserMessage || context.originalUserMessage,
        documentText: context.documentText
    });

    return (await finalizeAgenticReply(
        await _callLLM(finalPrompt),
        context.originalUserMessage || context.contextualUserMessage,
        context.proactiveRecommendation,
        context.highRiskRecommendations,
        context.effectiveRoute,
        context.adaptivePreferences,
        context.turnSupport
    )) || attachHighRiskSafetyRecommendations(
        buildHumanFallbackAnswer(context.contextualUserMessage || context.originalUserMessage, context.effectiveRoute),
        context.highRiskRecommendations
    );
}

async function runToolFollowUpAgent(toolFollowUp) {
    const activeModel = getSelectedModelName();
    const responseSystemPrompt = buildResponseSystemPrompt(getEffectiveSystemPrompt(), activeModel);
    const profileStr = JSON.stringify(chatManager.getCombinedContentStore(), null, 2);
    const runtimeContext = getRuntimeContextString();
    const chatHistory = chatManager.getActiveChatHistory();
    const conversationSummary = await chatManager.getConversationSummary();
    const modelHistoryStr = buildModelSafeHistoryString(chatHistory);
    const turnSupport = deriveHeuristicTurnSupport('', 'GeneralFriendAgent', chatHistory);
    const toolPreferences = chatManager.getActiveResponsePreferences();
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

    const rawReply = await _callLLM(prompt);
    return (await finalizeReplyWithProactiveTool(
        rawReply,
        '',
        null,
        'GeneralFriendAgent',
        toolPreferences,
        turnSupport
    )) ||
        "Nice progress. If you want, we can build on this and handle the next step together.";
}

async function runAuraAgentPipeline(userMessage, documentText = null) {
    const context = await buildAuraAgentContext(userMessage, documentText);
    context.originalUserMessage = userMessage;

    const knowledgeReply = await runKnowledgeComposerAgent(context);
    if (knowledgeReply) return knowledgeReply;

    const evidenceReply = await runEvidenceComposerAgent(context);
    if (evidenceReply) return evidenceReply;

    return runDirectComposerAgent(context);
}

async function getOllamaResponse(userMessage, toolFollowUp = null, documentText = null) {
    if (toolFollowUp) return runToolFollowUpAgent(toolFollowUp);
    return runAuraAgentPipeline(userMessage, documentText);
}
