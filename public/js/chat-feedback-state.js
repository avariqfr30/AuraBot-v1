(function initializeChatFeedbackState(root, factory) {
    const feedback = typeof module === 'object' && module.exports
        ? require('./feedback-learning')
        : root?.AURA_FEEDBACK;
    const api = factory(feedback);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_CHAT_FEEDBACK_STATE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createChatFeedbackState(feedback) {
    if (!feedback) throw new Error('Feedback policy is required');

    function getEntry(state, chatId, messageId) {
        const entry = state.entries[String(messageId || '')];
        return entry?.chatId === chatId ? { ...entry } : null;
    }

    function findRelatedUserMessage(chat, assistantMessage) {
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

    function upsert(state, chat, messageId, patch, personalIntelligenceActive) {
        const assistantMessage = chat?.history?.find((message) => message.id === messageId);
        if (!assistantMessage || assistantMessage.role !== 'ai') return null;
        const existing = getEntry(state, chat.id, messageId);
        const userMessage = findRelatedUserMessage(chat, assistantMessage);
        const routeSnapshot = assistantMessage.routeSnapshot || existing?.routeSnapshot;
        return feedback.upsertFeedback(state, {
            ...existing,
            ...patch,
            chatId: chat.id,
            messageId,
            learningEligible: feedback.resolveFeedbackLearningEligibility(
                existing?.learningEligible,
                personalIntelligenceActive,
                routeSnapshot
            ),
            userMessageId: userMessage?.id || existing?.userMessageId || '',
            routeSnapshot
        });
    }

    function getRetryContext(state, chat, messageId) {
        const assistantMessage = chat?.history?.find((message) => message.id === messageId);
        const entry = getEntry(state, chat?.id, messageId);
        const userMessage = findRelatedUserMessage(chat, assistantMessage);
        const request = feedback.buildRetryRequest(entry, userMessage?.content);
        if (!assistantMessage || !entry || !request) return null;
        return { assistantMessage, feedback: entry, userMessage, ...request };
    }

    function getPersonalExampleCandidate(state, chat, messageId, personalIntelligenceActive) {
        if (!personalIntelligenceActive) return null;
        const assistantMessage = chat?.history?.find((message) => message.id === messageId);
        const entry = getEntry(state, chat?.id, messageId);
        const userMessage = findRelatedUserMessage(chat, assistantMessage);
        if (!feedback.canPromotePersonalExample({
            feedback: entry,
            userMessage: userMessage?.content,
            assistantMessage: assistantMessage?.content
        })) return null;
        return {
            id: `personal-${messageId}`,
            task: entry.routeSnapshot.task || 'conversation',
            route: entry.routeSnapshot.route,
            domain: 'companion',
            risk: 'low',
            preferredModel: 'either',
            userMessage: String(userMessage.content || '').slice(0, 4000),
            idealResponse: String(assistantMessage.content || '').slice(0, 8000)
        };
    }

    function getActivePersonalExampleIds(state) {
        return Object.values(state.entries)
            .filter((entry) => (
                entry.learningEligible &&
                feedback.isFeedbackLearningRouteEligible(entry.routeSnapshot)
            ))
            .map((entry) => entry.promotedExampleId)
            .filter(Boolean);
    }

    function getPromotedExampleIdsForChat(state, chatId) {
        return Object.values(state.entries)
            .filter((entry) => entry.chatId === String(chatId || ''))
            .map((entry) => entry.promotedExampleId)
            .filter(Boolean);
    }

    function removeChat(state, chatId) {
        const promotedExampleIds = Object.values(state.entries)
            .filter((entry) => entry.chatId === chatId && entry.promotedExampleId)
            .map((entry) => entry.promotedExampleId);
        const entries = Object.fromEntries(
            Object.entries(state.entries).filter(([, entry]) => entry.chatId !== chatId)
        );
        return {
            state: feedback.normalizeState({ ...state, entries }),
            promotedExampleIds
        };
    }

    return {
        getEntry,
        findRelatedUserMessage,
        upsert,
        getRetryContext,
        getPersonalExampleCandidate,
        getActivePersonalExampleIds,
        getPromotedExampleIdsForChat,
        removeChat
    };
});
