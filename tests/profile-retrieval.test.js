const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const chatLogic = fs.readFileSync(
    path.resolve(__dirname, '..', 'public', 'js', 'chat-logic.js'),
    'utf8'
);
const profileRag = fs.readFileSync(
    path.resolve(__dirname, '..', 'public', 'js', 'profile-rag.js'),
    'utf8'
);
const app = fs.readFileSync(
    path.resolve(__dirname, '..', 'public', 'js', 'app.js'),
    'utf8'
);
const server = fs.readFileSync(
    path.resolve(__dirname, '..', 'server.js'),
    'utf8'
);

assert.match(
    chatLogic,
    /searchApprovedMemoryMatches[\s\S]*?postJson\(API_ENDPOINTS\.searchMemory,\s*\{\s*profileId:\s*sourceProfileId,\s*query,\s*approvedOnly:\s*true\s*\}\)/
);
assert.match(
    chatLogic,
    /buildAuraAgentContext[\s\S]*?AURA_PROFILE_RAG\.selectContext\(\{[\s\S]*?approvedSignals:[\s\S]*?vectorMatches: memory\.vectorMatches/
);
assert.match(profileRag, /source: approved personal memory/);
assert.match(
    server,
    /function approvedMemoryWhere[\s\S]*?approval:\s*\{\s*\$eq:\s*'explicit'\s*\}/
);
assert.match(
    server,
    /app\.post\('\/api\/search_memory'[\s\S]*?approvedOnly[\s\S]*?where:\s*approvedMemoryWhere/
);
assert.doesNotMatch(chatLogic, /source: current conversation memory/);
assert.match(chatLogic, /getContentStoreForChat[\s\S]*?sanitizeChatScopedProfile\(chat\?\.localContentStore, buildChatScopedProfile\(\)\)/);
assert.match(chatLogic, /this\.pendingVectorWrites = new Map\(\)/);
assert.doesNotMatch(
    chatLogic,
    /if \(role === 'user' && !metadata\.skipVectorization\)[\s\S]*?this\.vectorizeData\(content/
);
assert.match(
    chatLogic,
    /waitForPendingVectorWrites\(profileId = null\)[\s\S]*?Promise\.allSettled\(pending\)/
);
assert.match(
    chatLogic,
    /vectorizeData[\s\S]*?pendingVectorWrites\.set\(request, sourceProfileId\)[\s\S]*?pendingVectorWrites\.delete\(request\)/
);
assert.match(chatLogic, /vectorizeData[\s\S]*?metadata\?\.approval !== 'explicit'[\s\S]*?return false/);
assert.match(
    chatLogic,
    /rememberUserFact[\s\S]*?vectorizeData\(value,[\s\S]*?sourceChatId:\s*chatId,[\s\S]*?approval:\s*'explicit'/
);
assert.match(
    chatLogic,
    /searchApprovedMemoryMatches[\s\S]*?postJson[\s\S]*?approvedOnly:\s*true/
);
assert.match(chatLogic, /getPromotedExampleIdsForChat\(chatId\)/);
[
    /clearAuraMemory[\s\S]*?waitForPendingVectorWrites\(profileId\)[\s\S]*?deleteRemoteProfileData\(profileId, 'memory'\)/,
    /manualMemoryCommand\?\.action === 'forget_all'[\s\S]*?waitForPendingVectorWrites\(profileId\)[\s\S]*?deleteRemoteProfileData\(profileId, 'memory'\)/,
    /deleteAllAuraData[\s\S]*?waitForPendingVectorWrites\(\)[\s\S]*?for \(const profile of profiles\)/,
    /deleteActiveProfile[\s\S]*?waitForPendingVectorWrites\(profile\.id\)[\s\S]*?deleteRemoteProfileData\(profile\.id, 'all'\)/
].forEach((pattern) => assert.match(app, pattern));
assert.match(
    app,
    /deleteButton[\s\S]*?waitForPendingVectorWrites\(profileId\)[\s\S]*?deleteRemoteProfileData\(profileId, 'memory', chatId\)[\s\S]*?deletePersonalExamples\(\s*promotedExampleIds[\s\S]*?chatManager\.deleteChat\(chatId\)/
);

console.log('profile retrieval tests passed');
