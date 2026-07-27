const assert = require('node:assert/strict');

let toolArtifacts = null;
try {
    toolArtifacts = require('../js/tool-artifacts');
} catch {
    toolArtifacts = null;
}

assert.equal(
    typeof toolArtifacts?.parseToolArtifacts,
    'function',
    'parseToolArtifacts must be implemented'
);
assert.equal(
    typeof toolArtifacts?.createToolOffer,
    'function',
    'createToolOffer must be implemented'
);
assert.equal(
    typeof toolArtifacts?.transitionToolOffer,
    'function',
    'transitionToolOffer must be implemented'
);
assert.equal(
    typeof toolArtifacts?.normalizeToolOffer,
    'function',
    'normalizeToolOffer must be implemented'
);

const parsed = toolArtifacts.parseToolArtifacts(
    [
        'Here is the answer.',
        '<tool_offer theme="Friday meeting prep" type="checklist" />',
        '<tool_create type="breathing_exercise" theme="Calming reset" />',
        '<tool_create type="unknown_tool" theme="Ignore me" />'
    ].join('\n')
);

assert.equal(parsed.content, 'Here is the answer.');
assert.deepEqual(parsed.creates, [
    { type: 'breathing_exercise', theme: 'Calming reset' }
]);
assert.deepEqual(parsed.offer, {
    type: 'checklist',
    theme: 'Friday meeting prep'
});

const firstOfferWins = toolArtifacts.parseToolArtifacts(
    '<tool_offer type="checklist" theme="First" /><tool_offer type="mood_tracker" theme="Second" />'
);
assert.deepEqual(firstOfferWins.offer, { type: 'checklist', theme: 'First' });

const offer = toolArtifacts.createToolOffer(
    { type: 'checklist', theme: 'Friday <meeting> \\"prep"' },
    { id: 'offer-1', now: 1234 }
);
assert.deepEqual(offer, {
    id: 'offer-1',
    type: 'checklist',
    theme: 'Friday meeting prep',
    status: 'pending',
    createdAt: 1234,
    resolvedAt: null,
    createdToolId: null
});

const creating = toolArtifacts.transitionToolOffer(offer, 'create', 2000);
assert.equal(creating.status, 'creating');
assert.equal(creating.resolvedAt, null);

const created = toolArtifacts.transitionToolOffer(creating, 'created', 2500, 'tool-1');
assert.equal(created.status, 'created');
assert.equal(created.resolvedAt, 2500);
assert.equal(created.createdToolId, 'tool-1');

const dismissed = toolArtifacts.transitionToolOffer(offer, 'dismiss', 3000);
assert.equal(dismissed.status, 'dismissed');
assert.equal(dismissed.resolvedAt, 3000);

assert.equal(
    toolArtifacts.transitionToolOffer(dismissed, 'create', 4000),
    null,
    'resolved offers cannot be claimed again'
);

assert.deepEqual(
    toolArtifacts.normalizeToolOffer({
        id: 'offer-2',
        type: 'mood_tracker',
        theme: '<Weekly> mood',
        status: 'dismissed',
        createdAt: 50,
        resolvedAt: 75,
        createdToolId: null,
        injected: true
    }),
    {
        id: 'offer-2',
        type: 'mood_tracker',
        theme: 'Weekly mood',
        status: 'dismissed',
        createdAt: 50,
        resolvedAt: 75,
        createdToolId: null
    }
);
assert.equal(toolArtifacts.normalizeToolOffer({ type: 'unknown' }), null);

console.log('tool artifact tests passed');
