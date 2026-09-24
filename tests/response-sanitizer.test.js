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
assert.equal(
    sanitizer.stripPlanningScaffold('Step 1 – Name the worry.\nStep 2 – Check the facts.\nStep5 – Decide what to do.'),
    'Step 1 – Name the worry.\nStep 2 – Check the facts.\nStep5 – Decide what to do.'
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
    const leakedRecord = '<thought_record> { "thought": "If I had said yes", "feeling": "sadness" } </thought_record>';
    assert.equal(await sanitizer.finalizeAssistantReply(`I hear why that feels painful.\n${leakedRecord}`),
        'I hear why that feels painful.');
    assert.equal(sanitizer.getDisplaySafeAssistantContent(leakedRecord), '');
    assert.equal(await sanitizer.finalizeAssistantReply(
        'Here is a plan. <checklist>{"items":["one"]}</checklist>'
    ), 'Here is a plan.');
    assert.equal(await sanitizer.finalizeAssistantReply(
        'I hear you. <thought_record>{"thought":"x"}</thought_record> <tool_create type="thought_record" theme="Reflection" />'
    ), 'I hear you.\n<tool_create type="thought_record" theme="Reflection" />');
    console.log('response sanitizer tests passed');
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
