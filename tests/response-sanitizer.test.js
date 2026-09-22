'use strict';

const assert = require('node:assert/strict');
const sanitizer = require('../public/js/response-sanitizer');

assert.equal(
    sanitizer.stripModelReasoningTokens('<think>private reasoning</think>Final answer.'),
    'Final answer.'
);
assert.equal(
    sanitizer.stripPlanningScaffold('Plan: reason internally\nHere is the useful answer.'),
    'Here is the useful answer.'
);
assert.deepEqual(
    sanitizer.splitReplyArtifacts('Answer body.\n\nSources: [Example](https://example.com)\n<tool_offer type="checklist" theme="Plan" />'),
    {
        body: 'Answer body.',
        toolTags: ['<tool_offer type="checklist" theme="Plan" />'],
        sourceLines: ['Sources: [Example](https://example.com)']
    }
);

(async () => {
    const finalized = await sanitizer.finalizeAssistantReply(
        'Analysis: hidden plan\nHere is the answer.\n<tool_offer type="checklist" theme="Plan" />'
    );
    assert.equal(finalized, 'Here is the answer.\n<tool_offer type="checklist" theme="Plan" />');
    assert.equal(
        sanitizer.getDisplaySafeAssistantContent('Visible reply. <tool_create type="checklist" theme="Plan" />'),
        'Visible reply.'
    );
    console.log('response sanitizer tests passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
