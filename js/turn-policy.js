(function initializeTurnPolicy(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_TURN_POLICY = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createTurnPolicy() {
    const STOP_WORDS = new Set([
        'about', 'after', 'again', 'also', 'and', 'are', 'because', 'been', 'before',
        'being', 'but', 'can', 'could', 'does', 'for', 'from', 'have', 'help', 'how',
        'into', 'just', 'like', 'more', 'should', 'that', 'the', 'then', 'there',
        'all', 'any', 'did', 'get', 'has', 'her', 'him', 'its', 'not', 'now', 'our',
        'out', 'she', 'they', 'this', 'through', 'too', 'use', 'want', 'was', 'what',
        'when', 'where', 'which', 'who', 'why', 'with', 'would', 'you', 'your'
    ]);
    const IMMEDIATE_TOOL_TYPES = new Set(['breathing_exercise']);
    const PROFILE_TOPIC_GROUPS = [
        ['breakfast', 'dinner', 'lunch', 'meal', 'recipe', 'cook', 'food', 'eat', 'vegetarian', 'vegan', 'dietary', 'allergy', 'gluten', 'halal', 'kosher'],
        ['work', 'office', 'job', 'career', 'coworker', 'meeting', 'shift', 'remote', 'focus', 'drained', 'exhausted', 'workplace'],
        ['daughter', 'son', 'child', 'children', 'parenting'],
        ['partner', 'wife', 'husband', 'spouse', 'dating', 'relationship'],
        ['friend', 'friendship'],
        ['family', 'mother', 'father', 'parent', 'sister', 'brother', 'sibling'],
        ['travel', 'trip', 'flight', 'hotel', 'holiday', 'vacation', 'passport'],
        ['sleep', 'bedtime', 'insomnia', 'tired', 'fatigue', 'morning', 'night']
    ];

    function normalizeToken(token) {
        return String(token || '')
            .toLowerCase()
            .replace(/[^a-z0-9'-]/g, '')
            .replace(/'(?:s|re|ve|ll|d|m)$/g, '');
    }

    function getTopicTokens(value) {
        return String(value || '')
            .split(/\s+/)
            .map(normalizeToken)
            .filter((token) => token.length >= 4 && !STOP_WORDS.has(token));
    }

    function getProfileTokens(value) {
        return String(value || '')
            .split(/\s+/)
            .map(normalizeToken)
            .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));
    }

    function tokensAreRelated(left, right) {
        if (left === right) return true;
        if (left.length < 5 || right.length < 5) return false;
        return left.slice(0, 5) === right.slice(0, 5);
    }

    function countTopicLinks(message, history = []) {
        const currentTokens = getTopicTokens(message);
        const recentTokens = getTopicTokens(
            history
                .slice(-4)
                .map((entry) => entry?.content || '')
                .join(' ')
        );

        return currentTokens.filter((token) =>
            recentTokens.some((recentToken) => tokensAreRelated(token, recentToken))
        ).length;
    }

    function matchesProfileTopicGroup(query, value) {
        const queryTokens = getProfileTokens(query);
        const valueTokens = getProfileTokens(value);
        return PROFILE_TOPIC_GROUPS.some((group) => {
            const queryMatch = queryTokens.some((token) =>
                group.some((topic) => tokensAreRelated(token, topic))
            );
            const valueMatch = valueTokens.some((token) =>
                group.some((topic) => tokensAreRelated(token, topic))
            );
            return queryMatch && valueMatch;
        });
    }

    function matchesShortNamedEntity(query, value) {
        const queryWords = new Set(normalizeText(query).split(' ').filter(Boolean));
        const names = [...String(value || '').matchAll(/\b(?:named|called)\s+([A-Z][a-z]{2})\b/g)];
        return names
            .map((match) => match[1].toLowerCase())
            .some((name) => queryWords.has(name));
    }

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function excludeCurrentTurn(history = [], message = '', { forceTrailingUser = false } = {}) {
        const prior = Array.isArray(history) ? [...history] : [];
        const last = prior[prior.length - 1];
        if (last?.role !== 'user') return prior;

        const sameMessage = normalizeText(last.content) === normalizeText(message);
        if (forceTrailingUser || (normalizeText(message) && sameMessage)) prior.pop();
        return prior;
    }

    function resolveContinuity({ message = '', history = [] } = {}) {
        const text = String(message || '').trim();
        const lower = text.toLowerCase();
        const priorHistory = excludeCurrentTurn(history, text);
        const hasHistory = priorHistory.some((entry) => String(entry?.content || '').trim());

        if (!hasHistory || !text) {
            return {
                mode: 'new_topic',
                confidence: 1,
                usePriorTurn: false,
                reason: hasHistory ? 'Empty current turn.' : 'No prior conversation.'
            };
        }

        if (/\b(new topic|different question|something else|unrelated|change(?:ing)? the subject)\b/i.test(text)) {
            return {
                mode: 'new_topic',
                confidence: 0.98,
                usePriorTurn: false,
                reason: 'The user explicitly changed topics.'
            };
        }

        if (hasContextRejection(text)) {
            return {
                mode: 'new_topic',
                confidence: 0.96,
                usePriorTurn: false,
                reason: 'The user rejected the prior framing or stored context.'
            };
        }

        const topicLinks = countTopicLinks(text, priorHistory);
        const ambiguousReference = /\b(it|this|that|them|those|these|they|there|the same)\b/i.test(text);
        const explicitFollowUp = /^(and|also|but|so|then|what about|how about|why|how come|go on|tell me more)\b/i.test(text);
        const shortQuestionFollowUp = /^(who|what|when|where|why|how)\??$/i.test(text);
        const continuationRequest = /\b(continue|expand|elaborate|more detail|what next|next step)\b/i.test(text);
        const dependentQuestion =
            /^(what|how|where|when|which)\s+(should|could|can|do|would)\s+(i|we|it|that)\b/i.test(text) &&
            text.split(/\s+/).length <= 12;

        if (
            topicLinks > 0 ||
            explicitFollowUp ||
            shortQuestionFollowUp ||
            continuationRequest ||
            dependentQuestion ||
            (ambiguousReference && text.split(/\s+/).length <= 18)
        ) {
            return {
                mode: 'follow_up',
                confidence: topicLinks > 0 ? 0.88 : 0.78,
                usePriorTurn: true,
                reason: topicLinks > 0
                    ? 'The current turn shares a meaningful topic with recent chat.'
                    : 'The wording explicitly depends on recent chat.'
            };
        }

        return {
            mode: 'new_topic',
            confidence: 0.82,
            usePriorTurn: false,
            reason: `No reliable link to the recent topic${lower.endsWith('?') ? ' was found' : ''}.`
        };
    }

    function resolveStance({ message = '', route = '' } = {}) {
        const text = String(message || '').toLowerCase();
        const emotional = /\b(feel|feeling|afraid|anxious|angry|hurt|lonely|sad|scared|stressed|overwhelmed|worried)\b/.test(text);
        const rigidConclusion = [
            /\b(always|never|everyone|nobody|nothing|everything)\b.*\b(fail|hate|judge|bad|wrong|pointless|incompetent|worthless|doomed)\b/,
            /\b(no point|definitely going to fail|cannot do anything right|i am a failure|i'm a failure)\b/,
            /\b(there is no other explanation|it can only mean)\b/
        ].some((pattern) => pattern.test(text));
        const uncertainPremise = /\b(i think|i assume|maybe|probably|seems like|must mean|might mean)\b/.test(text);
        const personalPreference = /\b(i prefer|i like|i dislike|my favorite|works best for me|i value)\b/.test(text);

        if (rigidConclusion) {
            return {
                mode: 'challenge',
                intensity: 'gentle',
                validateEmotionFirst: true,
                reason: 'A rigid or unsupported conclusion may be working against the user.'
            };
        }

        if (personalPreference) {
            return {
                mode: 'support',
                intensity: 'balanced',
                validateEmotionFirst: false,
                reason: 'A harmless personal preference does not need correction.'
            };
        }

        if (uncertainPremise) {
            return {
                mode: 'explore',
                intensity: 'gentle',
                validateEmotionFirst: emotional,
                reason: 'The premise is uncertain, so curiosity is more useful than correction.'
            };
        }

        return {
            mode: emotional || /Cbt|Crisis/i.test(route) ? 'support' : 'explore',
            intensity: emotional ? 'gentle' : 'balanced',
            validateEmotionFirst: emotional,
            reason: emotional
                ? 'The user needs understanding before guidance.'
                : 'No material claim needs correction.'
        };
    }

    function isExplicitToolRequest(message = '') {
        const text = String(message || '').toLowerCase().trim();
        if (!text) return false;
        const toolNoun = /\b(checklist|check list|tracker|mood log|thought record|affirmation card|breathing exercise|breathing reset|grounding exercise|safety plan|crisis plan|medication checklist|meds checklist|appointment prep|follow-?up plan|check-?in plan|support card|tool)\b/;
        const directAction = /\b(make|create|build|set up|open|start|add|prepare|give me)\b/;
        const requestLead = /\b(can you|could you|can we|could we|please|let'?s|i need|i want|i would like|i'd like|help me)\b/;

        if (directAction.test(text) && toolNoun.test(text)) return true;
        if (requestLead.test(text) && toolNoun.test(text)) return true;
        return /\b(can we|could we|please|help me)\b.*\b(track|log|monitor|keep track)\b/.test(text);
    }

    function hasToolRefusal(message = '') {
        const text = String(message || '').toLowerCase().trim();
        if (!text) return false;

        return [
            /\b(no|without)(?:\s+(?:a|any))?\s+(?:tool|card|checklist|tracker|plan)\b/,
            /\b(?:do not|don't|dont)\s+(?:want|need)\s+(?:a|any|the)?\s*(?:tool|card|checklist|tracker|plan)\b/,
            /\b(?:do not|don't|dont)\s+(?:make|create|build|open|start|add|offer|suggest|use|give)\b/,
            /\bjust\s+(?:answer|respond|reply|talk|listen)\b/,
            /\b(?:answer|respond|reply)\s+(?:only|without (?:a|any) tool)\b/
        ].some((pattern) => pattern.test(text));
    }

    function hasImmediateGroundingNeed(message = '') {
        const text = String(message || '').toLowerCase().trim();
        if (!text) return false;

        const directSignals = [
            /\b(?:can(?:not|'t)|unable to)\s+breathe\b/,
            /\bhyperventilat(?:e|ing|ed|ion)\b/,
            /\bheart (?:is )?racing\b/,
            /\b(?:calm|ground)\s+me(?:\s+down)?\b/,
            /\bi(?:'m| am)\s+panick(?:ing|ed)?\b/,
            /\bi(?:'m| am)\s+having\s+(?:a|an)\s+(?:panic|anxiety)\s+attack\b/
        ].some((pattern) => pattern.test(text));
        const currentEpisode =
            /\b(?:right now|currently|happening now)\b/.test(text) &&
            /\b(?:panic|anxiety attack|breath|hyperventilat|heart racing)\b/.test(text);

        return directSignals || currentEpisode;
    }

    function hasContextRejection(message = '') {
        const text = String(message || '').toLowerCase().trim();
        if (!text) return false;

        return [
            /\bstop\s+(?:connecting|linking|relating|comparing|bringing)\b/,
            /\b(?:do not|don't|dont)\s+(?:connect|link|relate|compare|use|mention|bring up)\b/,
            /\bleave\s+(?:the\s+)?(?:old|past|previous|earlier)\b.*\bout\b/,
            /\b(?:this|it)\s+(?:is not|isn't|was not|wasn't)\s+about\b/,
            /\bthis\s+is\s+(?:someone|something|a person|a situation)\s+(?:new|different)\b/
        ].some((pattern) => pattern.test(text));
    }

    function resolveInitiative({
        toolCandidate = null,
        explicitToolRequest = false,
        immediateSupportNeed = false,
        hasActiveTool = false,
        recentlyDeclinedTool = false
    } = {}) {
        const type = String(toolCandidate?.type || '').trim();
        const confidence = Number(toolCandidate?.confidence) || 0;

        if (!type || confidence < 0.65) {
            return {
                initiative: {
                    mode: 'respond',
                    reason: 'No useful tool clears the confidence threshold.'
                },
                tool: { mode: 'none', type: null }
            };
        }

        if (explicitToolRequest) {
            return {
                initiative: {
                    mode: 'act',
                    reason: 'The user explicitly requested the tool.'
                },
                tool: { mode: 'create', type }
            };
        }

        if (hasActiveTool || recentlyDeclinedTool) {
            return {
                initiative: {
                    mode: 'respond',
                    reason: hasActiveTool
                        ? 'A similar tool is already active.'
                        : 'The user recently declined this tool.'
                },
                tool: { mode: 'none', type: null }
            };
        }

        if (immediateSupportNeed && IMMEDIATE_TOOL_TYPES.has(type)) {
            return {
                initiative: {
                    mode: 'act',
                    reason: 'Immediate grounding support is useful in the current moment.'
                },
                tool: { mode: 'create', type }
            };
        }

        return {
            initiative: {
                mode: 'offer',
                reason: 'The tool could reduce friction, but the user should choose whether to create it.'
            },
            tool: { mode: 'offer', type }
        };
    }

    function selectRelevantMemories({
        query = '',
        matches = [],
        chatId = '',
        explicitRecall = false,
        continuity = null,
        maxItems = 2
    } = {}) {
        const cleanQuery = String(query || '').trim();
        const normalizedQuery = normalizeText(cleanQuery);
        const queryTokens = getTopicTokens(cleanQuery);
        if (!normalizedQuery) return [];
        if (!explicitRecall && hasContextRejection(cleanQuery)) return [];
        if (!explicitRecall && continuity?.usePriorTurn && queryTokens.length === 0) return [];

        return (Array.isArray(matches) ? matches : [])
            .filter((entry) => {
                const text = String(entry?.text || '').trim();
                if (!text || normalizeText(text) === normalizedQuery) return false;
                const memoryChatId = String(entry?.provenance?.chatId || '');
                if (chatId && memoryChatId && memoryChatId !== String(chatId)) return false;
                if (explicitRecall) return true;
                return countTopicLinks(cleanQuery, [{ content: text }]) > 0;
            })
            .sort((left, right) => {
                const leftDistance = Number.isFinite(Number(left?.distance))
                    ? Number(left.distance)
                    : Number.POSITIVE_INFINITY;
                const rightDistance = Number.isFinite(Number(right?.distance))
                    ? Number(right.distance)
                    : Number.POSITIVE_INFINITY;
                return leftDistance - rightDistance;
            })
            .slice(0, Math.max(0, Math.min(3, Number(maxItems) || 2)))
            .map((entry) => ({
                ...entry,
                relevance: explicitRecall ? 'explicit_recall' : 'topic_match'
            }));
    }

    function selectProfileEntries(query, values, maxItems = 4, allowTopicGroups = true) {
        return (Array.isArray(values) ? values : [])
            .map((value) => String(value || '').trim())
            .filter(Boolean)
            .filter((value) => (
                countTopicLinks(query, [{ content: value }]) > 0 ||
                (allowTopicGroups && (
                    matchesProfileTopicGroup(query, value) ||
                    matchesShortNamedEntity(query, value)
                ))
            ))
            .slice(0, maxItems);
    }

    function buildRelevantProfileBundle({
        query = '',
        activeProfile = null,
        durableProfile = null,
        includeDurable = false
    } = {}) {
        const active = activeProfile && typeof activeProfile === 'object' ? activeProfile : {};
        const durable = durableProfile && typeof durableProfile === 'object' ? durableProfile : {};
        const rejectStoredContext = hasContextRejection(query);
        const buildFacts = (profile) => ({
            behavioralFacts: rejectStoredContext
                ? []
                : selectProfileEntries(query, profile.behavioralFacts, 6),
            moodPatterns: rejectStoredContext
                ? []
                : selectProfileEntries(query, profile.moodPatterns, 4),
            potentialLapses: rejectStoredContext
                ? []
                : selectProfileEntries(query, profile.potentialLapses, 3, false)
        });

        return {
            communicationStyle: String(active.communicationStyle || durable.communicationStyle || '').trim(),
            responsePreferences: active.responsePreferences && typeof active.responsePreferences === 'object'
                ? { ...active.responsePreferences }
                : {},
            activeChat: buildFacts(active),
            durableUserMemory: includeDurable ? buildFacts(durable) : null
        };
    }

    function resolveReEngagement({
        lastUserMessageAt = 0,
        lastReengagementAt = 0,
        now = Date.now()
    } = {}) {
        const lastUser = Number(lastUserMessageAt) || 0;
        const lastReengagement = Number(lastReengagementAt) || 0;
        const currentTime = Number(now) || Date.now();
        if (!lastUser || lastReengagement >= lastUser) return null;

        const days = (currentTime - lastUser) / 86400000;
        if (days <= 3) return null;
        return { days: Math.round(days), reason: 'inactive' };
    }

    function resolveTurnPolicy(options = {}) {
        const continuity = resolveContinuity(options);
        const stance = resolveStance(options);
        const initiativeDecision = resolveInitiative(options);

        return {
            continuity,
            stance,
            initiative: initiativeDecision.initiative,
            tool: initiativeDecision.tool,
            context: {
                usePriorTurn: continuity.usePriorTurn,
                priority: ['current_turn', 'recent_chat', 'personal_memory', 'response_examples']
            }
        };
    }

    return {
        resolveContinuity,
        resolveStance,
        excludeCurrentTurn,
        isExplicitToolRequest,
        hasToolRefusal,
        hasImmediateGroundingNeed,
        hasContextRejection,
        resolveInitiative,
        selectRelevantMemories,
        buildRelevantProfileBundle,
        resolveReEngagement,
        resolveTurnPolicy
    };
});
