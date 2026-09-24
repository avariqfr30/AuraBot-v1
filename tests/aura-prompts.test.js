'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const prompts = require('../public/js/aura-prompts');
const expectedKeys = [
    'DEFAULT_SYSTEM',
    'RESPONSE_STYLE_CONTRACT',
    'MEDGEMMA_CLINICAL_APPENDIX',
    'AURA_COMPANION_CONTRACT',
    'TOOL_OPPORTUNITY',
    'AURA_DIRECT_REPLY',
    'AURA_EVIDENCE_REPLY',
    'MEDICAL_RESPONSE_REVIEW',
    'BEHAVIOR_ANALYZER',
    'CONVERSATION_SUMMARIZER',
    'SEARCH_PLAN',
    'KNOWLEDGE_MAPPER',
    'CRISIS_DETECTION',
    'CRISIS_SUPPORT_REPLY',
    'RE_ENGAGEMENT'
];

assert.deepEqual(Object.keys(prompts), expectedKeys);
assert.equal(Object.isFrozen(prompts), true);
assert.match(prompts.RESPONSE_STYLE_CONTRACT, /Do not end every reply with a question/i);
assert.match(prompts.RESPONSE_STYLE_CONTRACT, /Do not repeatedly suggest the same tool/i);
assert.match(prompts.RESPONSE_STYLE_CONTRACT, /respond to the specific feeling/i);
assert.match(prompts.RESPONSE_STYLE_CONTRACT, /hypothetical details as known facts/i);
assert.match(prompts.AURA_COMPANION_CONTRACT, /tentative pattern/i);
assert.match(prompts.AURA_COMPANION_CONTRACT, /user-stated details/i);
assert.match(prompts.AURA_COMPANION_CONTRACT, /known facts from interpretation/i);
assert.equal(
    crypto.createHash('sha256').update(JSON.stringify(prompts)).digest('hex'),
    'af67fa5b573df74ba0e662cb99cccfc737ea3324b9e85475aee1a7158b377d59',
    'prompt extraction must preserve every prompt byte-for-byte'
);

const root = path.resolve(__dirname, '..');
const index = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
const chatLogic = fs.readFileSync(path.join(root, 'public/js/chat-logic.js'), 'utf8');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

assert.match(index, /aura-prompts\.js"><\/script>[\s\S]*?chat-logic\.js"><\/script>/);
assert.match(chatLogic, /const PROMPTS = window\.AURA_PROMPTS;/);
assert.doesNotMatch(chatLogic, /const PROMPTS = \{/);
assert.match(packageJson.scripts.check, /node --check public\/js\/aura-prompts\.js/);
assert.match(packageJson.scripts.check, /node tests\/aura-prompts\.test\.js/);

console.log('Aura prompt catalog tests passed');
