(function initializeToolArtifacts(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_TOOL_ARTIFACTS = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createToolArtifacts() {
    const TOOL_TYPES = new Set([
        'mood_tracker',
        'checklist',
        'thought_record',
        'affirmation_card',
        'breathing_exercise',
        'safety_plan',
        'medication_checklist',
        'appointment_prep',
        'follow_up_plan'
    ]);
    const TOOL_TAG_PATTERN = /<tool_(create|offer)\b[^>]*\/?>/gi;
    const ATTRIBUTE_PATTERN = /\b(type|theme)=["']([^"']*)["']/gi;

    function sanitizeTheme(theme, fallback = 'Quick support') {
        const clean = String(theme || '')
            .replace(/["<>\\]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120);
        return clean || fallback;
    }

    function parseTag(tag) {
        const attributes = {};
        for (const match of String(tag || '').matchAll(ATTRIBUTE_PATTERN)) {
            attributes[String(match[1] || '').toLowerCase()] = String(match[2] || '');
        }

        const type = String(attributes.type || '').trim();
        if (!TOOL_TYPES.has(type)) return null;
        return {
            type,
            theme: sanitizeTheme(attributes.theme)
        };
    }

    function parseToolArtifacts(value) {
        const raw = String(value || '');
        const creates = [];
        let offer = null;

        for (const match of raw.matchAll(TOOL_TAG_PATTERN)) {
            const artifact = parseTag(match[0]);
            if (!artifact) continue;
            if (String(match[1] || '').toLowerCase() === 'create') {
                creates.push(artifact);
            } else if (!offer) {
                offer = artifact;
            }
        }

        const content = raw
            .replace(TOOL_TAG_PATTERN, ' ')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        return { content, creates, offer };
    }

    function createToolOffer(candidate, { id = '', now = Date.now() } = {}) {
        const type = String(candidate?.type || '').trim();
        if (!TOOL_TYPES.has(type)) return null;

        return {
            id: String(id || `offer-${Number(now) || Date.now()}`),
            type,
            theme: sanitizeTheme(candidate?.theme),
            status: 'pending',
            createdAt: Number(now) || Date.now(),
            resolvedAt: null,
            createdToolId: null
        };
    }

    function normalizeToolOffer(value) {
        if (!value || typeof value !== 'object') return null;
        const base = createToolOffer(value, {
            id: value.id,
            now: value.createdAt
        });
        if (!base) return null;

        const allowedStatuses = new Set(['pending', 'creating', 'created', 'dismissed']);
        const status = allowedStatuses.has(value.status) ? value.status : 'pending';
        return {
            ...base,
            status,
            resolvedAt: status === 'created' || status === 'dismissed'
                ? (Number(value.resolvedAt) || base.createdAt)
                : null,
            createdToolId: status === 'created' && value.createdToolId != null
                ? String(value.createdToolId)
                : null
        };
    }

    function transitionToolOffer(offer, action, now = Date.now(), createdToolId = null) {
        if (!offer || typeof offer !== 'object') return null;
        const status = String(offer.status || '');
        const timestamp = Number(now) || Date.now();

        if (action === 'create' && status === 'pending') {
            return { ...offer, status: 'creating', resolvedAt: null };
        }
        if (action === 'dismiss' && status === 'pending') {
            return { ...offer, status: 'dismissed', resolvedAt: timestamp };
        }
        if (action === 'created' && status === 'creating') {
            return {
                ...offer,
                status: 'created',
                resolvedAt: timestamp,
                createdToolId: createdToolId == null ? null : String(createdToolId)
            };
        }
        if (action === 'retry' && status === 'creating') {
            return { ...offer, status: 'pending', resolvedAt: null };
        }
        return null;
    }

    return {
        TOOL_TYPES,
        parseToolArtifacts,
        createToolOffer,
        normalizeToolOffer,
        transitionToolOffer
    };
});
