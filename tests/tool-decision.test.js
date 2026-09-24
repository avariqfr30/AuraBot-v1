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

const acceptedThoughtRecord = policy.deriveExplicit('Yeah, a thought record would be pretty cool.');
assert.equal(acceptedThoughtRecord.shouldUseTool, true);
assert.equal(acceptedThoughtRecord.type, 'thought_record');
assert.equal(turnPolicy.resolveInitiative({
    toolCandidate: acceptedThoughtRecord,
    explicitToolRequest: acceptedThoughtRecord.shouldUseTool
}).tool.mode, 'create');
for (const wording of [
    'That thought worksheet sounds helpful.',
    "I'd like to try the thought record.",
    'Let us do the thought record.',
    'A thought log sounds good to me.'
]) {
    assert.equal(policy.deriveExplicit(wording).type, 'thought_record', wording);
    assert.equal(policy.deriveExplicit(wording).shouldUseTool, true, wording);
}
assert.equal(policy.deriveExplicit('What is a thought record?').shouldUseTool, false);
assert.equal(policy.deriveExplicit('What is a thought record, and can we try one?').type, 'thought_record');
assert.equal(policy.deriveExplicit('What is a thought record, and can we try one?').shouldUseTool, true);
assert.equal(policy.deriveExplicit('I do not want a thought record.').shouldUseTool, false);

const pendingThoughtOffer = [{ role: 'ai', toolOffer: {
    type: 'thought_record', theme: 'Reflect on a conversation', status: 'pending'
} }];
for (const wording of ['Yes, please.', 'Sure, let’s give it a go.', 'That sounds useful.', 'Let us try it.']) {
    const accepted = policy.resolvePendingOfferAcceptance(wording, pendingThoughtOffer);
    assert.equal(accepted?.type, 'thought_record', wording);
    assert.equal(accepted?.theme, 'Reflect on a conversation', wording);
}
for (const wording of ['No thanks.', 'What does it do?', 'Yes, but I only want to understand it.']) {
    assert.equal(policy.resolvePendingOfferAcceptance(wording, pendingThoughtOffer), null, wording);
}
assert.equal(policy.resolvePendingOfferAcceptance('Yes please.', [{ role: 'ai', toolOffer: {
    ...pendingThoughtOffer[0].toolOffer, status: 'dismissed'
} }]), null);

const fillableThoughtTable = policy.deriveExplicit(
    'A quick table I can fill in might do great!',
    'I keep thinking about my former partner. Yeah, a thought record would be pretty cool.'
);
assert.equal(fillableThoughtTable.shouldUseTool, true);
assert.equal(fillableThoughtTable.type, 'thought_record');
assert.equal(policy.deriveExplicit('A quick table I can fill in might do great!').shouldUseTool, false);
assert.equal(policy.deriveExplicit('Could I have a worksheet with blanks to complete?',
    'We discussed a thought record for this feeling.').type, 'thought_record');
assert.equal(policy.deriveExplicit('Could I have a worksheet with blanks to complete?',
    'We discussed a packing checklist.').shouldUseTool, false);
assert.equal(policy.deriveExplicit('Could I have a worksheet with blanks to complete for my chemistry class?',
    'We discussed a thought record for this feeling.').shouldUseTool, false);

for (const wording of [
    "I can't keep circling this. Is there anything concrete I could try?",
    'The same worry keeps coming back. How can I start untangling it?',
    'I feel stuck with this again. I need something I can work through.',
    'Could we try something small that might help me move forward?'
]) {
    assert.equal(policy.shouldConsiderAdaptiveOffer({ message: wording, route: 'GeneralFriendAgent' }), true, wording);
}
for (const wording of [
    'I just need to vent. Please listen.',
    'What is a thought record?',
    'I am telling you about last year, and I am fine now.',
    'Please do not suggest a tool. I need an answer.'
]) {
    assert.equal(policy.shouldConsiderAdaptiveOffer({ message: wording, route: 'GeneralFriendAgent' }), false, wording);
}
assert.equal(policy.shouldConsiderAdaptiveOffer({
    message: 'I feel stuck again. Is there something to try?', route: 'SearchAgent'
}), false);

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

const dailySupport = policy.deriveExplicit(
    'Could you set me up a tool to help? I want to come back each day and work through one small step.',
    'I am grieving my past relationship and missing my former partner.'
);
assert.equal(dailySupport.shouldUseTool, true);
assert.equal(dailySupport.type, 'follow_up_plan');
assert.match(dailySupport.theme, /relationship/);
assert.doesNotMatch(dailySupport.userLine, /notify|send you|remind you daily/i);

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
