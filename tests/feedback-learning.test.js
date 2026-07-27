const assert = require('node:assert/strict');
const feedbackLearning = require('../js/feedback-learning');

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

console.log('feedback learning tests passed');
