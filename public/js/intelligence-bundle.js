(function initializeIntelligenceBundle(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_INTELLIGENCE_BUNDLE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createIntelligenceBundleApi() {
    const VERSION = 1;
    const DAY_MS = 24 * 60 * 60 * 1000;
    const MAX_SIGNALS = 200;
    const KINDS = new Set([
        'interaction_preference',
        'approved_memory',
        'legacy_memory'
    ]);
    const PREFERENCE_VALUES = {
        detailLevel: new Set(['brief', 'balanced', 'detailed']),
        reassuranceLevel: new Set(['low', 'medium', 'high']),
        technicalLevel: new Set(['plain', 'mixed', 'technical']),
        structureLevel: new Set(['paragraphs', 'mixed', 'stepwise']),
        directnessLevel: new Set(['soft', 'balanced', 'direct']),
        followUpLevel: new Set(['none', 'gentle', 'active'])
    };
    const EXPLICIT_SOURCE_TYPES = new Set(['explicit_instruction', 'feedback', 'memory_request']);

    function cleanText(value, maxLength = 500) {
        return String(value || '').replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
    }

    function clampConfidence(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0;
    }

    function stableHash(value) {
        let hash = 2166136261;
        for (const character of String(value || '')) {
            hash ^= character.charCodeAt(0);
            hash = Math.imul(hash, 16777619);
        }
        return (hash >>> 0).toString(36);
    }

    function signalId(kind, key, value) {
        return `signal-${stableHash(`${kind}:${key}:${String(value).toLowerCase()}`)}`;
    }

    function normalizeSource(value, fallbackNow) {
        const safe = value && typeof value === 'object' ? value : {};
        const type = cleanText(safe.type, 48);
        const chatId = cleanText(safe.chatId, 120);
        const messageId = cleanText(safe.messageId, 120);
        if (!type) return null;
        return {
            type,
            chatId,
            messageId,
            observedAt: Number(safe.observedAt) || fallbackNow,
            confidence: clampConfidence(safe.confidence)
        };
    }

    function validSignalValue(kind, key, value) {
        if (kind === 'interaction_preference') {
            return Boolean(PREFERENCE_VALUES[key]?.has(value));
        }
        return Boolean(value);
    }

    function recomputeSignal(signal) {
        const contributions = Array.isArray(signal.contributions) ? signal.contributions : [];
        const combinedConfidence = 1 - contributions.reduce(
            (remaining, contribution) => remaining * (1 - clampConfidence(contribution.confidence)),
            1
        );
        return {
            ...signal,
            contributions,
            confidence: Number(combinedConfidence.toFixed(4)),
            evidenceCount: contributions.length,
            sourceChatIds: [...new Set(contributions.map((entry) => entry.chatId).filter(Boolean))],
            firstObservedAt: contributions.length
                ? Math.min(...contributions.map((entry) => entry.observedAt))
                : Number(signal.firstObservedAt) || 0,
            lastObservedAt: contributions.length
                ? Math.max(...contributions.map((entry) => entry.observedAt))
                : Number(signal.lastObservedAt) || 0
        };
    }

    function normalizeSignal(value, now) {
        if (!value || typeof value !== 'object') return null;
        const kind = cleanText(value.kind, 48);
        const key = cleanText(value.key, 80);
        const maxLength = kind === 'interaction_preference' ? 80 : 500;
        const signalValue = cleanText(value.value, maxLength);
        if (!KINDS.has(kind) || !key || !validSignalValue(kind, key, signalValue)) return null;
        const contributions = (Array.isArray(value.contributions) ? value.contributions : [])
            .map((entry) => normalizeSource(entry, now))
            .filter(Boolean)
            .slice(-40);
        if (!contributions.length) return null;
        const consent = value.consent === 'explicit'
            ? 'explicit'
            : (kind === 'legacy_memory'
                ? 'review_required'
                : (kind === 'interaction_preference' ? 'personal_intelligence_opt_in' : 'none'));
        if (kind === 'approved_memory' && consent !== 'explicit') return null;
        return recomputeSignal({
            id: signalId(kind, key, signalValue),
            kind,
            key,
            value: signalValue,
            status: value.status === 'contradicted' ? 'contradicted' : 'active',
            consent,
            sensitivity: value.sensitivity === 'sensitive' ? 'sensitive' : 'non_sensitive',
            contributions,
            contradictedAt: Number(value.contradictedAt) || null
        });
    }

    function createBundle(now = Date.now()) {
        const timestamp = Number(now) || Date.now();
        return { version: VERSION, createdAt: timestamp, updatedAt: timestamp, signals: [] };
    }

    function trimSignals(signals) {
        return [...signals]
            .sort((left, right) => (
                (right.kind === 'approved_memory' ? 2 : Number(right.kind === 'legacy_memory')) -
                (left.kind === 'approved_memory' ? 2 : Number(left.kind === 'legacy_memory')) ||
                right.lastObservedAt - left.lastObservedAt
            ))
            .slice(0, MAX_SIGNALS)
            .sort((left, right) => right.lastObservedAt - left.lastObservedAt);
    }

    function normalizeBundle(value, now = Date.now()) {
        const timestamp = Number(now) || Date.now();
        const safe = value && typeof value === 'object' ? value : {};
        return {
            version: VERSION,
            createdAt: Number(safe.createdAt) || timestamp,
            updatedAt: Number(safe.updatedAt) || timestamp,
            signals: trimSignals((Array.isArray(safe.signals) ? safe.signals : [])
                .map((signal) => normalizeSignal(signal, timestamp))
                .filter(Boolean))
        };
    }

    function recordSignal(value, input, now = Date.now()) {
        const timestamp = Number(now) || Date.now();
        const bundle = normalizeBundle(value, timestamp);
        const kind = cleanText(input?.kind, 48);
        const key = cleanText(input?.key, 80);
        const maxLength = kind === 'interaction_preference' ? 80 : 500;
        const signalValue = cleanText(input?.value, maxLength);
        const consent = input?.consent === 'explicit'
            ? 'explicit'
            : (kind === 'legacy_memory'
                ? 'review_required'
                : (kind === 'interaction_preference' ? 'personal_intelligence_opt_in' : 'none'));
        if (!KINDS.has(kind) || !key || !validSignalValue(kind, key, signalValue)) return bundle;
        if (kind === 'approved_memory' && consent !== 'explicit') return bundle;
        const contribution = normalizeSource({
            ...input.source,
            observedAt: timestamp,
            confidence: input.confidence
        }, timestamp);
        if (!contribution) return bundle;

        const exactId = signalId(kind, key, signalValue);
        const contributionIsExplicit = EXPLICIT_SOURCE_TYPES.has(contribution.type);
        const hasExplicitConflict = kind === 'interaction_preference' && !contributionIsExplicit &&
            bundle.signals.some((signal) => (
                signal.kind === kind && signal.key === key && signal.id !== exactId &&
                signal.status === 'active' && hasExplicitSource(signal)
            ));
        const existingIndex = bundle.signals.findIndex((signal) => signal.id === exactId);
        const contributionKey = `${contribution.type}:${contribution.chatId}:${contribution.messageId}`;
        if (existingIndex >= 0) {
            const existing = bundle.signals[existingIndex];
            const withoutDuplicate = existing.contributions.filter((entry) => (
                `${entry.type}:${entry.chatId}:${entry.messageId}` !== contributionKey
            ));
            bundle.signals[existingIndex] = recomputeSignal({
                ...existing,
                status: contributionIsExplicit
                    ? 'active'
                    : (existing.status === 'contradicted' || hasExplicitConflict ? 'contradicted' : 'active'),
                consent: consent === 'explicit' ? 'explicit' : existing.consent,
                contradictedAt: null,
                contributions: [...withoutDuplicate, contribution]
            });
        } else {
            bundle.signals.push(recomputeSignal({
                id: exactId,
                kind,
                key,
                value: signalValue,
                status: hasExplicitConflict ? 'contradicted' : 'active',
                consent,
                sensitivity: input?.sensitivity === 'sensitive' ? 'sensitive' : 'non_sensitive',
                contributions: [contribution],
                contradictedAt: null
            }));
        }

        if (kind === 'interaction_preference' && contributionIsExplicit) {
            bundle.signals = bundle.signals.map((signal) => (
                signal.kind === kind && signal.key === key && signal.id !== exactId && signal.status === 'active'
                    ? { ...signal, status: 'contradicted', contradictedAt: timestamp }
                    : signal
            ));
        }
        bundle.updatedAt = timestamp;
        bundle.signals = trimSignals(bundle.signals);
        return bundle;
    }

    function hasExplicitSource(signal) {
        return signal.contributions.some((entry) => EXPLICIT_SOURCE_TYPES.has(entry.type));
    }

    function effectiveConfidence(signal, now = Date.now()) {
        if (signal.kind === 'approved_memory' || hasExplicitSource(signal)) return signal.confidence;
        const ageDays = Math.max(0, (Number(now) - signal.lastObservedAt) / DAY_MS);
        const halfLifeDays = signal.kind === 'interaction_preference' ? 90 : 30;
        return signal.confidence * Math.pow(0.5, ageDays / halfLifeDays);
    }

    function getActiveSignals(value, { now = Date.now(), kind = '' } = {}) {
        return normalizeBundle(value, now).signals
            .filter((signal) => signal.status === 'active')
            .filter((signal) => !kind || signal.kind === kind)
            .filter((signal) => {
                if (signal.kind === 'approved_memory') return signal.consent === 'explicit';
                if (signal.kind === 'legacy_memory') return false;
                if (hasExplicitSource(signal)) return effectiveConfidence(signal, now) >= 0.65;
                return signal.sourceChatIds.length >= 2 && effectiveConfidence(signal, now) >= 0.65;
            })
            .map((signal) => ({
                ...signal,
                effectiveConfidence: Number(effectiveConfidence(signal, now).toFixed(4))
            }));
    }

    function buildPreferenceOverrides(value, now = Date.now()) {
        return getActiveSignals(value, { now, kind: 'interaction_preference' })
            .sort((left, right) => left.lastObservedAt - right.lastObservedAt)
            .reduce((result, signal) => {
                if (PREFERENCE_VALUES[signal.key]?.has(signal.value)) result[signal.key] = signal.value;
                return result;
            }, {});
    }

    function restoreLatestSignals(signals) {
        const groups = new Map();
        signals.forEach((signal) => {
            const key = `${signal.kind}:${signal.key}`;
            const group = groups.get(key) || [];
            group.push(signal);
            groups.set(key, group);
        });
        groups.forEach((group) => {
            if (group.some((signal) => signal.status === 'active')) return;
            group.sort((left, right) => right.lastObservedAt - left.lastObservedAt)[0].status = 'active';
        });
        return signals;
    }

    function removeChatContributions(value, chatId, now = Date.now()) {
        const target = cleanText(chatId, 120);
        const bundle = normalizeBundle(value, now);
        if (!target) return bundle;
        const signals = bundle.signals.flatMap((signal) => {
            if (signal.kind === 'approved_memory' && signal.consent === 'explicit') return [signal];
            const contributions = signal.contributions.filter((entry) => entry.chatId !== target);
            return contributions.length ? [recomputeSignal({ ...signal, contributions })] : [];
        });
        return {
            ...bundle,
            updatedAt: Number(now) || Date.now(),
            signals: restoreLatestSignals(signals)
        };
    }

    function clearApprovedMemories(value, now = Date.now()) {
        const bundle = normalizeBundle(value, now);
        return {
            ...bundle,
            updatedAt: Number(now) || Date.now(),
            signals: bundle.signals.filter((signal) => (
                signal.kind !== 'approved_memory' && signal.kind !== 'legacy_memory'
            ))
        };
    }

    function migrateLegacyContext(value, legacyStore, now = Date.now()) {
        const safe = legacyStore && typeof legacyStore === 'object' ? legacyStore : {};
        return (Array.isArray(safe.behavioralFacts) ? safe.behavioralFacts : [])
            .map((fact) => cleanText(fact, 500))
            .filter(Boolean)
            .slice(0, 40)
            .reduce((bundle, fact, index) => recordSignal(bundle, {
                kind: 'legacy_memory',
                key: 'memory',
                value: fact,
                confidence: 1,
                source: {
                    type: 'legacy_migration',
                    chatId: '',
                    messageId: `legacy-${index}`
                }
            }, Number(now) || Date.now()), normalizeBundle(value, now));
    }

    function getReviewRequiredMemories(value, now = Date.now()) {
        const bundle = normalizeBundle(value, now);
        const approved = new Set(bundle.signals
            .filter((signal) => signal.kind === 'approved_memory' && signal.consent === 'explicit')
            .map((signal) => signal.value.toLowerCase()));
        return bundle.signals
            .filter((signal) => signal.kind === 'legacy_memory')
            .map((signal) => signal.value)
            .filter((memory) => !approved.has(memory.toLowerCase()));
    }

    function clearInteractionPreferences(value, now = Date.now()) {
        const bundle = normalizeBundle(value, now);
        return {
            ...bundle,
            updatedAt: Number(now) || Date.now(),
            signals: bundle.signals.filter((signal) => signal.kind !== 'interaction_preference')
        };
    }

    function inferExplicitPreferenceSignals(message) {
        const text = String(message || '').toLowerCase().replace(/\s+/g, ' ').trim();
        if (!text) return [];
        const signals = [];
        const add = (key, value) => {
            if (!signals.some((signal) => signal.key === key)) signals.push({ key, value });
        };

        if (/\b(?:keep (?:it )?|be |make (?:it )?)(?:short|brief|concise)\b|\b(?:short|brief|concise) answers?\b/.test(text)) {
            add('detailLevel', 'brief');
        } else if (/\b(?:more|very) detailed\b|\b(?:be|give me) (?:thorough|detailed)\b|\bin depth\b/.test(text)) {
            add('detailLevel', 'detailed');
        }

        if (/\b(?:be|stay) direct\b|\bstraight answer\b|\bdon'?t sugarcoat\b|\bjust tell me plainly\b/.test(text)) {
            add('directnessLevel', 'direct');
        } else if (/\b(?:be|stay) gentle\b|\bsoften (?:it|the answer)\b/.test(text)) {
            add('directnessLevel', 'soft');
        }

        if (/\bstep[- ]by[- ]step\b|\buse (?:a )?(?:checklist|list|bullets)\b|\bbreak it down\b/.test(text)) {
            add('structureLevel', 'stepwise');
        }

        if (/\bplain (?:language|english)\b|\bsimple terms\b|\bavoid jargon\b/.test(text)) {
            add('technicalLevel', 'plain');
        } else if (/\btechnical detail\b|\buse technical (?:language|terms)\b/.test(text)) {
            add('technicalLevel', 'technical');
        }

        if (/\b(?:do not|don'?t|stop) ask(?:ing)? (?:me )?(?:follow[- ]?up )?questions\b|\bjust answer\b/.test(text)) {
            add('followUpLevel', 'none');
        } else if (/\bask me (?:more |some )?questions\b|\bguide me with questions\b/.test(text)) {
            add('followUpLevel', 'active');
        }

        if (/\b(?:do not|don'?t) reassure me\b|\bless reassurance\b/.test(text)) {
            add('reassuranceLevel', 'low');
        } else if (/\bi need reassurance\b|\bmore reassurance\b/.test(text)) {
            add('reassuranceLevel', 'high');
        }

        return signals;
    }

    return {
        VERSION,
        createBundle,
        normalizeBundle,
        recordSignal,
        getActiveSignals,
        buildPreferenceOverrides,
        removeChatContributions,
        clearApprovedMemories,
        clearInteractionPreferences,
        inferExplicitPreferenceSignals,
        migrateLegacyContext,
        getReviewRequiredMemories
    };
});
