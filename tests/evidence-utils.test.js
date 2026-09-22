'use strict';

const assert = require('node:assert/strict');
const evidence = require('../public/js/evidence-utils');

const catalog = evidence.buildEvidenceCatalog({
    primaryQuery: 'panic signs',
    evidence: [
        { title: 'Guide', snippet: 'A sufficiently detailed explanation of common panic symptoms and warning signs.', link: 'https://example.com/guide', source: 'Example' },
        { title: 'Duplicate', snippet: 'Duplicate URL.', link: 'https://example.com/guide', source: 'Example' },
        { title: 'Second', snippet: 'A second sufficiently detailed source describing breathing and heart-rate symptoms.', link: 'https://example.com/second', source: 'Second' }
    ]
});
assert.equal(catalog.length, 2);
assert.deepEqual(catalog.map((entry) => entry.id), [1, 2]);
assert.equal(evidence.getQuestionFocus('How can I recognize the warning signs?'), 'signs');

const fallback = evidence.buildDeterministicSearchFallback(
    'How can I recognize the warning signs?',
    catalog
);
assert.match(fallback, /sudden shift|panic symptoms/i);
assert.match(fallback, /Sources:/);
assert.match(evidence.buildHumanFallbackAnswer('How do I recognize panic warning signs?'), /urgent help/i);

console.log('evidence utility tests passed');
