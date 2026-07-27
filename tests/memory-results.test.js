const assert = require('node:assert/strict');

let memoryResults = null;
try {
    memoryResults = require('../lib/memory-results');
} catch {
    memoryResults = null;
}

assert.equal(
    typeof memoryResults?.buildMemoryMatches,
    'function',
    'buildMemoryMatches must be implemented'
);

const matches = memoryResults.buildMemoryMatches({
    ids: [['memory-1', 'memory-2']],
    documents: [['I prefer concise replies.', 'My Friday meeting is at noon.']],
    distances: [[0.12, 0.28]],
    metadatas: [[
        { chatId: 'chat-1', role: 'user', timestamp: 1000 },
        { chatId: 'chat-1', role: 'user', timestamp: 2000 }
    ]]
});

assert.deepEqual(matches, [
    {
        id: 'memory-1',
        text: 'I prefer concise replies.',
        distance: 0.12,
        provenance: {
            source: 'conversation_vector',
            collection: 'aura_long_term_memory',
            chatId: 'chat-1',
            role: 'user',
            timestamp: 1000
        }
    },
    {
        id: 'memory-2',
        text: 'My Friday meeting is at noon.',
        distance: 0.28,
        provenance: {
            source: 'conversation_vector',
            collection: 'aura_long_term_memory',
            chatId: 'chat-1',
            role: 'user',
            timestamp: 2000
        }
    }
]);

assert.deepEqual(
    memoryResults.buildMemoryMatches({
        ids: [['memory-1']],
        documents: [[null]],
        distances: [[null]],
        metadatas: [[null]]
    }),
    []
);

console.log('memory result tests passed');
