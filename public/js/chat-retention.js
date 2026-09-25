(function initializeChatRetention(root, factory) {
    const chatFeedback = typeof module === 'object' && module.exports
        ? require('./chat-feedback-state')
        : root?.AURA_CHAT_FEEDBACK_STATE;
    const intelligence = typeof module === 'object' && module.exports
        ? require('./intelligence-bundle')
        : root?.AURA_INTELLIGENCE_BUNDLE;
    const api = factory(chatFeedback, intelligence);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_CHAT_RETENTION = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createChatRetention(chatFeedback, intelligence) {
    if (!chatFeedback || !intelligence) throw new Error('Chat feedback and intelligence modules are required');

    function isSavedChat(chat) {
        return Boolean(chat && chat.retention !== 'temporary');
    }

    function projectForPersistence(state) {
        const chats = {};
        let feedbackLearning = state.feedbackLearning;
        let intelligenceBundle = state.intelligenceBundle;

        for (const [id, chat] of Object.entries(state.chats || {})) {
            if (isSavedChat(chat)) {
                chats[id] = chat;
                continue;
            }
            feedbackLearning = chatFeedback.removeChat(feedbackLearning, id).state;
            intelligenceBundle = intelligence.removeChatContributions(intelligenceBundle, id);
        }

        const activeChatId = chats[state.activeChatId]
            ? state.activeChatId
            : (chats[state.lastSavedChatId] ? state.lastSavedChatId : (Object.keys(chats)[0] || null));
        return {
            ...state,
            chats,
            activeChatId,
            lastSavedChatId: activeChatId,
            feedbackLearning,
            intelligenceBundle
        };
    }

    return { isSavedChat, projectForPersistence };
});
