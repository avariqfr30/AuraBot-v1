(function initializeResponseSanitizer(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_RESPONSE_SANITIZER = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createResponseSanitizer() {
const TOOL_TAG_PATTERN = /<tool_(?:create|offer)\b[^>]*\/?>/gi;

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

function splitReplyArtifacts(text) {
    const raw = String(text || '');
    const toolTags = extractToolTags(raw);
    const sourceLines = raw
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => /^\s*Sources:\s*/i.test(line));
    const body = normalizeReplyWhitespace(stripInlineSourceLine(stripToolTags(raw)));

    return {
        body,
        toolTags,
        sourceLines
    };
}

function reassembleReplyArtifacts({ body = '', toolTags = [], sourceLines = [] } = {}) {
    return normalizeReplyWhitespace(
        [
            normalizeReplyWhitespace(body),
            ...sourceLines.filter(Boolean),
            ...toolTags.filter(Boolean)
        ].filter(Boolean).join('\n\n')
    );
}

function stripModelReasoningTokens(text) {
    let value = String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, ' ');
    const gemmaFinal = value.match(/<unused95>\s*([\s\S]*)/i);
    if (gemmaFinal) {
        return gemmaFinal[1]
            .replace(/<unused9[45]>/gi, ' ')
            .replace(/\[(?:end of )?medgemma medical mode\]/gi, ' ')
            .trim();
    }
    value = value.replace(/<unused94>\s*thought[\s\S]*$/gi, ' ');
    return value
        .replace(/<unused9[45]>/gi, ' ')
        .replace(/\[(?:end of )?medgemma medical mode\]/gi, ' ')
        .trim();
}

function stripThinkingTags(text) {
    return stripModelReasoningTokens(text);
}

function stripPlanningScaffold(text) {
    const cleaned = normalizeReplyWhitespace(text);
    if (!cleaned) return '';

    const lines = cleaned.split('\n');
    const filtered = lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return true;

        return ![
            /^\[[^\]]*(?:thought|analysis|reasoning|plan|思考|分析|推理|计划|計劃)[^\]]*\]\s*/i,
            /^identify (?:the )?(?:core )?request\b[:\s-]/i,
            /^identify (?:the )?(?:core )?question\b[:\s-]/i,
            /^structure (?:the )?response\b[:\s-]/i,
            /^structure (?:the )?answer\b[:\s-]/i,
            /^gather information\b[:\s-]/i,
            /^formulate (?:the )?response\b[:\s-]/i,
            /^formulate (?:the )?answer\b[:\s-]/i,
            /^review to ensure\b[:\s-]/i,
            /^self-?correction\b[:\s-]/i,
            /^\(self-?correction\/?refinement\)/i,
            /^plan\b[:\s-]/i,
            /^recall (?:the )?previous context\b[:\s-]/i,
            /^determine (?:the )?scope\b[:\s-]/i,
            /^access knowledge\b[:\s-]/i,
            /^synthesize (?:the )?answer\b[:\s-]/i,
            /^refine (?:the )?language\b[:\s-]/i,
            /^check against rules\b[:\s-]/i,
            /^final check\b[:\s-]/i,
            /^draft(?:ing)? (?:the )?response\b[:\s-]/i,
            /^avoid overly technical\b[:\s-]/i,
            /^steps?\b[:\s-]/i,
            /^approach\b[:\s-]/i,
            /^core request\b[:\s-]/i,
            /^the user is asking\b[:\s-]/i,
            /^the original draft\b[:\s-]/i,
            /^the goal is to\b[:\s-]/i,
            /^drafting(?:\s*-\s*iteration\s*\d+)?\b[:\s-]/i,
            /^iteration\s*\d+\b[:\s-]/i,
            /^responding to the user\b[:\s-]/i
        ].some((pattern) => pattern.test(trimmed));
    });

    let result = normalizeReplyWhitespace(filtered.join('\n'));
    if (!result) return '';

    const conversationalAnchor = result.match(
        /(?:^|\n|["“])\s*(?:hi\b|hello\b|hey\b|okay[,! ]+let'?s|let'?s\b|here'?s\b|short answer[:\-]|quick answer[:\-])/i
    );

    if (conversationalAnchor && conversationalAnchor.index > 0) {
        result = normalizeReplyWhitespace(result.slice(conversationalAnchor.index).replace(/^["“]+/, ''));
    }

    return result;
}

function extractLikelyUserFacingSegment(text) {
    const normalized = normalizeReplyWhitespace(stripToolTags(stripThinkingTags(text)));
    if (!normalized) return '';

    const anchors = [
        /(?:^|\n|["“])\s*(?:hi\b|hello\b|hey\b|okay[,! ]+let'?s|let'?s\b|here'?s\b|short answer[:\-]|quick answer[:\-])/i,
        /(?:^|\n)\s*[A-Z][A-Za-z0-9\s'()\/&-]{3,80}:\s*$/m
    ];

    for (const pattern of anchors) {
        const match = normalized.match(pattern);
        if (match && typeof match.index === 'number') {
            const candidate = normalizeReplyWhitespace(normalized.slice(match.index).replace(/^["“]+/, ''));
            if (candidate) return candidate;
        }
    }

    return normalized;
}

function isMetaInstructionLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return true;

    return [
        /^\[[^\]]*(?:thought|analysis|reasoning|plan|思考|分析|推理|计划|計劃)[^\]]*\]\s*/i,
        /^(?:thought|analysis|reasoning|plan)\b[:\s-]/i,
        /^(?:思考|分析|推理|计划|計劃)\b[:\s-]/i,
        /^the user wants me to\b/i,
        /^the user is asking\b/i,
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
        /^identify (?:the )?(?:core )?request\b/i,
        /^identify (?:the )?(?:core )?question\b/i,
        /^structure (?:the )?response\b/i,
        /^structure (?:the )?answer\b/i,
        /^gather information\b/i,
        /^formulate (?:the )?response\b/i,
        /^formulate (?:the )?answer\b/i,
        /^review to ensure\b/i,
        /^self-?correction\b/i,
        /^\(self-?correction\/?refinement\)/i,
        /^recall (?:the )?previous context\b/i,
        /^determine (?:the )?scope\b/i,
        /^access knowledge\b/i,
        /^synthesize (?:the )?answer\b/i,
        /^refine (?:the )?language\b/i,
        /^check against rules\b/i,
        /^final check\b/i,
        /^draft(?:ing)? (?:the )?response\b/i,
        /^drafting(?:\s*-\s*iteration\s*\d+)?\b/i,
        /^the original draft\b/i,
        /^the goal is to\b/i,
        /^core request\b[:\s-]/i,
        /^\[?(?:behavioral profile|runtime context|system context|current session history|relevant past memories|current profile|recent chat|draft reply|user message)\]?[:\]]/i
    ].some((pattern) => pattern.test(trimmed));
}

function stripMetaPreface(text) {
    const cleaned = normalizeReplyWhitespace(stripThinkingTags(text));
    const lines = cleaned.split('\n');
    const keptLines = [];
    let started = false;
    const strongMetaBoundary = /^(?:thought|analysis|reasoning|plan|思考|分析|推理|计划|計劃)\b[:\s-]|^\[[^\]]*(?:thought|analysis|reasoning|plan|思考|分析|推理|计划|計劃)[^\]]*\]\s*|^(?:the user is asking|the original draft|the goal is to|drafting(?:\s*-\s*iteration\s*\d+)?)\b[:\s-]?|^\[?(?:behavioral profile|runtime context|system context|current session history|relevant past memories|current profile|recent chat|draft reply|user message)\]?[:\]]/i;

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
        /(?:^|\n)\s*\[[^\]]*(?:thought|analysis|reasoning|plan|思考|分析|推理|计划|計劃)[^\]]*\]/i,
        /(?:^|\n)\s*(?:thought|analysis|reasoning|plan)\b[:\s-]/i,
        /(?:^|\n)\s*(?:思考|分析|推理|计划|計劃)\b[:\s-]/i,
        /\bthe user wants me to\b/i,
        /\bthe user is asking\b/i,
        /\bi need to respond\b/i,
        /\bi should respond\b/i,
        /\bi must\b/i,
        /\buse the provided html structure\b/i,
        /\bbased on the prompt\b/i,
        /\bidentify (?:the )?(?:core )?request\b/i,
        /\bidentify (?:the )?(?:core )?question\b/i,
        /\bstructure (?:the )?response\b/i,
        /\bstructure (?:the )?answer\b/i,
        /\bgather information\b/i,
        /\bformulate (?:the )?response\b/i,
        /\bformulate (?:the )?answer\b/i,
        /\breview to ensure\b/i,
        /\bself-?correction\b/i,
        /\brecall (?:the )?previous context\b/i,
        /\bdetermine (?:the )?scope\b/i,
        /\baccess knowledge\b/i,
        /\bsynthesize (?:the )?answer\b/i,
        /\brefine (?:the )?language\b/i,
        /\bcheck against rules\b/i,
        /\bfinal check\b/i,
        /\bdrafting (?:the )?response\b/i,
        /\bdrafting(?:\s*-\s*iteration\s*\d+)?\b/i,
        /\bthe original draft\b/i,
        /\bthe goal is to\b/i,
        /\bbehavioral profile\b/i,
        /\bruntime context\b/i,
        /\bsystem context\b/i,
        /\brespond only\b/i,
        /\breturn only\b/i
    ].some((pattern) => pattern.test(sample));
}

async function finalizeAssistantReply(rawReply, userMessage = '') {
    if (!rawReply) return null;

    const toolTags = extractToolTags(rawReply);
    let cleanedBody = stripRoboticSourcePreamble(stripPlanningScaffold(stripMetaPreface(stripToolTags(rawReply))));

    if (looksLikeLeakedReasoning(rawReply) || looksLikeLeakedReasoning(cleanedBody)) {
        cleanedBody = stripRoboticSourcePreamble(stripPlanningScaffold(stripMetaPreface(extractLikelyUserFacingSegment(rawReply))));
    }

    if (!cleanedBody || looksLikeLeakedReasoning(cleanedBody)) {
        cleanedBody = stripRoboticSourcePreamble(stripPlanningScaffold(stripMetaPreface(extractLikelyUserFacingSegment(rawReply))));
    }

    if (!cleanedBody || looksLikeLeakedReasoning(cleanedBody)) {
        const tailCandidate = normalizeReplyWhitespace(
            String(rawReply || '')
                .split('\n')
                .slice(-12)
                .join('\n')
        );
        cleanedBody = stripRoboticSourcePreamble(stripPlanningScaffold(stripMetaPreface(stripToolTags(tailCandidate))));
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


function stripInlineSourceLine(text) {
    return normalizeReplyWhitespace(
        String(text || '')
            .split('\n')
            .filter((line) => !/^\s*Sources:\s*/i.test(line))
            .join('\n')
    );
}

function stripRoboticSourcePreamble(text) {
    return normalizeReplyWhitespace(
        String(text || '')
            .replace(/^\s*based on (?:the )?(?:information|sources|evidence|results)(?:\s+from\s+[^,.]+)?[,.]\s*/i, '')
            .replace(/\[(?:end of )?medgemma medical mode\]/gi, ' ')
    );
}

return {
    extractToolTags,
    stripToolTags,
    normalizeReplyWhitespace,
    splitReplyArtifacts,
    reassembleReplyArtifacts,
    stripModelReasoningTokens,
    stripThinkingTags,
    stripPlanningScaffold,
    stripMetaPreface,
    looksLikeLeakedReasoning,
    finalizeAssistantReply,
    getDisplaySafeAssistantContent,
    stripInlineSourceLine,
    stripRoboticSourcePreamble
};
});
