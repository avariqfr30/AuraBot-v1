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
        reviewMedicalReplyIfNeeded, getConfiguredRoutingModels, getModelPreference,
        calibrateUncertainAccessReply, deriveHeuristicRoute, deriveHeuristicSourceNeed,
        runEvidenceDecisionAgent
    };
`, sandbox);
const api = sandbox.api;

(async () => {
    for (const message of [
        "I keep replaying a meeting where my manager criticized my report. I felt embarrassed. Can you help me understand what's happening?",
        "I felt ashamed after my friend cancelled. I'm telling myself they dislike me. Why am I taking it this way?",
        "I keep replaying what I said at dinner. What might I be assuming?",
        "I wasn't invited to one team lunch, and I thought my coworkers dislike me. I don't have enough evidence for that. Why did I make that leap?"
    ]) {
        const route = api.deriveHeuristicRoute(message);
        assert.notEqual(api.runEvidenceDecisionAgent(message, route).effectiveRoute, 'SearchAgent');
    }
    assert.equal(api.runEvidenceDecisionAgent('I felt embarrassed. Can you find research on this?', 'GeneralFriendAgent').effectiveRoute, 'SearchAgent');
    assert.equal(api.runEvidenceDecisionAgent('Find evidence for this claim in published studies.', 'GeneralFriendAgent').effectiveRoute, 'SearchAgent');
    assert.equal(api.deriveHeuristicSourceNeed('What are the current clinical guidelines for insomnia?', 'KnowledgeAgent').needsSources, true);

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

    window.AURA_HOSTED = {
        enabled: true,
        primaryModel: 'client-large:70b',
        medicalModel: 'medgemma1.5:4b',
        allowedModels: ['client-large:70b', 'medgemma1.5:4b'],
        settingsStorage: { getItem: () => 'gpt-oss:120b-cloud' }
    };
    assert.equal(api.getConfiguredRoutingModels().gptModel, 'client-large:70b');
    assert.equal(api.getConfiguredRoutingModels().medModel, 'medgemma1.5:4b');
    assert.equal(api.getModelPreference(), 'auto', 'an old cloud override must not escape this client allowlist');

    const listeningTurn = { primaryMode: 'reflect', questioningLevel: 'none' };
    const listened = await api.finalizeReplyWithProactiveTool(
        'Blanking in front of colleagues can feel exposing. It makes sense that the moment stayed with you.\n\nIf you want to share more, I’m here to listen. Whatever you need, I’m with you.',
        'I just need you to listen.', null, 'GeneralFriendAgent', undefined,
        listeningTurn, 'chat-1'
    );
    assert.match(listened, /Blanking in front of colleagues can feel exposing/);
    assert.doesNotMatch(listened, /If you want to share more|Whatever you need/);
    const sameParagraphClosing = await api.finalizeReplyWithProactiveTool(
        'Freezing during rehearsal felt exposing. It makes sense that it stayed with you. You asked to be heard, and I’m here to hold space for it.',
        'I just need you to listen.', null, 'GeneralFriendAgent', undefined,
        listeningTurn, 'chat-1'
    );
    assert.match(sameParagraphClosing, /Freezing during rehearsal felt exposing/);
    assert.doesNotMatch(sameParagraphClosing, /hold space|I’m here/);
    const ordinaryReply = await api.finalizeReplyWithProactiveTool(
        'A concrete answer.\n\nIf you want to share more, I’m here to listen.',
        'What else can I do?', null, 'GeneralFriendAgent', undefined,
        { primaryMode: 'coach', questioningLevel: 'one_if_needed' }, 'chat-1'
    );
    assert.match(ordinaryReply, /If you want to share more/);
    modelReply = "I can't tell whether late entry is allowed from a closed sign-up form. Ask the organizer if they still accept participants or keep a waitlist.";
    const calibrated = await api.calibrateUncertainAccessReply({
        draft: 'Most classes have options.\n- Try a waitlist\n- Search social media',
        userMessage: 'The class sign-up form is closed. Can I still join?',
        route: 'GeneralFriendAgent', activeModel: 'gpt-oss:120b-cloud'
    });
    assert.match(calibrated, /closed sign-up form/i);
    assert.match(calibrated, /can't tell whether late entry is allowed/i);
    assert.match(calibrated, /Ask the organizer/i);
    assert.match(calibrated, /feel|wonder|disappoint|regret/i);
    modelReply = 'Most classes usually have several ways in.\n- Ask around\n- Try social media';
    const fallback = await api.calibrateUncertainAccessReply({
        draft: modelReply,
        userMessage: 'The event registration is closed. Can I still attend?',
        route: 'GeneralFriendAgent', activeModel: 'gpt-oss:120b-cloud'
    });
    assert.doesNotMatch(fallback, /Most|usually|\n-/);
    assert.match(fallback, /can't tell/i);
    assert.match(fallback, /feel|wonder|disappoint|regret/i);
    modelReply = "Seeing the form closed can feel discouraging. You missed the registration deadline, but I can't tell if late entry is allowed. Ask the organizer.";
    const unsupportedDeadline = await api.calibrateUncertainAccessReply({
        draft: modelReply,
        userMessage: 'The workshop signup is closed. Can I still attend?',
        route: 'GeneralFriendAgent', activeModel: 'gpt-oss:120b-cloud'
    });
    assert.doesNotMatch(unsupportedDeadline, /missed.*deadline/i);
    assert.match(unsupportedDeadline, /feel|wonder|disappoint/i);
    modelReply = "It’s frustrating to find a sign-up form closed when you wanted the class. You missed the deadline, but ask around.";
    const preservedWarmth = await api.calibrateUncertainAccessReply({
        draft: modelReply,
        userMessage: 'The class sign-up form is closed. Can I still join?',
        route: 'GeneralFriendAgent', activeModel: 'gpt-oss:120b-cloud'
    });
    assert.match(preservedWarmth, /frustrating to find a sign-up form closed/i);
    assert.doesNotMatch(preservedWarmth, /missed the deadline/i);
    assert.match(preservedWarmth, /can't tell/i);
    const alreadyGood = "Seeing the form closed can feel discouraging. I can't tell whether late entry is allowed. Ask the organizer whether you can still join.";
    const callsBeforeGoodDraft = modelCalls.length;
    const unchanged = await api.calibrateUncertainAccessReply({
        draft: alreadyGood,
        userMessage: 'The event sign-up form is closed. Can I still attend?',
        route: 'GeneralFriendAgent', activeModel: 'gpt-oss:120b-cloud'
    });
    assert.equal(unchanged, alreadyGood);
    assert.equal(modelCalls.length, callsBeforeGoodDraft, 'a safe, human reply needs no second model call');
    console.log('tool flow tests passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
