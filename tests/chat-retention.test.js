'use strict';

const assert = require('node:assert/strict');
const feedback = require('../public/js/feedback-learning');
const intelligence = require('../public/js/intelligence-bundle');
const retention = require('../public/js/chat-retention');

const bundle = intelligence.recordSignal(intelligence.createBundle(100), {
    kind: 'interaction_preference', key: 'detailLevel', value: 'brief', confidence: 0.8,
    source: { type: 'explicit_instruction', chatId: 'temporary', messageId: 'temp-user' }
}, 101);
const state = {
    chats: {
        legacy: { id: 'legacy', history: [{ role: 'user', content: 'Existing saved conversation' }] },
        temporary: {
            id: 'temporary', retention: 'temporary',
            history: [{ role: 'user', content: 'EPHEMERAL_CANARY' }],
            tools: { thought_record: [{ title: 'EPHEMERAL_CANARY' }] },
            contextSummary: { summary: 'EPHEMERAL_CANARY' }
        }
    },
    activeChatId: 'temporary',
    feedbackLearning: feedback.upsertFeedback(feedback.createState(), {
        chatId: 'temporary', messageId: 'temp-ai', rating: 'helpful',
        comment: 'EPHEMERAL_CANARY'
    }),
    intelligenceBundle: bundle
};
const original = JSON.stringify(state);
const persisted = retention.projectForPersistence(state);
assert.equal(retention.isSavedChat(state.chats.legacy), true);
assert.equal(retention.isSavedChat(state.chats.temporary), false);
assert.deepEqual(Object.keys(persisted.chats), ['legacy']);
assert.equal(persisted.activeChatId, 'legacy');
assert.doesNotMatch(JSON.stringify(persisted), /EPHEMERAL_CANARY|temp-user|temp-ai/);
assert.equal(JSON.stringify(state), original, 'projection must leave the running chat intact');

const onlyTemporary = retention.projectForPersistence({
    ...state, chats: { temporary: state.chats.temporary }
});
assert.deepEqual(onlyTemporary.chats, {});
assert.equal(onlyTemporary.activeChatId, null);

const lastViewedSaved = retention.projectForPersistence({
    ...state,
    chats: {
        older: { id: 'older', retention: 'saved', history: [] },
        newer: { id: 'newer', retention: 'saved', history: [] },
        temporary: state.chats.temporary
    },
    lastSavedChatId: 'newer'
});
assert.equal(lastViewedSaved.activeChatId, 'newer');

const explicitlySaved = retention.projectForPersistence({
    ...state,
    chats: {
        ...state.chats,
        temporary: { ...state.chats.temporary, retention: 'saved' }
    }
});
assert.equal(explicitlySaved.activeChatId, 'temporary');
assert.match(JSON.stringify(explicitlySaved), /EPHEMERAL_CANARY/);
assert.ok(explicitlySaved.feedbackLearning.entries['temp-ai']);

console.log('chat retention tests passed');
