(function initializeProfileRag(root, factory) {
    const turnPolicy = typeof module === 'object' && module.exports
        ? require('./turn-policy')
        : root?.AURA_TURN_POLICY;
    const api = factory(turnPolicy);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_PROFILE_RAG = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createProfileRag(turnPolicy) {
    if (!turnPolicy) throw new Error('Turn policy is required');
    const MAX_CONTEXT_CHARS = 3200;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const PREFERENCE_KEYS = new Set([
        'detailLevel', 'reassuranceLevel', 'technicalLevel', 'structureLevel',
        'directnessLevel', 'followUpLevel', 'likelyTone'
    ]);

    function cleanText(value, limit = 400) {
        return String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit);
    }

    function relevance(query, value) {
        return turnPolicy.scoreContextRelevance(query, value);
    }

    function recency(timestamp, now) {
        const ageDays = Math.max(0, (now - (Number(timestamp) || 0)) / DAY_MS);
        return Math.pow(0.5, ageDays / 90);
    }

    function fitBlocks(blocks, limit) {
        const selected = [];
        let length = 0;
        for (const block of blocks) {
            if (length + block.length + (selected.length ? 2 : 0) > limit) continue;
            selected.push(block);
            length += block.length + (selected.length > 1 ? 2 : 0);
        }
        return selected.join('\n\n');
    }

    function selectContext({
        query = '',
        relevanceQuery = query,
        activeProfile = null,
        approvedSignals = [],
        vectorMatches = [],
        currentSummary = null,
        continuity = null,
        examples = [],
        personalIntelligenceActive = false,
        highRisk = false,
        sanitizeText = (value) => value,
        now = Date.now()
    } = {}) {
        const safeText = (value, limit) => cleanText(sanitizeText(value), limit);
        const rejected = turnPolicy.hasContextRejection(query);
        const recall = /\b(remember|earlier|before|last time|previously|did i tell you)\b/i.test(query);
        const safeProfile = personalIntelligenceActive
            ? activeProfile
            : { responsePreferences: activeProfile?.responsePreferences || {} };
        const profile = turnPolicy.buildRelevantProfileBundle({
            query: relevanceQuery,
            activeProfile: safeProfile,
            includeDurable: false
        });
        profile.communicationStyle = safeText(profile.communicationStyle, 160);
        profile.responsePreferences = Object.fromEntries(
            Object.entries(profile.responsePreferences)
                .filter(([key]) => PREFERENCE_KEYS.has(key))
                .map(([key, value]) => [key, safeText(value, 40)])
        );
        const candidates = [];
        if (personalIntelligenceActive && !rejected) {
            for (const [key, values] of Object.entries(profile.activeChat)) {
                for (const value of values) {
                    const text = safeText(value, 250);
                    const topic = relevance(relevanceQuery, text);
                    if (topic >= 0.5) candidates.push({ type: 'chat', key, text, score: topic * 10 + 1 });
                }
            }
            for (const signal of approvedSignals) {
                if (signal?.kind !== 'approved_memory' || signal.consent !== 'explicit' || signal.status !== 'active') continue;
                const text = safeText(signal.value);
                const topic = relevance(relevanceQuery, text);
                if (!text || (topic < 0.5 && !recall)) continue;
                candidates.push({
                    type: 'memory', text,
                    score: topic * 10 + 2 + (Number(signal.effectiveConfidence ?? signal.confidence) || 0) +
                        recency(signal.lastObservedAt, now)
                });
            }
            for (const match of vectorMatches) {
                const text = safeText(match?.text);
                const topic = relevance(relevanceQuery, text);
                if (!text || (topic < 0.5 && !recall)) continue;
                const distance = match.distance == null ? NaN : Number(match.distance);
                candidates.push({
                    type: 'memory', text,
                    score: topic * 10 + 2 + (Number.isFinite(distance) ? 1 / (1 + Math.max(0, distance)) : 0) +
                        recency(match.provenance?.timestamp, now)
                });
            }
        }

        const seen = new Set();
        const selected = candidates
            .sort((left, right) => right.score - left.score)
            .filter((entry) => {
                const key = entry.text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            })
            .slice(0, 4);
        profile.activeChat = { behavioralFacts: [], moodPatterns: [], potentialLapses: [] };
        selected.filter((entry) => entry.type === 'chat').slice(0, 2).forEach((entry) => {
            profile.activeChat[entry.key].push(entry.text);
        });
        let profileContext = JSON.stringify(profile);
        if (profileContext.length > 650) {
            profile.activeChat = { behavioralFacts: [], moodPatterns: [], potentialLapses: [] };
            profileContext = JSON.stringify(profile);
        }
        const selectedMemories = selected.filter((entry) => entry.type === 'memory').slice(0, 2);
        const memoryLines = selectedMemories.map((entry) => `- ${entry.text} (source: approved personal memory)`);
        const memoryContext = memoryLines.length
            ? fitBlocks(['[Relevant recalled context]', ...memoryLines], 850).replace(/\n\n/g, '\n')
            : '';

        const summary = currentSummary && typeof currentSummary === 'object' ? currentSummary : {};
        const shortFollowUp = String(query).trim().split(/\s+/).length <= 3;
        const summaryItems = [];
        if (personalIntelligenceActive && !rejected && continuity?.usePriorTurn) {
            const summaryText = safeText(summary.summary, 260);
            if (summaryText && (relevance(relevanceQuery, summaryText) >= 0.5 || shortFollowUp)) {
                summaryItems.push(`Summary: ${summaryText}`);
            }
            for (const loop of Array.isArray(summary.openLoops) ? summary.openLoops : []) {
                const text = safeText(loop, 160);
                if (text && (relevance(relevanceQuery, text) >= 0.5 || shortFollowUp)) summaryItems.push(`Open thread: ${text}`);
            }
        }
        const summaryContext = fitBlocks(summaryItems, 450);

        const exampleBlocks = highRisk ? [] : (Array.isArray(examples) ? examples : [])
            .filter((entry) => personalIntelligenceActive || entry?.source !== 'personal_feedback')
            .filter((entry, index, list) => list.findIndex((candidate) => candidate?.id === entry?.id) === index)
            .slice(0, 3)
            .map((entry, index) => [
                `[${entry.source === 'personal_feedback' ? 'Approved personal example' : 'Example'} ${index + 1}: ${safeText(entry.task, 60) || 'conversation'}]`,
                `Example request: ${safeText(entry.userMessage, 220)}`,
                `Preferred response: ${safeText(entry.idealResponse, 480)}`,
                Array.isArray(entry.avoid) && entry.avoid.length
                    ? `Avoid: ${entry.avoid.map((value) => safeText(value, 80)).filter(Boolean).slice(0, 3).join(' | ')}`
                    : ''
            ].filter(Boolean).join('\n'));
        const remaining = Math.max(0, MAX_CONTEXT_CHARS - profileContext.length - memoryContext.length - summaryContext.length);
        const exampleContext = fitBlocks(exampleBlocks, Math.min(1400, remaining));
        return {
            profileContext,
            memoryContext,
            summaryContext,
            exampleContext,
            totalCharacters: profileContext.length + memoryContext.length + summaryContext.length + exampleContext.length
        };
    }

    return { selectContext };
});
