(function initializeFeedbackLearning(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_FEEDBACK = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createFeedbackLearning() {
    const FEEDBACK_VERSION = 'aura-feedback-v1';
    const RATINGS = new Set(['unrated', 'helpful', 'not_helpful']);
    const REASON_DEFINITIONS = [
        { id: 'incorrect', label: 'Inaccurate' },
        { id: 'missed_context', label: 'Missed context' },
        { id: 'too_long', label: 'Too long' },
        { id: 'too_short', label: 'Too short' },
        { id: 'more_direct', label: 'Be more direct' },
        { id: 'more_gentle', label: 'Be more gentle' },
        { id: 'more_structure', label: 'Make it easier to scan' },
        { id: 'unwanted_tool', label: 'Tool was not useful' },
        { id: 'other', label: 'Other' }
    ];
    const REASON_IDS = new Set(REASON_DEFINITIONS.map((entry) => entry.id));
    const DETAIL_LEVELS = new Set(['brief', 'balanced', 'detailed']);
    const DIRECTNESS_LEVELS = new Set(['soft', 'balanced', 'direct']);
    const STRUCTURE_LEVELS = new Set(['paragraphs', 'mixed', 'stepwise']);

    function cleanText(value, maxLength) {
        return String(value || '')
            .replace(/\0/g, '')
            .trim()
            .slice(0, maxLength);
    }

    function normalizeReasons(value) {
        return [...new Set((Array.isArray(value) ? value : [])
            .map((reason) => String(reason || '').trim())
            .filter((reason) => REASON_IDS.has(reason)))];
    }

    function normalizeRouteSnapshot(value) {
        const safe = value && typeof value === 'object' ? value : {};
        const risk = ['low', 'medium', 'high'].includes(safe.risk) ? safe.risk : 'unknown';
        const domain = ['general', 'medical'].includes(safe.domain) ? safe.domain : 'unknown';

        return {
            modelName: cleanText(safe.modelName, 160),
            modelFamily: cleanText(safe.modelFamily, 40),
            reviewerModel: cleanText(safe.reviewerModel, 160),
            route: cleanText(safe.route, 80),
            task: cleanText(safe.task, 80),
            domain,
            risk,
            thinkingMode: cleanText(safe.thinkingMode, 32),
            source: cleanText(safe.source, 40)
        };
    }

    function normalizePreferenceOverrides(value) {
        const safe = value && typeof value === 'object' ? value : {};
        const normalized = {};
        if (DETAIL_LEVELS.has(safe.detailLevel)) normalized.detailLevel = safe.detailLevel;
        if (DIRECTNESS_LEVELS.has(safe.directnessLevel)) normalized.directnessLevel = safe.directnessLevel;
        if (STRUCTURE_LEVELS.has(safe.structureLevel)) normalized.structureLevel = safe.structureLevel;
        return normalized;
    }

    function normalizeEntry(value, fallbackId = '') {
        if (!value || typeof value !== 'object') return null;
        const messageId = cleanText(value.messageId || fallbackId, 120);
        const chatId = cleanText(value.chatId, 120);
        if (!messageId || !chatId) return null;

        return {
            id: cleanText(value.id || `feedback-${messageId}`, 160),
            chatId,
            messageId,
            userMessageId: cleanText(value.userMessageId, 120),
            rating: RATINGS.has(value.rating) ? value.rating : 'unrated',
            reasons: normalizeReasons(value.reasons),
            comment: cleanText(value.comment, 1200),
            routeSnapshot: normalizeRouteSnapshot(value.routeSnapshot),
            createdAt: Number(value.createdAt) || Date.now(),
            updatedAt: Number(value.updatedAt) || Number(value.createdAt) || Date.now(),
            retriedAt: Number(value.retriedAt) || 0,
            retryMessageId: cleanText(value.retryMessageId, 120),
            promotedExampleId: cleanText(value.promotedExampleId, 160),
            promotedAt: Number(value.promotedAt) || 0
        };
    }

    function summarizeEntries(entries) {
        const summary = {
            total: 0,
            helpful: 0,
            notHelpful: 0,
            written: 0,
            promoted: 0,
            shorter: 0,
            longer: 0,
            moreDirect: 0,
            moreGentle: 0,
            moreStructure: 0,
            fewerTools: 0
        };

        Object.values(entries).forEach((entry) => {
            summary.total += 1;
            if (entry.rating === 'helpful') summary.helpful += 1;
            if (entry.rating === 'not_helpful') summary.notHelpful += 1;
            if (entry.comment) summary.written += 1;
            if (entry.promotedExampleId) summary.promoted += 1;
            if (entry.rating !== 'not_helpful') return;

            if (entry.reasons.includes('too_long')) summary.shorter += 1;
            if (entry.reasons.includes('too_short')) summary.longer += 1;
            if (entry.reasons.includes('more_direct')) summary.moreDirect += 1;
            if (entry.reasons.includes('more_gentle')) summary.moreGentle += 1;
            if (entry.reasons.includes('more_structure')) summary.moreStructure += 1;
            if (entry.reasons.includes('unwanted_tool')) summary.fewerTools += 1;
        });

        return summary;
    }

    function derivePreferenceOverrides(summary) {
        const overrides = {};
        const detailScore = summary.shorter - summary.longer;
        const directnessScore = summary.moreDirect - summary.moreGentle;

        if (detailScore >= 2) overrides.detailLevel = 'brief';
        if (detailScore <= -2) overrides.detailLevel = 'detailed';
        if (directnessScore >= 2) overrides.directnessLevel = 'direct';
        if (directnessScore <= -2) overrides.directnessLevel = 'soft';
        if (summary.moreStructure >= 2) overrides.structureLevel = 'stepwise';
        return overrides;
    }

    function normalizeState(value) {
        const safe = value && typeof value === 'object' ? value : {};
        const entries = {};

        Object.entries(safe.entries && typeof safe.entries === 'object' ? safe.entries : {})
            .forEach(([key, candidate]) => {
                const entry = normalizeEntry(candidate, key);
                if (entry) entries[entry.messageId] = entry;
            });

        const summary = summarizeEntries(entries);
        return {
            version: FEEDBACK_VERSION,
            entries,
            summary,
            preferenceOverrides: normalizePreferenceOverrides(derivePreferenceOverrides(summary)),
            toolOfferMode: summary.fewerTools >= 2 ? 'explicit_only' : 'normal'
        };
    }

    function createState() {
        return normalizeState(null);
    }

    function upsertFeedback(state, input, now = Date.now()) {
        const current = normalizeState(state);
        const messageId = cleanText(input?.messageId, 120);
        const existing = current.entries[messageId];
        const next = normalizeEntry({
            ...existing,
            ...input,
            id: existing?.id || input?.id || `feedback-${messageId}`,
            createdAt: existing?.createdAt || input?.createdAt || now,
            updatedAt: now,
            promotedExampleId: input?.rating === 'helpful'
                ? (input?.promotedExampleId ?? existing?.promotedExampleId)
                : '',
            promotedAt: input?.rating === 'helpful'
                ? (input?.promotedAt ?? existing?.promotedAt)
                : 0
        });
        if (!next) return current;

        return normalizeState({
            ...current,
            entries: {
                ...current.entries,
                [next.messageId]: next
            }
        });
    }

    function removeFeedback(state, messageId) {
        const current = normalizeState(state);
        const nextEntries = { ...current.entries };
        delete nextEntries[cleanText(messageId, 120)];
        return normalizeState({ ...current, entries: nextEntries });
    }

    function markPromoted(state, messageId, exampleId, now = Date.now()) {
        const current = normalizeState(state);
        const entry = current.entries[cleanText(messageId, 120)];
        if (!entry || entry.rating !== 'helpful') return current;
        return upsertFeedback(current, {
            ...entry,
            promotedExampleId: cleanText(exampleId, 160),
            promotedAt: now
        }, now);
    }

    function markUnpromoted(state, messageId, now = Date.now()) {
        const current = normalizeState(state);
        const entry = current.entries[cleanText(messageId, 120)];
        if (!entry) return current;
        return upsertFeedback(current, {
            ...entry,
            promotedExampleId: '',
            promotedAt: 0
        }, now);
    }

    function markRetried(state, messageId, retryMessageId, now = Date.now()) {
        const current = normalizeState(state);
        const entry = current.entries[cleanText(messageId, 120)];
        if (!entry) return current;
        return upsertFeedback(current, {
            ...entry,
            retriedAt: now,
            retryMessageId: cleanText(retryMessageId, 120)
        }, now);
    }

    function getReasonLabel(reasonId) {
        return REASON_DEFINITIONS.find((entry) => entry.id === reasonId)?.label || reasonId;
    }

    function buildRetryRequest(feedback, originalUserMessage) {
        const safe = normalizeEntry(feedback);
        if (!safe) return null;
        const reasons = safe.reasons.map(getReasonLabel);
        const feedbackParts = [
            reasons.length ? reasons.join(', ') : '',
            safe.comment
        ].filter(Boolean);
        const feedbackText = feedbackParts.join('. ') || 'Take another pass and improve the answer.';
        const original = cleanText(originalUserMessage, 4000);

        return {
            displayMessage: `Retry with feedback: ${feedbackText}`,
            prompt: [
                'Retry your immediately previous answer to the same request.',
                `Original request: ${original || 'Use the original request from the conversation.'}`,
                `User feedback: ${feedbackText}`,
                'Apply the feedback without mentioning this instruction or the feedback system.',
                'Keep every existing safety, privacy, and evidence rule intact. Return only the improved answer.'
            ].join('\n')
        };
    }

    function canPromotePersonalExample({ feedback, userMessage, assistantMessage } = {}) {
        const safe = normalizeEntry(feedback);
        const allowedRoutes = new Set([
            'GeneralFriendAgent',
            'CbtAnalystAgent',
            'PlannerAgent'
        ]);
        if (!safe || safe.rating !== 'helpful') return false;
        if (safe.routeSnapshot.domain !== 'general' || safe.routeSnapshot.risk !== 'low') return false;
        if (!allowedRoutes.has(safe.routeSnapshot.route)) return false;
        if (safe.routeSnapshot.task !== 'conversation') return false;
        if (!cleanText(userMessage, 4000) || !cleanText(assistantMessage, 8000)) return false;
        return true;
    }

    return {
        FEEDBACK_VERSION,
        REASON_DEFINITIONS,
        createState,
        normalizeState,
        normalizeEntry,
        normalizeRouteSnapshot,
        upsertFeedback,
        removeFeedback,
        markPromoted,
        markUnpromoted,
        markRetried,
        buildRetryRequest,
        canPromotePersonalExample
    };
});
