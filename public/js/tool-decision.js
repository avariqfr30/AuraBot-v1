(function initializeToolDecision(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_TOOL_DECISION = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createToolDecision() {
const TOOL_TYPES = new Set([
    'mood_tracker', 'checklist', 'thought_record', 'affirmation_card',
    'breathing_exercise', 'safety_plan', 'medication_checklist',
    'appointment_prep', 'follow_up_plan'
]);
const LOW_RISK_PROACTIVE_TYPES = new Set(TOOL_TYPES);
const CRISIS_ROUTE_PROACTIVE_TYPES = new Set(['breathing_exercise', 'checklist', 'safety_plan']);
const THEME_FILLER_WORDS = new Set([
    'please', 'make', 'create', 'build', 'open', 'give', 'checklist', 'tracker',
    'this', 'that', 'them', 'these', 'those', 'with', 'could', 'would', 'tomorrow'
]);

function sanitizeToolTheme(theme, fallback = 'Quick support') {
    const clean = String(theme || '')
        .replace(/["<>\\]/g, '')
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
        shouldUseTool: Boolean(safe.shouldUseTool) && TOOL_TYPES.has(safe.type) && LOW_RISK_PROACTIVE_TYPES.has(type),
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

function inferToolThemeFromConversation(
    userMessage,
    fallback = 'Quick support',
    recentConversationText = ''
) {
    const current = String(userMessage || '').toLowerCase();
    const topicWords = (current.match(/[a-z]{4,}/g) || []).filter((word) => !THEME_FILLER_WORDS.has(word));
    const useRecent = topicWords.length === 0 && /\b(this|that|it|them|these|those)\b/.test(current);
    const text = current + (useRecent ? ' ' + String(recentConversationText || '').toLowerCase() : '');

    if (/\bpanic|anxiety attack|breath|heart racing\b/.test(text)) return 'Panic support';
    if (/\badhd|focus|executive|task|procrastinat\b/.test(text)) return 'ADHD support';
    if (/\bbipolar|mood swing|mania|hypomania|depression\b/.test(text)) return 'Mood support';
    if (/\bmedication|meds|dose|pill|prescription\b/.test(text)) return 'Medication safety';
    if (/\bdoctor|clinician|therapist|psychiatrist|appointment\b/.test(text)) return 'Appointment prep';
    if (/\bshare|send|them|together\b/.test(text)) return 'Shared support';

    return fallback;
}

function applyApprovedToolPreferences(
    candidate,
    signals = [],
    { personalIntelligenceActive = false, explicitToolRequest = false, immediateSupportNeed = false } = {}
) {
    if (!candidate?.shouldUseTool || !personalIntelligenceActive ||
        explicitToolRequest || immediateSupportNeed) return candidate;
    const typeWords = {
        checklist: /\bchecklists?\b/,
        mood_tracker: /\b(?:mood trackers?|mood logs?)\b/,
        thought_record: /\b(?:thought records?|thought logs?)\b/,
        affirmation_card: /\b(?:affirmations?|encouragement cards?|support cards?)\b/,
        breathing_exercise: /\b(?:breathing exercises?|breathing resets?|breathwork)\b/,
        safety_plan: /\b(?:safety plans?|crisis plans?)\b/,
        medication_checklist: /\b(?:medication|meds|pill) checklists?\b/,
        appointment_prep: /\b(?:appointment|doctor|therapist) prep\b/,
        follow_up_plan: /\b(?:follow[- ]?up|check[- ]?in) plans?\b/
    };
    const target = typeWords[candidate.type];
    if (!target) return candidate;
    const avoided = (Array.isArray(signals) ? signals : []).some((signal) => {
        if (signal?.kind !== 'approved_memory' || signal.consent !== 'explicit' ||
            signal.status !== 'active') return false;
        const text = String(signal.value || '').toLowerCase();
        const mention = target.exec(text);
        if (!mention) return false;
        const before = text.slice(Math.max(0, mention.index - 70), mention.index);
        const after = text.slice(mention.index + mention[0].length, mention.index + mention[0].length + 45);
        const directAvoidance =
            /\b(?:do not|don't|never|prefer not to)\b.{0,40}\b(?:offer|suggest|make|create|use|show|open|give|want|need)\b.{0,20}$/.test(before) ||
            /\bavoid\b.{0,20}$/.test(before);
        const negativeExperience = /\b(?:not helpful|overwhelms? me|stresses? me out|makes? me anxious)\b/.test(after);
        return directAvoidance || negativeExperience;
    });
    return avoided ? null : candidate;
}

function deriveExplicitToolRequest(userMessage, recentConversationText = '') {
    const text = String(userMessage || '').toLowerCase();
    if (!text.trim()) return sanitizeToolOpportunity(null);
    if (isInformationalExplanationRequest(userMessage) &&
        !/\b(make|create|build|set up|open|start|add|prepare questions)\b/.test(text) &&
        !/\bprepare\b.{0,45}\b(?:doctor|therapist|psychiatrist|clinician|appointment)\b/.test(text)) {
        return sanitizeToolOpportunity(null);
    }

    const explicitAction = /\b(can you|could you|can we|could we|please|let'?s|make|create|build|set up|open|give me|start|add|prepare|prep|i need|i want|i would like|i'd like|help me make|help me create|help me set up|help me prepare|help me prep)\b/;
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
            ? `${inferToolThemeFromConversation(userMessage, 'Shared support', recentConversationText)} checklist`
            : `${inferToolThemeFromConversation(userMessage, 'Personal support', recentConversationText)} checklist`;
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
            `${inferToolThemeFromConversation(userMessage, 'Mood', recentConversationText)} tracker`,
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

    if (explicitAction.test(text) && /\b(affirmation|affirmation card|encouragement card|support card|self-worth card|kind reminder)\b/.test(text)) {
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

function deriveHeuristicToolOpportunity(
    userMessage,
    route,
    recentConversationText = '',
    { immediateSupportNeed = false } = {}
) {
    const text = String(userMessage || '').toLowerCase();

    if (!text.trim()) return sanitizeToolOpportunity(null);

    const explicitTool = deriveExplicitToolRequest(userMessage, recentConversationText);
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

    if (immediateSupportNeed) {
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
        /\b(?:i need|i want) to understand\b/,
        /\bhow do i (?:recognize|identify|spot|tell if)\b/,
        /\bwhat (?:are|were) the (?:signs|symptoms)\b/,
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

function shouldSuppress({
    message = '', route = '', explicitToolRequest = false,
    immediateSupportNeed = false, toolRefusal = false
} = {}) {
    const actionable = hasActionableToolIntent(message);
    if (toolRefusal) return true;
    if (explicitToolRequest || immediateSupportNeed) return false;
    if (/\b(?:just (?:need|want) to vent|let me vent|just listen|no advice|no solutions|don't need (?:advice|solutions))\b/i.test(message)) return true;
    if (isInformationalExplanationRequest(message)) return true;
    if (route.includes('Search') || route.includes('Knowledge')) return true;
    const currentNeed = /\b(?:right now|currently|i feel|i'm (?:struggling|overwhelmed|panicking|anxious|sad)|i am (?:struggling|overwhelmed|panicking|anxious|sad))\b/i.test(message);
    if (/\b(?:yesterday|last (?:night|week|month|year)|used to|back then|in the past)\b/i.test(message) &&
        !actionable && !currentNeed) return true;
    if (!actionable && !hasActivePersonalNeedSignal(message)) return true;
    return false;
}

return {
    TOOL_TYPES,
    LOW_RISK_PROACTIVE_TYPES,
    CRISIS_ROUTE_PROACTIVE_TYPES,
    sanitizeToolTheme,
    sanitizeOpportunity: sanitizeToolOpportunity,
    deriveExplicit: deriveExplicitToolRequest,
    deriveCandidate: deriveHeuristicToolOpportunity,
    applyApprovedToolPreferences,
    isInformationalExplanationRequest,
    hasActivePersonalNeedSignal,
    hasActionableToolIntent,
    shouldSuppress
};
});
