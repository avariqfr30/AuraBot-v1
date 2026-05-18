const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const indexHtml = read('index.html');
const configJs = read('js/config.js');
const appJs = read('js/app.js');
const chatLogicJs = read('js/chat-logic.js');

assert.match(configJs, /defaultModel:\s*'medgemma1\.5:4b'/);
assert.match(configJs, /'gpt-oss:120b-cloud'/);

assert.doesNotMatch(indexHtml, /<label[^>]+for="systemPromptTextarea"[^>]*>\s*System Prompt\s*<\/label>/);
assert.match(indexHtml, /id="auraStyleSelect"/);
assert.match(indexHtml, /id="responseDetailSelect"/);
assert.match(indexHtml, /id="advancedPromptToggle"/);
assert.match(indexHtml, /id="advancedPromptTextarea"/);

assert.match(appJs, /function escapeOptionValue/);
assert.match(appJs, /getPinnedModelNames/);
assert.match(appJs, /advancedPromptToggle/);
assert.match(appJs, /auraStyleSelect/);
assert.match(appJs, /responseDetailSelect/);

assert.match(chatLogicJs, /PROMPT_OVERRIDE_ENABLED/);
assert.match(chatLogicJs, /function getEffectiveSystemPrompt/);
assert.match(chatLogicJs, /buildResponseSystemPrompt\(getEffectiveSystemPrompt\(\), activeModel\)/);
