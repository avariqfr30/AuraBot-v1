const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const responseExamples = require('../lib/response-examples');

assert.equal(
    typeof responseExamples.loadAllApprovedExamples,
    'function',
    'loadAllApprovedExamples must be implemented'
);
assert.equal(responseExamples.RESPONSE_EXAMPLE_FILES.length, 2);

const examples = responseExamples.loadAllApprovedExamples();
assert.equal(examples.length, 68);
assert.equal(new Set(examples.map((example) => example.id)).size, examples.length);

const companionExamples = examples.filter((example) => example.domain === 'companion');
assert.equal(companionExamples.length, 28);

const expectedTasks = [
    'emotional_presence',
    'supportive_disagreement',
    'uncertainty_clarification',
    'topic_transition',
    'repair_after_misread',
    'tool_offer',
    'tool_suppression'
];
expectedTasks.forEach((task) => {
    assert.equal(
        companionExamples.filter((example) => example.task === task).length,
        4,
        `${task} must have four approved variations`
    );
});

const evaluationPath = path.resolve(
    __dirname,
    '..',
    'contents',
    'examples',
    'companion-evaluation-cases.json'
);
const evaluationCases = JSON.parse(fs.readFileSync(evaluationPath, 'utf8'));
assert.ok(evaluationCases.length >= 12);
assert.ok(evaluationCases.every((entry) => entry.retrievable === false));

console.log('response example tests passed');
