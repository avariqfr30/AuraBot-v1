document.addEventListener('DOMContentLoaded', () => {
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const stopResponseButton = document.getElementById('stopResponseButton');
    const responseStatus = document.getElementById('responseStatus');
    const newChatButton = document.getElementById('newChatButton');
    const chatListContainer = document.getElementById('chatList');
    const chatMessagesSurface = document.getElementById('chatMessages');
    const toolsButton = document.getElementById('toolsButton');
    const fileInput = document.getElementById('fileInput');
    const fileUploadButton = document.getElementById('fileUploadButton');
    const editMessageIndicator = document.getElementById('editMessageIndicator');
    const fileAttachmentIndicator = document.getElementById('fileAttachmentIndicator');
    const insightsButton = document.getElementById('insightsButton');
    const themeToggleButton = document.getElementById('themeToggleButton');
    const settingsButton = document.getElementById('settingsButton');
    const activeProfileButton = document.getElementById('activeProfileButton');
    const activeProfileLabel = document.getElementById('activeProfileLabel');
    const profileSelect = document.getElementById('profileSelect');
    const createProfileButton = document.getElementById('createProfileButton');
    const renameProfileButton = document.getElementById('renameProfileButton');
    const deleteProfileButton = document.getElementById('deleteProfileButton');
    const profileActionStatusText = document.getElementById('profileActionStatusText');
    const auraStyleSelect = document.getElementById('auraStyleSelect');
    const responseDetailSelect = document.getElementById('responseDetailSelect');
    const advancedPromptToggle = document.getElementById('advancedPromptToggle');
    const advancedPromptTextarea = document.getElementById('advancedPromptTextarea');
    const modelSelectDropdown = document.getElementById('modelSelectDropdown');
    const composerThinkingMode = document.getElementById('composerThinkingMode');
    const thinkingModeDropdown = document.getElementById('thinkingModeDropdown');
    const thinkingModeStatusText = document.getElementById('thinkingModeStatusText');
    const locationAccessCheckbox = document.getElementById('locationAccessCheckbox');
    const locationStatusText = document.getElementById('locationStatusText');
    const refreshLocationButton = document.getElementById('refreshLocationButton');
    const personalIntelligenceCheckbox = document.getElementById('personalIntelligenceCheckbox');
    const personalIntelligenceStatusText = document.getElementById('personalIntelligenceStatusText');
    const feedbackLearningStatusText = document.getElementById('feedbackLearningStatusText');
    const clearFeedbackButton = document.getElementById('clearFeedbackButton');
    const cancelSettingsButton = document.getElementById('cancelSettingsButton');
    const resetSettingsButton = document.getElementById('resetSettingsButton');
    const saveSettingsButton = document.getElementById('saveSettingsButton');
    const exportDataButton = document.getElementById('exportDataButton');
    const clearMemoryButton = document.getElementById('clearMemoryButton');
    const deleteAllDataButton = document.getElementById('deleteAllDataButton');
    const toolsModalContent = document.getElementById('toolsModalContent');
    const LOCATION_MAX_AGE_MS = 10 * 60 * 1000;
    const LEGACY_DEFAULT_MODELS = new Set(['llama3:8b']);
    const AUTO_MODEL_OPTION = 'auto';

    window.AURA_AVAILABLE_MODELS = [];

    let attachedFile = null;
    let responseInFlight = false;
    let profileOperationInFlight = false;

    function syncResponseInFlightControls() {
        const appBusy = responseInFlight || profileOperationInFlight;
        if (sendButton) sendButton.disabled = appBusy;
        if (stopResponseButton) {
            stopResponseButton.classList.toggle('hidden', !responseInFlight);
            stopResponseButton.disabled = Boolean(responseRuntime.getTurnSignal()?.aborted);
        }
        if (newChatButton) newChatButton.disabled = appBusy;
        if (settingsButton) settingsButton.disabled = appBusy;
        if (fileUploadButton) fileUploadButton.disabled = appBusy;
        if (chatListContainer) {
            chatListContainer.setAttribute('aria-busy', String(appBusy));
            chatListContainer
                .querySelectorAll('[role="tab"], .delete-chat-button')
                .forEach((button) => {
                    button.disabled = appBusy;
                });
        }
        document.querySelectorAll('.response-feedback button, .response-feedback textarea, .response-feedback input')
            .forEach((control) => {
                control.disabled = appBusy;
            });
        document.querySelectorAll('[data-block-during-response="true"]')
            .forEach((control) => {
                control.disabled = appBusy;
            });
        if (deleteProfileButton && window.chatManager) {
            deleteProfileButton.disabled = appBusy || chatManager.listProfiles().length <= 1;
        }
        document.body.classList.toggle('response-in-flight', responseInFlight);
        document.body.classList.toggle('profile-operation-in-flight', profileOperationInFlight);
    }

    function setResponseInFlight(value) {
        if (value && !responseInFlight) {
            responseRuntime.beginTurn();
            if (responseStatus) responseStatus.textContent = '';
        } else if (!value && responseInFlight) {
            if (responseStatus && !responseStatus.textContent && responseRuntime.isRetrievalUnavailable()) {
                responseStatus.textContent = 'Some saved context was unavailable for this reply.';
            }
            responseRuntime.endTurn();
        }
        responseInFlight = Boolean(value);
        syncResponseInFlightControls();
    }

    function handleResponseInterruption(error) {
        const reason = responseRuntime.getTurnSignal()?.reason || error;
        if (!['AbortError', 'TimeoutError'].includes(reason?.name)) return false;
        if (responseStatus) {
            responseStatus.textContent = reason.name === 'AbortError'
                ? 'Response stopped. You can send another message.'
                : 'The response took too long. Your message is saved; please try again.';
        }
        chatManager.pendingResponseMetadata.clear();
        return true;
    }

    function setProfileOperationInFlight(value) {
        profileOperationInFlight = Boolean(value);
        syncResponseInFlightControls();
    }

    function resizeComposer() {
        if (!userInput) return;
        userInput.style.height = 'auto';
        const nextHeight = Math.min(Math.max(userInput.scrollHeight, 50), 168);
        userInput.style.height = `${nextHeight}px`;
        userInput.style.overflowY = userInput.scrollHeight > 168 ? 'auto' : 'hidden';
    }

    function setupLiquidGlassInteractions() {
        return;
    }

    window.setupLiquidGlassInteractions = setupLiquidGlassInteractions;

    function syncChromeCompression() {
        if (!chatMessagesSurface) return;
        document.body.classList.toggle('glass-condensed', chatMessagesSurface.scrollTop > 18);
    }

    function getStoredTheme() {
        const storedTheme = localStorage.getItem(STORAGE_KEYS.THEME);
        return storedTheme === 'light' || storedTheme === 'dark'
            ? storedTheme
            : window.AURA_CONFIG.defaultTheme;
    }

    function updateThemeToggleLabel(theme) {
        if (!themeToggleButton) return;

        const nextTheme = theme === 'dark' ? 'light' : 'dark';
        const label = nextTheme.charAt(0).toUpperCase() + nextTheme.slice(1);
        const textNode = themeToggleButton.querySelector('.theme-toggle-label');

        if (textNode) textNode.textContent = label;
        themeToggleButton.setAttribute('title', `Switch to ${nextTheme} mode`);
        themeToggleButton.setAttribute('aria-label', `Switch to ${nextTheme} mode`);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem(STORAGE_KEYS.THEME, theme);
        updateThemeToggleLabel(theme);
    }

    function toggleTheme() {
        const nextTheme = getStoredTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme);
    }

    function normalizeStoredModel() {
        const storedModel = localStorage.getItem(STORAGE_KEYS.MODEL);
        if (!storedModel || LEGACY_DEFAULT_MODELS.has(storedModel)) {
            localStorage.setItem(
                STORAGE_KEYS.MODEL,
                window.AURA_CONFIG.defaultModelPreference || AUTO_MODEL_OPTION
            );
        }
    }

    function escapeOptionValue(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getPinnedModelNames() {
        return [...new Set([
            window.AURA_CONFIG.defaultModel,
            ...(window.AURA_CONFIG.preferredModels || []),
            'gpt-oss:120b-cloud'
        ].filter(Boolean))];
    }

    function getPrioritizedModels(models = []) {
        const preferredModels = getPinnedModelNames();
        const preferredSet = new Set(preferredModels);
        const preferredOrder = new Map(preferredModels.map((modelName, index) => [modelName, index]));

        return [...models].sort((left, right) => {
            const leftPreferred = preferredSet.has(left);
            const rightPreferred = preferredSet.has(right);

            if (leftPreferred && !rightPreferred) return -1;
            if (!leftPreferred && rightPreferred) return 1;
            if (leftPreferred && rightPreferred) {
                return preferredOrder.get(left) - preferredOrder.get(right);
            }
            return left.localeCompare(right);
        });
    }

    function resolvePreferredStoredModel(storedModel, availableModels = []) {
        if (storedModel === AUTO_MODEL_OPTION) return AUTO_MODEL_OPTION;

        const preferredModels = getPinnedModelNames();
        const availableSet = new Set(availableModels);
        const pinnedSet = new Set(preferredModels);
        const hasStoredModel = storedModel && availableSet.has(storedModel);

        if (storedModel && !LEGACY_DEFAULT_MODELS.has(storedModel) && (hasStoredModel || pinnedSet.has(storedModel) || availableModels.length === 0)) {
            return storedModel;
        }

        const preferredAvailableModel = preferredModels.find((modelName) => availableSet.has(modelName) || pinnedSet.has(modelName));

        return preferredAvailableModel || storedModel || window.AURA_CONFIG.defaultModel;
    }

    function isLocationSharingEnabled() {
        return window.chatManager
            ? Boolean(chatManager.getProfileSetting(STORAGE_KEYS.LOCATION_ENABLED, false))
            : false;
    }

    function getStoredLocationContext() {
        return window.chatManager
            ? chatManager.getProfileSetting(STORAGE_KEYS.LOCATION_CONTEXT, null)
            : null;
    }

    function describeLocationContext(locationContext) {
        if (!locationContext) return 'No location captured yet.';

        const details = [];
        details.push('Your current device location is available');
        if (locationContext.timestamp) {
            details.push(`updated ${new Date(locationContext.timestamp).toLocaleString()}`);
        }

        return details.join(' | ') || 'Location captured.';
    }

    function setLocationStatus(message) {
        if (locationStatusText) locationStatusText.textContent = message;
    }

    function setProfileActionStatus(message = '', { error = false } = {}) {
        if (!profileActionStatusText) return;
        profileActionStatusText.textContent = message;
        profileActionStatusText.classList.toggle('text-red-300', Boolean(error));
        profileActionStatusText.classList.toggle('text-gray-400', !error);
    }

    function getPersonalIntelligenceState() {
        return window.chatManager
            ? chatManager.getPersonalIntelligenceState()
            : 'not_enabled';
    }

    function refreshProfileHeader() {
        if (!window.chatManager) return;
        const profile = chatManager.getActiveProfile();
        const state = getPersonalIntelligenceState();
        const stateLabel = {
            active: 'Personal Intelligence active',
            paused: 'Personal Intelligence paused',
            not_enabled: 'Personal Intelligence off'
        }[state] || 'Personal Intelligence off';

        if (activeProfileLabel) {
            activeProfileLabel.textContent = `${profile?.name || 'My Profile'} · ${stateLabel}`;
        }
        if (activeProfileButton) {
            activeProfileButton.dataset.personalIntelligenceState = state;
            activeProfileButton.setAttribute(
                'aria-label',
                `${profile?.name || 'My Profile'}, ${stateLabel}. Open local profile settings`
            );
        }
    }

    function refreshPersonalIntelligenceStatus({ preview = false } = {}) {
        if (!personalIntelligenceStatusText || !window.chatManager) return;
        const state = getPersonalIntelligenceState();
        const enabledInForm = Boolean(personalIntelligenceCheckbox?.checked);

        if (preview && enabledInForm !== (state === 'active')) {
            personalIntelligenceStatusText.textContent = enabledInForm
                ? 'Personal Intelligence will become active when you save.'
                : 'Personal Intelligence will pause when you save. Stored profile data will be retained.';
            return;
        }

        if (state === 'not_enabled') {
            personalIntelligenceStatusText.textContent = 'Not enabled. Aura only uses the current chat and does not learn across chats.';
            return;
        }
        if (state === 'paused') {
            personalIntelligenceStatusText.textContent = 'Paused. Stored profile data is retained but excluded from replies and new learning.';
            return;
        }

        const store = chatManager.getUserMemoryStore();
        const rememberedCount = (store?.behavioralFacts?.length || 0) + (store?.moodPatterns?.length || 0);
        personalIntelligenceStatusText.textContent = rememberedCount > 0
            ? `Active. Aura may use ${rememberedCount} approved or learned memory item${rememberedCount === 1 ? '' : 's'} across this profile's chats.`
            : 'Active. Aura may learn useful preferences across this profile’s chats.';
    }

    function refreshProfileControls({ clearStatus = false } = {}) {
        if (!window.chatManager) return;
        const profiles = chatManager.listProfiles();
        const activeProfile = chatManager.getActiveProfile();

        if (profileSelect) {
            profileSelect.innerHTML = profiles
                .map((profile) => (
                    `<option value="${escapeOptionValue(profile.id)}">${escapeOptionValue(profile.name)}</option>`
                ))
                .join('');
            profileSelect.value = activeProfile?.id || '';
        }
        if (deleteProfileButton) {
            deleteProfileButton.disabled = responseInFlight || profileOperationInFlight || profiles.length <= 1;
            deleteProfileButton.title = profiles.length <= 1
                ? 'At least one local profile is required'
                : 'Delete the active local profile';
        }
        if (personalIntelligenceCheckbox) {
            personalIntelligenceCheckbox.checked = getPersonalIntelligenceState() === 'active';
        }
        if (clearStatus) setProfileActionStatus('');
        refreshProfileHeader();
        refreshPersonalIntelligenceStatus();
    }

    function refreshFeedbackLearningStatus() {
        if (!feedbackLearningStatusText || !window.chatManager) return;
        const summary = chatManager.getFeedbackSummary();
        const state = getPersonalIntelligenceState();
        const inactiveNote = state === 'active'
            ? 'Learning remains local to this profile.'
            : 'Retries still work, but feedback saved while Personal Intelligence is off or paused will not affect future replies.';
        if (!summary.total) {
            feedbackLearningStatusText.textContent = `No response feedback saved yet. ${inactiveNote}`;
            return;
        }

        const parts = [
            `${summary.total} response${summary.total === 1 ? '' : 's'} reviewed`
        ];
        if (summary.promoted) {
            parts.push(`${summary.promoted} personal example${summary.promoted === 1 ? '' : 's'}`);
        }
        feedbackLearningStatusText.textContent = `${parts.join(' · ')}. ${inactiveNote}`;
    }

    async function deletePersonalExamples(
        exampleIds = [],
        { all = false, profileId = window.chatManager?.getFeedbackProfileId() } = {}
    ) {
        if (!window.chatManager) return false;
        const ids = [...new Set((exampleIds || []).filter(Boolean))];
        if (!profileId || (!all && !ids.length)) return !all && !ids.length;

        try {
            await postJson(API_ENDPOINTS.deletePersonalExamples, {
                profileId,
                ids: all ? [] : ids
            });
            return true;
        } catch (error) {
            console.error('Personal response example deletion failed:', error);
            return false;
        }
    }

    function refreshThinkingModeStatus() {
        const mode = typeof window.getThinkingModeKey === 'function'
            ? window.getThinkingModeKey(thinkingModeDropdown?.value || composerThinkingMode?.value)
            : (thinkingModeDropdown?.value || composerThinkingMode?.value || 'auto');
        const copy = {
            auto: 'Auto keeps background work low, increases effort for complex requests, and handles urgent safety signals without reviewer delay.',
            fast: 'Fast uses GPT-OSS Low or one concise MedGemma pass.',
            balanced: 'Balanced uses GPT-OSS Medium or one structured MedGemma pass.',
            deep: 'Deep uses GPT-OSS High; MedGemma may use a second bounded review pass.'
        };

        if (thinkingModeStatusText) thinkingModeStatusText.textContent = copy[mode] || copy.auto;
    }

    function syncThinkingModeControls(mode = null) {
        const activeMode = typeof window.getThinkingModeKey === 'function'
            ? window.getThinkingModeKey(mode)
            : (mode || 'auto');

        if (composerThinkingMode) composerThinkingMode.value = activeMode;
        if (thinkingModeDropdown) thinkingModeDropdown.value = activeMode;
        refreshThinkingModeStatus();
    }

    function setThinkingMode(mode) {
        const activeMode = typeof window.applyThinkingMode === 'function'
            ? window.applyThinkingMode(mode)
            : (mode || 'auto');
        syncThinkingModeControls(activeMode);
    }

    function syncBehaviorControls() {
        const activeStyle = typeof window.getExperienceStyleKey === 'function'
            ? window.getExperienceStyleKey()
            : (window.chatManager?.getProfileSetting(STORAGE_KEYS.EXPERIENCE_STYLE, 'balanced') || 'balanced');
        const activeStylePreset = window.EXPERIENCE_STYLE_PRESETS?.[activeStyle];
        const styleDefaultDetail = activeStylePreset?.preferences?.detailLevel ||
            DEFAULT_RESPONSE_PREFERENCES.detailLevel;
        const activeDetail = window.chatManager
            ? chatManager.getProfileSetting(
                STORAGE_KEYS.RESPONSE_DETAIL,
                styleDefaultDetail
            )
            : styleDefaultDetail;

        if (auraStyleSelect) auraStyleSelect.value = activeStyle;
        if (responseDetailSelect) responseDetailSelect.value = activeDetail;
        if (advancedPromptToggle) advancedPromptToggle.checked = localStorage.getItem(STORAGE_KEYS.PROMPT_OVERRIDE_ENABLED) === 'true';
        if (advancedPromptTextarea) advancedPromptTextarea.value = localStorage.getItem(STORAGE_KEYS.PROMPT) || '';
    }

    function applyBehaviorControls() {
        const selectedStyle = auraStyleSelect?.value || 'balanced';
        const selectedDetail = responseDetailSelect?.value || DEFAULT_RESPONSE_PREFERENCES.detailLevel;

        if (typeof window.applyExperienceStyle === 'function') {
            window.applyExperienceStyle(selectedStyle);
        } else if (window.chatManager) {
            chatManager.setProfileSetting(STORAGE_KEYS.EXPERIENCE_STYLE, selectedStyle);
        }

        if (window.chatManager) {
            const styleDefaultDetail = window.EXPERIENCE_STYLE_PRESETS?.[selectedStyle]
                ?.preferences?.detailLevel || DEFAULT_RESPONSE_PREFERENCES.detailLevel;
            if (selectedDetail === styleDefaultDetail) {
                chatManager.removeProfileSetting(STORAGE_KEYS.RESPONSE_DETAIL);
            } else {
                chatManager.setProfileSetting(STORAGE_KEYS.RESPONSE_DETAIL, selectedDetail);
            }
        }

        localStorage.setItem(STORAGE_KEYS.PROMPT_OVERRIDE_ENABLED, String(Boolean(advancedPromptToggle?.checked)));
        const overrideValue = String(advancedPromptTextarea?.value || '').trim();
        if (overrideValue) {
            localStorage.setItem(STORAGE_KEYS.PROMPT, overrideValue);
        } else {
            localStorage.removeItem(STORAGE_KEYS.PROMPT);
        }
    }

    async function refreshLocationStatus() {
        if (!locationAccessCheckbox?.checked) {
            setLocationStatus('Location access is off.');
            return;
        }

        if (!navigator.geolocation) {
            setLocationStatus('Geolocation is not supported in this browser.');
            return;
        }

        const storedLocation = getStoredLocationContext();
        let permissionState = 'unknown';

        if (navigator.permissions?.query) {
            try {
                const permission = await navigator.permissions.query({ name: 'geolocation' });
                permissionState = permission.state;
            } catch (_error) {}
        }

        if (storedLocation) {
            const ageMs = Date.now() - new Date(storedLocation.timestamp).getTime();
            const ageLabel = Number.isFinite(ageMs) && ageMs >= 0
                ? ` Refreshed about ${Math.round(ageMs / 60000)} min ago.`
                : '';
            setLocationStatus(`${describeLocationContext(storedLocation)}.${ageLabel}`);
            return;
        }

        if (permissionState === 'denied') {
            setLocationStatus('Location permission is denied in your browser settings.');
            return;
        }

        setLocationStatus('Location is enabled. Click "Refresh Location" to capture your current position.');
    }

    async function requestCurrentLocation({ silent = false } = {}) {
        if (!locationAccessCheckbox?.checked) {
            window.chatManager?.removeProfileSetting(STORAGE_KEYS.LOCATION_CONTEXT);
            await refreshLocationStatus();
            return null;
        }

        if (!navigator.geolocation) {
            setLocationStatus('Geolocation is not supported in this browser.');
            return null;
        }

        const sourceProfileId = window.chatManager?.getActiveProfileId();
        const locationContext = await new Promise((resolve) => {
            navigator.geolocation.getCurrentPosition(
                (position) => resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: position.timestamp,
                    label: 'Approximate device location'
                }),
                (error) => {
                    const reasons = {
                        1: 'Location permission was denied.',
                        2: 'Location is temporarily unavailable.',
                        3: 'Location lookup timed out.'
                    };
                    if (!silent) {
                        setLocationStatus(reasons[error.code] || 'Location lookup failed.');
                    }
                    resolve(null);
                },
                { enableHighAccuracy: false, timeout: 10000, maximumAge: LOCATION_MAX_AGE_MS }
            );
        });

        if (
            locationContext &&
            sourceProfileId &&
            sourceProfileId === window.chatManager?.getActiveProfileId()
        ) {
            chatManager.setProfileSetting(STORAGE_KEYS.LOCATION_CONTEXT, locationContext);
            await refreshLocationStatus();
        }

        return locationContext;
    }

    async function ensureRuntimeLocationFresh() {
        if (!isLocationSharingEnabled()) return null;

        const storedLocation = getStoredLocationContext();
        if (storedLocation?.timestamp && Date.now() - new Date(storedLocation.timestamp).getTime() < LOCATION_MAX_AGE_MS) {
            return storedLocation;
        }

        return requestCurrentLocation({ silent: true });
    }

    function clearResendDraft() {
        editMessageIndicator.classList.add('hidden');
        editMessageIndicator.innerHTML = '';
    }

    function queueMessageForEditAndResend(messageIndex) {
        const message = chatManager.getActiveChatHistory()[messageIndex];
        if (!message?.content) return;

        editMessageIndicator.innerHTML = `Editing an earlier message. Sending will resend it as a new message.<button id="cancelEditResendButton" class="ml-3 text-pink-400 hover:text-pink-300">Cancel</button>`;
        editMessageIndicator.classList.remove('hidden');
        userInput.value = message.content;
        resizeComposer();
        userInput.focus();
        userInput.setSelectionRange(userInput.value.length, userInput.value.length);
        document.getElementById('cancelEditResendButton').onclick = clearResendDraft;
    }

    function getToolChecklistConfig(toolType) {
        const configs = {
            checklist: { itemKey: 'items', followUpType: 'checklist_item_completed' },
            medication_checklist: { itemKey: 'checks', followUpType: 'medication_step_completed' },
            follow_up_plan: { itemKey: 'checkpoints', followUpType: 'follow_up_step_completed' }
        };

        return configs[toolType] || null;
    }

    function resetAttachment() {
        attachedFile = null;
        fileInput.value = '';
        fileAttachmentIndicator.classList.add('hidden');
        fileAttachmentIndicator.innerHTML = '';
    }

    function setAttachment(file) {
        attachedFile = file;
        fileAttachmentIndicator.innerHTML = `<span>${file.name}</span><button id="removeFile" class="ml-2 text-gray-500 hover:text-white">&times;</button>`;
        fileAttachmentIndicator.classList.remove('hidden');
        document.getElementById('removeFile').onclick = resetAttachment;
    }

    async function readAttachedFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
            reader.readAsText(file);
        });
    }

    function buildDisplayedUserMessage(message, file) {
        if (!file) return message;
        return message ? `[Attached: ${file.name}]\n\n${message}` : `[Attached: ${file.name}]`;
    }

    function getProgressMessage(message, hasFile = false) {
        const text = String(message || '').toLowerCase();
        if (hasFile) return 'Aura is reading the attachment.';
        if (/\b(source|sources|research|verify|fact-check|citation|latest|current|news)\b/.test(text)) {
            return 'Aura is checking sources quietly.';
        }
        if (/\b(plan|steps|checklist|organize|prepare|track|follow up|appointment)\b/.test(text)) {
            return 'Aura is organizing this into something usable.';
        }
        if (/\b(panic|anxious|overwhelmed|scared|spiral|unsafe)\b/.test(text)) {
            return 'Aura is slowing this down with you.';
        }
        return 'Aura is thinking this through.';
    }

    function parseManualMemoryCommand(message) {
        const text = String(message || '').trim();
        const rememberMatch = text.match(/^(?:please\s+)?remember(?:\s+this)?[:\s-]+(.+)$/i);
        if (rememberMatch?.[1]) {
            return { action: 'remember', value: rememberMatch[1].trim() };
        }

        if (/^(?:please\s+)?forget(?:\s+my\s+)?(?:memory|memories|what you remember|everything you remember)$/i.test(text)) {
            return { action: 'forget_all' };
        }

        return null;
    }

    function downloadJson(filename, data) {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    function exportAuraData() {
        if (!window.chatManager) return;
        const profileName = String(chatManager.getActiveProfile()?.name || 'profile')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 40) || 'profile';
        downloadJson(
            `aura-${profileName}-${new Date().toISOString().slice(0, 10)}.json`,
            chatManager.exportLocalData()
        );
    }

    async function deleteRemoteProfileData(profileId, scope = 'all', chatId = null) {
        return postJson(`${window.AURA_CONFIG.apiBaseUrl}/profile_data/delete`, {
            profileId,
            scope,
            ...(chatId ? { chatId } : {})
        });
    }

    async function clearAuraMemory() {
        if (!window.chatManager) return;
        if (!confirm('Forget cross-chat memory for the active profile? Its chats, feedback, and Personal Intelligence state will stay.')) return;

        const profileId = chatManager.getActiveProfileId();
        setProfileOperationInFlight(true);
        setProfileActionStatus('Deleting active-profile memory…');
        try {
            await chatManager.waitForPendingVectorWrites(profileId);
            await deleteRemoteProfileData(profileId, 'memory');
            if (profileId !== chatManager.getActiveProfileId()) {
                throw new Error('The active profile changed before memory deletion finished.');
            }
            chatManager.clearUserMemoryStore();
            setProfileActionStatus('Active-profile memory was deleted. Personal Intelligence state was not changed.');
            refreshPersonalIntelligenceStatus();
            refreshUI();
        } catch (error) {
            console.error('Profile memory deletion failed:', error);
            setProfileActionStatus('Could not delete profile memory. No local memory was cleared.', { error: true });
        } finally {
            setProfileOperationInFlight(false);
        }
    }

    async function clearFeedbackLearning() {
        if (!window.chatManager) return;
        if (!confirm('Clear feedback and personal response examples for the active profile? Its chats and memory will stay.')) return;

        const profileId = chatManager.getActiveProfileId();
        setProfileOperationInFlight(true);
        setProfileActionStatus('Deleting active-profile feedback…');
        try {
            const deleted = await deletePersonalExamples(
                chatManager.getActivePersonalExampleIds(),
                { all: true, profileId }
            );
            if (!deleted || profileId !== chatManager.getActiveProfileId()) {
                throw new Error('Remote feedback deletion did not complete for the active profile.');
            }
            chatManager.clearFeedbackLearning();
            setProfileActionStatus('Active-profile feedback was deleted.');
            refreshFeedbackLearningStatus();
            refreshUI();
        } catch (error) {
            console.error('Feedback deletion failed:', error);
            setProfileActionStatus('Could not delete feedback. Local feedback was retained.', { error: true });
        } finally {
            setProfileOperationInFlight(false);
        }
    }

    async function deleteAllAuraData() {
        if (!window.chatManager) return;
        if (!confirm('Delete every local profile, chat, memory, feedback item, and device setting? This cannot be undone.')) return;

        const profiles = chatManager.listProfiles();
        setProfileOperationInFlight(true);
        setProfileActionStatus('Deleting all profile data…');
        try {
            await chatManager.waitForPendingVectorWrites();
            for (const profile of profiles) {
                await deleteRemoteProfileData(profile.id, 'all');
            }

            await chatManager.deleteAllLocalData();
            normalizeStoredModel();
            applyTheme(getStoredTheme());
            syncThinkingModeControls('auto');
            syncBehaviorControls();
            refreshProfileControls({ clearStatus: true });
            if (locationAccessCheckbox) locationAccessCheckbox.checked = isLocationSharingEnabled();
            refreshLocationStatus();
            refreshFeedbackLearningStatus();
            closeSettingsModal();
            refreshUI();
        } catch (error) {
            console.error('Delete all Aura data failed:', error);
            setProfileActionStatus(
                'Could not delete every profile remotely. Local data was retained; some remote profile data may already have been removed.',
                { error: true }
            );
        } finally {
            setProfileOperationInFlight(false);
        }
    }

    async function processToolTags(rawResponse, chatId = chatManager.getActiveChatId()) {
        responseRuntime.throwIfAborted();
        const artifacts = window.AURA_TOOL_ARTIFACTS.parseToolArtifacts(rawResponse);

        if (artifacts.creates.length > 0) {
            artifacts.creates.forEach((entry) => addToolStatusMessage(entry.type));
        }

        for (const entry of artifacts.creates) {
            const toolData = await createToolByType(entry.type, entry.theme);
            responseRuntime.throwIfAborted();
            if (toolData) chatManager.addOrUpdateToolInChat(chatId, entry.type, toolData);
        }

        removeToolStatusMessages();
        return {
            content: artifacts.content,
            toolOffer: artifacts.offer
                ? window.AURA_TOOL_ARTIFACTS.createToolOffer(artifacts.offer, {
                    id: `offer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
                })
                : null
        };
    }

    function addAssistantArtifact(
        artifact,
        fallback = '',
        chatId = chatManager.getActiveChatId(),
        metadata = {}
    ) {
        responseRuntime.throwIfAborted();
        const content = artifact?.content || fallback;
        if (!content) return false;

        const pendingMetadata = chatManager.consumePendingResponseMetadata(chatId);
        const messageIndex = chatManager.addMessageToChat(chatId, 'ai', content, {
            ...pendingMetadata,
            ...metadata,
            toolOffer: artifact?.toolOffer || null
        });
        const storedMessage = chatManager.getChatHistory(chatId)[messageIndex];
        if (chatManager.getActiveChatId() === chatId) {
            addMessage('ai', content, {
                messageIndex,
                messageId: storedMessage?.id,
                chatId,
                toolOffer: artifact?.toolOffer || null,
                feedback: storedMessage
                    ? chatManager.getResponseFeedback(chatId, storedMessage.id)
                    : null,
                canPromote: storedMessage
                    ? chatManager.canPromoteResponseFeedback(chatId, storedMessage.id)
                    : false
            });
        }
        return storedMessage || false;
    }

    function refreshUI() {
        renderChatList(chatManager.state.chats, chatManager.getActiveChatId());
        displayChat(chatManager.getActiveChatHistory());
        const tools = chatManager.getActiveChatTools();
        toggleToolsButton(Object.values(tools).some((entries) => entries && entries.length > 0));
        refreshProfileHeader();
        refreshFeedbackLearningStatus();
        setupLiquidGlassInteractions();
        syncResponseInFlightControls();
    }

    async function triggerAIFollowUp(followUp) {
        if (responseInFlight || profileOperationInFlight) return;
        const requestChatId = chatManager.getActiveChatId();
        setResponseInFlight(true);
        showTypingIndicator();

        try {
            const response = await getOllamaResponse('', followUp, null, requestChatId);
            const artifact = await processToolTags(response, requestChatId);

            addAssistantArtifact(artifact, '', requestChatId);
            refreshUI();
        } catch (error) {
            if (!handleResponseInterruption(error)) {
                console.error('Tool follow-up failed:', error);
                if (responseStatus) responseStatus.textContent = 'Could not finish this reply. Please try again.';
            }
        } finally {
            hideTypingIndicator();
            setResponseInFlight(false);
        }
    }

    async function handleSendMessage() {
        if (responseInFlight || profileOperationInFlight) return;
        const message = userInput.value.trim();
        if (!message && !attachedFile) return;

        const requestChatId = chatManager.getActiveChatId();
        const currentAttachment = attachedFile;
        const displayMessage = buildDisplayedUserMessage(message, currentAttachment);
        const manualMemoryCommand = parseManualMemoryCommand(message);
        addMessage('user', displayMessage);
        chatManager.addMessageToChat(
            requestChatId,
            'user',
            message || displayMessage,
            { skipVectorization: Boolean(manualMemoryCommand) }
        );

        userInput.value = '';
        resizeComposer();
        clearResendDraft();
        resetAttachment();
        if (manualMemoryCommand?.action === 'remember') {
            const remembered = chatManager.rememberUserFact(manualMemoryCommand.value);
            const state = getPersonalIntelligenceState();
            const reply = remembered
                ? 'I’ll remember that for this profile’s future chats. You can pause Personal Intelligence or delete this memory anytime in Settings.'
                : state === 'paused'
                    ? 'Personal Intelligence is paused for this profile, so I did not store that. You can reactivate it in Settings, then ask me again.'
                    : 'Personal Intelligence is not enabled for this profile, so I did not store that. You can opt in through Settings, then ask me again.';
            addMessage('ai', reply);
            chatManager.addMessageToChat(requestChatId, 'ai', reply);
            refreshUI();
            return;
        }

        if (manualMemoryCommand?.action === 'forget_all') {
            const profileId = chatManager.getActiveProfileId();
            let reply = '';
            setProfileOperationInFlight(true);
            try {
                await chatManager.waitForPendingVectorWrites(profileId);
                await deleteRemoteProfileData(profileId, 'memory');
                if (profileId !== chatManager.getActiveProfileId()) {
                    throw new Error('The active profile changed before memory deletion finished.');
                }
                chatManager.clearUserMemoryStore();
                reply = 'I forgot this profile’s cross-chat memory. Its Personal Intelligence setting and your current chat are unchanged.';
            } catch (error) {
                console.error('Manual memory deletion failed:', error);
                reply = 'I couldn’t delete all of this profile’s stored memory, so I left the local copy intact. You can try again in Settings.';
            } finally {
                setProfileOperationInFlight(false);
            }
            addMessage('ai', reply);
            chatManager.addMessageToChat(requestChatId, 'ai', reply);
            refreshPersonalIntelligenceStatus();
            refreshUI();
            return;
        }

        setResponseInFlight(true);
        showTypingIndicator(getProgressMessage(message, Boolean(currentAttachment)));

        try {
            const documentText = currentAttachment
                ? await responseRuntime.waitFor(() => readAttachedFile(currentAttachment))
                : null;
            updateTypingIndicator(getProgressMessage(message, false));
            await responseRuntime.waitFor(() => ensureRuntimeLocationFresh());
            const screenResult = await chatManager.preScreenMessage(message, requestChatId);

            if (screenResult === 'CRISIS') {
                updateTypingIndicator('Aura is focusing on immediate safety.');
                const safeMessage = await chatManager.triggerSafetyIntervention(
                    message,
                    requestChatId
                );
                addAssistantArtifact({ content: safeMessage }, '', requestChatId);
                refreshUI();
                return;
            }

            updateTypingIndicator(getProgressMessage(message, Boolean(documentText)));
            const rawResponse = await getOllamaResponse(
                message,
                null,
                documentText,
                requestChatId
            );
            updateTypingIndicator('Aura is shaping the reply.');
            const artifact = await processToolTags(rawResponse, requestChatId);
            addAssistantArtifact(
                artifact,
                "I'm here. I just didn't manage to form a full reply that time.",
                requestChatId
            );
            refreshUI();
        } catch (error) {
            if (handleResponseInterruption(error)) return;
            console.error('Message handling failed:', error);
            addAssistantArtifact(
                {
                    content: "I hit a snag while working on that. Try again in a second and I'll take another pass."
                },
                '',
                requestChatId
            );
            refreshUI();
        } finally {
            hideTypingIndicator();
            removeToolStatusMessages();
            setResponseInFlight(false);
        }
    }

    function getFeedbackFormValue(root) {
        return {
            rating: root.dataset.rating || 'unrated',
            reasons: [...root.querySelectorAll('[data-feedback-reason]:checked')]
                .map((input) => input.dataset.feedbackReason)
                .filter(Boolean),
            comment: root.querySelector('[data-feedback-comment]')?.value || ''
        };
    }

    function getFeedbackSavedStatus() {
        return chatManager.isPersonalIntelligenceActive()
            ? 'Saved locally. Eligible repeated patterns may guide future replies.'
            : 'Saved locally for this reply and retries only. It will not affect future replies.';
    }

    async function saveFeedbackPatchRemoteFirst(root, patch) {
        const chatId = root.dataset.chatId;
        const messageId = root.dataset.messageId;
        const existing = chatManager.getResponseFeedback(chatId, messageId);
        const nextRating = patch.rating ?? existing?.rating ?? 'unrated';
        const nextLearningEligible = window.AURA_FEEDBACK.resolveFeedbackLearningEligibility(
            existing?.learningEligible,
            chatManager.isPersonalIntelligenceActive(),
            existing?.routeSnapshot
        );
        const promotedExampleId = existing?.promotedExampleId || '';
        const mustDeletePromotion = Boolean(
            promotedExampleId &&
            (nextRating !== 'helpful' || !nextLearningEligible)
        );

        if (!mustDeletePromotion) {
            return chatManager.saveResponseFeedback(chatId, messageId, patch);
        }

        const profileId = chatManager.getFeedbackProfileId();
        const contextEpoch = chatManager.getPersonalContextEpoch();
        setProfileOperationInFlight(true);
        try {
            const deleted = await deletePersonalExamples(
                [promotedExampleId],
                { profileId }
            );
            const latest = chatManager.getResponseFeedback(chatId, messageId);
            if (
                !deleted ||
                profileId !== chatManager.getFeedbackProfileId() ||
                contextEpoch !== chatManager.getPersonalContextEpoch() ||
                latest?.promotedExampleId !== promotedExampleId
            ) {
                throw new Error('The promoted response example could not be deleted safely.');
            }
            return chatManager.saveResponseFeedback(chatId, messageId, patch);
        } finally {
            setProfileOperationInFlight(false);
        }
    }

    function renderUpdatedFeedback(root, { open = false, status = '', isError = false } = {}) {
        const chatId = root.dataset.chatId;
        const messageId = root.dataset.messageId;
        const replacement = renderResponseFeedback({
            chatId,
            messageId,
            feedback: chatManager.getResponseFeedback(chatId, messageId),
            canPromote: chatManager.canPromoteResponseFeedback(chatId, messageId)
        });
        if (!replacement) return null;
        root.replaceWith(replacement);
        if (open) replacement.querySelector('.feedback-detail-panel')?.classList.remove('hidden');
        const statusTarget = replacement.querySelector('.feedback-action-status');
        if (statusTarget && status) {
            statusTarget.textContent = status;
            statusTarget.classList.toggle('is-error', isError);
        }
        syncResponseInFlightControls();
        refreshFeedbackLearningStatus();
        return replacement;
    }

    async function rateResponse(root, rating) {
        if (responseInFlight || profileOperationInFlight) return null;
        try {
            const saved = await saveFeedbackPatchRemoteFirst(root, {
                ...getFeedbackFormValue(root),
                rating
            });
            if (!saved) throw new Error('The feedback could not be saved.');
            return renderUpdatedFeedback(root, {
                open: rating === 'not_helpful',
                status: getFeedbackSavedStatus()
            });
        } catch (error) {
            console.error('Response rating save failed:', error);
            return renderUpdatedFeedback(root, {
                open: true,
                status: 'Could not update this feedback. Its previous local and personal-example state was retained.',
                isError: true
            });
        }
    }

    async function saveResponseFeedbackFromRoot(root) {
        if (responseInFlight || profileOperationInFlight) return null;
        try {
            const saved = await saveFeedbackPatchRemoteFirst(root, getFeedbackFormValue(root));
            if (!saved) throw new Error('The feedback could not be saved.');
            return renderUpdatedFeedback(root, {
                open: true,
                status: getFeedbackSavedStatus()
            });
        } catch (error) {
            console.error('Response feedback save failed:', error);
            renderUpdatedFeedback(root, {
                open: true,
                status: 'Could not update this feedback. Its previous local and personal-example state was retained.',
                isError: true
            });
            return null;
        }
    }

    async function promotePersonalExample(root) {
        if (responseInFlight || profileOperationInFlight) return;
        const chatId = root.dataset.chatId;
        const messageId = root.dataset.messageId;
        const candidate = chatManager.getPersonalExampleCandidate(chatId, messageId);
        if (!candidate) {
            renderUpdatedFeedback(root, {
                open: true,
                status: 'Only explicitly helpful, low-risk companion replies can become personal examples.',
                isError: true
            });
            return;
        }

        const profileId = chatManager.getFeedbackProfileId();
        const contextEpoch = chatManager.getPersonalContextEpoch();
        let storedExampleId = '';
        setProfileOperationInFlight(true);
        try {
            const result = await postJson(API_ENDPOINTS.upsertPersonalExample, {
                profileId,
                example: candidate
            });
            storedExampleId = result.id || candidate.id;
            const latestCandidate = chatManager.getPersonalExampleCandidate(chatId, messageId);
            if (
                profileId !== chatManager.getFeedbackProfileId() ||
                contextEpoch !== chatManager.getPersonalContextEpoch() ||
                latestCandidate?.id !== candidate.id
            ) {
                await deletePersonalExamples([storedExampleId], { profileId });
                throw new Error('The profile or feedback changed before promotion finished.');
            }
            chatManager.markFeedbackPromoted(chatId, messageId, storedExampleId);
            if (!chatManager.isPersonalExampleActive(storedExampleId)) {
                await deletePersonalExamples([storedExampleId], { profileId });
                throw new Error('The stored response example could not be activated locally.');
            }
            renderUpdatedFeedback(root, {
                open: true,
                status: 'Saved as a local response example. It may be included in future model prompts.'
            });
        } catch (error) {
            console.error('Personal response example storage failed:', error);
            renderUpdatedFeedback(root, {
                open: true,
                status: storedExampleId
                    ? 'Could not finish saving this personal example. A remote copy may need cleanup.'
                    : 'Could not save the personal example. Make sure ChromaDB is running.',
                isError: true
            });
        } finally {
            setProfileOperationInFlight(false);
        }
    }

    async function removePersonalExample(root) {
        if (responseInFlight || profileOperationInFlight) return;
        const chatId = root.dataset.chatId;
        const messageId = root.dataset.messageId;
        const feedback = chatManager.getResponseFeedback(
            chatId,
            messageId
        );
        const promotedExampleId = feedback?.promotedExampleId || '';
        if (!promotedExampleId) {
            renderUpdatedFeedback(root, {
                open: true,
                status: 'This response is not stored as a personal example.'
            });
            return;
        }

        const profileId = chatManager.getFeedbackProfileId();
        const contextEpoch = chatManager.getPersonalContextEpoch();
        setProfileOperationInFlight(true);
        try {
            const deleted = await deletePersonalExamples(
                [promotedExampleId],
                { profileId }
            );
            const latest = chatManager.getResponseFeedback(chatId, messageId);
            if (
                !deleted ||
                profileId !== chatManager.getFeedbackProfileId() ||
                contextEpoch !== chatManager.getPersonalContextEpoch() ||
                latest?.promotedExampleId !== promotedExampleId
            ) {
                throw new Error('The personal response example could not be deleted safely.');
            }
            chatManager.markFeedbackUnpromoted(chatId, messageId);
            renderUpdatedFeedback(root, {
                open: true,
                status: 'This response is no longer used as a personal example.'
            });
        } catch (error) {
            console.error('Personal response example removal failed:', error);
            renderUpdatedFeedback(root, {
                open: true,
                status: 'Could not remove the personal example. Its local marker was retained.',
                isError: true
            });
        } finally {
            setProfileOperationInFlight(false);
        }
    }

    async function removeResponseFeedback(root) {
        if (responseInFlight || profileOperationInFlight) return;
        const chatId = root.dataset.chatId;
        const messageId = root.dataset.messageId;
        const feedback = chatManager.getResponseFeedback(chatId, messageId);
        const promotedExampleId = feedback?.promotedExampleId || '';
        const profileId = chatManager.getFeedbackProfileId();
        const contextEpoch = chatManager.getPersonalContextEpoch();

        if (promotedExampleId) setProfileOperationInFlight(true);
        try {
            if (promotedExampleId) {
                const deleted = await deletePersonalExamples(
                    [promotedExampleId],
                    { profileId }
                );
                const latest = chatManager.getResponseFeedback(chatId, messageId);
                if (
                    !deleted ||
                    profileId !== chatManager.getFeedbackProfileId() ||
                    contextEpoch !== chatManager.getPersonalContextEpoch() ||
                    latest?.promotedExampleId !== promotedExampleId
                ) {
                    throw new Error('The personal response example could not be deleted safely.');
                }
            }
            chatManager.deleteResponseFeedback(chatId, messageId);
            renderUpdatedFeedback(root, {
                open: false,
                status: 'Feedback removed.'
            });
        } catch (error) {
            console.error('Response feedback removal failed:', error);
            renderUpdatedFeedback(root, {
                open: true,
                status: 'Could not remove this feedback. Its local and personal-example state was retained.',
                isError: true
            });
        } finally {
            if (promotedExampleId) setProfileOperationInFlight(false);
        }
    }

    async function retryWithFeedback(root) {
        if (responseInFlight || profileOperationInFlight) return;
        const savedRoot = await saveResponseFeedbackFromRoot(root);
        if (!savedRoot) return;
        const chatId = savedRoot.dataset.chatId;
        const messageId = savedRoot.dataset.messageId;
        const retryContext = chatManager.getFeedbackRetryContext(chatId, messageId);
        if (!retryContext) {
            renderUpdatedFeedback(savedRoot, {
                open: true,
                status: 'Add feedback before asking Aura to retry.',
                isError: true
            });
            return;
        }

        setResponseInFlight(true);
        if (chatManager.getActiveChatId() === chatId) {
            addMessage('user', retryContext.displayMessage);
        }
        chatManager.addMessageToChat(chatId, 'user', retryContext.prompt, {
            feedbackRetryFor: messageId,
            skipVectorization: true
        });
        showTypingIndicator('Aura is applying your feedback.');

        try {
            const rawResponse = await getOllamaResponse(
                retryContext.prompt,
                null,
                null,
                chatId
            );
            const artifact = await processToolTags(rawResponse, chatId);
            const retryMessage = addAssistantArtifact(
                artifact,
                "I couldn't complete that retry. Your feedback is still saved.",
                chatId,
                { retryOfMessageId: messageId }
            );
            if (retryMessage?.id) {
                chatManager.markFeedbackRetried(chatId, messageId, retryMessage.id);
            }
            refreshUI();
        } catch (error) {
            if (handleResponseInterruption(error)) return;
            console.error('Feedback retry failed:', error);
            addAssistantArtifact(
                { content: "I couldn't complete that retry. Your feedback is still saved locally." },
                '',
                chatId,
                { retryOfMessageId: messageId }
            );
            refreshUI();
        } finally {
            hideTypingIndicator();
            removeToolStatusMessages();
            setResponseInFlight(false);
        }
    }

    async function populateModelOptions() {
        const storedModel = localStorage.getItem(STORAGE_KEYS.MODEL) ||
            window.AURA_CONFIG.defaultModelPreference ||
            AUTO_MODEL_OPTION;
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 3500);

        try {
            modelSelectDropdown.innerHTML = `<option value="${escapeOptionValue(storedModel)}">Loading local models...</option>`;
            modelSelectDropdown.value = storedModel;

            const data = await requestJson(`${window.AURA_CONFIG.ollamaBaseUrl}/tags`, {
                method: 'GET',
                signal: controller.signal
            });
            const models = (data.models || []).map((model) => model.name).filter(Boolean);
            window.AURA_AVAILABLE_MODELS = [...models];
            const resolvedModel = resolvePreferredStoredModel(storedModel, models);
            const uniqueModels = getPrioritizedModels([
                ...new Set([
                    ...(resolvedModel === AUTO_MODEL_OPTION ? [] : [resolvedModel]),
                    ...getPinnedModelNames(),
                    ...models
                ])
            ]);

            if (resolvedModel !== storedModel) {
                localStorage.setItem(STORAGE_KEYS.MODEL, resolvedModel);
            }

            modelSelectDropdown.innerHTML = [
                `<option value="${AUTO_MODEL_OPTION}">Auto (GPT-OSS + MedGemma)</option>`,
                ...uniqueModels.map((modelName) => {
                    const isPreferred = getPinnedModelNames().includes(modelName);
                    const label = isPreferred ? `${modelName} (Preferred)` : modelName;
                    return `<option value="${escapeOptionValue(modelName)}">${escapeOptionValue(label)}</option>`;
                })
            ].join('');
        } catch (error) {
            console.error('Failed to load models:', error);
            window.AURA_AVAILABLE_MODELS = [];
            const fallbackModels = getPrioritizedModels([
                ...new Set([
                    ...(storedModel === AUTO_MODEL_OPTION ? [] : [storedModel]),
                    ...getPinnedModelNames()
                ])
            ]);
            modelSelectDropdown.innerHTML = [
                `<option value="${AUTO_MODEL_OPTION}">Auto (GPT-OSS + MedGemma)</option>`,
                ...fallbackModels.map((modelName) => `<option value="${escapeOptionValue(modelName)}">${escapeOptionValue(modelName)}</option>`)
            ].join('');
        } finally {
            window.clearTimeout(timeoutId);
        }

        modelSelectDropdown.value = localStorage.getItem(STORAGE_KEYS.MODEL) || storedModel;
    }

    function refreshProfileScopedUI({ clearStatus = false } = {}) {
        syncBehaviorControls();
        if (locationAccessCheckbox) locationAccessCheckbox.checked = isLocationSharingEnabled();
        refreshProfileControls({ clearStatus });
        refreshLocationStatus();
        refreshFeedbackLearningStatus();
        clearResendDraft();
        resetAttachment();
        refreshUI();
    }

    function switchActiveProfile(profileId) {
        if (responseInFlight || profileOperationInFlight || !window.chatManager) return false;
        const selected = chatManager.switchProfile(profileId);
        if (!selected) {
            refreshProfileControls();
            setProfileActionStatus('That local profile is unavailable.', { error: true });
            return false;
        }

        refreshProfileScopedUI({ clearStatus: true });
        setProfileActionStatus(`Switched to ${selected.name}.`);
        return true;
    }

    function createLocalProfile() {
        if (responseInFlight || profileOperationInFlight || !window.chatManager) return;
        const requestedName = prompt('Name this local profile:');
        if (requestedName === null) return;
        const name = requestedName.trim();
        if (!name) {
            setProfileActionStatus('Enter a profile name.', { error: true });
            return;
        }

        const profile = chatManager.createProfile(name);
        if (!profile) {
            setProfileActionStatus('Could not create the local profile.', { error: true });
            return;
        }
        refreshProfileScopedUI({ clearStatus: true });
        setProfileActionStatus(`Created ${profile.name}. Personal Intelligence is off by default.`);
    }

    function renameActiveProfile() {
        if (responseInFlight || profileOperationInFlight || !window.chatManager) return;
        const profile = chatManager.getActiveProfile();
        if (!profile) return;
        const requestedName = prompt('Rename this local profile:', profile.name);
        if (requestedName === null) return;
        const name = requestedName.trim();
        if (!name) {
            setProfileActionStatus('Enter a profile name.', { error: true });
            return;
        }

        const renamed = chatManager.renameProfile(profile.id, name);
        if (!renamed) {
            setProfileActionStatus('Could not rename the local profile.', { error: true });
            return;
        }
        refreshProfileControls();
        setProfileActionStatus(`Renamed this profile to ${renamed.name}.`);
    }

    async function deleteActiveProfile() {
        if (responseInFlight || profileOperationInFlight || !window.chatManager) return;
        const profiles = chatManager.listProfiles();
        const profile = chatManager.getActiveProfile();
        if (!profile) return;
        if (profiles.length <= 1) {
            setProfileActionStatus('At least one local profile is required.', { error: true });
            return;
        }
        if (!confirm(`Delete the local profile “${profile.name}” and all of its chats, memory, and feedback?`)) return;

        setProfileOperationInFlight(true);
        setProfileActionStatus(`Deleting ${profile.name}…`);
        try {
            await chatManager.waitForPendingVectorWrites(profile.id);
            await deleteRemoteProfileData(profile.id, 'all');
            if (profile.id !== chatManager.getActiveProfileId()) {
                throw new Error('The active profile changed before deletion finished.');
            }
            if (!chatManager.deleteProfileLocal(profile.id)) {
                throw new Error('The local profile could not be deleted.');
            }
            refreshProfileScopedUI({ clearStatus: true });
            setProfileActionStatus(`${profile.name} was deleted.`);
        } catch (error) {
            console.error('Profile deletion failed:', error);
            setProfileActionStatus(
                'Could not finish deleting the profile. Its local data was retained; some remote profile data may already be gone.',
                { error: true }
            );
        } finally {
            setProfileOperationInFlight(false);
        }
    }

    async function openSettingsPanel() {
        syncBehaviorControls();
        syncThinkingModeControls();
        if (locationAccessCheckbox) locationAccessCheckbox.checked = isLocationSharingEnabled();
        refreshProfileControls({ clearStatus: true });
        openSettingsModal();
        populateModelOptions();
        refreshLocationStatus();
        refreshPersonalIntelligenceStatus();
        refreshFeedbackLearningStatus();
    }

    function resetSettingsForm() {
        if (responseInFlight || profileOperationInFlight) return;
        localStorage.removeItem(STORAGE_KEYS.PROMPT);
        localStorage.removeItem(STORAGE_KEYS.MODEL);
        localStorage.removeItem(STORAGE_KEYS.THINKING_MODE);
        localStorage.removeItem(STORAGE_KEYS.PROMPT_OVERRIDE_ENABLED);
        if (window.chatManager) {
            chatManager.removeProfileSetting(STORAGE_KEYS.LOCATION_ENABLED);
            chatManager.removeProfileSetting(STORAGE_KEYS.LOCATION_CONTEXT);
            chatManager.removeProfileSetting(STORAGE_KEYS.EXPERIENCE_STYLE);
            chatManager.removeProfileSetting(STORAGE_KEYS.RESPONSE_DETAIL);
        }
        syncBehaviorControls();
        const defaultPreference = window.AURA_CONFIG.defaultModelPreference || AUTO_MODEL_OPTION;
        localStorage.setItem(STORAGE_KEYS.MODEL, defaultPreference);
        modelSelectDropdown.innerHTML = `<option value="${AUTO_MODEL_OPTION}">Auto (GPT-OSS + MedGemma)</option>`;
        modelSelectDropdown.value = defaultPreference;
        syncThinkingModeControls('auto');
        if (locationAccessCheckbox) locationAccessCheckbox.checked = false;
        setLocationStatus('Location access is off.');
        refreshProfileControls();
        setProfileActionStatus('Settings were reset. Chats, memory, feedback, and Personal Intelligence state were kept.');
    }

    async function saveSettings() {
        if (responseInFlight || profileOperationInFlight || !window.chatManager) return;
        const selectedModel = modelSelectDropdown.value;
        const profileId = chatManager.getActiveProfileId();
        setProfileOperationInFlight(true);

        try {
            if (selectedModel) {
                localStorage.setItem(STORAGE_KEYS.MODEL, selectedModel);
            }

            applyBehaviorControls();
            setThinkingMode(thinkingModeDropdown?.value || composerThinkingMode?.value || 'auto');

            chatManager.setProfileSetting(
                STORAGE_KEYS.LOCATION_ENABLED,
                Boolean(locationAccessCheckbox?.checked)
            );
            if (!locationAccessCheckbox?.checked) {
                chatManager.removeProfileSetting(STORAGE_KEYS.LOCATION_CONTEXT);
            } else {
                await requestCurrentLocation({ silent: false });
            }

            if (profileId !== chatManager.getActiveProfileId()) {
                throw new Error('The active profile changed before settings were saved.');
            }
            chatManager.setPersonalIntelligenceEnabled(Boolean(personalIntelligenceCheckbox?.checked));
            refreshProfileControls();
            refreshFeedbackLearningStatus();

            closeSettingsModal();
        } catch (error) {
            console.error('Settings save failed:', error);
            setProfileActionStatus('Could not finish saving this profile’s settings.', { error: true });
        } finally {
            setProfileOperationInFlight(false);
        }
    }

    async function checkAgents() {
        if (responseInFlight || profileOperationInFlight) return;
        const requestChatId = chatManager.getActiveChatId();
        const pattern = chatManager.checkForWithdrawalPattern(requestChatId);
        if (!pattern) return;

        setResponseInFlight(true);
        showTypingIndicator();

        try {
            const message = await chatManager.triggerReEngagement(pattern, requestChatId);
            const artifact = await processToolTags(message, requestChatId);
            addAssistantArtifact(artifact, '', requestChatId);
            refreshUI();
        } catch (error) {
            if (!handleResponseInterruption(error)) {
                console.error('Follow-up response failed:', error);
                if (responseStatus) responseStatus.textContent = 'Could not finish this reply. Please try again.';
            }
        } finally {
            hideTypingIndicator();
            setResponseInFlight(false);
        }
    }

    function runBreathingExercise(button) {
        const container = button.closest('.breathing-exercise-container');
        if (!container || container.dataset.running === 'true') return;

        const pacer = container.querySelector('.breathing-pacer');
        const status = container.querySelector('.breathing-status');
        const phases = [
            { key: 'inhale', label: `Inhale for ${button.dataset.cycleInhale}s`, duration: Number(button.dataset.cycleInhale) || 4 },
            { key: 'hold', label: `Hold for ${button.dataset.cycleHold}s`, duration: Number(button.dataset.cycleHold) || 4 },
            { key: 'exhale', label: `Exhale for ${button.dataset.cycleExhale}s`, duration: Number(button.dataset.cycleExhale) || 6 }
        ];

        let phaseIndex = 0;
        let completedRounds = 0;

        container.dataset.running = 'true';
        button.disabled = true;
        button.textContent = 'Breathing...';

        const runPhase = () => {
            const phase = phases[phaseIndex];
            pacer.dataset.phase = phase.key;
            status.textContent = phase.label;

            container._breathingTimer = window.setTimeout(() => {
                phaseIndex = (phaseIndex + 1) % phases.length;
                if (phaseIndex === 0) completedRounds += 1;

                if (completedRounds >= 3) {
                    pacer.dataset.phase = 'idle';
                    status.textContent = 'Nice. Take a moment and notice how your body feels.';
                    container.dataset.running = 'false';
                    button.disabled = false;
                    button.textContent = 'Start Again';
                    return;
                }

                runPhase();
            }, phase.duration * 1000);
        };

        runPhase();
    }

    userInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            handleSendMessage();
        }
    });
    userInput.addEventListener('input', resizeComposer);
    sendButton.addEventListener('click', handleSendMessage);
    stopResponseButton?.addEventListener('click', () => {
        if (!responseInFlight) return;
        responseRuntime.cancelTurn();
        if (responseStatus) responseStatus.textContent = 'Stopping response…';
        syncResponseInFlightControls();
    });
    newChatButton.addEventListener('click', () => {
        if (responseInFlight || profileOperationInFlight) return;
        chatManager.createNewChat();
        refreshUI();
    });

    if (fileUploadButton) fileUploadButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) setAttachment(file);
    });

    chatListContainer.addEventListener('click', async (event) => {
        if (responseInFlight || profileOperationInFlight) return;
        const deleteButton = event.target.closest('.delete-chat-button');
        const chatTab = event.target.closest('[data-chat-id]');

        if (deleteButton) {
            if (confirm('Delete chat?')) {
                const chatId = deleteButton.dataset.chatId;
                const profileId = chatManager.getActiveProfileId();
                const promotedExampleIds = chatManager.getPromotedExampleIdsForChat(chatId);
                setProfileOperationInFlight(true);
                try {
                    await chatManager.waitForPendingVectorWrites(profileId);
                    await deleteRemoteProfileData(profileId, 'memory', chatId);
                    const examplesDeleted = await deletePersonalExamples(
                        promotedExampleIds,
                        { profileId }
                    );
                    if (!examplesDeleted) {
                        throw new Error('Personal examples for this chat were not deleted.');
                    }
                    if (
                        profileId !== chatManager.getActiveProfileId() ||
                        !chatManager.getChat(chatId)
                    ) {
                        throw new Error('The active profile or chat changed before deletion finished.');
                    }
                    chatManager.deleteChat(chatId);
                    refreshUI();
                } catch (error) {
                    console.error('Chat deletion failed:', error);
                    alert('Could not finish deleting this chat. Its local copy was retained; some remote memory may already be gone.');
                } finally {
                    setProfileOperationInFlight(false);
                }
            }
            return;
        }

        if (chatTab && chatTab.dataset.chatId !== chatManager.getActiveChatId()) {
            chatManager.setActiveChat(chatTab.dataset.chatId);
            refreshUI();
            checkAgents();
        }
    });
    chatListContainer.addEventListener('keydown', (event) => {
        if (responseInFlight || profileOperationInFlight) return;
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        const tabs = [...chatListContainer.querySelectorAll('[role="tab"]')];
        const currentIndex = tabs.indexOf(event.target.closest('[role="tab"]'));
        if (currentIndex === -1 || tabs.length < 2) return;

        event.preventDefault();
        const nextIndex = event.key === 'Home'
            ? 0
            : (event.key === 'End'
                ? tabs.length - 1
                : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length);
        const nextChatId = tabs[nextIndex].dataset.chatId;
        chatManager.setActiveChat(nextChatId);
        refreshUI();
        checkAgents();
        window.requestAnimationFrame(() => {
            chatListContainer.querySelector(`[role="tab"][data-chat-id="${nextChatId}"]`)?.focus();
        });
    });

    if (toolsButton) toolsButton.addEventListener('click', () => {
        renderToolsInModal(chatManager.getActiveChatTools());
        openToolsModal();
    });
    document.getElementById('closeToolsButton')?.addEventListener('click', closeToolsModal);

    if (insightsButton) insightsButton.addEventListener('click', openInsightsModal);
    document.getElementById('closeInsightsButton')?.addEventListener('click', closeInsightsModal);
    if (themeToggleButton) themeToggleButton.addEventListener('click', toggleTheme);
    if (settingsButton) settingsButton.addEventListener('click', openSettingsPanel);
    if (activeProfileButton) activeProfileButton.addEventListener('click', openSettingsPanel);
    if (profileSelect) {
        profileSelect.addEventListener('change', () => switchActiveProfile(profileSelect.value));
    }
    if (createProfileButton) createProfileButton.addEventListener('click', createLocalProfile);
    if (renameProfileButton) renameProfileButton.addEventListener('click', renameActiveProfile);
    if (deleteProfileButton) deleteProfileButton.addEventListener('click', deleteActiveProfile);
    if (cancelSettingsButton) cancelSettingsButton.addEventListener('click', closeSettingsModal);
    if (resetSettingsButton) resetSettingsButton.addEventListener('click', resetSettingsForm);
    if (saveSettingsButton) saveSettingsButton.addEventListener('click', saveSettings);
    if (exportDataButton) exportDataButton.addEventListener('click', exportAuraData);
    if (clearMemoryButton) clearMemoryButton.addEventListener('click', clearAuraMemory);
    if (clearFeedbackButton) clearFeedbackButton.addEventListener('click', clearFeedbackLearning);
    if (deleteAllDataButton) deleteAllDataButton.addEventListener('click', deleteAllAuraData);
    if (locationAccessCheckbox) locationAccessCheckbox.addEventListener('change', refreshLocationStatus);
    if (refreshLocationButton) refreshLocationButton.addEventListener('click', () => requestCurrentLocation({ silent: false }));
    if (personalIntelligenceCheckbox) {
        personalIntelligenceCheckbox.addEventListener(
            'change',
            () => refreshPersonalIntelligenceStatus({ preview: true })
        );
    }
    if (thinkingModeDropdown) thinkingModeDropdown.addEventListener('change', () => setThinkingMode(thinkingModeDropdown.value));
    if (composerThinkingMode) composerThinkingMode.addEventListener('change', () => setThinkingMode(composerThinkingMode.value));

    toolsModalContent.addEventListener('click', async (event) => {
        const target = event.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;

        if (action === 'log_mood') {
            chatManager.logMoodToTracker(target.dataset.mood);
            closeToolsModal();
            await triggerAIFollowUp({ type: 'mood_logged', mood: target.dataset.mood });
            return;
        }

        if (action === 'commit_affirmation') {
            target.textContent = 'Committed!';
            target.disabled = true;
            return;
        }

        if (action === 'save_thought_record') {
            const card = target.closest('.thought-record-card');
            const data = {};
            card.querySelectorAll('textarea').forEach((textarea) => {
                data[textarea.dataset.field] = textarea.value;
            });
            chatManager.updateThoughtRecord(target.dataset.toolId, data);
            target.textContent = 'Saved!';
            window.setTimeout(() => {
                target.textContent = 'Save Record';
            }, 1500);
            return;
        }

        if (action === 'start_breathing') {
            runBreathingExercise(target);
        }
    });

    toolsModalContent.addEventListener('change', async (event) => {
        if (event.target.type === 'checkbox') {
            const toolType = event.target.dataset.toolType;
            const config = getToolChecklistConfig(toolType);
            if (!config) return;

            const itemText = chatManager.completeAndRemoveChecklistItem(
                event.target.dataset.toolId,
                parseInt(event.target.dataset.itemIndex, 10),
                toolType,
                config.itemKey
            );

            if (itemText) {
                closeToolsModal();
                await triggerAIFollowUp({ type: config.followUpType, toolType, text: itemText });
            }
        }
    });

    document.body.addEventListener('click', async (event) => {
        const feedbackTarget = event.target.closest('.response-feedback [data-action]');
        if (feedbackTarget) {
            const root = feedbackTarget.closest('.response-feedback');
            const action = feedbackTarget.dataset.action;
            if (!root) return;

            if (action === 'toggle_feedback_details') {
                const panel = root.querySelector('.feedback-detail-panel');
                panel?.classList.toggle('hidden');
                if (panel && !panel.classList.contains('hidden')) {
                    panel.querySelector('[data-feedback-comment]')?.focus();
                }
                return;
            }
            if (action === 'rate_response') {
                await rateResponse(root, feedbackTarget.dataset.rating);
                return;
            }
            if (action === 'save_response_feedback') {
                await saveResponseFeedbackFromRoot(root);
                return;
            }
            if (action === 'retry_with_feedback') {
                await retryWithFeedback(root);
                return;
            }
            if (action === 'promote_personal_example') {
                await promotePersonalExample(root);
                return;
            }
            if (action === 'remove_personal_example') {
                await removePersonalExample(root);
                return;
            }
            if (action === 'remove_response_feedback') {
                await removeResponseFeedback(root);
                return;
            }
        }

        const toolOfferTarget = event.target.closest(
            '[data-action="create_tool_offer"], [data-action="dismiss_tool_offer"], [data-action="open_tools"]'
        );
        if (toolOfferTarget) {
            const action = toolOfferTarget.dataset.action;
            if (action === 'open_tools') {
                renderToolsInModal(chatManager.getActiveChatTools());
                openToolsModal();
                return;
            }

            const chatId = toolOfferTarget.dataset.chatId;
            const messageIndex = Number.parseInt(toolOfferTarget.dataset.messageIndex, 10);
            if (!chatId || !Number.isInteger(messageIndex)) return;

            if (action === 'dismiss_tool_offer') {
                chatManager.transitionToolOffer(chatId, messageIndex, 'dismiss');
                refreshUI();
                return;
            }

            const claimedOffer = chatManager.transitionToolOffer(chatId, messageIndex, 'create');
            if (!claimedOffer) return;
            refreshUI();
            addToolStatusMessage(claimedOffer.type);

            try {
                const toolData = await createToolByType(claimedOffer.type, claimedOffer.theme);
                if (!toolData) {
                    chatManager.transitionToolOffer(chatId, messageIndex, 'retry');
                    return;
                }

                chatManager.addOrUpdateToolInChat(chatId, claimedOffer.type, toolData);
                chatManager.transitionToolOffer(
                    chatId,
                    messageIndex,
                    'created',
                    toolData.id || null
                );
            } catch (error) {
                console.error('Tool offer creation failed:', error);
                chatManager.transitionToolOffer(chatId, messageIndex, 'retry');
            } finally {
                removeToolStatusMessages();
                refreshUI();
            }
            return;
        }

        const resendTarget = event.target.closest('[data-action="edit_resend_message"]');
        if (resendTarget) {
            queueMessageForEditAndResend(parseInt(resendTarget.dataset.messageIndex, 10));
            return;
        }

        const suggestionTarget = event.target.closest('[data-prompt-suggestion]');
        if (suggestionTarget) {
            userInput.value = suggestionTarget.dataset.promptSuggestion || '';
            resizeComposer();
            userInput.focus();
            userInput.setSelectionRange(userInput.value.length, userInput.value.length);
            return;
        }

        const experienceTarget = event.target.closest('[data-experience-style]');
        if (experienceTarget) {
            const selectedStyle = experienceTarget.dataset.experienceStyle || 'balanced';
            if (typeof window.applyExperienceStyle === 'function') {
                window.applyExperienceStyle(selectedStyle);
            }
            document.querySelectorAll('[data-experience-style]').forEach((chip) => {
                chip.classList.toggle('is-active', chip.dataset.experienceStyle === selectedStyle);
            });
            userInput.focus();
            return;
        }

        const target = event.target.closest('a.content-link');
        if (!target?.dataset.topic) return;

        event.preventDefault();
        const content = await fetchMarkdownContent(target.dataset.topic);
        if (content) showContentModal(target.dataset.topic.replace(/-/g, ' '), content);
    });

    normalizeStoredModel();
    syncThinkingModeControls();
    applyTheme(getStoredTheme());
    if (locationAccessCheckbox) locationAccessCheckbox.checked = isLocationSharingEnabled();
    refreshProfileControls();
    refreshLocationStatus();
    refreshPersonalIntelligenceStatus();
    refreshFeedbackLearningStatus();
    setupLiquidGlassInteractions();
    resizeComposer();
    if (chatMessagesSurface) chatMessagesSurface.addEventListener('scroll', syncChromeCompression, { passive: true });
    syncChromeCompression();
    refreshUI();
    checkAgents();
});
