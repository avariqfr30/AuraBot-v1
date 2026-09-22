'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const index = read('public/index.html');
const chatLogic = read('public/js/chat-logic.js');
const packageJson = JSON.parse(read('package.json'));

assert.match(index, /personal-intelligence\.js"><\/script>\s*<script src="js\/intelligence-bundle\.js"><\/script>/);
assert.match(packageJson.scripts.check, /node --check public\/js\/intelligence-bundle\.js/);
assert.match(packageJson.scripts.check, /node tests\/intelligence-bundle\.test\.js/);
assert.match(packageJson.scripts.check, /node tests\/intelligence-integration\.test\.js/);

assert.match(chatLogic, /intelligenceBundle:\s*window\.AURA_INTELLIGENCE_BUNDLE\.createBundle\(\)/);
assert.match(
    chatLogic,
    /safeState\.intelligenceBundle\s*=\s*window\.AURA_INTELLIGENCE_BUNDLE\.normalizeBundle\(\s*safeState\.intelligenceBundle\s*\)/
);
assert.match(
    chatLogic,
    /legacyGlobalStore[\s\S]*?sanitizeChatScopedProfile\(\s*chat\.localContentStore,\s*buildChatScopedProfile\(\)\s*\)[\s\S]*?safeState\.localContentStore = legacyGlobalStore/
);
assert.match(
    chatLogic,
    /hadIntelligenceBundle[\s\S]*?migrateLegacyContext\(\s*safeState\.intelligenceBundle,\s*legacyGlobalStore/
);
assert.match(
    chatLogic,
    /deleteChat[\s\S]*?removeChatContributions\(\s*this\.state\.intelligenceBundle,\s*id/
);
assert.match(
    chatLogic,
    /getProfileIntelligenceBundle\(\)[\s\S]*?normalizeBundle\(this\.state\.intelligenceBundle\)/
);
assert.match(
    chatLogic,
    /getUserMemoryStore\(\)[\s\S]*?getActiveSignals\(\s*this\.state\.intelligenceBundle,[\s\S]*?kind:\s*'approved_memory'/
);
assert.match(
    chatLogic,
    /getUserMemoryStore\(\)[\s\S]*?behavioralFacts:\s*approvedMemories/
);
assert.match(
    chatLogic,
    /getResponsePreferencesForChat[\s\S]*?buildPreferenceOverrides\(\s*this\.state\.intelligenceBundle\s*\)[\s\S]*?getStoredResponsePreferencesForChat\(chatId\)/
);
assert.match(
    chatLogic,
    /runBehaviorAnalyzer[\s\S]*?recordInteractionPreferenceSignals\(\s*previousPreferences,\s*nextStore\.responsePreferences,\s*chatId/
);
assert.match(chatLogic, /this\.behaviorAnalysisVersions = new Map\(\)/);
assert.match(
    chatLogic,
    /runBehaviorAnalyzer[\s\S]*?analysisVersion[\s\S]*?behaviorAnalysisVersions\.get\(chatId\) !== analysisVersion/
);
assert.match(
    chatLogic,
    /addMessageToChat[\s\S]*?role === 'user'[\s\S]*?recordExplicitPreferenceSignals\(content, chat\.id, message\.id\)/
);
assert.match(
    chatLogic,
    /recordExplicitPreferenceSignals[\s\S]*?inferExplicitPreferenceSignals\(message\)[\s\S]*?type:\s*'explicit_instruction'/
);
assert.match(
    chatLogic,
    /rememberUserFact[\s\S]*?kind:\s*'approved_memory'[\s\S]*?consent:\s*'explicit'/
);
assert.match(
    chatLogic,
    /clearUserMemoryStore[\s\S]*?clearApprovedMemories\(\s*this\.state\.intelligenceBundle\s*\)/
);
assert.match(
    chatLogic,
    /clearLearnedPreferences\(\)[\s\S]*?clearInteractionPreferences\(\s*this\.state\.intelligenceBundle\s*\)/
);

console.log('intelligence integration tests passed');
