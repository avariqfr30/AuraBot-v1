'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

let history = [];
let createdMarks = 0;
let modelReply = null;
const modelCalls = [];
const manager = {
    getActiveChatId: () => 'chat-1',
    getChatHistory: () => history,
    isPersonalIntelligenceActive: () => false,
    hasActiveToolType: () => false,
    wasToolRecentlyDeclined: () => false,
    canUseProactiveTool: () => true,
    markProactiveToolUsed: () => { createdMarks += 1; }
};
const window = {
    AURA_CONFIG: { apiBaseUrl: '/api', ollamaBaseUrl: '/api/ollama' },
    AURA_HOSTED_READY: { then() {} },
    localStorage: { getItem: () => null },
    AURA_REQUEST_RUNTIME: { createRuntime: () => ({ throwIfAborted() {} }) },
    AURA_MODEL_REQUEST: { createClient: () => ({ callLLM: async (prompt, options) => {
        modelCalls.push({ prompt, options });
        return modelReply;
    } }) },
    chatManager: manager
};
for (const [key, file] of Object.entries({
    AURA_TOOL_DECISION: 'tool-decision', AURA_TURN_POLICY: 'turn-policy',
    AURA_RESPONSE_ADAPTATION: 'response-adaptation', AURA_RESPONSE_SANITIZER: 'response-sanitizer',
    AURA_EVIDENCE_UTILS: 'evidence-utils', AURA_PROMPTS: 'aura-prompts',
    AURA_MODEL_ROUTING: 'model-routing'
})) window[key] = require(`../public/js/${file}`);

const sandbox = { window, chatManager: manager, console };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/js/chat-logic.js'), 'utf8') + `
    globalThis.api = {
        deriveExplicitToolRequest, runToolUseAgent, finalizeReplyWithProactiveTool,
        reviewMedicalReplyIfNeeded
    };
`, sandbox);
const api = sandbox.api;

(async () => {
    history = [
        { role: 'user', content: 'I keep replaying what I said at dinner.' },
        { role: 'ai', content: 'A thought record could help us separate the facts from the worry.',
            toolOffer: { type: 'thought_record', theme: 'Dinner conversation', status: 'pending' } }
    ];
    const accepted = await api.runToolUseAgent('Sure, let’s give it a go.', 'GeneralFriendAgent',
        history, null, 'chat-1');
    assert.equal(accepted.proactiveRecommendation?.type, 'thought_record');
    assert.equal(accepted.proactiveRecommendation?.delivery, 'create');
    assert.equal(accepted.proactiveRecommendation?.theme, 'Dinner conversation');

    history = [
        { role: 'user', content: 'I keep replaying what I said at dinner.' },
        { role: 'ai', content: 'We could use a thought record to sort through it.' },
        { role: 'user', content: 'That thought record sounds helpful.' },
        { role: 'ai', content: 'What format would help you use it?' }
    ];
    const table = await api.runToolUseAgent('Could I have a worksheet with blanks to complete?',
        'GeneralFriendAgent', history, null, 'chat-1');
    assert.equal(table.proactiveRecommendation?.type, 'thought_record');
    assert.equal(table.proactiveRecommendation?.delivery, 'create');

    const reply = await api.finalizeReplyWithProactiveTool(
        '<thought_record>{"thought":"I failed"}</thought_record>',
        'That thought record sounds helpful.', accepted.proactiveRecommendation,
        'GeneralFriendAgent', undefined, null, 'chat-1'
    );
    assert.match(reply, /<tool_create type="thought_record"/);
    assert.doesNotMatch(reply, /<thought_record>|I failed/);
    assert.equal((reply.match(/I’ll open/g) || []).length, 1);
    assert.equal(createdMarks > 0, true);
    const replyWithRedundantQuestion = await api.finalizeReplyWithProactiveTool(
        'It makes sense that you want to sort through this.\n\nWould trying a thought record feel useful for you now?',
        'That thought record sounds helpful.', accepted.proactiveRecommendation,
        'GeneralFriendAgent', undefined, null, 'chat-1'
    );
    assert.doesNotMatch(replyWithRedundantQuestion, /Would trying a thought record/);
    assert.match(replyWithRedundantQuestion, /It makes sense/);
    const optional = { ...accepted.proactiveRecommendation, delivery: 'offer' };
    for (const body of [
        'That worry sounds tiring. If you’re up for it, we can walk through one together right now.',
        'That worry sounds tiring.\n\nWould you like to try a thought record?',
        'That worry sounds tiring.\n\nIf you’d like, we can turn this into a thought record. It may make the pattern easier to see.'
    ]) {
        const offeredReply = await api.finalizeReplyWithProactiveTool(
            body, 'I keep replaying the conversation.', optional,
            'GeneralFriendAgent', undefined, null, 'chat-1'
        );
        assert.match(offeredReply, /That worry sounds tiring/);
        assert.doesNotMatch(offeredReply, /If you’re up for it|If you’d like|Would you like|It may make the pattern easier/);
        assert.match(offeredReply, /<tool_offer type="thought_record"/);
    }

    history = [{ role: 'ai', content: 'An offer.', toolOffer: {
        type: 'thought_record', theme: 'Dinner conversation', status: 'dismissed'
    } }];
    assert.equal(api.deriveExplicitToolRequest('Sure, let’s give it a go.').shouldUseTool, false);

    history = [
        { role: 'user', content: 'I keep replaying an argument with my friend.' },
        { role: 'ai', content: 'That sounds hard to carry.' }
    ];
    modelReply = JSON.stringify({
        shouldUseTool: true, type: 'thought_record', theme: 'The argument',
        reason: 'A fillable reflection would help unpack the repeating belief.', confidence: 0.91
    });
    const adaptive = await api.runToolUseAgent(
        "I can't keep circling this. Is there anything concrete I could try?",
        'GeneralFriendAgent', history, null, 'chat-1'
    );
    assert.equal(adaptive.proactiveRecommendation?.type, 'thought_record');
    assert.equal(adaptive.proactiveRecommendation?.delivery, 'offer');
    assert.equal(modelCalls.at(-1).options.format, 'json');
    assert.doesNotMatch(modelCalls.at(-1).prompt, /That sounds hard to carry/);

    modelReply = JSON.stringify({
        shouldUseTool: true, type: 'thought_record', theme: 'The argument',
        reason: 'Maybe helpful.', confidence: 0.4
    });
    const weak = await api.runToolUseAgent(
        "I can't keep circling this. Is there anything concrete I could try?",
        'GeneralFriendAgent', history, null, 'chat-1'
    );
    assert.equal(weak.proactiveRecommendation, null);
    modelReply = JSON.stringify({
        shouldUseTool: true, type: 'safety_plan', theme: 'A plan',
        reason: 'A plan.', confidence: 0.95
    });
    const outsideAdaptiveTypes = await api.runToolUseAgent(
        "I can't keep circling this. Is there anything concrete I could try?",
        'GeneralFriendAgent', history, null, 'chat-1'
    );
    assert.equal(outsideAdaptiveTypes.proactiveRecommendation, null);
    const callsBeforeVenting = modelCalls.length;
    await api.runToolUseAgent('I just need to vent. Please listen.',
        'GeneralFriendAgent', history, null, 'chat-1');
    assert.equal(modelCalls.length, callsBeforeVenting);

    modelReply = JSON.stringify({ requiresRevision: false, issues: [], revisionGuidance: '' });
    const medicalContext = {
        activeModel: 'gpt-oss:120b-cloud',
        originalUserMessage: 'Help me understand this lab report.',
        documentText: 'Synthetic potassium value: 4.1 mmol/L',
        modelDecision: {
            reviewerModel: 'medgemma1.5:4b',
            classification: { domain: 'medical', task: 'medical_document' }
        }
    };
    const reviewed = await api.reviewMedicalReplyIfNeeded({
        context: medicalContext, prompt: 'Main conversational prompt', draft: 'Draft interpretation.'
    });
    assert.equal(reviewed, 'Draft interpretation.');
    assert.equal(modelCalls.at(-1).options.modelName, 'medgemma1.5:4b');
    assert.match(modelCalls.at(-1).prompt, /Synthetic potassium value: 4\.1 mmol\/L/);
    console.log('tool flow tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
