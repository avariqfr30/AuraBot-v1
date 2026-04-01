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
    const systemPromptTextarea = document.getElementById('systemPromptTextarea');
    const modelSelectDropdown = document.getElementById('modelSelectDropdown');
    const locationAccessCheckbox = document.getElementById('locationAccessCheckbox');
    const locationStatusText = document.getElementById('locationStatusText');
    const refreshLocationButton = document.getElementById('refreshLocationButton');
    const cancelSettingsButton = document.getElementById('cancelSettingsButton');
    const resetSettingsButton = document.getElementById('resetSettingsButton');
    const saveSettingsButton = document.getElementById('saveSettingsButton');
    const toolsModalContent = document.getElementById('toolsModalContent');
    const TOOL_TAG_REGEX = /<tool_create[^>]*type=["']([^"']+)["'][^>]*(?:theme=["']([^"']+)["'])?[^>]*\/?>/gi;
    const LOCATION_MAX_AGE_MS = 10 * 60 * 1000;

    let attachedFile = null;

    function setupLiquidGlassInteractions() {
        return;
    }

    window.setupLiquidGlassInteractions = setupLiquidGlassInteractions;

    function syncChromeCompression() {
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
        if (!storedModel || storedModel === 'llama3:8b') {
            localStorage.setItem(STORAGE_KEYS.MODEL, window.AURA_CONFIG.defaultModel);
        }
    }

    function isLocationSharingEnabled() {
        return localStorage.getItem(STORAGE_KEYS.LOCATION_ENABLED) === 'true';
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
        locationStatusText.textContent = message;
    }

    async function refreshLocationStatus() {
        if (!locationAccessCheckbox.checked) {
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
        if (!locationAccessCheckbox.checked) {
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
            if (response) {
                addMessage('ai', response);
                chatManager.addMessageToActiveChat('ai', response);
                refreshUI();
            }
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
        showTypingIndicator();

        try {
            const documentText = currentAttachment ? await readAttachedFile(currentAttachment) : null;
            await ensureRuntimeLocationFresh();
            const screenResult = await chatManager.preScreenMessage(message);

            if (screenResult === 'CRISIS') {
                const safeMessage = await chatManager.triggerSafetyIntervention(message);
                addMessage('ai', safeMessage);
                refreshUI();
                return;
            }

            const rawResponse = await getOllamaResponse(message, null, documentText);
            const cleanedResponse = await processToolTags(rawResponse);

            addMessage('ai', cleanedResponse || "I'm here. I just didn't manage to form a full reply that time.");
            chatManager.addMessageToActiveChat('ai', rawResponse || cleanedResponse || '');
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
        const storedModel = localStorage.getItem(STORAGE_KEYS.MODEL) || window.AURA_CONFIG.defaultModel;

        try {
            const data = await requestJson(`${window.AURA_CONFIG.ollamaBaseUrl}/tags`, { method: 'GET' });
            const models = (data.models || []).map((model) => model.name).filter(Boolean);
            const uniqueModels = [...new Set([storedModel, ...models])];

            modelSelectDropdown.innerHTML = uniqueModels
                .map((modelName) => `<option value="${modelName}">${modelName}</option>`)
                .join('');
        } catch (error) {
            console.error('Failed to load models:', error);
            modelSelectDropdown.innerHTML = `<option value="${storedModel}">${storedModel}</option>`;
        }

        modelSelectDropdown.value = storedModel;
    }

    async function openSettingsPanel() {
        systemPromptTextarea.value = localStorage.getItem(STORAGE_KEYS.PROMPT) || PROMPTS.DEFAULT_SYSTEM;
        locationAccessCheckbox.checked = isLocationSharingEnabled();
        await populateModelOptions();
        await refreshLocationStatus();
        openSettingsModal();
    }

    function resetSettingsForm() {
        localStorage.removeItem(STORAGE_KEYS.PROMPT);
        localStorage.removeItem(STORAGE_KEYS.MODEL);
        localStorage.removeItem(STORAGE_KEYS.LOCATION_ENABLED);
        localStorage.removeItem(STORAGE_KEYS.LOCATION_CONTEXT);
        systemPromptTextarea.value = PROMPTS.DEFAULT_SYSTEM;
        modelSelectDropdown.innerHTML = `<option value="${window.AURA_CONFIG.defaultModel}">${window.AURA_CONFIG.defaultModel}</option>`;
        modelSelectDropdown.value = window.AURA_CONFIG.defaultModel;
        locationAccessCheckbox.checked = false;
        setLocationStatus('Location access is off.');
    }

    async function saveSettings() {
        const promptValue = systemPromptTextarea.value.trim();
        const selectedModel = modelSelectDropdown.value;

        if (promptValue) {
            localStorage.setItem(STORAGE_KEYS.PROMPT, promptValue);
        } else {
            localStorage.removeItem(STORAGE_KEYS.PROMPT);
        }

        if (selectedModel) {
            localStorage.setItem(STORAGE_KEYS.MODEL, selectedModel);
        }

        localStorage.setItem(STORAGE_KEYS.LOCATION_ENABLED, String(locationAccessCheckbox.checked));
        if (!locationAccessCheckbox.checked) {
            localStorage.removeItem(STORAGE_KEYS.LOCATION_CONTEXT);
        } else {
            await requestCurrentLocation({ silent: false });
        }

        closeSettingsModal();
    }

    async function checkAgents() {
        const pattern = chatManager.checkForWithdrawalPattern();
        if (!pattern) return;

        showTypingIndicator();

        try {
            const message = await chatManager.triggerReEngagement(pattern);
            if (message) {
                addMessage('ai', message);
                refreshUI();
            }
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

    toolsButton.addEventListener('click', () => {
        renderToolsInModal(chatManager.getActiveChatTools());
        openToolsModal();
    });
    document.getElementById('closeToolsButton').addEventListener('click', closeToolsModal);

    if (insightsButton) insightsButton.addEventListener('click', openInsightsModal);
    document.getElementById('closeInsightsButton').addEventListener('click', closeInsightsModal);
    if (themeToggleButton) themeToggleButton.addEventListener('click', toggleTheme);
    if (settingsButton) settingsButton.addEventListener('click', openSettingsPanel);
    cancelSettingsButton.addEventListener('click', closeSettingsModal);
    resetSettingsButton.addEventListener('click', resetSettingsForm);
    saveSettingsButton.addEventListener('click', saveSettings);
    locationAccessCheckbox.addEventListener('change', refreshLocationStatus);
    refreshLocationButton.addEventListener('click', () => requestCurrentLocation({ silent: false }));

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
        if (event.target.type === 'checkbox' && event.target.dataset.toolType === 'checklist') {
            const itemText = chatManager.completeAndRemoveChecklistItem(
                event.target.dataset.toolId,
                parseInt(event.target.dataset.itemIndex, 10)
            );

            if (itemText) {
                closeToolsModal();
                await triggerAIFollowUp({ type: 'checklist_item_completed', text: itemText });
            }
        }
    });

    document.body.addEventListener('click', async (event) => {
        const resendTarget = event.target.closest('[data-action="edit_resend_message"]');
        if (resendTarget) {
            queueMessageForEditAndResend(parseInt(resendTarget.dataset.messageIndex, 10));
            return;
        }

        const target = event.target.closest('a.content-link');
        if (!target?.dataset.topic) return;

        event.preventDefault();
        const content = await fetchMarkdownContent(target.dataset.topic);
        if (content) showContentModal(target.dataset.topic.replace(/-/g, ' '), content);
    });

    normalizeStoredModel();
    applyTheme(getStoredTheme());
    locationAccessCheckbox.checked = isLocationSharingEnabled();
    refreshLocationStatus();
    setupLiquidGlassInteractions();
    chatMessagesSurface.addEventListener('scroll', syncChromeCompression, { passive: true });
    syncChromeCompression();
    refreshUI();
    checkAgents();
});
