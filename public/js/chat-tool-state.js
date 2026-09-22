(function initializeChatToolState(root, factory) {
    const toolDecision = typeof module === 'object' && module.exports
        ? require('./tool-decision')
        : root?.AURA_TOOL_DECISION;
    const api = factory(toolDecision);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_CHAT_TOOL_STATE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createChatToolState(toolDecision) {
    if (!toolDecision) throw new Error('Tool decision policy is required');
    const { TOOL_TYPES } = toolDecision;

    function wasToolRecentlyDeclined(chat, type, { now = Date.now(), windowMs = 30 * 60 * 1000 } = {}) {
        if (!chat) return false;
        return (chat.history || []).some((message) => (
            message?.toolOffer?.type === type &&
            message.toolOffer.status === 'dismissed' &&
            Number(now) - Number(message.toolOffer.resolvedAt || 0) < windowMs
        ));
    }

    function canUseProactiveTool(chat, type, {
        now = Date.now(),
        minCooldownMs = 90 * 1000,
        prefersFewerTools = false
    } = {}) {
        if (!TOOL_TYPES.has(type) || !chat || prefersFewerTools) return false;
        if (chat.lastProactiveToolAt && (Number(now) - chat.lastProactiveToolAt) < minCooldownMs) return false;
        if ((chat.history || []).some((message) => (
            message?.toolOffer?.type === type && ['pending', 'creating'].includes(message.toolOffer.status)
        ))) return false;
        if (wasToolRecentlyDeclined(chat, type, { now, windowMs: 30 * 60 * 1000 })) return false;
        const currentCount = Array.isArray(chat.tools?.[type]) ? chat.tools[type].length : 0;
        const maxPerType = type === 'checklist' ? 4 : (type === 'follow_up_plan' ? 3 : 2);
        return currentCount < maxPerType;
    }

    function hasActiveToolType(chat, type) {
        return Boolean(chat && Array.isArray(chat.tools?.[type]) && chat.tools[type].length > 0);
    }

    function markProactiveToolUsed(chat, type, now = Date.now()) {
        if (!chat) return false;
        chat.lastProactiveToolAt = Number(now) || Date.now();
        chat.lastProactiveToolType = type;
        return true;
    }

    function addTool(chat, toolName, toolData) {
        if (!chat || !toolData) return false;
        chat.tools = chat.tools && typeof chat.tools === 'object' ? chat.tools : {};
        if (!Array.isArray(chat.tools[toolName])) chat.tools[toolName] = [];
        chat.tools[toolName].push(toolData);
        return true;
    }

    function transitionOffer(chat, messageIndex, action, transition, now = Date.now(), createdToolId = null) {
        const message = chat?.history?.[Number(messageIndex)];
        if (!message?.toolOffer || typeof transition !== 'function') return null;
        const nextOffer = transition(message.toolOffer, action, now, createdToolId);
        if (!nextOffer) return null;
        message.toolOffer = nextOffer;
        return { ...nextOffer };
    }

    function logMood(chat, mood, now = new Date().toISOString()) {
        if (!chat?.tools?.mood_tracker?.[0]) return false;
        const tracker = chat.tools.mood_tracker[0];
        tracker.history = tracker.history || [];
        tracker.history.push({ mood, timestamp: now });
        chat.isHeightenedAwareness = ['Sad', 'Angry'].includes(mood);
        return true;
    }

    function completeChecklistItem(chat, toolId, itemIndex, toolType = 'checklist', itemKey = 'items') {
        if (!chat?.tools?.[toolType]) return null;
        const toolIndex = chat.tools[toolType].findIndex((entry) => entry.id === toolId);
        if (toolIndex === -1) return null;
        const list = chat.tools[toolType][toolIndex][itemKey];
        if (!Array.isArray(list)) return null;
        const [item] = list.splice(itemIndex, 1);
        if (!item) return null;
        if (list.length === 0) chat.tools[toolType].splice(toolIndex, 1);
        chat.completed_tasks = chat.completed_tasks || [];
        const completedLabel = item.text || item.action || item.when || 'Completed step';
        chat.completed_tasks.push(completedLabel);
        return completedLabel;
    }

    function updateThoughtRecord(chat, toolId, data) {
        if (!chat?.tools?.thought_record) return false;
        const recordIndex = chat.tools.thought_record.findIndex((record) => record.id === toolId);
        if (recordIndex === -1) return false;
        chat.tools.thought_record[recordIndex] = {
            ...chat.tools.thought_record[recordIndex],
            ...data
        };
        return true;
    }

    function getTools(chat) {
        return chat?.tools || {};
    }

    return {
        canUseProactiveTool,
        hasActiveToolType,
        wasToolRecentlyDeclined,
        markProactiveToolUsed,
        addTool,
        transitionOffer,
        logMood,
        completeChecklistItem,
        updateThoughtRecord,
        getTools
    };
});
