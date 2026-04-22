const STORAGE_KEYS = {
    STATE: 'aura_app_state',
    PROMPT: 'aura_system_prompt',
    MODEL: 'aura_model_name',
    THEME: 'aura_theme',
    LOCATION_ENABLED: 'aura_location_enabled',
    LOCATION_CONTEXT: 'aura_location_context'
};

const API_ENDPOINTS = {
    ollamaGenerate: `${window.AURA_CONFIG.ollamaBaseUrl}/generate`,
    storeMemory: `${window.AURA_CONFIG.apiBaseUrl}/store_memory`,
    searchMemory: `${window.AURA_CONFIG.apiBaseUrl}/search_memory`,
    osint: `${window.AURA_CONFIG.apiBaseUrl}/osint`
};

const TOOL_TAG_PATTERN = /<tool_create[^>]*\/?>/gi;
const TOOL_TYPES = new Set(['mood_tracker', 'checklist', 'thought_record', 'affirmation_card', 'breathing_exercise']);
const DETAIL_LEVELS = new Set(['brief', 'balanced', 'detailed']);
const REASSURANCE_LEVELS = new Set(['low', 'medium', 'high']);
const TECHNICAL_LEVELS = new Set(['plain', 'mixed', 'technical']);
const STRUCTURE_LEVELS = new Set(['paragraphs', 'mixed', 'stepwise']);
const DIRECTNESS_LEVELS = new Set(['soft', 'balanced', 'direct']);
const FOLLOW_UP_LEVELS = new Set(['none', 'gentle', 'active']);

const DEFAULT_RESPONSE_PREFERENCES = {
    detailLevel: 'balanced',
    reassuranceLevel: 'medium',
    technicalLevel: 'plain',
    structureLevel: 'paragraphs',
    directnessLevel: 'balanced',
    followUpLevel: 'gentle',
    likelyTone: 'neutral'
};

const PROMPTS = {
    DEFAULT_SYSTEM: `You are Aura, a human-sounding companion people can use for everyday life, support, research, learning, planning, and health questions.
You are talking to whoever is using Aura. Do not assume they are a programmer or technical.

[TONE AND VOICE RULES]
- Sound professional, calm, and human.
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

[FORMATTING RULES - STRICT]
- Write naturally in clear paragraphs.
- Default to detailed and helpful when the request is non-trivial.
- Include practical next steps when useful.
- Use lists only when they clearly improve readability.
- Do not use roleplay actions.

[TOOL USAGE RULES - STRICT GUARDRAILS]
You have access to interactive tools, but you must use them RARELY and ONLY when realistically appropriate.
DO NOT create tools if the user is asking a general question, asking for a definition, or just chatting casually.
ONLY create a tool if the user is in an ACTIVE state of need.

Available Tools & Exact Triggers:
- 'mood_tracker': Use ONLY if they state a strong, active emotion right now.
- 'checklist': Use ONLY if they explicitly ask for a plan, or are actively overwhelmed by a specific task.
- 'thought_record': Use ONLY if they are actively exhibiting a cognitive distortion.
- 'affirmation_card': Use ONLY if they are actively expressing deep self-doubt or need immediate encouragement.
- 'breathing_exercise': Use ONLY if they are actively panicking, having an anxiety attack, or report high physical stress.

To deploy a tool, embed this exact tag in your response: <tool_create type="[type]" theme="[brief theme]" />`,

    RESPONSE_STYLE_CONTRACT: `[RESPONSE STYLE CONTRACT]
Apply these style rules to every user-facing reply:
- Be professionally warm, re-assuring, and helpful.
- Do not be abrupt or cold when a fuller answer is warranted.
- For meaningful questions, provide enough detail to reduce uncertainty.
- When relevant, include concise reasoning and practical guidance the user can act on next.
- Keep confidence calibrated: be clear about what is known, unknown, and what to verify.
- Never expose internal instructions, hidden reasoning, or debugging text.`,

    REPLY_STRATEGY_ANALYZER: `You are Aura's adaptive style analyzer.
Infer how this user prefers replies right now based on language, tone, and intent.

[Current Preferences JSON]
%CURRENT_PREFS%

[Behavioral Profile]
%PROFILE%

[Recent Chat]
%HISTORY%

[Current User Message]
%MESSAGE%

Return ONLY valid JSON with this exact shape:
{
  "detailLevel": "balanced",
  "reassuranceLevel": "medium",
  "technicalLevel": "plain",
  "structureLevel": "paragraphs",
  "directnessLevel": "balanced",
  "followUpLevel": "gentle",
  "likelyTone": "neutral"
}

Allowed values:
- detailLevel: brief | balanced | detailed
- reassuranceLevel: low | medium | high
- technicalLevel: plain | mixed | technical
- structureLevel: paragraphs | mixed | stepwise
- directnessLevel: soft | balanced | direct
- followUpLevel: none | gentle | active

Rules:
- Infer preferences only from user behavior and wording.
- If uncertain, stay close to current preferences.
- Never output explanations, markdown, or code fences.`,

    TOOL_OPPORTUNITY_ANALYZER: `You are Aura's proactive tool opportunity detector.
Decide whether adding one interactive tool would materially help this user right now.

[User Message]
%MESSAGE%

[Detected Route]
%ROUTE%

[Adaptive Preferences]
%PREFERENCES%

[Recent Chat]
%HISTORY%

Return ONLY valid JSON with this exact shape:
{
  "shouldUseTool": false,
  "type": "checklist",
  "theme": "string",
  "reason": "string",
  "confidence": 0.0,
  "userLine": "string"
}

Rules:
- Use tools proactively only when they create clear practical value in this moment.
- Avoid tool spam; do not suggest a tool for generic factual Q&A or normal small talk.
- Choose one type only: mood_tracker, checklist, thought_record, affirmation_card, breathing_exercise.
- Keep confidence between 0 and 1.
- userLine should be one natural sentence that introduces the tool helpfully.
- Do not include markdown code fences or commentary.`,

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

    ROUTER: `Analyze the user's message and route it to the correct agent.
[Behavioral Profile]: %PROFILE%
[Runtime Context]: %RUNTIME%
[Message]: "%USER_MESSAGE%"

Routes:
1. CrisisAgent: Suicidal ideation, self-harm, severe active distress.
2. CbtAnalystAgent: Active negative thoughts, exhibiting cognitive distortions, needing behavioral reframing.
3. PlannerAgent: Goal setting, task planning, overcoming executive dysfunction.
4. KnowledgeAgent: Asking for general definitions, facts about mental health, or psychoeducation.
5. SearchAgent: Needs open-source research, current facts, verification, local places, organizations, people, companies, timelines, or source-backed real-world details.
6. GeneralFriendAgent: Default chat, empathy, standard conversation, or unclear intent.

Respond ONLY with the exact route name.`,

    BEHAVIOR_ANALYZER: `You are Aura's background profiling agent.
Update the user's behavioral profile based on the recent chat history.
Focus on updating: communicationStyle, moodPatterns, potentialLapses, and behavioralFacts.
[Current Profile]: %STORE%
[Recent Chat]: %HISTORY%
Respond ONLY with the updated JSON object matching the input structure.`,

    SEARCH_PLAN: `You are Aura's OSINT planning agent.
Turn the user message into a compact JSON search plan.

[Behavioral Profile]: %PROFILE%
[Runtime Context]: %RUNTIME%
[User Message]: "%MESSAGE%"

Return ONLY valid JSON with this exact shape:
{
  "primaryQuery": "string",
  "supportingQueries": ["string"],
  "includeNews": true,
  "reason": "string"
}

Rules:
- Keep the primary query concise and specific.
- supportingQueries must contain 0 to 2 distinct strings that add missing context or verification angles.
- Set includeNews to true when freshness matters.
- If the user needs nearby crisis help, use "emergency mental health crisis hotline near me" as the primaryQuery.
- Do not include markdown, commentary, or code fences.`,

    SEARCH_EVIDENCE_EXTRACTOR: `You are Aura's evidence extraction engine.
Turn the research evidence into strictly supported answer content.

[User Message]
%MESSAGE%

[Behavioral Profile]
%PROFILE%

[Runtime Context]
%RUNTIME%

[Evidence Catalog JSON]
%EVIDENCE%

Return ONLY valid JSON with this exact shape:
{
  "directAnswer": "string",
  "supportedClaims": [
    {
      "text": "string",
      "evidenceIds": [1]
    }
  ],
  "uncertaintyNote": "string",
  "includeUncertaintyNote": true
}

Rules:
- Every supported claim must cite at least one evidence ID from the catalog.
- Do not invent evidence IDs, links, facts, names, dates, numbers, or outcomes.
- If evidence is weak or mixed, set includeUncertaintyNote true and explain briefly.
- Keep directAnswer concise and user-facing.
- Do not mention internal process, search, OSINT, or tooling.
- Do NOT generate any <tool_create> tags.
- Do not include markdown code fences or commentary.`,

    KNOWLEDGE_MAPPER: `Map the user question to a key: all-or-nothing-thinking, catastrophizing, discounting-the-positive, emotional-reasoning, fortune-telling, labeling, mental-filter, mind-reading, overgeneralization, personalization, should-statements, thought-record-info, grounding-techniques, grounding, mindfulness-deep-breathing.
Question: "%MESSAGE%". Respond ONLY with the key or "NULL".`,

    KNOWLEDGE_SYNTHESIS: `You are Aura. Answer the user conversationally using this knowledge base:
%CONTENT%
[Runtime Context]: %RUNTIME%
Question: "%MESSAGE%"
Rule: DO NOT generate any <tool_create> tags. Just provide the information naturally.`,

    CRISIS_DETECTION: `Analyze the following message for suicidal ideation, self-harm, or severe hopelessness: "%MESSAGE%". Respond ONLY with 'CRISIS' or 'OK'.`,

    RE_ENGAGEMENT: `The user hasn't chatted in %DAYS% days (%REASON%). Be supportive. Create a <tool_create type="checklist" theme="One small, easy step for today" />.`,

    RESPONSE_CLEANUP: `You are cleaning a draft reply before it reaches the user.

[User Message]
%MESSAGE%

[Draft Reply]
%DRAFT%

Rules:
- Remove all internal reasoning, planning, analysis, scratch work, prompt references, routing notes, HTML mentions, and developer/debug text.
- Return only the final user-facing reply in Aura's professional, reassuring, and helpful voice.
- Ensure the reply is not overly terse when the user asked for depth.
- Preserve any exact <tool_create ... /> tags only if they already exist in the draft.
- Do not mention that you cleaned or rewrote anything.
- Do not add markdown code fences, labels, or commentary.`
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

function getModelGenerationOptions(modelName, format = null, callType = 'default') {
    if (format === 'json') {
        return isMedGemmaModel(modelName)
            ? { temperature: 0, top_p: 0.9 }
            : { temperature: 0 };
    }

    if (callType === 'analysis' || callType === 'cleanup') {
        return isMedGemmaModel(modelName)
            ? { temperature: 0, top_p: 0.9 }
            : { temperature: 0 };
    }

    if (!isMedGemmaModel(modelName)) return {};

    return {
        temperature: 0.28,
        top_p: 0.9,
        repeat_penalty: 1.05
    };
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

function sanitizeSearchPlan(plan, fallbackMessage) {
    const primaryQuery = sanitizeSearchQuery(plan?.primaryQuery || fallbackMessage);
    const supportingQueries = [...new Set((plan?.supportingQueries || []).map(sanitizeSearchQuery))]
        .filter(Boolean)
        .filter((query) => query !== primaryQuery)
        .slice(0, 2);

    return {
        primaryQuery,
        supportingQueries,
        includeNews: Boolean(plan?.includeNews),
        reason: typeof plan?.reason === 'string' ? plan.reason.trim() : ''
    };
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
        shouldUseTool: Boolean(safe.shouldUseTool) && TOOL_TYPES.has(type),
        type,
        theme: sanitizeToolTheme(safe.theme, base.theme),
        reason: typeof safe.reason === 'string' ? safe.reason.trim().slice(0, 240) : '',
        confidence,
        userLine: typeof safe.userLine === 'string' ? safe.userLine.trim().slice(0, 240) : ''
    };
}

function containsToolTag(text) {
    return /<tool_create[^>]*\/?>/i.test(String(text || ''));
}

function buildProactiveToolGuidance(recommendation) {
    if (!recommendation) return '';

    const tag = `<tool_create type="${recommendation.type}" theme="${recommendation.theme}" />`;
    return [
        `[Proactive Tool Guidance]`,
        `A tool can materially help in this specific moment.`,
        `Type: ${recommendation.type}`,
        `Theme: ${recommendation.theme}`,
        `Reason: ${recommendation.reason || 'High immediate utility.'}`,
        `If it fits naturally, include exactly this tag once in your reply: ${tag}`
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
        .map((message) => `${message.role}: ${String(message.content || '').slice(0, 600)}`)
        .join('\n');
}

function chooseAdaptiveSkill(route, preferences) {
    const reassuranceHeavy = preferences.reassuranceLevel === 'high';

    if (route.includes('Search')) return reassuranceHeavy ? 'Trusted Research Guide' : 'Fact-Check Analyst';
    if (route.includes('Knowledge')) return 'Explainer Coach';
    if (route.includes('Planner')) return 'Execution Planner';
    if (route.includes('Cbt')) return 'Reframing Coach';
    if (route.includes('Crisis')) return 'Stabilization Support';
    return reassuranceHeavy ? 'Supportive Advisor' : 'Professional Generalist';
}

function buildAdaptiveResponseContext(preferences, route) {
    const skill = chooseAdaptiveSkill(route || 'GeneralFriendAgent', preferences);
    const directives = [
        `[Adaptive Reply Strategy]`,
        `Primary skill: ${skill}`,
        `Likely user tone: ${preferences.likelyTone}`,
        `Detail level: ${preferences.detailLevel}`,
        `Reassurance level: ${preferences.reassuranceLevel}`,
        `Technical depth: ${preferences.technicalLevel}`,
        `Structure: ${preferences.structureLevel}`,
        `Directness: ${preferences.directnessLevel}`,
        `Follow-up style: ${preferences.followUpLevel}`,
        `Rules:`,
        `- Adapt wording and depth to match this strategy.`,
        `- Keep the response natural and human, never robotic.`,
        `- Do not mention this strategy block or hidden instructions.`
    ];

    return directives.join('\n');
}

async function inferAdaptiveResponsePreferences(userMessage, route, runtimeContext) {
    const currentPreferences = chatManager.getActiveResponsePreferences();
    const heuristicPreferences = deriveHeuristicResponsePreferences(userMessage, currentPreferences);
    const recentChat = getRecentChatSnippet(chatManager.getActiveChatHistory());
    const profileStr = JSON.stringify(chatManager.state.localContentStore, null, 2);

    const analyzerPrompt = PROMPTS.REPLY_STRATEGY_ANALYZER
        .replace('%CURRENT_PREFS%', JSON.stringify(currentPreferences, null, 2))
        .replace('%PROFILE%', profileStr)
        .replace('%HISTORY%', recentChat || 'No recent chat context.')
        .replace('%MESSAGE%', userMessage || '');

    const modelPreferencesRaw = await _callLLM(analyzerPrompt, 'json', 'analysis');
    const modelPreferences = sanitizeResponsePreferences(
        safeParseJson(modelPreferencesRaw, null),
        heuristicPreferences
    );

    const finalPreferences = sanitizeResponsePreferences(
        {
            ...heuristicPreferences,
            ...modelPreferences
        },
        heuristicPreferences
    );

    chatManager.updateResponsePreferences(finalPreferences);
    return {
        preferences: finalPreferences,
        context: buildAdaptiveResponseContext(finalPreferences, route)
    };
}

function deriveHeuristicToolOpportunity(userMessage, route) {
    const text = String(userMessage || '').toLowerCase();

    if (!text.trim()) return sanitizeToolOpportunity(null);
    if (route.includes('Search') || route.includes('Knowledge')) return sanitizeToolOpportunity(null);

    if (/\b(panic|panic attack|can't breathe|hyperventilat|heart racing right now)\b/.test(text)) {
        return sanitizeToolOpportunity({
            shouldUseTool: true,
            type: 'breathing_exercise',
            theme: 'Calming reset',
            reason: 'Immediate physiological regulation can help.',
            confidence: 0.9,
            userLine: 'Let me open a short breathing reset you can use right now.'
        });
    }

    if (/\b(overwhelmed|too much|can't keep up|i'm stuck|need a plan|organize)\b/.test(text)) {
        return sanitizeToolOpportunity({
            shouldUseTool: true,
            type: 'checklist',
            theme: 'One-step-at-a-time plan',
            reason: 'Task decomposition reduces overload and improves execution.',
            confidence: 0.85,
            userLine: 'I can set up a quick checklist so this feels more manageable immediately.'
        });
    }

    if (/\b(i'm worthless|i hate myself|i'm a failure|not good enough|can't do anything right)\b/.test(text)) {
        return sanitizeToolOpportunity({
            shouldUseTool: true,
            type: 'affirmation_card',
            theme: 'Self-worth reinforcement',
            reason: 'Helpful for active self-critical loops.',
            confidence: 0.8,
            userLine: 'I can also create a short grounding affirmation card for this moment.'
        });
    }

    if (/\b(always|never|everyone thinks|i know it will fail|i'm doomed)\b/.test(text)) {
        return sanitizeToolOpportunity({
            shouldUseTool: true,
            type: 'thought_record',
            theme: 'Reality-check reframing',
            reason: 'Useful when cognitive distortion patterns are active.',
            confidence: 0.75,
            userLine: 'I can open a quick thought-record to help unpack this pattern step by step.'
        });
    }

    if (/\b(feel terrible|really low|sad all day|angry all day|my mood)\b/.test(text)) {
        return sanitizeToolOpportunity({
            shouldUseTool: true,
            type: 'mood_tracker',
            theme: 'Mood trend check-in',
            reason: 'Tracking can clarify patterns and triggers.',
            confidence: 0.7,
            userLine: 'If helpful, I can open a quick mood tracker so we can spot patterns.'
        });
    }

    return sanitizeToolOpportunity(null);
}

async function inferProactiveToolOpportunity(userMessage, route, adaptivePreferences) {
    const heuristic = deriveHeuristicToolOpportunity(userMessage, route);
    const recentChat = getRecentChatSnippet(chatManager.getActiveChatHistory());

    const analyzerPrompt = PROMPTS.TOOL_OPPORTUNITY_ANALYZER
        .replace('%MESSAGE%', userMessage || '')
        .replace('%ROUTE%', route || 'GeneralFriendAgent')
        .replace('%PREFERENCES%', JSON.stringify(adaptivePreferences || DEFAULT_RESPONSE_PREFERENCES, null, 2))
        .replace('%HISTORY%', recentChat || 'No recent chat context.');

    const modelSuggestionRaw = await _callLLM(analyzerPrompt, 'json', 'analysis');
    const modelSuggestion = sanitizeToolOpportunity(safeParseJson(modelSuggestionRaw, null));

    const candidate = modelSuggestion.shouldUseTool && modelSuggestion.confidence >= heuristic.confidence
        ? modelSuggestion
        : heuristic;

    if (!candidate.shouldUseTool) return null;
    if (candidate.confidence < 0.65) return null;
    if (!chatManager.canUseProactiveTool(candidate.type)) return null;

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

function stripThinkingTags(text) {
    return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, ' ');
}

function isMetaInstructionLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return true;

    return [
        /^(?:thought|analysis|reasoning|plan)\b[:\s-]/i,
        /^the user wants me to\b/i,
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
        /^\[?(?:behavioral profile|runtime context|system context|current session history|relevant past memories|current profile|recent chat|draft reply|user message)\]?[:\]]/i,
        /^\d+\.\s+/,
        /^[-*]\s+/
    ].some((pattern) => pattern.test(trimmed));
}

function stripMetaPreface(text) {
    const cleaned = normalizeReplyWhitespace(stripThinkingTags(text));
    const lines = cleaned.split('\n');
    const keptLines = [];
    let started = false;
    const strongMetaBoundary = /^(?:thought|analysis|reasoning|plan)\b[:\s-]|^\[?(?:behavioral profile|runtime context|system context|current session history|relevant past memories|current profile|recent chat|draft reply|user message)\]?[:\]]/i;

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
        /(?:^|\n)\s*(?:thought|analysis|reasoning|plan)\b[:\s-]/i,
        /\bthe user wants me to\b/i,
        /\bi need to respond\b/i,
        /\bi should respond\b/i,
        /\bi must\b/i,
        /\buse the provided html structure\b/i,
        /\bbased on the prompt\b/i,
        /\bbehavioral profile\b/i,
        /\bruntime context\b/i,
        /\bsystem context\b/i,
        /\brespond only\b/i,
        /\breturn only\b/i
    ].some((pattern) => pattern.test(sample));
}

async function cleanupLeakedReply(rawReply, userMessage) {
    if (!rawReply) return null;

    return _callLLM(
        PROMPTS.RESPONSE_CLEANUP
            .replace('%MESSAGE%', userMessage || '')
            .replace('%DRAFT%', rawReply),
        null,
        'cleanup'
    );
}

async function finalizeAssistantReply(rawReply, userMessage = '') {
    if (!rawReply) return null;

    const toolTags = extractToolTags(rawReply);
    let cleanedBody = stripMetaPreface(stripToolTags(rawReply));

    if (looksLikeLeakedReasoning(rawReply) || looksLikeLeakedReasoning(cleanedBody)) {
        const rewrittenReply = await cleanupLeakedReply(stripToolTags(rawReply), userMessage);
        if (rewrittenReply) {
            cleanedBody = stripMetaPreface(stripToolTags(rewrittenReply));
        }
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

        return data.response?.trim() || null;
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
            localContentStore: {
                communicationStyle: 'Not yet established.',
                moodPatterns: [],
                potentialLapses: [],
                behavioralFacts: [],
                responsePreferences: { ...DEFAULT_RESPONSE_PREFERENCES }
            }
        };
    }

    ensureStateShape(state) {
        const safeState = state && typeof state === 'object' ? state : this.getInitialState();
        safeState.chats = safeState.chats && typeof safeState.chats === 'object' ? safeState.chats : {};
        safeState.localContentStore = safeState.localContentStore && typeof safeState.localContentStore === 'object'
            ? safeState.localContentStore
            : this.getInitialState().localContentStore;
        Object.values(safeState.chats).forEach((chat) => {
            if (!chat || typeof chat !== 'object') return;
            chat.history = Array.isArray(chat.history) ? chat.history : [];
            chat.tools = chat.tools && typeof chat.tools === 'object' ? chat.tools : {};
            chat.completed_tasks = Array.isArray(chat.completed_tasks) ? chat.completed_tasks : [];
            chat.isHeightenedAwareness = Boolean(chat.isHeightenedAwareness);
            chat.lastUserMessageTimestamp = Number(chat.lastUserMessageTimestamp) || Date.now();
            chat.lastProactiveToolAt = Number(chat.lastProactiveToolAt) || 0;
            chat.lastProactiveToolType = typeof chat.lastProactiveToolType === 'string' ? chat.lastProactiveToolType : '';
        });

        safeState.localContentStore.communicationStyle = safeState.localContentStore.communicationStyle || 'Not yet established.';
        safeState.localContentStore.moodPatterns = Array.isArray(safeState.localContentStore.moodPatterns)
            ? safeState.localContentStore.moodPatterns
            : [];
        safeState.localContentStore.potentialLapses = Array.isArray(safeState.localContentStore.potentialLapses)
            ? safeState.localContentStore.potentialLapses
            : [];
        safeState.localContentStore.behavioralFacts = Array.isArray(safeState.localContentStore.behavioralFacts)
            ? safeState.localContentStore.behavioralFacts
            : [];
        safeState.localContentStore.responsePreferences = sanitizeResponsePreferences(
            safeState.localContentStore.responsePreferences,
            DEFAULT_RESPONSE_PREFERENCES
        );

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
            lastProactiveToolType: ''
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
            this.vectorizeData(content, { role: 'user', timestamp });

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
            const data = await postJson(API_ENDPOINTS.searchMemory, { query });
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
            .map((message) => `${message.role}: ${message.content}`)
            .join('\n');

        const prompt = PROMPTS.BEHAVIOR_ANALYZER
            .replace('%STORE%', JSON.stringify(this.state.localContentStore))
            .replace('%HISTORY%', historyStr);

        const response = await _callLLM(prompt, 'json');
        const parsed = safeParseJson(response, null);

        if (parsed && typeof parsed === 'object') {
            const previousPreferences = this.getActiveResponsePreferences();
            this.state.localContentStore = parsed;
            this.state.localContentStore.responsePreferences = sanitizeResponsePreferences(
                parsed.responsePreferences,
                previousPreferences
            );
            this.saveState();
        }
    }

    getActiveResponsePreferences() {
        return sanitizeResponsePreferences(
            this.state.localContentStore.responsePreferences,
            DEFAULT_RESPONSE_PREFERENCES
        );
    }

    updateResponsePreferences(nextPreferences) {
        this.state.localContentStore.responsePreferences = sanitizeResponsePreferences(
            nextPreferences,
            this.getActiveResponsePreferences()
        );
        this.saveState();
    }

    canUseProactiveTool(type, minCooldownMs = 3 * 60 * 1000) {
        if (!TOOL_TYPES.has(type)) return false;
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat) return false;

        const now = Date.now();
        if (chat.lastProactiveToolAt && (now - chat.lastProactiveToolAt) < minCooldownMs) return false;

        const currentCount = Array.isArray(chat.tools?.[type]) ? chat.tools[type].length : 0;
        const maxPerType = type === 'checklist' ? 2 : 1;
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

    completeAndRemoveChecklistItem(toolId, itemIndex) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat?.tools?.checklist) return null;

        const checklistIndex = chat.tools.checklist.findIndex((list) => list.id === toolId);
        if (checklistIndex === -1) return null;

        const [item] = chat.tools.checklist[checklistIndex].items.splice(itemIndex, 1);
        if (chat.tools.checklist[checklistIndex].items.length === 0) {
            chat.tools.checklist.splice(checklistIndex, 1);
        }

        chat.completed_tasks = chat.completed_tasks || [];
        chat.completed_tasks.push(item.text);
        this.saveState();
        return item.text;
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

        const prompt = `User in distress: "${message}". Acknowledge calmly, direct to breathing tool.`;
        const rawReply = await _callLLM(prompt);
        return (await finalizeAssistantReply(rawReply, message)) || "I hear you. Let's use the breathing exercise together.";
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
        return finalizeAssistantReply(rawReply, '');
    }
}

window.chatManager = new ChatManager();

async function createToolByType(type, theme = '') {
    const templates = {
        mood_tracker: `{ "type": "mood_tracker", "id": "m-${Date.now()}", "title": "Mood Tracker", "options": ["Happy", "Okay", "Neutral", "Sad", "Angry"] }`,
        checklist: `{ "type": "checklist", "id": "c-${Date.now()}", "title": "${theme || 'Tasks'}", "items": [{"text": "First step", "done": false}] }`,
        thought_record: `{ "type": "thought_record", "id": "tr-${Date.now()}", "title": "Thought Record", "situation": "${theme}" }`,
        affirmation_card: `{ "type": "affirmation_card", "id": "a-${Date.now()}", "title": "Affirmation", "text": ["You got this."] }`,
        breathing_exercise: `{ "type": "breathing_exercise", "id": "b-${Date.now()}", "title": "Breathe", "cycle": {"inhale":4, "hold":4, "exhale":6} }`
    };

    if (!templates[type]) return null;

    const prompt = `Output ONLY this exact JSON object structure, filling in realistic data for the theme "${theme}": ${templates[type]}`;
    const response = await _callLLM(prompt, 'json');
    const parsed = safeParseJson(response, null);

    return parsed && typeof parsed === 'object' ? parsed : null;
}

async function buildSearchPlan(userMessage, profileStr, runtimeContext) {
    const response = await _callLLM(
        PROMPTS.SEARCH_PLAN
            .replace('%PROFILE%', profileStr)
            .replace('%RUNTIME%', runtimeContext)
            .replace('%MESSAGE%', userMessage),
        'json'
    );

    return sanitizeSearchPlan(safeParseJson(response, null), userMessage);
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

function sanitizeEvidenceExtractorResult(parsed, evidenceCount) {
    const normalized = parsed && typeof parsed === 'object' ? parsed : {};
    const supportedClaims = Array.isArray(normalized.supportedClaims) ? normalized.supportedClaims : [];
    const cleanClaims = supportedClaims
        .map((claim) => {
            const text = typeof claim?.text === 'string' ? claim.text.trim() : '';
            const evidenceIds = [...new Set((claim?.evidenceIds || [])
                .map((value) => Number(value))
                .filter((value) => Number.isInteger(value) && value >= 1 && value <= evidenceCount))];

            if (!text || evidenceIds.length === 0) return null;
            return { text, evidenceIds };
        })
        .filter(Boolean)
        .slice(0, 3);

    const directAnswer = typeof normalized.directAnswer === 'string' ? normalized.directAnswer.trim() : '';
    const uncertaintyNote = typeof normalized.uncertaintyNote === 'string' ? normalized.uncertaintyNote.trim() : '';
    const includeUncertaintyNote = Boolean(normalized.includeUncertaintyNote);

    return {
        directAnswer,
        supportedClaims: cleanClaims,
        uncertaintyNote,
        includeUncertaintyNote
    };
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

function buildEvidenceBackedReply(extracted, evidenceCatalog, preferences = DEFAULT_RESPONSE_PREFERENCES) {
    const evidenceIds = [...new Set(extracted.supportedClaims.flatMap((claim) => claim.evidenceIds))];
    const directAnswer = extracted.directAnswer || extracted.supportedClaims[0]?.text || '';
    const orderedClaims = extracted.supportedClaims
        .map((claim) => claim.text)
        .filter((text) => text && text !== directAnswer);
    const extraClaims = preferences.detailLevel === 'brief'
        ? orderedClaims.slice(0, 1)
        : orderedClaims;
    const responseParts = [];

    if (preferences.reassuranceLevel === 'high') {
        responseParts.push("Here's the most reliable answer I can confirm right now.");
    }

    if (directAnswer) responseParts.push(directAnswer);
    if (extraClaims.length) {
        const claimText = preferences.structureLevel === 'stepwise'
            ? extraClaims.map((claim, index) => `${index + 1}. ${claim}`).join('\n')
            : extraClaims.join(' ');
        responseParts.push(claimText);
    }
    if (extracted.includeUncertaintyNote && extracted.uncertaintyNote) {
        responseParts.push(extracted.uncertaintyNote);
    }

    if (preferences.followUpLevel === 'active') {
        responseParts.push('If you want, I can help apply this to your exact situation next.');
    }

    const fallbackEvidenceIds = evidenceIds.length
        ? evidenceIds
        : evidenceCatalog.filter((entry) => entry.url).slice(0, 2).map((entry) => entry.id);
    const sourcesLine = buildSourcesLineFromEvidenceIds(fallbackEvidenceIds, evidenceCatalog);
    const messageBody = normalizeReplyWhitespace(responseParts.join('\n\n'));

    if (!messageBody && !sourcesLine) return '';
    if (!sourcesLine) return messageBody;
    return normalizeReplyWhitespace(`${messageBody}\n\n${sourcesLine}`);
}

function buildDeterministicSearchFallback(evidenceCatalog, preferences = DEFAULT_RESPONSE_PREFERENCES) {
    if (!evidenceCatalog.length) {
        const lead = preferences.reassuranceLevel === 'high'
            ? "I know this is important, and I want to be accurate."
            : '';
        const core = "I can't verify this confidently from reliable live sources right now.";
        const next = "If you want, I can try again shortly and cross-check more references.";
        return normalizeReplyWhitespace([lead, core, next].filter(Boolean).join(' '));
    }

    const topEvidence = evidenceCatalog[0];
    const topSnippet = topEvidence.snippet || `I found a relevant source: ${topEvidence.title}.`;
    const sourcesLine = buildSourcesLineFromEvidenceIds(
        evidenceCatalog.filter((entry) => entry.url).slice(0, 2).map((entry) => entry.id),
        evidenceCatalog
    );

    return normalizeReplyWhitespace(
        `${topSnippet}${sourcesLine ? `\n\n${sourcesLine}` : ''}`
    );
}

async function finalizeReplyWithProactiveTool(rawReply, userMessage, recommendation = null) {
    const cleanReply = await finalizeAssistantReply(rawReply, userMessage);
    if (!cleanReply) return null;
    if (!recommendation) return cleanReply;

    const augmented = attachProactiveToolTag(cleanReply, recommendation);
    if (!containsToolTag(cleanReply) && containsToolTag(augmented)) {
        chatManager.markProactiveToolUsed(recommendation.type);
    }

    return augmented;
}

async function getOllamaResponse(userMessage, toolFollowUp = null, documentText = null) {
    const activeModel = getSelectedModelName();
    const responseSystemPrompt = buildResponseSystemPrompt(
        localStorage.getItem(STORAGE_KEYS.PROMPT) || PROMPTS.DEFAULT_SYSTEM,
        activeModel
    );
    const profileStr = JSON.stringify(chatManager.state.localContentStore, null, 2);
    const runtimeContext = getRuntimeContextString();

    if (toolFollowUp) {
        const toolPreferences = chatManager.getActiveResponsePreferences();
        const adaptiveContext = buildAdaptiveResponseContext(toolPreferences, 'GeneralFriendAgent');
        const prompt = `${responseSystemPrompt}
[Adaptive Strategy]:
${adaptiveContext}
[System Context]:
${runtimeContext}
[Profile]:
${profileStr}
[Note]: User interacted with tool: ${JSON.stringify(toolFollowUp)}`;

        const rawReply = await _callLLM(prompt);
        return (await finalizeReplyWithProactiveTool(rawReply, '', null)) ||
            "Nice progress. If you want, we can build on this and handle the next step together.";
    }

    const routePrompt = PROMPTS.ROUTER
        .replace('%PROFILE%', profileStr)
        .replace('%RUNTIME%', runtimeContext)
        .replace('%USER_MESSAGE%', userMessage);
    const route = (await _callLLM(routePrompt, null, 'analysis')) || 'GeneralFriendAgent';
    const { preferences: adaptivePreferences, context: adaptiveContext } = await inferAdaptiveResponsePreferences(
        userMessage,
        route,
        runtimeContext
    );
    const proactiveRecommendation = await inferProactiveToolOpportunity(userMessage, route, adaptivePreferences);
    const proactiveToolGuidance = buildProactiveToolGuidance(proactiveRecommendation);

    if (route.includes('Knowledge')) {
        const key = await _callLLM(PROMPTS.KNOWLEDGE_MAPPER.replace('%MESSAGE%', userMessage), null, 'analysis');
        if (key && key !== 'NULL') {
            const content = await fetchMarkdownContent(key.toLowerCase());
            if (content) {
                return (
                    (await finalizeReplyWithProactiveTool(
                        await _callLLM(
                            `${responseSystemPrompt}
[Adaptive Strategy]:
${adaptiveContext}
${proactiveToolGuidance ? `\n${proactiveToolGuidance}` : ''}

${PROMPTS.KNOWLEDGE_SYNTHESIS}`
                                .replace('%MESSAGE%', userMessage)
                                .replace('%RUNTIME%', runtimeContext)
                                .replace('%CONTENT%', content)
                        ),
                        userMessage,
                        proactiveRecommendation
                    )) || "I couldn't produce a solid answer on that attempt. Ask again and I'll give you a clearer, more complete explanation."
                );
            }
        }
    }

    if (route.includes('Search')) {
        try {
            const searchPlan = await buildSearchPlan(userMessage, profileStr, runtimeContext);
            const osintReport = await postJson(API_ENDPOINTS.osint, searchPlan);
            const evidenceCatalog = buildEvidenceCatalog(osintReport);
            const extractorPrompt = PROMPTS.SEARCH_EVIDENCE_EXTRACTOR
                .replace('%MESSAGE%', userMessage)
                .replace('%RUNTIME%', runtimeContext)
                .replace('%PROFILE%', profileStr)
                .replace('%EVIDENCE%', JSON.stringify(evidenceCatalog, null, 2));
            const extractedRaw = await _callLLM(extractorPrompt, 'json', 'analysis');
            const extracted = sanitizeEvidenceExtractorResult(safeParseJson(extractedRaw, null), evidenceCatalog.length);
            const renderedReply = buildEvidenceBackedReply(extracted, evidenceCatalog, adaptivePreferences) ||
                buildDeterministicSearchFallback(evidenceCatalog, adaptivePreferences);

            return (
                (await finalizeReplyWithProactiveTool(renderedReply, userMessage, proactiveRecommendation)) ||
                "I couldn't verify that as cleanly as I want just yet. Give me a moment and I can take another, more thorough pass."
            );
        } catch (error) {
            console.error('[SearchAgent] Full failure details:', error);
            return "I'm temporarily unable to verify that live right now. Please try again in a moment and I'll provide a source-backed answer.";
        }
    }

    const vectorContext = await chatManager.searchVectorData(userMessage);
    const historyStr = chatManager
        .getActiveChatHistory()
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n');

    let finalPrompt = `${responseSystemPrompt}
[Adaptive Strategy]:
${adaptiveContext}
${proactiveToolGuidance ? `\n${proactiveToolGuidance}` : ''}

[System Context]:
${runtimeContext}

[Behavioral Profile]: ${profileStr}

[Relevant Past Memories]:
${vectorContext || 'No specific past context found.'}

[Current Session History]:
${historyStr}

User: ${userMessage}`;

    if (documentText) finalPrompt += `\n[Doc Content]: ${documentText}`;

    return (await finalizeReplyWithProactiveTool(await _callLLM(finalPrompt), userMessage, proactiveRecommendation)) ||
        "I couldn't generate a high-quality response on that try. Ask again and I'll give you a clearer, more complete answer.";
}
