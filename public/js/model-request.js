(function initializeModelRequest(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_MODEL_REQUEST = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModelRequestModule() {
    function isLikelyIncompleteReply(text, normalizeReplyWhitespace) {
        const value = normalizeReplyWhitespace(text);
        if (!value || value.length < 60) return false;
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

    function createClient({
        postJson,
        endpoint,
        responseRuntime,
        modelRouting,
        getBackgroundModelName,
        getThinkingModeKey,
        getModelGenerationOptions,
        normalizeReplyWhitespace,
        stripModelReasoningTokens
    }) {
        async function callLLM(prompt, {
            modelName = getBackgroundModelName(),
            format = null,
            callType = 'default',
            thinkingMode = getThinkingModeKey(),
            routeDecision = null,
            signal = responseRuntime.getTurnSignal()
        } = {}) {
            const inferencePolicy = modelRouting.resolveInferencePolicy({
                modelName,
                requestedMode: thinkingMode,
                callType: format === 'json' ? 'json' : callType,
                routeDecision
            });
            const options = {
                ...getModelGenerationOptions(modelName, format, callType),
                num_predict: inferencePolicy.maxTokens
            };

            try {
                const data = await postJson(endpoint, {
                    model: modelName,
                    prompt,
                    stream: false,
                    ...(inferencePolicy.think ? { think: inferencePolicy.think } : {}),
                    ...(Object.keys(options).length ? { options } : {}),
                    ...(format ? { format } : {})
                }, { signal });

                let rawReply = data.response?.trim() || null;
                const doneReason = String(data.done_reason || data.doneReason || '').toLowerCase();
                const allowContinuation = !format && callType === 'default';
                const firstVisibleReply = stripModelReasoningTokens(rawReply);
                const needsReasoningContinuation = rawReply && !firstVisibleReply && /<unused94>\s*thought/i.test(rawReply);
                const needsFinalAnswer = !firstVisibleReply && (
                    needsReasoningContinuation || Boolean(data.thinking?.trim()) || doneReason === 'length'
                );
                const visibleWordCount = firstVisibleReply
                    ? firstVisibleReply.split(/\s+/).filter(Boolean).length
                    : 0;
                const visibleLooksCutOff = firstVisibleReply && visibleWordCount < 60 &&
                    isLikelyIncompleteReply(firstVisibleReply, normalizeReplyWhitespace);

                if (allowContinuation && (needsFinalAnswer || (rawReply && (doneReason === 'length' || visibleLooksCutOff)))) {
                    let attempts = 0;
                    while (attempts < 3) {
                        const visibleSoFar = stripModelReasoningTokens(rawReply);
                        const stillHiddenOnly = !visibleSoFar && needsFinalAnswer;
                        const shouldContinue = stillHiddenOnly ||
                            (attempts === 0 && (doneReason === 'length' || visibleLooksCutOff));
                        if (!shouldContinue) break;

                        const continuationData = await postJson(endpoint, {
                            model: modelName,
                            prompt: stillHiddenOnly
                                ? buildFinalAnswerRetryPrompt(prompt)
                                : buildContinuationPrompt(prompt, rawReply),
                            stream: false,
                            ...(inferencePolicy.think ? { think: inferencePolicy.think } : {}),
                            ...(Object.keys(options).length ? { options } : {})
                        }, { signal });
                        const continuation = continuationData.response?.trim() || '';
                        if (!continuation) break;
                        rawReply = normalizeReplyWhitespace(stillHiddenOnly ? continuation : `${rawReply} ${continuation}`);
                        if (stripModelReasoningTokens(rawReply)) break;
                        attempts += 1;
                    }
                }

                return stripModelReasoningTokens(rawReply);
            } catch (error) {
                if (error.name === 'AbortError' || error.name === 'TimeoutError') throw error;
                console.error('LLM Call Failed:', error);
                return null;
            }
        }

        return { callLLM };
    }

    return { createClient };
});
