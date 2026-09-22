'use strict';

const assert = require('node:assert/strict');
const toolState = require('../public/js/chat-tool-state');

const chat = {
    tools: {},
    history: [],
    completed_tasks: [],
    lastProactiveToolAt: 0,
    lastProactiveToolType: ''
};

assert.equal(toolState.canUseProactiveTool(chat, 'checklist', { now: 1000, minCooldownMs: 100 }), true);
toolState.markProactiveToolUsed(chat, 'checklist', 1000);
assert.equal(toolState.canUseProactiveTool(chat, 'checklist', { now: 1050, minCooldownMs: 100 }), false);

toolState.addTool(chat, 'checklist', { id: 'tool-1', items: [{ text: 'First' }] });
assert.equal(toolState.hasActiveToolType(chat, 'checklist'), true);
assert.equal(toolState.completeChecklistItem(chat, 'tool-1', 0), 'First');
assert.deepEqual(chat.tools.checklist, []);
assert.deepEqual(chat.completed_tasks, ['First']);

toolState.addTool(chat, 'thought_record', { id: 'thought-1', thought: 'Old' });
assert.equal(toolState.updateThoughtRecord(chat, 'thought-1', { thought: 'Updated' }), true);
assert.equal(chat.tools.thought_record[0].thought, 'Updated');

const offerChat = {
    tools: {},
    history: [{ toolOffer: { type: 'checklist', status: 'dismissed', resolvedAt: 900 } }]
};
assert.equal(toolState.wasToolRecentlyDeclined(offerChat, 'checklist', { now: 1000, windowMs: 200 }), true);

console.log('chat tool state tests passed');
