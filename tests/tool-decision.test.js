'use strict';

const assert = require('node:assert/strict');
const policy = require('../public/js/tool-decision');
const turnPolicy = require('../public/js/turn-policy');

assert.equal(policy.TOOL_TYPES.has('checklist'), true);
assert.deepEqual(
    policy.sanitizeOpportunity({ shouldUseTool: true, type: 'unknown', confidence: 1 }),
    {
        shouldUseTool: false,
        type: 'checklist',
        theme: 'Quick support',
        reason: '',
        confidence: 1,
        userLine: ''
    },
    'unknown tool types must not become checklist actions'
);

const explicit = policy.deriveExplicit(
    'Please make me a checklist for that.',
    'I have ADHD and keep losing track of tasks.'
);
assert.equal(explicit.type, 'checklist');
assert.equal(explicit.shouldUseTool, true);
assert.match(explicit.theme, /ADHD support/i);

const unrelatedTheme = policy.deriveExplicit(
    'Please make me a packing checklist.',
    'I have ADHD and keep losing track of tasks.'
);
assert.doesNotMatch(unrelatedTheme.theme, /ADHD/i);

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
    true,
    'an informational panic question does not request a support tool'
);
assert.equal(policy.deriveCandidate('I had a panic attack last month.', 'GeneralFriendAgent').shouldUseTool, false);
assert.equal(policy.shouldSuppress({
    message: 'I just need to vent. I feel overwhelmed.',
    route: 'GeneralFriendAgent'
}), true);
assert.equal(policy.shouldSuppress({
    message: "I just want to vent. I'm overwhelmed.",
    route: 'GeneralFriendAgent'
}), true);
assert.equal(policy.shouldSuppress({
    message: "I was sad all day last week, but I'm fine now.",
    route: 'GeneralFriendAgent'
}), true);
assert.equal(policy.shouldSuppress({
    message: 'I was sad last week, and I feel overwhelmed right now.',
    route: 'GeneralFriendAgent'
}), false);
assert.equal(policy.deriveExplicit('I need to understand what a safety plan is.').shouldUseTool, false);
assert.equal(policy.deriveExplicit('Please prepare questions for my psychiatrist.').type, 'appointment_prep');
assert.equal(policy.deriveExplicit(
    'Please explain my symptoms and prepare questions for my psychiatrist.'
).type, 'appointment_prep');
assert.equal(policy.deriveExplicit(
    'Please explain my symptoms and prepare questions for my psychiatrist.'
).shouldUseTool, true);
assert.equal(policy.deriveExplicit('Please ground me.').type, 'breathing_exercise');
assert.equal(policy.deriveExplicit('Please create a support card.').type, 'affirmation_card');
assert.equal(policy.deriveExplicit('Please create a support card.').shouldUseTool, true);
const grounding = policy.deriveExplicit('Please ground me.');
assert.equal(turnPolicy.resolveInitiative({
    toolCandidate: grounding,
    explicitToolRequest: grounding.shouldUseTool
}).tool.mode, 'create');
assert.equal(policy.shouldSuppress({
    message: 'What is a panic attack? I am panicking right now.',
    route: 'KnowledgeAgent',
    immediateSupportNeed: true
}), false);
assert.equal(policy.shouldSuppress({
    message: 'What should I do if I missed a dose of my medication?',
    route: 'KnowledgeAgent'
}), true);
assert.equal(policy.deriveCandidate(
    'I am panicking right now.', 'GeneralFriendAgent', '',
    { immediateSupportNeed: true }
).type, 'breathing_exercise');

const optionalChecklist = policy.deriveCandidate(
    'I feel overwhelmed and need help breaking this down.', 'PlannerAgent'
);
const noChecklistMemory = [{
    kind: 'approved_memory', consent: 'explicit', status: 'active',
    value: 'Please do not offer me checklists; they stress me out.'
}];
assert.equal(policy.applyApprovedToolPreferences(optionalChecklist, noChecklistMemory, {
    personalIntelligenceActive: true
}), null);
assert.equal(policy.applyApprovedToolPreferences(optionalChecklist, noChecklistMemory, {
    personalIntelligenceActive: false
})?.type, 'checklist');
assert.equal(policy.applyApprovedToolPreferences(optionalChecklist, noChecklistMemory, {
    personalIntelligenceActive: true, explicitToolRequest: true
})?.type, 'checklist');
assert.equal(policy.applyApprovedToolPreferences(optionalChecklist, [
    { ...noChecklistMemory[0], consent: 'none' },
    { ...noChecklistMemory[0], status: 'contradicted' }
], { personalIntelligenceActive: true })?.type, 'checklist');
assert.equal(policy.applyApprovedToolPreferences(optionalChecklist, [{
    kind: 'approved_memory', consent: 'explicit', status: 'active',
    value: "I don't mind checklists when we plan work."
}], { personalIntelligenceActive: true })?.type, 'checklist');
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
