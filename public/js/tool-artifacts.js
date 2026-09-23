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

    function isUsableToolData(type, value) {
        if (!TOOL_TYPES.has(type) || !value || typeof value !== 'object' || Array.isArray(value)) return false;
        if (value.type !== type || typeof value.id !== 'string' || !value.id.trim() ||
            typeof value.title !== 'string' || !value.title.trim()) return false;
        const stringList = (items) => Array.isArray(items) && items.length > 0 &&
            items.every((item) => typeof item === 'string' && item.trim());
        const itemList = (items, keys) => Array.isArray(items) && items.length > 0 && items.every((item) => (
            item && typeof item === 'object' && keys.every((key) => (
                typeof item[key] === 'string' && item[key].trim()
            ))
        ));

        switch (type) {
            case 'mood_tracker': return stringList(value.options);
            case 'checklist': return itemList(value.items, ['text']);
            case 'thought_record': return typeof value.situation === 'string';
            case 'affirmation_card': return stringList(value.text);
            case 'breathing_exercise': return Boolean(value.cycle) && ['inhale', 'hold', 'exhale'].every((key) => (
                Number.isFinite(Number(value.cycle[key])) && Number(value.cycle[key]) > 0
            ));
            case 'safety_plan': return [
                'warningSigns', 'groundingSteps', 'saferEnvironment', 'professionalSupport', 'reasonsToStay'
            ].every((key) => stringList(value[key])) && itemList(value.peopleToContact, ['name', 'contact']);
            case 'medication_checklist': return typeof value.medicationName === 'string' &&
                itemList(value.checks, ['text']);
            case 'appointment_prep': return stringList(value.symptomTimeline) &&
                stringList(value.questions) && stringList(value.medsToMention);
            case 'follow_up_plan': return itemList(value.checkpoints, ['when', 'action']);
            default: return false;
        }
    }

    return {
        TOOL_TYPES,
        parseToolArtifacts,
        createToolOffer,
        normalizeToolOffer,
        transitionToolOffer,
        isUsableToolData
    };
});
