'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const index = read('public/index.html');
const chatLogic = read('public/js/chat-logic.js');
const auraPrompts = read('public/js/aura-prompts.js');
const packageJson = JSON.parse(read('package.json'));

assert.match(index, /turn-policy\.js"><\/script>\s*<script src="js\/profile-rag\.js"><\/script>\s*<script src="js\/response-adaptation\.js"><\/script>/);
assert.match(packageJson.scripts.check, /node --check public\/js\/response-adaptation\.js/);
assert.match(packageJson.scripts.check, /node tests\/response-adaptation\.test\.js/);
assert.match(packageJson.scripts.check, /node tests\/response-adaptation-integration\.test\.js/);
assert.match(
    chatLogic,
    /function deriveHeuristicTurnSupport[\s\S]*?AURA_RESPONSE_ADAPTATION\.resolve\(\{[\s\S]*?continuity:\s*turnPolicy\?\.continuity[\s\S]*?stance:\s*turnPolicy\?\.stance/
);
assert.match(chatLogic, /cognitiveBandwidth:\s*bandwidthValues\.has/);
assert.match(chatLogic, /questioningLevel:\s*questioningValues\.has/);
assert.match(chatLogic, /professionalBridge:\s*bridgeValues\.has/);
assert.match(chatLogic, /Cognitive bandwidth:/);
assert.match(chatLogic, /Questioning:/);
assert.match(chatLogic, /Professional bridge:/);
assert.match(chatLogic, /safeTurn\.directnessTolerance !== 'balanced'/);
assert.match(chatLogic, /safeTurn\.structureNeed === 'high'/);
assert.match(auraPrompts, /Give the user room to vent without immediately turning the moment into advice/i);
assert.match(auraPrompts, /bridge between confusion and clearer self-understanding/i);

console.log('response adaptation integration tests passed');
