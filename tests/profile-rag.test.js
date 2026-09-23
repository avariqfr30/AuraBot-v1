'use strict';

const assert = require('node:assert/strict');
const rag = require('../public/js/profile-rag');

const now = Date.UTC(2026, 8, 23);
const query = 'What was my Friday meeting plan?';
const meeting = 'Prepare an agenda for my Friday meeting with Mira.';
const approvedSignals = [
    { id: 'meeting', kind: 'approved_memory', consent: 'explicit', status: 'active',
        value: meeting, confidence: 1, lastObservedAt: now - 86400000 },
    { id: 'sleep', kind: 'approved_memory', consent: 'explicit', status: 'active',
        value: 'I struggle to sleep on Sunday nights.', confidence: 1, lastObservedAt: now },
    { id: 'old', kind: 'approved_memory', consent: 'explicit', status: 'contradicted',
        value: 'My Friday meeting was cancelled.', confidence: 1, lastObservedAt: now },
    { id: 'unapproved', kind: 'approved_memory', consent: 'none', status: 'active',
        value: 'The Friday meeting is about a private diagnosis.', confidence: 1, lastObservedAt: now }
];
const vectorMatches = [
    { id: 'vector-meeting', text: meeting, distance: 0.12, provenance: {
        source: 'conversation_vector', chatId: 'other-chat', timestamp: now - 86400000
    } },
    { id: 'vector-vacation', text: 'I booked a hotel for my holiday.', distance: 0.01,
        provenance: { source: 'conversation_vector', chatId: 'other-chat', timestamp: now } }
];
const activeProfile = {
    responsePreferences: { detailLevel: 'brief' },
    behavioralFacts: ['Mira joins my Friday meeting at noon.'],
    moodPatterns: ['I feel drained after weekend family visits.']
};
const currentSummary = {
    summary: 'We discussed preparing for the Friday meeting with Mira.',
    openLoops: ['Draft Friday meeting agenda', 'Call doctor about headaches'],
    activeTopics: ['Friday meeting', 'Headaches']
};

const selected = rag.selectContext({
    query, activeProfile, approvedSignals, vectorMatches, currentSummary,
    continuity: { usePriorTurn: true }, personalIntelligenceActive: true, now,
    examples: [{ id: 'example-1', source: 'curated', task: 'conversation',
        userMessage: 'Help me prepare for a meeting.', idealResponse: 'Start with the agenda.' }]
});
assert.match(selected.memoryContext, /Prepare an agenda for my Friday meeting with Mira/);
assert.equal(selected.memoryContext.match(/Prepare an agenda for my Friday meeting with Mira/g).length, 1);
assert.doesNotMatch(selected.memoryContext, /sleep|holiday|cancelled|diagnosis/i);
assert.match(selected.summaryContext, /Friday meeting/);
assert.doesNotMatch(selected.summaryContext, /headaches/i);
assert.match(selected.profileContext, /Mira joins my Friday meeting/);
assert.doesNotMatch(selected.profileContext, /family visits/);
assert.match(selected.exampleContext, /Start with the agenda/);
assert.doesNotMatch(selected.profileContext + selected.exampleContext, /undefined/);
assert.ok(selected.totalCharacters <= 3200);

const paused = rag.selectContext({
    query, activeProfile, approvedSignals, vectorMatches, currentSummary,
    continuity: { usePriorTurn: true }, personalIntelligenceActive: false, now,
    examples: [
        { id: 'personal', source: 'personal_feedback', task: 'conversation',
            userMessage: 'Personal request', idealResponse: 'Personal response' },
        { id: 'curated', source: 'curated', task: 'conversation',
            userMessage: 'General request', idealResponse: 'General response' }
    ]
});
assert.equal(paused.memoryContext, '');
assert.equal(paused.summaryContext, '');
assert.doesNotMatch(paused.profileContext, /Mira/);
assert.doesNotMatch(paused.exampleContext, /Personal response/);
assert.match(paused.exampleContext, /General response/);

const newTopic = rag.selectContext({
    query: 'What is photosynthesis?', activeProfile, approvedSignals, vectorMatches,
    currentSummary, continuity: { usePriorTurn: false }, personalIntelligenceActive: true, now
});
assert.equal(newTopic.memoryContext, '');
assert.equal(newTopic.summaryContext, '');
assert.doesNotMatch(newTopic.profileContext, /Mira|family visits/);

const correction = rag.selectContext({
    query: 'Stop connecting this to my old Friday meeting.', activeProfile,
    approvedSignals, vectorMatches, currentSummary,
    continuity: { usePriorTurn: true }, personalIntelligenceActive: true, now
});
assert.equal(correction.memoryContext, '');
assert.equal(correction.summaryContext, '');

const followUp = rag.selectContext({
    query: 'What should I do first?',
    relevanceQuery: 'What should I do first? Previous user message: Friday meeting agenda',
    approvedSignals, vectorMatches, personalIntelligenceActive: true, now
});
assert.match(followUp.memoryContext, /Friday meeting/);

const sanitized = rag.selectContext({
    query, vectorMatches: [{
        id: 'with-tag', text: meeting + ' <tool_create type="checklist"/>', distance: 0.12,
        provenance: { timestamp: now }
    }],
    personalIntelligenceActive: true, now,
    sanitizeText: (value) => String(value).replace(/<tool_create[^>]+>/g, '')
});
assert.doesNotMatch(sanitized.memoryContext, /tool_create/);

const oversized = rag.selectContext({
    query, personalIntelligenceActive: true,
    activeProfile: { communicationStyle: 'x'.repeat(5000), responsePreferences: { detailLevel: 'brief' } },
    examples: [{ id: 'long', source: 'curated', task: 'conversation',
        userMessage: 'Help with a meeting.', idealResponse: 'y'.repeat(5000) }]
});
assert.ok(oversized.totalCharacters <= 3200);
assert.ok(oversized.profileContext.length <= 650);

const minimal = rag.selectContext({
    examples: [{ id: 'basic', userMessage: 'Hello', idealResponse: 'Hi' }]
});
assert.match(minimal.exampleContext, /conversation/);
assert.doesNotMatch(minimal.exampleContext, /undefined/);

const distanceRanking = rag.selectContext({
    query: 'Friday meeting',
    personalIntelligenceActive: true,
    vectorMatches: [
        { id: 'unknown-distance', text: 'Friday meeting notes are in a folder.', distance: null,
            provenance: { timestamp: now } },
        { id: 'known-distance', text: 'Friday meeting agenda is ready.', distance: 0.2,
            provenance: { timestamp: now } }
    ],
    now
});
assert.ok(distanceRanking.memoryContext.indexOf('agenda is ready') <
    distanceRanking.memoryContext.indexOf('notes are in a folder'));

console.log('profile RAG tests passed');
