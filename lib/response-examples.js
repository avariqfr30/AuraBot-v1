const fs = require('fs');
const path = require('path');

const RESPONSE_EXAMPLE_COLLECTION = 'aura_response_examples_v1';
const PERSONAL_RESPONSE_EXAMPLE_COLLECTION = 'aura_personal_response_examples_v1';
const RESPONSE_EXAMPLE_FILE = path.resolve(__dirname, '..', 'contents', 'examples', 'medical-response-examples.json');
const COMPANION_RESPONSE_EXAMPLE_FILE = path.resolve(__dirname, '..', 'contents', 'examples', 'companion-response-examples.json');
const RESPONSE_EXAMPLE_FILES = [
    RESPONSE_EXAMPLE_FILE,
    COMPANION_RESPONSE_EXAMPLE_FILE
];
const ALLOWED_DOMAINS = new Set(['medical', 'companion']);
const ALLOWED_RISKS = new Set(['low', 'medium', 'high']);
const ALLOWED_MODELS = new Set(['gpt-oss', 'medgemma', 'either']);

function validateExample(example) {
    const errors = [];
    if (!example || typeof example !== 'object') return ['Example must be an object.'];
    if (!/^[a-z0-9-]+$/.test(String(example.id || ''))) errors.push('id must use lowercase letters, numbers, and hyphens.');
    if (example.status !== 'approved') errors.push('status must be approved.');
    if (!ALLOWED_DOMAINS.has(example.domain)) errors.push('domain is not supported.');
    if (!String(example.task || '').trim()) errors.push('task is required.');
    if (!ALLOWED_RISKS.has(example.risk)) errors.push('risk is not supported.');
    if (!ALLOWED_MODELS.has(example.preferredModel)) errors.push('preferredModel is not supported.');
    if (!Array.isArray(example.tags) || !example.tags.length) errors.push('tags must be a non-empty array.');
    if (!String(example.userMessage || '').trim()) errors.push('userMessage is required.');
    if (!String(example.idealResponse || '').trim()) errors.push('idealResponse is required.');
    if (!Array.isArray(example.avoid)) errors.push('avoid must be an array.');
    return errors;
}

function loadApprovedExamples(filePath = RESPONSE_EXAMPLE_FILE) {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(parsed)) throw new Error('Response example file must contain a JSON array.');

    return parsed.map((example, index) => {
        const errors = validateExample(example);
        if (errors.length) {
            throw new Error(`Invalid response example at index ${index} (${example?.id || 'missing-id'}): ${errors.join(' ')}`);
        }
        return example;
    });
}

function loadAllApprovedExamples(filePaths = RESPONSE_EXAMPLE_FILES) {
    const examples = filePaths.flatMap((filePath) => loadApprovedExamples(filePath));
    const seen = new Set();
    examples.forEach((example) => {
        if (seen.has(example.id)) {
            throw new Error(`Duplicate response example id: ${example.id}`);
        }
        seen.add(example.id);
    });
    return examples;
}

function buildStoredDocument(example) {
    return JSON.stringify({
        userMessage: example.userMessage,
        idealResponse: example.idealResponse,
        avoid: example.avoid
    });
}

function buildEmbeddingDocument(example) {
    return [
        `Domain: ${example.domain}`,
        `Task: ${example.task}`,
        `Risk: ${example.risk}`,
        `Tags: ${example.tags.join(', ')}`,
        `Example request: ${example.userMessage}`,
        `Preferred response: ${example.idealResponse}`
    ].join('\n');
}

function buildMetadata(example) {
    return {
        status: example.status,
        domain: example.domain,
        task: example.task,
        risk: example.risk,
        preferredModel: example.preferredModel,
        tags: example.tags.join(','),
        version: Number(example.version || 1),
        storedDocument: buildStoredDocument(example)
    };
}

function buildPersonalEmbeddingDocument(example) {
    return [
        'Source: explicitly approved local feedback',
        `Task: ${example.task || 'conversation'}`,
        `Example request: ${example.userMessage}`,
        `Preferred response: ${example.idealResponse}`
    ].join('\n');
}

function buildPersonalMetadata(example) {
    return {
        status: 'approved',
        source: 'local_feedback',
        profileId: example.profileId,
        domain: 'companion',
        route: example.route,
        task: example.task || 'conversation',
        risk: 'low',
        preferredModel: example.preferredModel || 'either',
        version: 1,
        updatedAt: Number(example.updatedAt) || Date.now(),
        storedDocument: buildStoredDocument({
            userMessage: example.userMessage,
            idealResponse: example.idealResponse,
            avoid: []
        })
    };
}

module.exports = {
    RESPONSE_EXAMPLE_COLLECTION,
    PERSONAL_RESPONSE_EXAMPLE_COLLECTION,
    RESPONSE_EXAMPLE_FILE,
    COMPANION_RESPONSE_EXAMPLE_FILE,
    RESPONSE_EXAMPLE_FILES,
    buildEmbeddingDocument,
    buildMetadata,
    buildPersonalEmbeddingDocument,
    buildPersonalMetadata,
    loadAllApprovedExamples,
    loadApprovedExamples,
    validateExample
};
