document.addEventListener('DOMContentLoaded', () => {
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const newChatButton = document.getElementById('newChatButton');
    const chatListContainer = document.getElementById('chatList');
    const chatMessagesSurface = document.getElementById('chatMessages');
    const toolsButton = document.getElementById('toolsButton');
    const fileInput = document.getElementById('fileInput');
    const editMessageIndicator = document.getElementById('editMessageIndicator');
    const fileAttachmentIndicator = document.getElementById('fileAttachmentIndicator');
    const insightsButton = document.getElementById('insightsButton');
    const themeToggleButton = document.getElementById('themeToggleButton');
    const settingsButton = document.getElementById('settingsButton');
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
    const userMemoryCheckbox = document.getElementById('userMemoryCheckbox');
    const userMemoryStatusText = document.getElementById('userMemoryStatusText');
    const cancelSettingsButton = document.getElementById('cancelSettingsButton');
    const resetSettingsButton = document.getElementById('resetSettingsButton');
    const saveSettingsButton = document.getElementById('saveSettingsButton');
    const exportDataButton = document.getElementById('exportDataButton');
    const clearMemoryButton = document.getElementById('clearMemoryButton');
    const deleteAllDataButton = document.getElementById('deleteAllDataButton');
    const toolsModalContent = document.getElementById('toolsModalContent');
    const TOOL_TAG_REGEX = /<tool_create[^>]*type=["']([^"']+)["'][^>]*(?:theme=["']([^"']+)["'])?[^>]*\/?>/gi;
    const LOCATION_MAX_AGE_MS = 10 * 60 * 1000;
    const LEGACY_DEFAULT_MODELS = new Set(['llama3:8b']);
    const AUTO_MODEL_OPTION = 'auto';

    window.AURA_AVAILABLE_MODELS = [];

    let attachedFile = null;

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
        return localStorage.getItem(STORAGE_KEYS.LOCATION_ENABLED) === 'true';
    }

    function isUserMemorySharingEnabled() {
        return localStorage.getItem(STORAGE_KEYS.USER_MEMORY_ENABLED) === 'true';
    }

    function getStoredLocationContext() {
        return safeParseJson(localStorage.getItem(STORAGE_KEYS.LOCATION_CONTEXT), null);
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

    function refreshUserMemoryStatus() {
        if (!userMemoryStatusText) return;

        if (!userMemoryCheckbox?.checked) {
            userMemoryStatusText.textContent = 'Cross-chat memory is off.';
            return;
        }

        const store = window.chatManager ? window.chatManager.getUserMemoryStore() : null;
        const rememberedCount = (store?.behavioralFacts?.length || 0) + (store?.moodPatterns?.length || 0);
        userMemoryStatusText.textContent = rememberedCount > 0
            ? `Cross-chat memory is on. Aura is carrying ${rememberedCount} durable memory items across chats on this device.`
            : 'Cross-chat memory is on. Aura will start building durable memory across chats on this device.';
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
            : (localStorage.getItem(STORAGE_KEYS.EXPERIENCE_STYLE) || 'balanced');
        const activePreferences = window.chatManager
            ? window.chatManager.getActiveResponsePreferences()
            : DEFAULT_RESPONSE_PREFERENCES;

        if (auraStyleSelect) auraStyleSelect.value = activeStyle;
        if (responseDetailSelect) responseDetailSelect.value = activePreferences.detailLevel || DEFAULT_RESPONSE_PREFERENCES.detailLevel;
        if (advancedPromptToggle) advancedPromptToggle.checked = localStorage.getItem(STORAGE_KEYS.PROMPT_OVERRIDE_ENABLED) === 'true';
        if (advancedPromptTextarea) advancedPromptTextarea.value = localStorage.getItem(STORAGE_KEYS.PROMPT) || '';
    }

    function applyBehaviorControls() {
        const selectedStyle = auraStyleSelect?.value || 'balanced';
        const selectedDetail = responseDetailSelect?.value || DEFAULT_RESPONSE_PREFERENCES.detailLevel;

        if (typeof window.applyExperienceStyle === 'function') {
            window.applyExperienceStyle(selectedStyle);
        } else {
            localStorage.setItem(STORAGE_KEYS.EXPERIENCE_STYLE, selectedStyle);
        }

        if (window.chatManager) {
            chatManager.updateResponsePreferences({
                ...chatManager.getActiveResponsePreferences(),
                detailLevel: selectedDetail
            });
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
            localStorage.removeItem(STORAGE_KEYS.LOCATION_CONTEXT);
            await refreshLocationStatus();
            return null;
        }

        if (!navigator.geolocation) {
            setLocationStatus('Geolocation is not supported in this browser.');
            return null;
        }

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

        if (locationContext) {
            localStorage.setItem(STORAGE_KEYS.LOCATION_CONTEXT, JSON.stringify(locationContext));
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
        downloadJson(`aura-export-${new Date().toISOString().slice(0, 10)}.json`, chatManager.exportLocalData());
    }

    function clearAuraMemory() {
        if (!window.chatManager) return;
        if (!confirm('Forget cross-chat memory? Your chats will stay, but durable memory will be cleared.')) return;
        chatManager.clearUserMemoryStore();
        localStorage.setItem(STORAGE_KEYS.USER_MEMORY_ENABLED, 'false');
        if (userMemoryCheckbox) userMemoryCheckbox.checked = false;
        refreshUserMemoryStatus();
        refreshUI();
    }

    function deleteAllAuraData() {
        if (!window.chatManager) return;
        if (!confirm('Delete all Aura chats, tools, memory, and settings from this browser?')) return;
        chatManager.deleteAllLocalData();
        normalizeStoredModel();
        applyTheme(getStoredTheme());
        if (locationAccessCheckbox) locationAccessCheckbox.checked = isLocationSharingEnabled();
        if (userMemoryCheckbox) userMemoryCheckbox.checked = isUserMemorySharingEnabled();
        syncThinkingModeControls('balanced');
        refreshLocationStatus();
        refreshUserMemoryStatus();
        closeSettingsModal();
        refreshUI();
    }

    async function processToolTags(rawResponse) {
        let cleanedResponse = rawResponse || '';
        const matchedTags = [...cleanedResponse.matchAll(TOOL_TAG_REGEX)];

        if (matchedTags.length > 0) {
            matchedTags.forEach((match) => addToolStatusMessage(match[1]));
        }

        for (const match of matchedTags) {
            const toolData = await createToolByType(match[1], match[2] || '');
            if (toolData) chatManager.addOrUpdateToolInActiveChat(match[1], toolData);
            cleanedResponse = cleanedResponse.replace(match[0], '').trim();
        }

        removeToolStatusMessages();
        return cleanedResponse;
    }

    function refreshUI() {
        renderChatList(chatManager.state.chats, chatManager.getActiveChatId());
        displayChat(chatManager.getActiveChatHistory());
        const tools = chatManager.getActiveChatTools();
        toggleToolsButton(Object.values(tools).some((entries) => entries && entries.length > 0));
        setupLiquidGlassInteractions();
    }

    async function triggerAIFollowUp(followUp) {
        showTypingIndicator();

        try {
            const response = await getOllamaResponse('', followUp);
            const cleanedResponse = await processToolTags(response);

            if (cleanedResponse) {
                addMessage('ai', cleanedResponse);
                chatManager.addMessageToActiveChat('ai', cleanedResponse);
            }
            refreshUI();
        } finally {
            hideTypingIndicator();
        }
    }

    async function handleSendMessage() {
        const message = userInput.value.trim();
        if (!message && !attachedFile) return;

        const currentAttachment = attachedFile;
        const displayMessage = buildDisplayedUserMessage(message, currentAttachment);
        addMessage('user', displayMessage);
        chatManager.addMessageToActiveChat('user', message || displayMessage);

        userInput.value = '';
        clearResendDraft();
        resetAttachment();
        const manualMemoryCommand = parseManualMemoryCommand(message);
        if (manualMemoryCommand?.action === 'remember') {
            chatManager.rememberUserFact(manualMemoryCommand.value);
            const reply = 'I’ll remember that for future chats on this device. You can turn memory off or clear it anytime in Settings.';
            addMessage('ai', reply);
            chatManager.addMessageToActiveChat('ai', reply);
            refreshUI();
            return;
        }

        if (manualMemoryCommand?.action === 'forget_all') {
            chatManager.clearUserMemoryStore();
            localStorage.setItem(STORAGE_KEYS.USER_MEMORY_ENABLED, 'false');
            const reply = 'I forgot the cross-chat memory stored on this device. Your current chat is still here unless you delete it in Settings.';
            addMessage('ai', reply);
            chatManager.addMessageToActiveChat('ai', reply);
            refreshUserMemoryStatus();
            refreshUI();
            return;
        }

        showTypingIndicator(getProgressMessage(message, Boolean(currentAttachment)));

        try {
            const documentText = currentAttachment ? await readAttachedFile(currentAttachment) : null;
            updateTypingIndicator(getProgressMessage(message, false));
            await ensureRuntimeLocationFresh();
            const screenResult = await chatManager.preScreenMessage(message);

            if (screenResult === 'CRISIS') {
                updateTypingIndicator('Aura is focusing on immediate safety.');
                const safeMessage = await chatManager.triggerSafetyIntervention(message);
                addMessage('ai', safeMessage);
                refreshUI();
                return;
            }

            updateTypingIndicator(getProgressMessage(message, Boolean(documentText)));
            const rawResponse = await getOllamaResponse(message, null, documentText);
            updateTypingIndicator('Aura is shaping the reply.');
            const cleanedResponse = await processToolTags(rawResponse);

            addMessage('ai', cleanedResponse || "I'm here. I just didn't manage to form a full reply that time.");
            chatManager.addMessageToActiveChat('ai', cleanedResponse || "I'm here. I just didn't manage to form a full reply that time.");
            refreshUI();
        } catch (error) {
            console.error('Message handling failed:', error);
            addMessage('ai', "I hit a snag while working on that. Try again in a second and I'll take another pass.");
        } finally {
            hideTypingIndicator();
            removeToolStatusMessages();
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

    async function openSettingsPanel() {
        syncBehaviorControls();
        syncThinkingModeControls();
        if (locationAccessCheckbox) locationAccessCheckbox.checked = isLocationSharingEnabled();
        if (userMemoryCheckbox) userMemoryCheckbox.checked = isUserMemorySharingEnabled();
        openSettingsModal();
        populateModelOptions();
        refreshLocationStatus();
        refreshUserMemoryStatus();
    }

    function resetSettingsForm() {
        localStorage.removeItem(STORAGE_KEYS.PROMPT);
        localStorage.removeItem(STORAGE_KEYS.MODEL);
        localStorage.removeItem(STORAGE_KEYS.LOCATION_ENABLED);
        localStorage.removeItem(STORAGE_KEYS.LOCATION_CONTEXT);
        localStorage.removeItem(STORAGE_KEYS.USER_MEMORY_ENABLED);
        localStorage.removeItem(STORAGE_KEYS.EXPERIENCE_STYLE);
        localStorage.removeItem(STORAGE_KEYS.THINKING_MODE);
        localStorage.removeItem(STORAGE_KEYS.PROMPT_OVERRIDE_ENABLED);
        if (window.chatManager) {
            window.chatManager.clearUserMemoryStore();
            window.chatManager.updateResponsePreferences(DEFAULT_RESPONSE_PREFERENCES);
        }
        syncBehaviorControls();
        const defaultPreference = window.AURA_CONFIG.defaultModelPreference || AUTO_MODEL_OPTION;
        localStorage.setItem(STORAGE_KEYS.MODEL, defaultPreference);
        modelSelectDropdown.innerHTML = `<option value="${AUTO_MODEL_OPTION}">Auto (GPT-OSS + MedGemma)</option>`;
        modelSelectDropdown.value = defaultPreference;
        syncThinkingModeControls('auto');
        if (locationAccessCheckbox) locationAccessCheckbox.checked = false;
        if (userMemoryCheckbox) userMemoryCheckbox.checked = false;
        setLocationStatus('Location access is off.');
        refreshUserMemoryStatus();
    }

    async function saveSettings() {
        const selectedModel = modelSelectDropdown.value;

        if (selectedModel) {
            localStorage.setItem(STORAGE_KEYS.MODEL, selectedModel);
        }

        applyBehaviorControls();
        setThinkingMode(thinkingModeDropdown?.value || composerThinkingMode?.value || 'auto');

        localStorage.setItem(STORAGE_KEYS.LOCATION_ENABLED, String(Boolean(locationAccessCheckbox?.checked)));
        if (!locationAccessCheckbox?.checked) {
            localStorage.removeItem(STORAGE_KEYS.LOCATION_CONTEXT);
        } else {
            await requestCurrentLocation({ silent: false });
        }

        localStorage.setItem(STORAGE_KEYS.USER_MEMORY_ENABLED, String(Boolean(userMemoryCheckbox?.checked)));
        refreshUserMemoryStatus();

        closeSettingsModal();
    }

    async function checkAgents() {
        const pattern = chatManager.checkForWithdrawalPattern();
        if (!pattern) return;

        showTypingIndicator();

        try {
            const message = await chatManager.triggerReEngagement(pattern);
            const cleanedMessage = await processToolTags(message);
            if (cleanedMessage) {
                addMessage('ai', cleanedMessage);
                chatManager.addMessageToActiveChat('ai', cleanedMessage);
            }
            refreshUI();
        } finally {
            hideTypingIndicator();
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

    userInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') handleSendMessage();
    });
    sendButton.addEventListener('click', handleSendMessage);
    newChatButton.addEventListener('click', () => {
        chatManager.createNewChat();
        refreshUI();
    });

    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) setAttachment(file);
    });

    chatListContainer.addEventListener('click', (event) => {
        const deleteButton = event.target.closest('.delete-chat-button');
        const chatTab = event.target.closest('[data-chat-id]');

        if (deleteButton) {
            if (confirm('Delete chat?')) {
                chatManager.deleteChat(deleteButton.dataset.chatId);
                refreshUI();
            }
            return;
        }

        if (chatTab && chatTab.dataset.chatId !== chatManager.getActiveChatId()) {
            chatManager.setActiveChat(chatTab.dataset.chatId);
            refreshUI();
            checkAgents();
        }
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
    if (cancelSettingsButton) cancelSettingsButton.addEventListener('click', closeSettingsModal);
    if (resetSettingsButton) resetSettingsButton.addEventListener('click', resetSettingsForm);
    if (saveSettingsButton) saveSettingsButton.addEventListener('click', saveSettings);
    if (exportDataButton) exportDataButton.addEventListener('click', exportAuraData);
    if (clearMemoryButton) clearMemoryButton.addEventListener('click', clearAuraMemory);
    if (deleteAllDataButton) deleteAllDataButton.addEventListener('click', deleteAllAuraData);
    if (locationAccessCheckbox) locationAccessCheckbox.addEventListener('change', refreshLocationStatus);
    if (refreshLocationButton) refreshLocationButton.addEventListener('click', () => requestCurrentLocation({ silent: false }));
    if (userMemoryCheckbox) userMemoryCheckbox.addEventListener('change', refreshUserMemoryStatus);
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
        const resendTarget = event.target.closest('[data-action="edit_resend_message"]');
        if (resendTarget) {
            queueMessageForEditAndResend(parseInt(resendTarget.dataset.messageIndex, 10));
            return;
        }

        const suggestionTarget = event.target.closest('[data-prompt-suggestion]');
        if (suggestionTarget) {
            userInput.value = suggestionTarget.dataset.promptSuggestion || '';
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
    if (userMemoryCheckbox) userMemoryCheckbox.checked = isUserMemorySharingEnabled();
    refreshLocationStatus();
    refreshUserMemoryStatus();
    setupLiquidGlassInteractions();
    if (chatMessagesSurface) chatMessagesSurface.addEventListener('scroll', syncChromeCompression, { passive: true });
    syncChromeCompression();
    refreshUI();
    checkAgents();
});
