'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const history = [
    { role: 'user', content: 'What are panic symptoms?' },
    { role: 'ai', content: 'Panic can involve a racing heart.' },
    { role: 'user', content: 'I am grieving my past relationship. I keep missing my former partner.' },
    { role: 'ai', content: 'That loss sounds painful. We can take this at your pace.' }
];
const request = 'Could you set me up a tool to help? I want to come back each day and work through one small step.';
const correction = 'How is that relevant to what we were discussing?';
const manager = {
    getActiveChatId: () => 'chat-1',
    getChatHistory: () => history,
    searchApprovedMemoryMatches: async () => [],
    markProactiveToolUsed() {}
};
const window = {
    AURA_CONFIG: { apiBaseUrl: '/api', ollamaBaseUrl: '/api/ollama' },
    AURA_HOSTED_READY: { then() {} },
    localStorage: { getItem: () => null },
    AURA_REQUEST_RUNTIME: { createRuntime: () => ({ throwIfAborted() {} }) },
    AURA_MODEL_REQUEST: { createClient: () => ({ callLLM: async () => null }) },
    chatManager: manager
};
for (const [key, file] of Object.entries({
    AURA_TOOL_DECISION: 'tool-decision', AURA_TURN_POLICY: 'turn-policy',
    AURA_RESPONSE_ADAPTATION: 'response-adaptation', AURA_RESPONSE_SANITIZER: 'response-sanitizer',
    AURA_EVIDENCE_UTILS: 'evidence-utils', AURA_PROMPTS: 'aura-prompts'
})) window[key] = require(`../public/js/${file}`);
const sandbox = { window, chatManager: manager, console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/chat-logic.js'), 'utf8') + `
    globalThis.api = { runReceptionAgent, buildContinuityContext, deriveExplicitToolRequest, runMemoryAgent };
`, sandbox);
const api = sandbox.api;

(async () => {
    const first = api.runReceptionAgent(request, history);
    assert.equal(first.turnPolicy.continuity.usePriorTurn, true);
    assert.match(first.contextualUserMessage, /grieving my past relationship/);
    assert.doesNotMatch(first.contextualUserMessage, /panic|racing heart/i);
    assert.equal(api.deriveExplicitToolRequest(request).type, 'follow_up_plan');
    assert.match(api.deriveExplicitToolRequest(request).theme, /relationship/);
    assert.doesNotMatch(api.deriveExplicitToolRequest(request).theme, /panic|racing heart/i);

    history.push({ role: 'user', content: request }, {
        role: 'ai', content: 'Handle the immediate symptoms and seek professional help.'
    });
    const repaired = api.runReceptionAgent(correction, history);
    assert.equal(repaired.turnSupport.followUpIntent, 'correct');
    assert.match(repaired.contextualUserMessage, /grieving my past relationship/);
    assert.doesNotMatch(repaired.contextualUserMessage, /symptoms|professional|panic/i);
    assert.notEqual(repaired.route, 'KnowledgeAgent');
    const continuity = api.buildContinuityContext(history, correction, repaired.turnSupport);
    assert.match(continuity, /relationship/);
    assert.match(continuity, /rejected|mistaken/i);

    let retrievalCalls = 0;
    manager.searchApprovedMemoryMatches = async () => { retrievalCalls += 1; return []; };
    await api.runMemoryAgent({
        chatHistory: history, contextualUserMessage: repaired.contextualUserMessage,
        userMessage: correction, modelHistoryStr: '', turnSupport: repaired.turnSupport,
        turnPolicy: repaired.turnPolicy
    });
    assert.equal(retrievalCalls, 0, 'a correction must not retrieve memories from the rejected framing');
    console.log('conversation context tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
