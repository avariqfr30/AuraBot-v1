const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { createRuntime } = require('../public/js/request-runtime');

function harness({ fetchImpl, retrievalTimeoutMs = 15 } = {}) {
    const runtime = createRuntime({ fetchImpl, retrievalTimeoutMs, requestTimeoutMs: 100 });
    const nodes = new Map();
    const messages = [];
    const tools = [];
    function element(id) {
        if (!nodes.has(id)) nodes.set(id, {
            disabled: false, textContent: '', dataset: {}, style: {},
            classList: { toggle() {}, add() {}, remove() {} },
            setAttribute() {}, querySelectorAll: () => []
        });
        return nodes.get(id);
    }
    const manager = {
        getActiveChatId: () => 'chat-1', listProfiles: () => [{ id: 'profile-1' }],
        pendingResponseMetadata: new Map(), consumePendingResponseMetadata: () => ({}),
        getResponseFeedback: () => null, canPromoteResponseFeedback: () => false,
        getProfileSetting: (_key, fallback) => fallback, preScreenMessage: async () => 'OK',
        getChatHistory: () => messages,
        addMessageToChat(chatId, role, content) {
            messages.push({ chatId, role, content });
            return messages.length - 1;
        },
        addOrUpdateToolInChat(...args) { tools.push(args); }
    };
    const sandbox = {
        console, responseRuntime: runtime, chatManager: manager,
        STORAGE_KEYS: { LOCATION_ENABLED: 'location' },
        document: {
            getElementById: element, querySelectorAll: () => [], body: element('body'),
            addEventListener: (_event, fn) => fn()
        },
        window: {
            chatManager: manager,
            AURA_TOOL_FOLLOW_UP: require('../public/js/tool-follow-up'),
            AURA_TOOL_ARTIFACTS: {
                parseToolArtifacts: (content) => ({ content, creates: [], offer: null })
            }
        },
        addMessage() {}, showTypingIndicator() {}, hideTypingIndicator() {}, updateTypingIndicator() {},
        removeToolStatusMessages() {}, addToolStatusMessage() {},
        getOllamaResponse: async () => (await runtime.fetchJson('/generate')).data.response,
        createToolByType: async () => ({ id: 'tool-1' })
    };
    const source = fs.readFileSync(path.join(__dirname, '../public/js/app.js'), 'utf8');
    // Execute the real handlers with small DOM/model doubles, without app startup.
    const handlerSource = source.slice(0, source.indexOf("    userInput.addEventListener('keydown'"));
    vm.runInNewContext(handlerSource + `
        refreshUI = () => {};
        globalThis.handlers = { handleSendMessage, triggerAIFollowUp, processToolTags, addAssistantArtifact,
            setResponseInFlight, handleResponseInterruption };
    });`, sandbox);
    return { runtime, nodes, messages, tools, sandbox, ...sandbox.handlers };
}

test('stopping a response releases actual chat controls without saving a late assistant reply', async () => {
    let finish;
    let calls = 0;
    const h = harness({ fetchImpl: () => ++calls === 1
        ? new Promise((resolve) => { finish = resolve; })
        : Promise.resolve({ ok: true, json: async () => ({ response: 'new reply' }) })
    });
    const turn = h.triggerAIFollowUp({ type: 'test' });
    assert.equal(h.nodes.get('sendButton').disabled, true);
    h.runtime.cancelTurn();
    await turn;
    assert.equal(h.nodes.get('sendButton').disabled, false);
    assert.equal(h.nodes.get('settingsButton').disabled, false);
    assert.match(h.nodes.get('responseStatus').textContent, /stopped/i);
    finish({ ok: true, json: async () => ({ response: 'late' }) });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(h.messages.length, 0);
    assert.equal(h.runtime.getTurnSignal(), undefined);
    await h.triggerAIFollowUp({ type: 'next-turn' });
    assert.equal(h.messages.length, 1);
    assert.equal(h.messages[0].content, 'new reply');
});

test('normal chat keeps the user message and unlocks after cancellation during retrieval', async () => {
    const h = harness();
    let started;
    const retrievalStarted = new Promise((resolve) => { started = resolve; });
    h.sandbox.getOllamaResponse = async () => {
        return h.runtime.retrieve(() => {
            started();
            return new Promise(() => {});
        }, {});
    };
    h.nodes.get('userInput').value = 'Help me plan my day';
    const turn = h.handleSendMessage();
    await retrievalStarted;
    h.runtime.cancelTurn();
    await turn;
    assert.equal(h.messages.length, 1);
    assert.equal(h.messages[0].role, 'user');
    assert.equal(h.messages[0].content, 'Help me plan my day');
    assert.equal(h.nodes.get('sendButton').disabled, false);
    assert.match(h.nodes.get('responseStatus').textContent, /stopped/i);
});

test('a stalled model request releases the UI with a timeout message', async () => {
    const h = harness({ fetchImpl: () => new Promise(() => {}) });
    await h.triggerAIFollowUp({ type: 'test' });
    assert.equal(h.nodes.get('sendButton').disabled, false);
    assert.match(h.nodes.get('responseStatus').textContent, /took too long/);
    assert.equal(h.messages.length, 0);
});

test('a failed model follow-up acknowledges the recorded tool action', async () => {
    const h = harness();
    h.sandbox.getOllamaResponse = async () => { throw new Error('model unavailable'); };
    await h.triggerAIFollowUp({ type: 'mood_logged', mood: 'Sad' });
    assert.equal(h.messages.length, 1);
    assert.match(h.messages[0].content, /logged feeling Sad/i);
    assert.doesNotMatch(h.messages[0].content, /progress|nice work/i);
    assert.equal(h.nodes.get('sendButton').disabled, false);
});

test('optional retrieval failure allows a reply and reports reduced context', async () => {
    const h = harness();
    h.sandbox.getOllamaResponse = async () => {
        await h.runtime.retrieve(() => new Promise(() => {}), {});
        return 'A reply using available context';
    };
    await h.triggerAIFollowUp({ type: 'test' });
    assert.equal(h.messages[0].content, 'A reply using available context');
    assert.equal(h.nodes.get('sendButton').disabled, false);
    assert.match(h.nodes.get('responseStatus').textContent, /context was unavailable/);
});

test('tool results arriving after stop cannot be persisted', async () => {
    const h = harness();
    h.sandbox.window.AURA_TOOL_ARTIFACTS.parseToolArtifacts = () => ({
        content: 'reply', creates: [{ type: 'checklist' }]
    });
    let finish;
    h.sandbox.createToolByType = () => new Promise((resolve) => { finish = resolve; });
    h.setResponseInFlight(true);
    const processing = h.processToolTags('reply');
    const rejected = assert.rejects(processing, { name: 'AbortError' });
    h.runtime.cancelTurn();
    finish({ id: 'late-tool' });
    await rejected;
    assert.equal(h.tools.length, 0);
    h.setResponseInFlight(false);
});

test('failed tool creation keeps the conversational reply without a broken card', async () => {
    const h = harness();
    h.sandbox.window.AURA_TOOL_ARTIFACTS.parseToolArtifacts = () => ({
        content: 'We can start with one manageable step.',
        creates: [{ type: 'checklist', theme: 'Small steps' }],
        offer: null
    });
    h.sandbox.createToolByType = async () => { throw new Error('tool generation unavailable'); };
    const artifact = await h.processToolTags('reply');
    assert.match(artifact.content, /one manageable step/);
    assert.match(artifact.content, /couldn't open/i);
    assert.equal(h.tools.length, 0);
    assert.equal(artifact.toolOffer, null);
});
