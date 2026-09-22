const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const indexHtml = read('public/index.html');
const configJs = read('public/js/config.js');
const appJs = read('public/js/app.js');
const chatLogicJs = read('public/js/chat-logic.js');
const auraPromptsJs = read('public/js/aura-prompts.js');
const uiJs = read('public/js/ui.js');
const packageJson = JSON.parse(read('package.json'));

assert.match(configJs, /defaultModel:\s*'medgemma1\.5:4b'/);
assert.match(configJs, /'gpt-oss:120b-cloud'/);
assert.match(configJs, /defaultModelPreference:\s*'auto'/);
assert.match(configJs, /gptModel:\s*'gpt-oss:120b-cloud'/);
assert.match(configJs, /medModel:\s*'medgemma1\.5:4b'/);

assert.doesNotMatch(indexHtml, /<label[^>]+for="systemPromptTextarea"[^>]*>\s*System Prompt\s*<\/label>/);
assert.match(indexHtml, /id="auraStyleSelect"/);
assert.match(indexHtml, /id="responseDetailSelect"/);
assert.match(indexHtml, /id="advancedPromptToggle"/);
assert.match(indexHtml, /id="advancedPromptTextarea"/);
assert.doesNotMatch(indexHtml, /class="browser-toolbar"/);
assert.match(indexHtml, /<textarea id="userInput" rows="1"/);
assert.match(indexHtml, /id="chatMessages"[^>]+role="log"[^>]+aria-live="polite"/);
assert.match(indexHtml, /<details class="advanced-model-panel">/);
assert.match(indexHtml, /id="feedbackLearningStatusText"/);
assert.match(indexHtml, /id="clearFeedbackButton"/);
assert.match(indexHtml, /id="activeProfileButton"/);
assert.match(indexHtml, /id="activeProfileLabel"/);
assert.match(indexHtml, /id="profileSelect"/);
assert.match(indexHtml, /id="createProfileButton"/);
assert.match(indexHtml, /id="renameProfileButton"/);
assert.match(indexHtml, /id="deleteProfileButton"/);
assert.match(indexHtml, /id="personalIntelligenceCheckbox"/);
assert.match(indexHtml, /id="personalIntelligenceStatusText"/);
assert.match(indexHtml, /id="clearLearnedPreferencesButton"/);
assert.match(indexHtml, /Reset Conversation Preferences/);
assert.match(indexHtml, /not account authentication/i);
assert.doesNotMatch(indexHtml, /Persistent Companion Memory/);
assert.match(indexHtml, /<script src="js\/personal-intelligence\.js"><\/script>\s*<script src="js\/intelligence-bundle\.js"><\/script>\s*<script src="js\/model-routing\.js"><\/script>\s*<script src="js\/turn-policy\.js"><\/script>\s*<script src="js\/response-adaptation\.js"><\/script>\s*<script src="js\/tool-decision\.js"><\/script>\s*<script src="js\/tool-artifacts\.js"><\/script>\s*<script src="js\/chat-tool-state\.js"><\/script>\s*<script src="js\/feedback-learning\.js"><\/script>\s*<script src="js\/hosted-client\.js"><\/script>\s*<script src="js\/aura-prompts\.js"><\/script>\s*<script src="js\/response-sanitizer\.js"><\/script>\s*<script src="js\/evidence-utils\.js"><\/script>\s*<script src="js\/chat-logic\.js"><\/script>/);
assert.match(indexHtml, /<option value="auto">Auto/);
assert.match(packageJson.scripts.check, /node --check lib\/memory-results\.js/);
assert.match(packageJson.scripts.check, /node --check public\/js\/turn-policy\.js/);
assert.match(packageJson.scripts.check, /node --check public\/js\/tool-artifacts\.js/);
assert.match(packageJson.scripts.check, /node --check public\/js\/feedback-learning\.js/);
assert.match(packageJson.scripts.check, /node tests\/memory-results\.test\.js/);
assert.match(packageJson.scripts.check, /node tests\/turn-policy\.test\.js/);
assert.match(packageJson.scripts.check, /node tests\/tool-artifacts\.test\.js/);
assert.match(packageJson.scripts.check, /node tests\/feedback-learning\.test\.js/);
assert.match(packageJson.scripts.check, /node tests\/response-examples\.test\.js/);

assert.match(appJs, /function escapeOptionValue/);
assert.match(appJs, /getPinnedModelNames/);
assert.match(appJs, /advancedPromptToggle/);
assert.match(appJs, /auraStyleSelect/);
assert.match(appJs, /responseDetailSelect/);
assert.match(appJs, /AUTO_MODEL_OPTION/);
assert.match(appJs, /window\.AURA_AVAILABLE_MODELS/);
assert.match(appJs, /let responseInFlight = false/);
assert.match(appJs, /chatManager\.addMessageToChat\(requestChatId/);
assert.match(appJs, /getOllamaResponse\(\s*message,\s*null,\s*documentText,\s*requestChatId\s*\)/);
assert.match(appJs, /async function retryWithFeedback/);
assert.match(appJs, /promotePersonalExample/);
assert.match(appJs, /chatManager\.getProfileSetting\(STORAGE_KEYS\.LOCATION_ENABLED/);
assert.match(appJs, /chatManager\.setProfileSetting\(\s*STORAGE_KEYS\.LOCATION_ENABLED/);
assert.match(appJs, /chatManager\.removeProfileSetting\(STORAGE_KEYS\.LOCATION_CONTEXT/);
assert.match(appJs, /chatManager\.getProfileSetting\(\s*STORAGE_KEYS\.RESPONSE_DETAIL/);
assert.match(appJs, /chatManager\.setProfileSetting\(STORAGE_KEYS\.RESPONSE_DETAIL/);
assert.match(appJs, /chatManager\.removeProfileSetting\(STORAGE_KEYS\.RESPONSE_DETAIL/);
assert.match(appJs, /chatManager\.setPersonalIntelligenceEnabled/);
assert.match(appJs, /chatManager\.clearLearnedPreferences\(\)/);
assert.match(appJs, /clearLearnedPreferencesButton\.addEventListener/);
assert.match(appJs, /chatManager\.getPersonalIntelligenceState/);
assert.match(appJs, /chatManager\.switchProfile/);
assert.match(appJs, /chatManager\.createProfile/);
assert.match(appJs, /chatManager\.renameProfile/);
assert.match(appJs, /chatManager\.deleteProfileLocal/);
assert.match(appJs, /deleteRemoteProfileData\([^,]+,\s*'memory'\)/);
assert.match(appJs, /deleteRemoteProfileData\([^,]+,\s*'all'\)/);
assert.match(chatLogicJs, /this\.profileManager\.clearAllProfileData\(\)/);
assert.match(
    appJs,
    /const manualMemoryCommand = parseManualMemoryCommand\(message\)[\s\S]*?addMessageToChat\([\s\S]*?skipVectorization:\s*Boolean\(manualMemoryCommand\)/
);
assert.doesNotMatch(
    appJs,
    /localStorage\.(?:setItem|removeItem)\(STORAGE_KEYS\.(?:LOCATION_ENABLED|LOCATION_CONTEXT|USER_MEMORY_ENABLED|EXPERIENCE_STYLE)/
);
assert.match(uiJs, /isPersonalIntelligenceActive/);
assert.doesNotMatch(uiJs, /localStorage\.getItem\(STORAGE_KEYS\.USER_MEMORY_ENABLED\)/);

assert.match(chatLogicJs, /PROMPT_OVERRIDE_ENABLED/);
assert.match(chatLogicJs, /RESPONSE_DETAIL:\s*'aura_response_detail'/);
assert.match(chatLogicJs, /function getEffectiveSystemPrompt/);
assert.match(chatLogicJs, /buildResponseSystemPrompt\(getEffectiveSystemPrompt\(\), activeModel\)/);
assert.match(chatLogicJs, /function getModelPreference/);
assert.match(chatLogicJs, /async function _callLLM\(prompt, \{/);
assert.match(chatLogicJs, /\.\.\.\(inferencePolicy\.think \? \{ think: inferencePolicy\.think \} : \{\}\)/);
assert.match(chatLogicJs, /num_predict:\s*inferencePolicy\.maxTokens/);
assert.match(chatLogicJs, /function runModelRoutingAgent/);
assert.match(chatLogicJs, /modelDecision:\s*modelRouting\.modelDecision/);
assert.match(chatLogicJs, /MEDICAL_RESPONSE_REVIEW/);
assert.match(chatLogicJs, /async function reviewMedicalReplyIfNeeded/);
assert.match(chatLogicJs, /AURA_TURN_POLICY\.hasToolRefusal\(userMessage\)/);
assert.match(chatLogicJs, /AURA_TURN_POLICY\.hasImmediateGroundingNeed\(userMessage\)/);
assert.match(chatLogicJs, /async function getOllamaResponse\([\s\S]*chatId = chatManager\.getActiveChatId\(\)/);
assert.match(chatLogicJs, /feedbackLearning:\s*window\.AURA_FEEDBACK\.createState\(\)/);
assert.match(chatLogicJs, /getPersonalExampleCandidate/);
assert.match(chatLogicJs, /window\.AURA_PERSONAL_INTELLIGENCE\.createManager\(\s*window\.AURA_HOSTED\?\.enabled \? window\.AURA_HOSTED\.storage : window\.localStorage/);
assert.match(chatLogicJs, /this\.profileManager\.loadProfileState\(\)/);
assert.match(chatLogicJs, /this\.profileManager\.saveProfileState\(this\.state\)/);
assert.match(chatLogicJs, /getFeedbackProfileId\(\)\s*\{\s*return this\.getActiveProfileId\(\)/);
assert.match(chatLogicJs, /profileId:\s*sourceProfileId/);
assert.match(
    chatLogicJs,
    /searchRelevantVectorData[\s\S]*if \(!query \|\| !this\.isPersonalIntelligenceActive\(\)\) return ''/
);
assert.match(chatLogicJs, /analysisCaches\[[^\]]+\]\.clear\(\)/);
assert.match(chatLogicJs, /sourceProfileId\s*!==\s*this\.getActiveProfileId\(\)/);
assert.match(
    chatLogicJs,
    /runBehaviorAnalyzer[\s\S]*normalUserTurns[\s\S]*normalUserTurns\.length < 2/
);
assert.match(auraPromptsJs, /BEHAVIOR_ANALYZER:[\s\S]*current chat only/i);
assert.match(auraPromptsJs, /BEHAVIOR_ANALYZER:[\s\S]*Do not diagnose/i);
assert.match(auraPromptsJs, /BEHAVIOR_ANALYZER:[\s\S]*explicit evidence/i);
assert.match(
    chatLogicJs,
    /getInferenceContentStore[\s\S]*?responsePreferences:\s*getStoredExperienceResponsePreferences\(\)[\s\S]*?\n    }\n\n    getUserMemoryStore/
);
assert.match(
    chatLogicJs,
    /getInferenceResponsePreferences[\s\S]*?this\.isPersonalIntelligenceActive\(\)[\s\S]*?getResponsePreferencesForChat\(chatId\)[\s\S]*?getStoredExperienceResponsePreferences\(\)/
);
assert.match(
    chatLogicJs,
    /getInferenceResponsePreferences[\s\S]*?getExplicitResponsePreferenceOverrides\(\)/
);
assert.match(
    chatLogicJs,
    /function getExplicitResponsePreferenceOverrides[\s\S]*?STORAGE_KEYS\.RESPONSE_DETAIL[\s\S]*?preset\.preferences/
);
assert.doesNotMatch(
    chatLogicJs,
    /function applyExperienceStyle[\s\S]*?updateResponsePreferences[\s\S]*?window\.applyExperienceStyle/
);
assert.match(chatLogicJs, /activeProfile:\s*chatManager\.getInferenceContentStore\(chatId\)/);
assert.match(chatLogicJs, /includeDurable:\s*isUserMemoryEnabled\(\)/);
assert.match(
    chatLogicJs,
    /runPreferenceAgent[\s\S]*?chatManager\.getInferenceResponsePreferences\(chatId\)[\s\S]*?\n}\n\nfunction runEvidenceDecisionAgent/
);
assert.match(
    chatLogicJs,
    /runToolFollowUpAgent[\s\S]*?getInferenceContentStore\(chatId\)[\s\S]*?getInferenceResponsePreferences\(chatId\)[\s\S]*?const turnProfile/
);
assert.match(
    chatLogicJs,
    /getConversationSummary\([^)]*\)\s*\{\s*if \(!this\.isPersonalIntelligenceActive\(\)\) return ''/
);
assert.match(
    chatLogicJs,
    /sourceProfileId\s*!==\s*this\.getActiveProfileId\(\)[\s\S]*?!this\.isPersonalIntelligenceActive\(\)[\s\S]*?!this\.state\.chats\[chatId\]/
);
assert.match(
    chatLogicJs,
    /hasOwnProperty\.call\(candidate,\s*'learningEligible'\)[\s\S]*resolveFeedbackLearningEligibility/
);
assert.match(
    chatLogicJs,
    /learningEligible:\s*window\.AURA_FEEDBACK\.resolveFeedbackLearningEligibility\(\s*existing\?\.learningEligible/
);
assert.match(
    chatLogicJs,
    /searchRelevantVectorData[\s\S]*?const sourceProfileId = this\.getActiveProfileId\(\)[\s\S]*?await postJson[\s\S]*?sourceProfileId !== this\.getActiveProfileId\(\)/
);
assert.match(
    chatLogicJs,
    /searchResponseExamples[\s\S]*?const sourceProfileId = chatManager\.getActiveProfileId\(\)[\s\S]*?personalResultsStillValid/
);
assert.doesNotMatch(
    chatLogicJs,
    /runBehaviorAnalyzer[\s\S]*?PROMPTS\.USER_MEMORY_ANALYZER/
);
assert.match(
    chatLogicJs,
    /getActivePersonalExampleIds[\s\S]*?learningEligible[\s\S]*?isFeedbackLearningRouteEligible/
);
assert.match(
    appJs,
    /removePersonalExample[\s\S]*?deletePersonalExamples[\s\S]*?markFeedbackUnpromoted/
);
assert.match(
    appJs,
    /removeResponseFeedback[\s\S]*?deletePersonalExamples[\s\S]*?deleteResponseFeedback/
);
assert.match(
    chatLogicJs,
    /constructor\(\)[\s\S]*?this\.state = this\.ensureStateShape[\s\S]*?this\.saveState\(\)[\s\S]*?\n    }\n\n    getInitialState/
);
assert.match(
    chatLogicJs,
    /switchProfile[\s\S]*?this\.state = this\.ensureStateShape[\s\S]*?this\.saveState\(\)[\s\S]*?return selected/
);
assert.match(
    chatLogicJs,
    /deleteProfileLocal[\s\S]*?this\.state = this\.ensureStateShape[\s\S]*?this\.saveState\(\)/
);
assert.match(chatLogicJs, /this\.personalContextEpoch = 0/);
assert.match(
    chatLogicJs,
    /getPersonalContextEpoch\(\)\s*\{\s*return this\.personalContextEpoch/
);
[
    /switchProfile[\s\S]*?advancePersonalContextEpoch\(\)[\s\S]*?deleteProfileLocal/,
    /deleteProfileLocal[\s\S]*?advancePersonalContextEpoch\(\)[\s\S]*?getPersonalIntelligenceState/,
    /setPersonalIntelligenceEnabled[\s\S]*?advancePersonalContextEpoch\(\)[\s\S]*?isPersonalIntelligenceActive/,
    /deleteChat[\s\S]*?advancePersonalContextEpoch\(\)[\s\S]*?addMessageToActiveChat/,
    /clearUserMemoryStore[\s\S]*?advancePersonalContextEpoch\(\)[\s\S]*?getFeedbackProfileId/,
    /clearFeedbackLearning[\s\S]*?advancePersonalContextEpoch\(\)[\s\S]*?exportLocalData/
].forEach((pattern) => assert.match(chatLogicJs, pattern));
assert.match(
    chatLogicJs,
    /searchRelevantVectorData[\s\S]*?sourceContextEpoch = this\.getPersonalContextEpoch\(\)[\s\S]*?sourceContextEpoch !== this\.getPersonalContextEpoch\(\)/
);
assert.match(
    chatLogicJs,
    /searchResponseExamples[\s\S]*?sourceContextEpoch = chatManager\.getPersonalContextEpoch\(\)[\s\S]*?sourceContextEpoch === chatManager\.getPersonalContextEpoch\(\)/
);
assert.match(
    chatLogicJs,
    /runBehaviorAnalyzer[\s\S]*?sourceContextEpoch = this\.getPersonalContextEpoch\(\)[\s\S]*?sourceContextEpoch !== this\.getPersonalContextEpoch\(\)/
);
assert.match(
    chatLogicJs,
    /getConversationSummary[\s\S]*?sourceContextEpoch = this\.getPersonalContextEpoch\(\)[\s\S]*?sourceContextEpoch !== this\.getPersonalContextEpoch\(\)/
);
