(function initializeEvidenceUtils(root, factory) {
    const sanitizer = typeof module === 'object' && module.exports
        ? require('./response-sanitizer')
        : root?.AURA_RESPONSE_SANITIZER;
    const api = factory(sanitizer);
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_EVIDENCE_UTILS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createEvidenceUtils(sanitizer) {
if (!sanitizer) throw new Error('Response sanitizer is required');
const { normalizeReplyWhitespace } = sanitizer;

function buildEvidenceCatalog(report) {
    const rawEvidence = Array.isArray(report?.evidence) ? report.evidence : [];
    const fallbackEvidence = rawEvidence.length
        ? []
        : [
              ...(report?.searches || []).flatMap((search) => [
                  ...(search?.organic || []),
                  ...(search?.places || [])
              ]),
              ...(report?.news || [])
          ];
    const sourceEvidence = rawEvidence.length ? rawEvidence : fallbackEvidence;
    const deduped = [];
    const seen = new Set();

    sourceEvidence.forEach((entry) => {
        const url = entry?.link || null;
        const title = String(entry?.title || '').trim();
        const snippet = String(entry?.snippet || '').trim();
        if (!url && !title && !snippet) return;

        const dedupeKey = url || `${title}:${snippet}`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);

        deduped.push({
            title: title || 'Untitled source',
            snippet,
            url,
            source: String(entry?.source || '').trim(),
            kind: String(entry?.kind || '').trim(),
            date: entry?.date || null,
            query: entry?.query || report?.primaryQuery || ''
        });
    });

    return deduped.slice(0, 12).map((entry, index) => ({
        id: index + 1,
        ...entry
    }));
}


function normalizeComparisonText(value) {
    return String(value || '')
        .toLowerCase()
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function claimLooksSnippetLike(text, evidenceCatalog, evidenceIds = []) {
    const raw = String(text || '').trim();
    if (!raw) return true;
    if (raw.length < 24) return true;
    if (/\.{3,}|…/.test(raw)) return true;
    if (/[\|]/.test(raw)) return true;
    if (/^(see|read|learn|click)\b/i.test(raw)) return true;

    const normalizedClaim = normalizeComparisonText(raw);
    if (!normalizedClaim || normalizedClaim.length < 20) return true;

    const relevantEvidence = evidenceIds.length
        ? evidenceCatalog.filter((entry) => evidenceIds.includes(entry.id))
        : evidenceCatalog;
    const claimTokens = normalizedClaim.split(' ');
    const claimTokenSet = new Set(claimTokens);

    for (const entry of relevantEvidence) {
        const normalizedSnippet = normalizeComparisonText(entry?.snippet || '');
        const normalizedTitle = normalizeComparisonText(entry?.title || '');

        for (const sourceText of [normalizedSnippet, normalizedTitle]) {
            if (!sourceText) continue;
            if (sourceText.includes(normalizedClaim) && normalizedClaim.length >= 36) return true;

            const sourceTokens = sourceText.split(' ');
            if (!sourceTokens.length) continue;
            const shared = sourceTokens.filter((token) => claimTokenSet.has(token)).length;
            const overlapRatio = shared / Math.max(1, claimTokens.length);
            if (claimTokens.length >= 9 && overlapRatio >= 0.88) return true;
        }
    }

    return false;
}

function cleanEvidenceSnippet(value) {
    return normalizeReplyWhitespace(
        String(value || '')
            .replace(/\.{3,}|…/g, '.')
            .replace(/\s+\|\s+.*$/g, '')
            .replace(/\b(read more|learn more|click here)\b.*$/i, '')
    );
}

function getQuestionFocus(message = '') {
    const text = String(message || '').toLowerCase();
    if (/\b(cause|causes|caused|why|risk factor|risk factors)\b/.test(text)) return 'causes';
    if (/\b(symptom|symptoms|identify|spot|recognize|tell if|warning signs|red flags)\b/.test(text)) return 'signs';
    if (/\b(treat|treatment|therapy|medication|manage|help)\b/.test(text)) return 'care';
    if (/\b(types?|classes?|kinds?|categories?|how many)\b/.test(text)) return 'types';
    if (/\b(link|relationship|connection|related|overlap)\b/.test(text)) return 'relationship';
    return 'general';
}

function evidenceMatchesFocus(text, focus) {
    const value = String(text || '').toLowerCase();
    const focusPatterns = {
        causes: /\b(cause|causes|caused|risk|genetic|family|brain|chemical|environment|stress|trigger)\b/,
        signs: /\b(symptom|sign|heart|breath|sweat|trembl|fear|dizziness|chest|nausea|episode|attack)\b/,
        care: /\b(treat|treatment|therapy|medication|manage|support|care|doctor|clinician)\b/,
        types: /\b(type|class|bipolar i|bipolar ii|cyclothym|category|categories)\b/,
        relationship: /\b(link|relationship|connection|comorbid|overlap|associated|risk)\b/,
        general: /./
    };
    return (focusPatterns[focus] || focusPatterns.general).test(value);
}

function extractEvidenceFactCandidates(userMessage, evidenceCatalog) {
    const focus = getQuestionFocus(userMessage);
    const candidates = [];
    const seen = new Set();

    (evidenceCatalog || []).forEach((entry) => {
        const sourceText = cleanEvidenceSnippet(entry.snippet || entry.title || '');
        if (!sourceText) return;

        const fragments = sourceText
            .split(/(?<=[.!?])\s+|;\s+/)
            .map((fragment) => cleanEvidenceSnippet(fragment))
            .filter((fragment) => fragment.length >= 45)
            .filter((fragment) => evidenceMatchesFocus(fragment, focus));

        const usableFragments = fragments.length ? fragments : [sourceText].filter((fragment) => fragment.length >= 45);
        usableFragments.forEach((fragment) => {
            const key = normalizeComparisonText(fragment).slice(0, 160);
            if (!key || seen.has(key)) return;
            seen.add(key);
            candidates.push(fragment);
        });
    });

    return candidates.slice(0, 4);
}

function makeSentence(value) {
    const text = normalizeReplyWhitespace(value);
    if (!text) return '';
    return /[.!?]$/.test(text) ? text : `${text}.`;
}

function buildEvidenceAnswerFromFragments(userMessage, evidenceCatalog) {
    const facts = extractEvidenceFactCandidates(userMessage, evidenceCatalog)
        .map(makeSentence)
        .filter(Boolean);

    if (!facts.length) return '';

    const focus = getQuestionFocus(userMessage);
    const openingByFocus = {
        causes: "It usually is not one single cause. The clearest picture is a mix of vulnerability and triggers.",
        signs: "The main thing to look for is a sudden shift: the person may seem intensely frightened or overwhelmed, and their body may look like it has gone into alarm mode.",
        care: "The useful way to think about treatment is that it usually needs both symptom relief and prevention, not just a one-time fix.",
        types: "The cleanest way to answer it is by separating the main categories first, then looking at what makes each one different.",
        relationship: "The relationship is real, but it is not usually a simple one-way cause. It is more of an overlap where each condition can make the other harder to manage.",
        general: "The most useful way to frame it is this:"
    };

    return normalizeReplyWhitespace([
        openingByFocus[focus] || openingByFocus.general,
        facts.slice(0, 3).join(' '),
        facts.length > 3 ? facts[3] : ''
    ].filter(Boolean).join('\n\n'));
}

function cleanSourceLabel(label) {
    return String(label || '')
        .replace(/[\[\]]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function buildSourcesLineFromEvidenceIds(evidenceIds, evidenceCatalog) {
    const links = evidenceIds
        .map((id) => evidenceCatalog.find((entry) => entry.id === id))
        .filter(Boolean)
        .filter((entry) => entry.url)
        .map((entry) => {
            const label = cleanSourceLabel(entry.source || entry.title || `Source ${entry.id}`);
            return `[${label}](${entry.url})`;
        });

    if (links.length === 0) return '';
    return `Sources: ${links.join(', ')}`;
}

function buildHumanFallbackAnswer() {
    return "I couldn't generate a useful reply this time. Your message is still here; please try again.";
}

function buildDeterministicSearchFallback(userMessage, evidenceCatalog, _preferences = null) {
    if (!evidenceCatalog.length) {
        return buildHumanFallbackAnswer(userMessage, 'SearchAgent');
    }

    const fragmentAnswer = buildEvidenceAnswerFromFragments(userMessage, evidenceCatalog);
    if (fragmentAnswer) {
        const sourcesLine = buildSourcesLineFromEvidenceIds(
            evidenceCatalog.filter((entry) => entry.url).slice(0, 4).map((entry) => entry.id),
            evidenceCatalog
        );
        return normalizeReplyWhitespace(`${fragmentAnswer}${sourcesLine ? `\n\n${sourcesLine}` : ''}`);
    }

    const topEvidence = evidenceCatalog[0];
    const topSnippet = String(topEvidence.snippet || '').trim();
    const naturalFallback = topSnippet && !claimLooksSnippetLike(topSnippet, evidenceCatalog, [topEvidence.id])
        ? topSnippet
        : buildMinimumEvidenceAnswer(userMessage, evidenceCatalog);
    const sourcesLine = buildSourcesLineFromEvidenceIds(
        evidenceCatalog.filter((entry) => entry.url).slice(0, 4).map((entry) => entry.id),
        evidenceCatalog
    );

    return normalizeReplyWhitespace(
        `${naturalFallback}${sourcesLine ? `\n\n${sourcesLine}` : ''}`
    );
}

function buildMinimumEvidenceAnswer(userMessage, evidenceCatalog) {
    return buildEvidenceAnswerFromFragments(userMessage, evidenceCatalog) ||
        "I would treat this as something that needs a careful, plain-English answer rather than a quick guess. The safest read from the available information is that there are several moving parts, so the next step is to look at the pattern, timing, severity, and what changed recently.";
}

return {
    buildEvidenceCatalog,
    normalizeComparisonText,
    claimLooksSnippetLike,
    cleanEvidenceSnippet,
    getQuestionFocus,
    evidenceMatchesFocus,
    extractEvidenceFactCandidates,
    buildEvidenceAnswerFromFragments,
    buildHumanFallbackAnswer,
    buildDeterministicSearchFallback,
    buildMinimumEvidenceAnswer
};
});
