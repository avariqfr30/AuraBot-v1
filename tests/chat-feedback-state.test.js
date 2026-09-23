'use strict';

const assert = require('node:assert/strict');
const feedback = require('../public/js/feedback-learning');
const chatFeedback = require('../public/js/chat-feedback-state');

const chat = {
    id: 'chat-a',
    history: [
        { id: 'user-1', role: 'user', content: 'Please explain this more simply.' },
        { id: 'ai-1', role: 'ai', content: 'A simple explanation.', routeSnapshot: {
            route: 'GeneralFriendAgent', task: 'conversation', domain: 'general', risk: 'low'
        } },
        { id: 'retry-1', role: 'user', source: 'feedback_retry', content: 'Try again.' },
        { id: 'ai-2', role: 'ai', content: 'A clearer explanation.', retryOfMessageId: 'ai-1' }
    ]
};

assert.equal(chatFeedback.findRelatedUserMessage(chat, chat.history[3]).id, 'user-1');
assert.equal(chatFeedback.upsert(feedback.createState(), chat, 'user-1', {}, true), null);

let state = chatFeedback.upsert(feedback.createState(), chat, 'ai-1', {
    rating: 'helpful'
}, true);
assert.equal(chatFeedback.getEntry(state, 'chat-a', 'ai-1').userMessageId, 'user-1');
assert.equal(chatFeedback.getEntry(state, 'chat-b', 'ai-1'), null);

state = chatFeedback.upsert(state, chat, 'ai-2', { rating: 'helpful' }, true);
assert.equal(chatFeedback.getEntry(state, 'chat-a', 'ai-2').userMessageId, 'user-1');
assert.equal(chatFeedback.getRetryContext(state, chat, 'ai-2').userMessage.id, 'user-1');
assert.match(chatFeedback.getRetryContext(state, chat, 'ai-2').prompt, /Original request: Please explain this more simply/);

const candidate = chatFeedback.getPersonalExampleCandidate(state, chat, 'ai-1', true);
assert.equal(candidate?.userMessage, 'Please explain this more simply.');
assert.equal(chatFeedback.getPersonalExampleCandidate(state, chat, 'ai-1', false), null);

state = feedback.markPromoted(state, 'ai-1', 'personal-ai-1');
assert.deepEqual(chatFeedback.getActivePersonalExampleIds(state), ['personal-ai-1']);
assert.deepEqual(chatFeedback.getPromotedExampleIdsForChat(state, 'chat-a'), ['personal-ai-1']);

const removed = chatFeedback.removeChat(state, 'chat-a');
assert.deepEqual(removed.promotedExampleIds, ['personal-ai-1']);
assert.equal(chatFeedback.getEntry(removed.state, 'chat-a', 'ai-1'), null);

console.log('chat feedback state tests passed');
