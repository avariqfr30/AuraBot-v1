const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const chatLogic = fs.readFileSync(
    path.resolve(__dirname, '..', 'js', 'chat-logic.js'),
    'utf8'
);
const app = fs.readFileSync(
    path.resolve(__dirname, '..', 'js', 'app.js'),
    'utf8'
);

assert.match(
    chatLogic,
    /searchRelevantVectorData[\s\S]*?postJson\(API_ENDPOINTS\.searchMemory,\s*\{\s*profileId:\s*sourceProfileId,\s*query\s*\}\)/
);
assert.match(
    chatLogic,
    /searchRelevantVectorData[\s\S]*?selectRelevantMemories\(\{\s*query,\s*matches,\s*explicitRecall,/
);
assert.match(chatLogic, /source: personal conversation memory/);
assert.doesNotMatch(chatLogic, /source: current conversation memory/);
assert.match(chatLogic, /this\.pendingVectorWrites = new Map\(\)/);
assert.match(
    chatLogic,
    /waitForPendingVectorWrites\(profileId = null\)[\s\S]*?Promise\.allSettled\(pending\)/
);
assert.match(
    chatLogic,
    /vectorizeData[\s\S]*?pendingVectorWrites\.set\(request, sourceProfileId\)[\s\S]*?pendingVectorWrites\.delete\(request\)/
);
assert.match(
    chatLogic,
    /vectorizeData[\s\S]*?isSensitiveAutomaticMemoryText\(text\)[\s\S]*?return false/
);
assert.match(
    chatLogic,
    /vectorizeData[\s\S]*?classifyTurn\(\{\s*message:\s*text\s*\}\)[\s\S]*?domain\s*===\s*'medical'[\s\S]*?return false/
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
