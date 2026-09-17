const assert = require('node:assert/strict');
const feedbackLearning = require('../public/js/feedback-learning');

let state = feedbackLearning.createState();

state = feedbackLearning.upsertFeedback(state, {
    chatId: 'chat-1',
    messageId: 'msg-one-12345678',
    rating: 'not_helpful',
    reasons: ['too_long', 'unwanted_tool'],
    routeSnapshot: { domain: 'general', risk: 'low' }
}, 100);

assert.deepEqual(state.preferenceOverrides, {});
assert.equal(state.toolOfferMode, 'normal');

state = feedbackLearning.upsertFeedback(state, {
    chatId: 'chat-1',
    messageId: 'msg-two-12345678',
    rating: 'not_helpful',
    reasons: ['too_long', 'unwanted_tool'],
    routeSnapshot: { domain: 'general', risk: 'low' }
}, 200);

assert.equal(state.preferenceOverrides.detailLevel, 'brief');
assert.equal(state.toolOfferMode, 'explicit_only');

let ineligibleState = feedbackLearning.createState();
ineligibleState = feedbackLearning.upsertFeedback(ineligibleState, {
    chatId: 'chat-private',
    messageId: 'msg-ineligible-one-12345678',
    rating: 'not_helpful',
    reasons: ['too_long', 'unwanted_tool'],
    learningEligible: false,
    routeSnapshot: { domain: 'general', risk: 'low' }
}, 210);
ineligibleState = feedbackLearning.upsertFeedback(ineligibleState, {
    chatId: 'chat-private',
    messageId: 'msg-ineligible-two-12345678',
    rating: 'not_helpful',
    reasons: ['too_long', 'unwanted_tool'],
    learningEligible: false,
    routeSnapshot: { domain: 'general', risk: 'low' }
}, 220);

assert.deepEqual(
    ineligibleState.preferenceOverrides,
    {},
    'ineligible feedback must not change learned response preferences'
);
assert.equal(
    ineligibleState.toolOfferMode,
    'normal',
    'ineligible feedback must not suppress proactive tools'
);

state = feedbackLearning.upsertFeedback(state, {
    chatId: 'chat-1',
    messageId: 'msg-three-12345678',
    rating: 'not_helpful',
    reasons: ['too_short'],
    routeSnapshot: { domain: 'general', risk: 'low' }
}, 300);

assert.equal(
    state.preferenceOverrides.detailLevel,
    undefined,
    'conflicting feedback must neutralize the learned length override'
);

const helpfulFeedback = feedbackLearning.normalizeEntry({
    chatId: 'chat-1',
    messageId: 'msg-helpful-12345678',
    rating: 'helpful',
    reasons: [],
    routeSnapshot: {
        domain: 'general',
        risk: 'low',
        modelFamily: 'gpt-oss',
        route: 'GeneralFriendAgent',
        task: 'conversation'
    }
});
assert.equal(feedbackLearning.canPromotePersonalExample({
    feedback: helpfulFeedback,
    userMessage: 'Help me plan a calm morning.',
    assistantMessage: 'Start with one quiet, achievable step.'
}), true);

const ineligibleHelpfulFeedback = feedbackLearning.normalizeEntry({
    ...helpfulFeedback,
    messageId: 'msg-ineligible-helpful-12345678',
    learningEligible: false
});
assert.equal(feedbackLearning.canPromotePersonalExample({
    feedback: ineligibleHelpfulFeedback,
    userMessage: 'Help me plan a calm morning.',
    assistantMessage: 'Start with one quiet, achievable step.'
}), false);

assert.equal(feedbackLearning.canPromotePersonalExample({
    feedback: {
        ...helpfulFeedback,
        routeSnapshot: { ...helpfulFeedback.routeSnapshot, domain: 'medical' }
    },
    userMessage: 'What does this symptom mean?',
    assistantMessage: 'It can have several causes.'
}), false);

assert.equal(feedbackLearning.canPromotePersonalExample({
    feedback: {
        ...helpfulFeedback,
        routeSnapshot: { ...helpfulFeedback.routeSnapshot, route: 'SearchAgent' }
    },
    userMessage: 'What changed this week?',
    assistantMessage: 'This answer depends on current sources.'
}), false);

const retry = feedbackLearning.buildRetryRequest({
    chatId: 'chat-1',
    messageId: 'msg-retry-12345678',
    rating: 'not_helpful',
    reasons: ['too_long', 'missed_context'],
    comment: 'Focus on the immediate decision.',
    routeSnapshot: { domain: 'general', risk: 'low' }
}, 'What should I do next?');

assert.match(retry.prompt, /Keep every existing safety, privacy, and evidence rule intact/);
assert.match(retry.prompt, /Focus on the immediate decision/);

const ineligibleRetry = feedbackLearning.buildRetryRequest({
    chatId: 'chat-private',
    messageId: 'msg-ineligible-retry-12345678',
    rating: 'not_helpful',
    reasons: ['missed_context'],
    comment: 'Answer the question I asked.',
    learningEligible: false,
    routeSnapshot: { domain: 'general', risk: 'low' }
}, 'Can you try again?');

assert.match(
    ineligibleRetry.prompt,
    /Answer the question I asked/,
    'inactive feedback must remain usable for immediate retry'
);
assert.equal(
    feedbackLearning.normalizeEntry({
        chatId: 'chat-legacy',
        messageId: 'msg-legacy-12345678',
        rating: 'helpful',
        routeSnapshot: helpfulFeedback.routeSnapshot
    }).learningEligible,
    true,
    'legacy feedback without the field must remain eligible'
);

const safeConversationRoute = {
    domain: 'general',
    risk: 'low',
    route: 'GeneralFriendAgent',
    task: 'conversation',
    source: 'automatic'
};
assert.equal(
    typeof feedbackLearning.resolveFeedbackLearningEligibility,
    'function',
    'feedback eligibility must be resolved by one shared pure policy'
);
assert.equal(
    feedbackLearning.resolveFeedbackLearningEligibility(undefined, true, safeConversationRoute),
    true
);
[
    { ...safeConversationRoute, domain: 'medical' },
    { ...safeConversationRoute, risk: 'high' },
    { ...safeConversationRoute, route: 'SearchAgent' },
    { ...safeConversationRoute, task: 'search' },
    { ...safeConversationRoute, source: 'background' }
].forEach((routeSnapshot) => {
    assert.equal(
        feedbackLearning.resolveFeedbackLearningEligibility(undefined, true, routeSnapshot),
        false,
        `unsafe feedback route must remain retry-only: ${JSON.stringify(routeSnapshot)}`
    );
});
assert.equal(
    feedbackLearning.resolveFeedbackLearningEligibility(false, true, safeConversationRoute),
    false,
    'an ineligible entry must never become eligible later'
);
assert.equal(
    feedbackLearning.resolveFeedbackLearningEligibility(true, false, safeConversationRoute),
    false,
    'editing while Personal Intelligence is inactive permanently disables learning'
);
let unsafePromotionState = feedbackLearning.upsertFeedback(feedbackLearning.createState(), {
    chatId: 'chat-unsafe-promotion',
    messageId: 'msg-unsafe-promotion-12345678',
    rating: 'helpful',
    learningEligible: true,
    routeSnapshot: { ...safeConversationRoute, route: 'SearchAgent' }
});
unsafePromotionState = feedbackLearning.markPromoted(
    unsafePromotionState,
    'msg-unsafe-promotion-12345678',
    'personal-unsafe'
);
assert.equal(
    unsafePromotionState.entries['msg-unsafe-promotion-12345678'].promotedExampleId,
    '',
    'an unsafe route must not be promotable even if stale data says it is eligible'
);

let ineligiblePromotionState = feedbackLearning.upsertFeedback(feedbackLearning.createState(), {
    chatId: 'chat-promotion-revoked',
    messageId: 'msg-promotion-revoked-12345678',
    rating: 'helpful',
    learningEligible: true,
    routeSnapshot: safeConversationRoute
});
ineligiblePromotionState = feedbackLearning.markPromoted(
    ineligiblePromotionState,
    'msg-promotion-revoked-12345678',
    'personal-promotion-revoked'
);
ineligiblePromotionState = feedbackLearning.upsertFeedback(ineligiblePromotionState, {
    ...ineligiblePromotionState.entries['msg-promotion-revoked-12345678'],
    learningEligible: false,
    rating: 'helpful'
});
assert.equal(
    ineligiblePromotionState.entries['msg-promotion-revoked-12345678'].promotedExampleId,
    '',
    'a promotion must be revoked permanently when feedback becomes ineligible'
);

[
    'Diagnosed with bipolar disorder',
    'Takes sertraline medication daily',
    'Survived childhood abuse and trauma',
    'Their sexual orientation is bisexual',
    'Has $12,000 in credit-card debt',
    'Lives at 17 Example Street, apartment 4',
    'Their court case needs a lawyer',
    'My coworker has a private family problem',
    'Has PTSD after a car crash',
    'Diagnosed with schizophrenia and psychosis',
    'Living with HIV/AIDS',
    'Uses an inhaler for asthma',
    'Has diabetes and takes insulin',
    'Receiving treatment for cancer',
    'Has epilepsy with recurring seizures',
    'Recovering from addiction and substance use',
    'Discussing pregnancy and fertility treatment',
    'Lives with a physical disability',
    'My blood pressure is 180/120',
    'I have hypertension',
    'I have a fever and a rash',
    'I am allergic to penicillin',
    'I have a kidney condition',
    'Contact me at name@example.com',
    'My phone number is +62 812 3456 7890',
    'I live at 17 Main St'
].forEach((value) => {
    assert.equal(
        feedbackLearning.isSensitiveAutomaticMemoryText(value),
        true,
        `automatic durable memory must reject sensitive text: ${value}`
    );
});
assert.equal(
    feedbackLearning.isSensitiveAutomaticMemoryText('Prefers concise step-by-step answers'),
    false
);

const filteredMemory = feedbackLearning.sanitizeAutomaticMemoryCandidate(
    {
        communicationStyle: 'Prefers concise answers.',
        moodPatterns: [],
        potentialLapses: [],
        behavioralFacts: ['Takes sertraline medication daily'],
        responsePreferences: { likelyTone: 'neutral' }
    },
    {
        communicationStyle: 'Has severe depression.',
        moodPatterns: ['Feels anxious every morning'],
        potentialLapses: ['Misses medication doses'],
        behavioralFacts: [
            'Takes sertraline medication daily',
            'Lives at 17 Example Street',
            'Prefers weekend planning'
        ],
        responsePreferences: { likelyTone: 'traumatized' }
    }
);
assert.equal(filteredMemory.communicationStyle, 'Prefers concise answers.');
assert.deepEqual(filteredMemory.moodPatterns, []);
assert.deepEqual(filteredMemory.potentialLapses, []);
assert.deepEqual(filteredMemory.behavioralFacts, [
    'Takes sertraline medication daily',
    'Prefers weekend planning'
]);
assert.equal(filteredMemory.responsePreferences.likelyTone, 'neutral');

const preservedSensitiveScalars = feedbackLearning.sanitizeAutomaticMemoryCandidate(
    {
        communicationStyle: 'Has an anxiety diagnosis.',
        responsePreferences: { likelyTone: 'anxious' }
    },
    {
        communicationStyle: 'Prefers plain language.',
        responsePreferences: { likelyTone: 'neutral' }
    }
);
assert.equal(preservedSensitiveScalars.communicationStyle, 'Has an anxiety diagnosis.');
assert.equal(preservedSensitiveScalars.responsePreferences.likelyTone, 'anxious');

console.log('feedback learning tests passed');
