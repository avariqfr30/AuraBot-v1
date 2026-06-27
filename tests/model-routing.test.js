const assert = require('node:assert/strict');
const {
    AUTO_MODEL_PREFERENCE,
    classifyTurn,
    resolveModelRoute,
    resolveInferencePolicy
} = require('../js/model-routing');

const GPT = 'gpt-oss:120b-cloud';
const MED = 'medgemma1.5:4b';
const models = [GPT, MED];

assert.equal(classifyTurn({ message: 'Help me organize my week.' }).domain, 'general');
assert.equal(classifyTurn({ message: 'Explain my HbA1c result.' }).domain, 'medical');
assert.equal(classifyTurn({
    message: 'Extract the values from this lab report.',
    documentText: 'Hemoglobin 13.2 g/dL\nHbA1c 8.4%'
}).task, 'medical_document');

const general = resolveModelRoute({
    preference: AUTO_MODEL_PREFERENCE,
    availableModels: models,
    gptModel: GPT,
    medModel: MED,
    message: 'Help me organize my week.'
});
assert.equal(general.primaryModel, GPT);
assert.equal(general.reviewerModel, null);

const medicalDocument = resolveModelRoute({
    preference: AUTO_MODEL_PREFERENCE,
    availableModels: models,
    gptModel: GPT,
    medModel: MED,
    message: 'Extract the abnormal values from this lab report.',
    documentText: 'HbA1c 8.4%'
});
assert.equal(medicalDocument.primaryModel, MED);

const highRiskMedical = resolveModelRoute({
    preference: AUTO_MODEL_PREFERENCE,
    availableModels: models,
    gptModel: GPT,
    medModel: MED,
    message: 'I have chest pain and shortness of breath right now.',
    highRiskRecommendations: [{ id: 'acute_medical_emergency', line: 'Get urgent help.' }]
});
assert.equal(highRiskMedical.primaryModel, GPT);
assert.equal(highRiskMedical.reviewerModel, null);
assert.equal(highRiskMedical.recommendedEffort, 'medium');

const manualMedGemmaEmergency = resolveModelRoute({
    preference: MED,
    availableModels: models,
    gptModel: GPT,
    medModel: MED,
    message: 'I have chest pain and shortness of breath right now.',
    highRiskRecommendations: [{ id: 'acute_medical_emergency', line: 'Get urgent help.' }]
});
assert.equal(manualMedGemmaEmergency.primaryModel, GPT);
assert.equal(manualMedGemmaEmergency.source, 'safety');

const manualMedGemma = resolveModelRoute({
    preference: MED,
    availableModels: models,
    gptModel: GPT,
    medModel: MED,
    message: 'Write a project plan.'
});
assert.equal(manualMedGemma.primaryModel, MED);
assert.equal(manualMedGemma.reviewerModel, null);
assert.equal(manualMedGemma.source, 'manual');

const medUnavailable = resolveModelRoute({
    preference: AUTO_MODEL_PREFERENCE,
    availableModels: [GPT],
    gptModel: GPT,
    medModel: MED,
    message: 'Extract this lab report.',
    documentText: 'Potassium 4.1 mmol/L'
});
assert.equal(medUnavailable.primaryModel, GPT);
assert.equal(medUnavailable.reviewerModel, null);

assert.deepEqual(
    resolveInferencePolicy({ modelName: GPT, requestedMode: 'fast', callType: 'default' }),
    { effort: 'low', think: 'low', passes: 1, maxTokens: 1024 }
);
assert.deepEqual(
    resolveInferencePolicy({ modelName: GPT, requestedMode: 'deep', callType: 'default' }),
    { effort: 'high', think: 'high', passes: 1, maxTokens: 4096 }
);
assert.deepEqual(
    resolveInferencePolicy({ modelName: GPT, requestedMode: 'deep', callType: 'analysis' }),
    { effort: 'low', think: 'low', passes: 1, maxTokens: 512 }
);
assert.deepEqual(
    resolveInferencePolicy({ modelName: MED, requestedMode: 'deep', callType: 'default' }),
    { effort: 'high', think: null, passes: 2, maxTokens: 1536 }
);

console.log('model routing tests passed');
