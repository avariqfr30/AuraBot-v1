'use strict';

const assert = require('node:assert/strict');
const intelligence = require('../public/js/intelligence-bundle');

const DAY = 24 * 60 * 60 * 1000;
const START = Date.UTC(2026, 0, 1);

let bundle = intelligence.createBundle(START);
bundle = intelligence.recordSignal(bundle, {
    kind: 'interaction_preference',
    key: 'directnessLevel',
    value: 'direct',
    confidence: 0.72,
    source: { type: 'behavior_analysis', chatId: 'chat-a', messageId: 'a-1' }
}, START);
assert.deepEqual(
    intelligence.buildPreferenceOverrides(bundle, START),
    {},
    'one inferred chat must not become a cross-chat preference'
);

bundle = intelligence.recordSignal(bundle, {
    kind: 'interaction_preference',
    key: 'directnessLevel',
    value: 'direct',
    confidence: 0.8,
    source: { type: 'behavior_analysis', chatId: 'chat-b', messageId: 'b-1' }
}, START + DAY);
assert.equal(intelligence.buildPreferenceOverrides(bundle, START + DAY).directnessLevel, 'direct');
const directSignal = intelligence.getActiveSignals(bundle, { now: START + DAY })
    .find((signal) => signal.key === 'directnessLevel');
assert.equal(directSignal.evidenceCount, 2);
assert.deepEqual(directSignal.sourceChatIds.sort(), ['chat-a', 'chat-b']);

bundle = intelligence.recordSignal(bundle, {
    kind: 'interaction_preference',
    key: 'detailLevel',
    value: 'brief',
    confidence: 0.95,
    source: { type: 'explicit_instruction', chatId: 'chat-a', messageId: 'a-2' }
}, START + (2 * DAY));
assert.equal(intelligence.buildPreferenceOverrides(bundle, START + (2 * DAY)).detailLevel, 'brief');

bundle = intelligence.recordSignal(bundle, {
    kind: 'interaction_preference',
    key: 'detailLevel',
    value: 'detailed',
    confidence: 0.99,
    source: { type: 'explicit_instruction', chatId: 'chat-c', messageId: 'c-1' }
}, START + (3 * DAY));
assert.equal(intelligence.buildPreferenceOverrides(bundle, START + (3 * DAY)).detailLevel, 'detailed');
assert.ok(bundle.signals.some((signal) => (
    signal.key === 'detailLevel' && signal.value === 'brief' && signal.status === 'contradicted'
)));
for (const [index, chatId] of ['chat-d', 'chat-e'].entries()) {
    bundle = intelligence.recordSignal(bundle, {
        kind: 'interaction_preference',
        key: 'detailLevel',
        value: 'brief',
        confidence: 0.9,
        source: { type: 'behavior_analysis', chatId, messageId: `background-${index}` }
    }, START + ((4 + index) * DAY));
}
assert.equal(
    intelligence.buildPreferenceOverrides(bundle, START + (6 * DAY)).detailLevel,
    'detailed',
    'background inference must not override a conflicting explicit preference'
);

const beforeUnapprovedMemory = bundle.signals.length;
bundle = intelligence.recordSignal(bundle, {
    kind: 'approved_memory',
    key: 'memory',
    value: 'The user has a Friday appointment.',
    confidence: 1,
    source: { type: 'memory_request', chatId: 'chat-a', messageId: 'a-3' }
}, START + (4 * DAY));
assert.equal(bundle.signals.length, beforeUnapprovedMemory, 'personal facts require explicit approval');

bundle = intelligence.recordSignal(bundle, {
    kind: 'approved_memory',
    key: 'memory',
    value: 'The user has a Friday appointment.',
    confidence: 1,
    consent: 'explicit',
    source: { type: 'memory_request', chatId: 'chat-a', messageId: 'a-3' }
}, START + (4 * DAY));
assert.ok(intelligence.getActiveSignals(bundle, { now: START + (400 * DAY) })
    .some((signal) => signal.kind === 'approved_memory'));
bundle = intelligence.recordSignal(bundle, {
    kind: 'approved_memory',
    key: 'memory',
    value: 'The user prefers morning appointments.',
    confidence: 1,
    consent: 'explicit',
    source: { type: 'memory_request', chatId: 'chat-b', messageId: 'b-2' }
}, START + (4 * DAY));
assert.equal(
    intelligence.getActiveSignals(bundle, { now: START + (4 * DAY), kind: 'approved_memory' }).length,
    2,
    'one approved fact must not contradict unrelated approved facts'
);

bundle = intelligence.removeChatContributions(bundle, 'chat-a', START + (5 * DAY));
assert.equal(
    intelligence.buildPreferenceOverrides(bundle, START + (5 * DAY)).directnessLevel,
    undefined,
    'removing a supporting chat must recompute cross-chat eligibility'
);
assert.ok(intelligence.getActiveSignals(bundle, { now: START + (5 * DAY) })
    .some((signal) => signal.kind === 'approved_memory'), 'approved memory survives chat deletion');

let decaying = intelligence.createBundle(START);
for (const [index, chatId] of ['chat-one', 'chat-two'].entries()) {
    decaying = intelligence.recordSignal(decaying, {
        kind: 'interaction_preference',
        key: 'structureLevel',
        value: 'stepwise',
        confidence: 0.8,
        source: { type: 'behavior_analysis', chatId, messageId: `m-${index}` }
    }, START + (index * DAY));
}
assert.equal(intelligence.buildPreferenceOverrides(decaying, START + DAY).structureLevel, 'stepwise');
assert.equal(
    intelligence.buildPreferenceOverrides(decaying, START + (240 * DAY)).structureLevel,
    undefined,
    'unconfirmed inferred preferences must decay'
);

const normalized = intelligence.normalizeBundle({
    version: 99,
    signals: [null, { kind: 'unknown', value: '<invalid>' }]
}, START);
assert.equal(normalized.version, 1);
assert.deepEqual(normalized.signals, []);

assert.deepEqual(
    intelligence.inferExplicitPreferenceSignals('Please be direct and keep it short. Do not ask follow-up questions.'),
    [
        { key: 'detailLevel', value: 'brief' },
        { key: 'directnessLevel', value: 'direct' },
        { key: 'followUpLevel', value: 'none' }
    ]
);
assert.deepEqual(
    intelligence.inferExplicitPreferenceSignals('I feel overwhelmed and scared.'),
    [],
    'emotion alone must not be persisted as a communication preference'
);
const preferencesReset = intelligence.clearInteractionPreferences(bundle, START + (6 * DAY));
assert.deepEqual(intelligence.buildPreferenceOverrides(preferencesReset, START + (6 * DAY)), {});
assert.equal(
    intelligence.getActiveSignals(preferencesReset, { now: START + (6 * DAY), kind: 'approved_memory' }).length,
    2,
    'resetting learned preferences must preserve approved memories'
);

let crowded = intelligence.createBundle(START);
crowded = intelligence.recordSignal(crowded, {
    kind: 'approved_memory',
    key: 'memory',
    value: 'Keep this approved memory.',
    confidence: 1,
    consent: 'explicit',
    source: { type: 'memory_request', chatId: 'chat-memory', messageId: 'memory-1' }
}, START);
for (let index = 0; index < 205; index += 1) {
    crowded = intelligence.recordSignal(crowded, {
        kind: 'legacy_memory',
        key: 'test_pattern',
        value: `Transient pattern ${index}`,
        confidence: 0.5,
        source: { type: 'legacy_migration', chatId: `chat-${index}`, messageId: `pattern-${index}` }
    }, START + index + 1);
}
assert.ok(
    crowded.signals.some((signal) => signal.kind === 'approved_memory'),
    'bounded inferred-signal storage must never evict an explicitly approved memory first'
);

const migratedLegacy = intelligence.migrateLegacyContext(
    intelligence.createBundle(START),
    {
        behavioralFacts: ['Prefers weekend planning', 'Works remotely'],
        moodPatterns: ['Legacy mood inference must not migrate']
    },
    START
);
assert.deepEqual(
    intelligence.getReviewRequiredMemories(migratedLegacy),
    ['Prefers weekend planning', 'Works remotely']
);
assert.equal(
    intelligence.getActiveSignals(migratedLegacy, { now: START }).length,
    0,
    'legacy context must remain review-only until explicitly approved'
);
assert.deepEqual(
    intelligence.getReviewRequiredMemories(
        intelligence.clearApprovedMemories(migratedLegacy, START + DAY)
    ),
    [],
    'forgetting profile memory must also remove quarantined legacy context'
);

console.log('intelligence bundle tests passed');
