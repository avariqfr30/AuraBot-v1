'use strict';

const assert = require('node:assert/strict');
const adaptation = require('../public/js/response-adaptation');

const informational = adaptation.resolve({
    message: 'What is anxiety?',
    route: 'KnowledgeAgent'
});
assert.equal(informational.primaryMode, 'clarify');
assert.equal(informational.distressLevel, 'low');
assert.notEqual(informational.reassuranceNeed, 'high');

const venting = adaptation.resolve({
    message: "I don't need solutions right now. I just need to vent.",
    route: 'GeneralFriendAgent'
});
assert.equal(venting.primaryMode, 'reflect');
assert.equal(venting.secondaryMode, 'none');
assert.equal(venting.questioningLevel, 'none');
assert.ok(venting.responseGoals.includes('Make space for the user without rushing into solutions'));

const planning = adaptation.resolve({
    message: 'I feel overwhelmed. Help me make a simple plan for tomorrow.',
    route: 'PlannerAgent'
});
assert.equal(planning.primaryMode, 'coach');
assert.equal(planning.structureNeed, 'high');
assert.equal(planning.cognitiveBandwidth, 'low');

const acutePanic = adaptation.resolve({
    message: "I'm panicking right now and my heart is racing. Help me slow down.",
    route: 'GeneralFriendAgent'
});
assert.equal(acutePanic.primaryMode, 'soothe');
assert.equal(acutePanic.distressLevel, 'high');
assert.equal(acutePanic.questioningLevel, 'none');
assert.equal(acutePanic.directnessTolerance, 'soft');

const direct = adaptation.resolve({
    message: 'Be direct with me. Am I jumping to conclusions?',
    route: 'CbtAnalystAgent',
    stance: { mode: 'challenge' }
});
assert.equal(direct.directnessTolerance, 'direct');
assert.ok(direct.responseGoals.some((goal) => /test the unsupported conclusion/i.test(goal)));

const professionalBridge = adaptation.resolve({
    message: 'Help me organize what I should tell my psychiatrist at my appointment.',
    route: 'PlannerAgent'
});
assert.equal(professionalBridge.primaryMode, 'coach');
assert.equal(professionalBridge.professionalBridge, 'consider');
assert.equal(professionalBridge.structureNeed, 'high');

const historicalEmotion = adaptation.resolve({
    message: 'I was anxious about that last year, but I am okay now.',
    route: 'GeneralFriendAgent'
});
assert.notEqual(historicalEmotion.distressLevel, 'high');

console.log('response adaptation tests passed');
