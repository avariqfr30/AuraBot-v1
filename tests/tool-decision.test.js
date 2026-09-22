'use strict';

const assert = require('node:assert/strict');
const policy = require('../public/js/tool-decision');

assert.equal(policy.TOOL_TYPES.has('checklist'), true);
assert.deepEqual(
    policy.sanitizeOpportunity({ shouldUseTool: true, type: 'unknown', confidence: 1 }),
    {
        shouldUseTool: true,
        type: 'checklist',
        theme: 'Quick support',
        reason: '',
        confidence: 1,
        userLine: ''
    },
    'cleanup must preserve the existing fallback behavior for unknown candidates'
);

const explicit = policy.deriveExplicit(
    'Please make me a checklist for tomorrow.',
    'I have ADHD and keep losing track of tasks.'
);
assert.equal(explicit.type, 'checklist');
assert.equal(explicit.shouldUseTool, true);
assert.match(explicit.theme, /ADHD support/i);

const proactive = policy.deriveCandidate(
    'I feel overwhelmed and need help breaking this down.',
    'PlannerAgent',
    ''
);
assert.equal(proactive.type, 'checklist');
assert.equal(proactive.shouldUseTool, true);

assert.equal(
    policy.shouldSuppress({
        message: 'What is a panic attack?',
        route: 'KnowledgeAgent',
        explicitToolRequest: false,
        toolRefusal: false
    }),
    false,
    'cleanup must preserve the existing panic-keyword personal-need behavior'
);
assert.equal(
    policy.shouldSuppress({
        message: 'I am overwhelmed and need a plan.',
        route: 'PlannerAgent',
        explicitToolRequest: false,
        toolRefusal: false
    }),
    false
);

console.log('tool decision tests passed');
