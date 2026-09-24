(function initializeResponseAdaptation(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_RESPONSE_ADAPTATION = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createResponseAdaptation() {
    function resolve({ message = '', route = '', history = [], continuity = null, stance = null } = {}) {
        const text = String(message || '').toLowerCase().trim();
        const previousAi = [...(Array.isArray(history) ? history : [])]
            .reverse()
            .find((entry) => entry?.role === 'ai' && String(entry.content || '').trim());
        const informational = /\b(?:what is|what are|explain|define|tell me about|how does|why does)\b/.test(text) &&
            !/\b(?:i feel|i'm|i am|my|me right now)\b/.test(text);
        const explicitVenting = /\b(?:just need to vent|let me vent|just listen|need you to listen|don'?t need (?:advice|solutions)|no (?:advice|solutions))\b/.test(text);
        const actionRequest = /\b(?:help me (?:make|build|organize|prepare|start)|make (?:me )?a plan|what should i do|next steps?|step[- ]by[- ]step|organize what|prepare what)\b/.test(text);
        const historical = /\b(?:last year|last month|years? ago|used to|back then|in the past|i am okay now|i'm okay now)\b/.test(text);
        const acuteDistress = !historical && (
            /\b(?:right now|currently|at this moment)\b.*\b(?:panic|panicking|spiral|can'?t cope|heart racing|can'?t breathe)\b/.test(text) ||
            /\b(?:i'm|i am) panicking\b|\bheart is racing\b|\bhelp me (?:calm down|slow down|breathe)\b/.test(text)
        );
        const emotionalDisclosure = !informational && /\b(?:i feel|i'm|i am|feeling|lonely|sad|hurt|afraid|scared|anxious|stressed|overwhelmed|hopeless)\b/.test(text);
        const lowBandwidth = acuteDistress || /\b(?:overwhelmed|too much|can'?t focus|cannot focus|exhausted|drained|one thing at a time|simple plan)\b/.test(text);
        const explicitDirect = /\b(?:be direct|tell me straight|straight answer|don'?t sugarcoat|do not sugarcoat|just tell me)\b/.test(text);
        const explicitGentle = /\b(?:be gentle|go easy on me|soften the answer)\b/.test(text);
        const noQuestions = explicitVenting || /\b(?:don'?t ask|do not ask|no questions|just answer)\b/.test(text);
        const clinicianContext = /\b(?:psychiatrist|therapist|psychologist|doctor|clinician|pharmacist|appointment)\b/.test(text);
        const urgentProfessional = /\b(?:hurt myself|kill myself|can'?t stay safe|cannot stay safe|overdose|severe chest pain)\b/.test(text);

        let primaryMode = route.includes('Search') ? 'research' : 'clarify';
        let secondaryMode = 'none';
        if (acuteDistress) {
            primaryMode = 'soothe';
            secondaryMode = route.includes('Search') ? 'research' : 'none';
        } else if (explicitVenting) {
            primaryMode = 'reflect';
        } else if (actionRequest) {
            primaryMode = 'coach';
            secondaryMode = emotionalDisclosure ? 'reflect' : 'clarify';
        } else if (emotionalDisclosure && !historical) {
            primaryMode = 'reflect';
            secondaryMode = 'clarify';
        } else if (informational || route.includes('Knowledge')) {
            primaryMode = 'clarify';
        }

        let followUpIntent = 'new_topic';
        if (/\b(?:more|deeper|elaborate|expand|go on)\b/.test(text)) followUpIntent = 'deepen';
        if (/\b(?:i mean|to be clear|clarify|what i meant)\b/.test(text)) followUpIntent = 'clarify';
        if (/\b(?:not quite|that'?s wrong|incorrect|i meant)\b/.test(text)) followUpIntent = 'correct';
        if (continuity?.repair) followUpIntent = 'correct';
        if (/\b(?:are you sure|but isn'?t|that seems wrong|why would)\b/.test(text)) followUpIntent = 'challenge';
        if (continuity?.usePriorTurn && followUpIntent === 'new_topic' && previousAi) followUpIntent = 'continue';
        const topicShift = continuity?.mode === 'new_topic' && Boolean(previousAi);
        if (continuity?.mode === 'follow_up' && followUpIntent === 'new_topic') followUpIntent = 'continue';

        const distressLevel = acuteDistress ? 'high' : (emotionalDisclosure && !historical ? 'medium' : 'low');
        const reassuranceNeed = acuteDistress ? 'high' : (emotionalDisclosure && !historical ? 'medium' : 'low');
        const structureNeed = actionRequest ? 'high' : (lowBandwidth ? 'medium' : 'low');
        const cognitiveBandwidth = lowBandwidth ? 'low' : (informational ? 'high' : 'medium');
        const directnessTolerance = explicitDirect
            ? 'direct'
            : (explicitGentle || acuteDistress ? 'soft' : 'balanced');
        const questioningLevel = noQuestions || acuteDistress
            ? 'none'
            : (/\b(?:help me understand myself|spot a pattern|figure out why)\b/.test(text)
                ? 'exploratory'
                : 'one_if_needed');
        const professionalBridge = urgentProfessional
            ? 'early'
            : (clinicianContext && actionRequest ? 'consider' : 'none');

        const responseGoals = [];
        if (primaryMode === 'research') responseGoals.push('Answer with evidence-backed clarity');
        if (primaryMode === 'clarify') responseGoals.push('Explain directly in plain language');
        if (primaryMode === 'soothe') responseGoals.push('Help stabilize the immediate moment before expanding');
        if (primaryMode === 'reflect') responseGoals.push(
            explicitVenting
                ? 'Make space for the user without rushing into solutions'
                : 'Show specific understanding before offering guidance'
        );
        if (primaryMode === 'coach') responseGoals.push('Turn the answer into a manageable next step');
        if (followUpIntent !== 'new_topic') responseGoals.push('Continue the thread without restarting it');
        if (structureNeed === 'high') responseGoals.push('Keep the structure easy to follow');
        if (stance?.mode === 'challenge') {
            responseGoals.push('Validate the feeling, then gently test the unsupported conclusion');
        }
        if (professionalBridge === 'consider') {
            responseGoals.push('Help the user prepare for professional support without implying diagnosis');
        }

        return {
            primaryMode,
            secondaryMode,
            followUpIntent,
            topicShift,
            distressLevel,
            reassuranceNeed,
            structureNeed,
            directnessTolerance,
            cognitiveBandwidth,
            questioningLevel,
            professionalBridge,
            responseGoals: responseGoals.slice(0, 6)
        };
    }

    return { resolve };
});
