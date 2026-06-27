(function initializeModelRouting(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_MODEL_ROUTING = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createModelRouting() {
    const AUTO_MODEL_PREFERENCE = 'auto';
    const MEDICAL_TERMS = /\b(symptoms?|diagnos(?:is|e)|treatment|medication|medicine|dose|dosage|side effects?|interaction|lab(?:s| report)?|blood test|imaging|x-?ray|mri|ct scan|clinical|medical|patient|doctor|physician|pharmacist|disease|disorder|condition|syndrome|infection|injury|surgery|pain|fever|headache|migraine|nausea|vomit|rash|allerg\w*|diabet\w*|cancer|asthma|antibiotic|antidepressant|vaccine|blood pressure|heart rate|hba1c|glucose|cholesterol)\b/i;
    const MEDICAL_DOCUMENT_TERMS = /\b(extract|interpret|summarize|review|values?|units?|abnormal|reference range|report|record|ehr|lab)\b/i;
    const COMPLEX_MEDICAL_TERMS = /\b(diagnos(?:is|e)|treatment plan|drug interaction|contraindication|multiple medications|differential|prognosis|severe|worsening|pregnan|child|infant)\b/i;
    const FRESHNESS_TERMS = /\b(current|latest|today|recent|guideline|approved|recall|interaction database)\b/i;

    function normalizeModels(models) {
        return [...new Set((models || []).map((model) => String(model || '').trim()).filter(Boolean))];
    }

    function getModelFamily(modelName) {
        const value = String(modelName || '').toLowerCase();
        if (value.includes('gpt-oss')) return 'gpt-oss';
        if (value.includes('medgemma')) return 'medgemma';
        return 'other';
    }

    function classifyTurn({
        message = '',
        effectiveRoute = '',
        sourceNeedDecision = null,
        documentText = null,
        highRiskRecommendations = []
    } = {}) {
        const text = String(message || '');
        const documentSample = String(documentText || '').slice(0, 2500);
        const medicalInput = `${text}\n${documentSample}`;
        const route = String(effectiveRoute || '');
        const riskIds = (highRiskRecommendations || []).map((entry) => entry?.id).filter(Boolean);
        const medical = MEDICAL_TERMS.test(medicalInput) || /medical|health/i.test(route);
        const medicalDocument = Boolean(documentText) && medical && MEDICAL_DOCUMENT_TERMS.test(text);
        const highRisk = riskIds.some((id) => ['acute_medical_emergency', 'poison_or_overdose'].includes(id));
        const complex = medical && (highRisk || COMPLEX_MEDICAL_TERMS.test(text));
        const needsCurrentInformation = FRESHNESS_TERMS.test(text);

        return {
            domain: medical ? 'medical' : 'general',
            task: medicalDocument ? 'medical_document' : (medical ? 'medical_text' : 'conversation'),
            risk: highRisk ? 'high' : (complex ? 'medium' : 'low'),
            complex,
            needsCurrentInformation
        };
    }

    function pickAvailable(preferred, availableModels, fallback) {
        const available = normalizeModels(availableModels);
        if (!available.length || available.includes(preferred)) return preferred;
        return available.includes(fallback) ? fallback : (available[0] || fallback || preferred);
    }

    function resolveModelRoute({
        preference = AUTO_MODEL_PREFERENCE,
        availableModels = [],
        gptModel,
        medModel,
        message = '',
        effectiveRoute = '',
        sourceNeedDecision = null,
        documentText = null,
        highRiskRecommendations = []
    } = {}) {
        const classification = classifyTurn({
            message,
            effectiveRoute,
            sourceNeedDecision,
            documentText,
            highRiskRecommendations
        });
        const available = normalizeModels(availableModels);

        if (classification.risk === 'high') {
            return {
                primaryModel: pickAvailable(gptModel, available, medModel),
                reviewerModel: null,
                recommendedEffort: 'medium',
                source: 'safety',
                classification,
                reason: 'Urgent safety guidance must not wait for a second model.'
            };
        }

        if (preference && preference !== AUTO_MODEL_PREFERENCE) {
            return {
                primaryModel: pickAvailable(preference, available, gptModel),
                reviewerModel: null,
                recommendedEffort: classification.complex ? 'high' : 'medium',
                source: 'manual',
                classification,
                reason: 'Explicit model override.'
            };
        }

        let primaryModel = gptModel;
        let reviewerModel = null;
        let reason = 'General conversation, reasoning, or tool use.';

        if (classification.task === 'medical_document') {
            primaryModel = medModel;
            reason = 'Medical document interpretation matches MedGemma specialization.';
        } else if (classification.domain === 'medical' && (classification.complex || classification.needsCurrentInformation)) {
            primaryModel = gptModel;
            reviewerModel = medModel;
            reason = 'Complex or current medical request uses GPT-OSS synthesis with MedGemma review.';
        }

        primaryModel = pickAvailable(primaryModel, available, gptModel);
        reviewerModel = reviewerModel && reviewerModel !== primaryModel && (!available.length || available.includes(reviewerModel))
            ? reviewerModel
            : null;

        return {
            primaryModel,
            reviewerModel,
            recommendedEffort: classification.complex && classification.risk !== 'high' ? 'high' : 'medium',
            source: 'auto',
            classification,
            reason
        };
    }

    function resolveEffort({ requestedMode = 'auto', callType = 'default', routeDecision = null } = {}) {
        if (['analysis', 'cleanup', 'json'].includes(callType)) return 'low';
        if (requestedMode === 'fast') return 'low';
        if (requestedMode === 'balanced') return 'medium';
        if (requestedMode === 'deep') return 'high';
        return routeDecision?.recommendedEffort || 'medium';
    }

    function resolveInferencePolicy({
        modelName,
        requestedMode = 'auto',
        callType = 'default',
        routeDecision = null
    } = {}) {
        const effort = resolveEffort({ requestedMode, callType, routeDecision });
        const family = getModelFamily(modelName);
        const backgroundLimits = { analysis: 512, cleanup: 640, json: 512 };
        const completionLimits = family === 'gpt-oss'
            ? { low: 1024, medium: 2048, high: 4096 }
            : { low: 768, medium: 1024, high: 1536 };

        return {
            effort,
            think: family === 'gpt-oss' ? effort : null,
            passes: family === 'medgemma' && effort === 'high' && callType === 'default' ? 2 : 1,
            maxTokens: backgroundLimits[callType] || completionLimits[effort]
        };
    }

    return {
        AUTO_MODEL_PREFERENCE,
        classifyTurn,
        getModelFamily,
        resolveEffort,
        resolveModelRoute,
        resolveInferencePolicy
    };
});
