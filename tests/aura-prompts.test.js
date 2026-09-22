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
assert.equal(
    crypto.createHash('sha256').update(JSON.stringify(prompts)).digest('hex'),
    '6015cb82a0d2e47306d8d07b3cccc02d961c5901647587525160263c17f2a030',
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
