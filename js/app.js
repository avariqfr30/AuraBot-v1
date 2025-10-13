// app.js
// This is the main entry point for the application. It connects all the pieces:
// UI elements, chat logic, and user event handling.

document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const newChatButton = document.getElementById('newChatButton');
    const chatListContainer = document.getElementById('chatList');
    const micButton = document.getElementById('micButton');
    const settingsButton = document.getElementById('settingsButton');
    const cancelSettingsButton = document.getElementById('cancelSettingsButton');
    const saveSettingsButton = document.getElementById('saveSettingsButton');
    const resetSettingsButton = document.getElementById('resetSettingsButton');
    const systemPromptTextarea = document.getElementById('systemPromptTextarea');
    const voiceSelectDropdown = document.getElementById('voiceSelectDropdown');
    const modelSelectDropdown = document.getElementById('modelSelectDropdown');
    const toolsButton = document.getElementById('toolsButton');
    const closeToolsButton = document.getElementById('closeToolsButton');
    const toolsModalContent = document.getElementById('toolsModalContent');
    const chatMessages = document.getElementById('chatMessages');
    const headerTitle = document.querySelector('.flex-1 > header h1');
    const fileInput = document.getElementById('fileInput');
    const fileAttachmentIndicator = document.getElementById('fileAttachmentIndicator');

    const availableModels = [
        'gemma3:4b',
        'gemma3:4b-it-qat',
        'gemma3n:e4b-it-q4_K_M',
        'deepseek-r1:8b',
        'llama3:8b-instruct-q5_K_M',
        'llama3.2:3b',
        'qwen3:4b-q4_K_M',
        'deepseek-v3.1:671b-cloud',
        'gpt-oss:120b-cloud',
        'kimi-k2:1t-cloud'
    ];

    let isRecording = false;
    let recognition;
    let voices = [];
    const synth = window.speechSynthesis;
    let lastInputMode = 'text';
    let breathInterval;
    let attachedFile = null;

    function populateVoiceDropdown() {
        voices = synth.getVoices();
        voiceSelectDropdown.innerHTML = '';
        const systemVoice = getVoiceName();
        voices.forEach(voice => {
            const option = document.createElement('option');
            option.textContent = voice.name;
            option.value = voice.name;
            if (voice.name === systemVoice) { option.selected = true; }
            voiceSelectDropdown.appendChild(option);
        });
    }
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceDropdown;
    }

    function speakResponse(text) {
        const cleanedText = text.replace(/[^\w\s.,?!'"-]/g, '').trim();
        if (!cleanedText) return;
        const selectedVoiceName = getVoiceName();
        const utterance = new SpeechSynthesisUttersance(cleanedText);
        if (selectedVoiceName) {
            const selectedVoice = voices.find(voice => voice.name === selectedVoiceName);
            if (selectedVoice) { utterance.voice = selectedVoice; }
        }
        synth.speak(utterance);
    }

    function setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            micButton.style.display = 'none';
            return;
        }
        recognition = new SpeechRecognition();
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.onstart = () => { isRecording = true; setMicButtonState('listening'); };
        recognition.onresult = (event) => {
            userInput.value = event.results[0][0].transcript;
            handleSendMessage('voice');
        };
        recognition.onend = () => { isRecording = false; setMicButtonState('idle'); };
        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            isRecording = false;
            setMicButtonState('idle');
        };
    }
    
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            if (!file.type.startsWith('text/') && !file.name.endsWith('.md')) {
                console.warn("Attempted to upload a non-text file. This feature currently supports .txt and .md files.");
                addMessage('ai', "Sorry, that file type is not supported. Please upload a plain text file (.txt, .md).");
                return resolve(null);
            }
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    function showFileAttachment(file) {
        fileAttachmentIndicator.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
            <span>${file.name}</span>
            <button id="removeAttachedFile" class="ml-3 text-gray-500 hover:text-white">&times;</button>
        `;
        fileAttachmentIndicator.classList.remove('hidden');
        document.getElementById('removeAttachedFile').addEventListener('click', () => {
            attachedFile = null;
            fileInput.value = '';
            fileAttachmentIndicator.classList.add('hidden');
        });
    }

    async function handleSendMessage(inputMode = 'text') {
        lastInputMode = inputMode;
        const message = userInput.value.trim();
        if (!message && !attachedFile) return;

        let documentText = null;
        if (attachedFile) {
            try {
                documentText = await readFileAsText(attachedFile);
                if (documentText === null) { 
                    attachedFile = null;
                    fileInput.value = '';
                    fileAttachmentIndicator.classList.add('hidden');
                    return; 
                }
            } catch (error) {
                console.error("Error reading file:", error);
                addMessage('ai', "Sorry, I couldn't read the attached file.");
                return;
            }
        }
        
        const displayMessage = attachedFile ? `[Attached: ${attachedFile.name}]\n\n${message}` : message;
        
        addMessage('user', displayMessage);
        chatManager.addMessageToActiveChat('user', message);
        userInput.value = '';
        
        if (attachedFile) {
            attachedFile = null;
            fileInput.value = '';
            fileAttachmentIndicator.classList.add('hidden');
        }

        showTypingIndicator();

        const rawResponse = await getOllamaResponse(message, null, documentText);
        
        const toolTagRegex = /<tool_create\s+type="([^"]+)"(?:\s+theme="([^"]+)")?\s*\/>/g;
        let cleanedResponse = rawResponse;
        const matchedTags = [...rawResponse.matchAll(toolTagRegex)];

        hideTypingIndicator();

        if (matchedTags.length > 0) {
            const uniqueToolTypes = new Set(matchedTags.map(match => match[1]));
            uniqueToolTypes.forEach(toolType => addToolStatusMessage(toolType));
        }

        for (const match of matchedTags) {
            const toolType = match[1];
            const toolTheme = match[2] || '';
            const toolData = await createToolByType(toolType, toolTheme);
            if (toolData) chatManager.addOrUpdateToolInActiveChat(toolType, toolData);
            cleanedResponse = cleanedResponse.replace(match[0], '').trim();
        }

        removeToolStatusMessages();
        addMessage('ai', cleanedResponse);
        chatManager.addMessageToActiveChat('ai', cleanedResponse);
        if (lastInputMode === 'voice') speakResponse(cleanedResponse);
        refreshUI();
    }
    
    async function triggerAIFollowUp(followUp) {
        showTypingIndicator();
        const response = await getOllamaResponse('', followUp);
        hideTypingIndicator();
        addMessage('ai', response);
        chatManager.addMessageToActiveChat('ai', response);
        if (lastInputMode === 'voice') speakResponse(response);
        refreshUI();
    }

    function refreshUI() {
        const allChats = chatManager.state.chats;
        const activeChatId = chatManager.getActiveChatId();
        renderChatList(allChats, activeChatId);
        const history = chatManager.getActiveChatHistory();
        displayChat(history);
        const activeTools = chatManager.getActiveChatTools();
        const hasAnyTools = Object.values(activeTools).some(toolArray => toolArray && toolArray.length > 0);
        toggleToolsButton(hasAnyTools);
    }

    function populateModelDropdown() {
        modelSelectDropdown.innerHTML = '';
        const currentModel = getModelName();
        availableModels.forEach(model => {
            const option = document.createElement('option');
            option.textContent = model;
            option.value = model;
            if (model === currentModel) option.selected = true;
            modelSelectDropdown.appendChild(option);
        });
    }

    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage('text');
        }
    });
    sendButton.addEventListener('click', () => handleSendMessage('text'));
    micButton.addEventListener('click', () => {
        if (isRecording) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });
    newChatButton.addEventListener('click', () => {
        chatManager.createNewChat();
        refreshUI();
    });
    
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            attachedFile = file;
            showFileAttachment(file);
        }
    });

    chatListContainer.addEventListener('click', (event) => {
        const deleteButton = event.target.closest('.delete-chat-button');
        const chatTab = event.target.closest('[data-chat-id]');
        if (deleteButton) {
            event.stopPropagation();
            if (confirm('Are you sure you want to delete this chat?')) {
                chatManager.deleteChat(deleteButton.getAttribute('data-chat-id'));
                refreshUI();
            }
        } else if (chatTab) {
            chatManager.setActiveChat(chatTab.getAttribute('data-chat-id'));
            refreshUI();
        }
    });
    
    toolsButton.addEventListener('click', () => {
        renderToolsInModal(chatManager.getActiveChatTools());
        openToolsModal();
    });
    closeToolsButton.addEventListener('click', closeToolsModal);
    
    toolsModalContent.addEventListener('change', async (event) => {
        const target = event.target;
        if (target.type === 'checkbox' && target.dataset.toolType === 'checklist') {
            const itemIndex = parseInt(target.dataset.itemIndex);
            const toolId = target.dataset.toolId;
            if (target.checked && toolId) {
                const itemText = chatManager.completeAndRemoveChecklistItem(toolId, itemIndex);
                renderToolsInModal(chatManager.getActiveChatTools());
                if (itemText) {
                    closeToolsModal();
                    await triggerAIFollowUp({ type: 'checklist_item_completed', text: itemText });
                }
            }
        }
    });

    const toolInteractionListener = async (event) => {
        const target = event.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        switch (action) {
            case 'log_mood': {
                const mood = target.dataset.mood;
                chatManager.logMoodToTracker(mood);
                renderToolsInModal(chatManager.getActiveChatTools());
                closeToolsModal();
                await triggerAIFollowUp({ type: 'mood_logged', mood: mood });
                break;
            }
            case 'commit_affirmation':
                target.textContent = 'Committed!';
                target.disabled = true;
                break;
            case 'start_breathing': {
                const container = target.closest('.breathing-exercise-container');
                if (!container) return;
                const pacer = container.querySelector('.breathing-pacer');
                const status = container.querySelector('.breathing-status');
                target.disabled = true;
                if (breathInterval) clearInterval(breathInterval);
                const cycle = {
                    inhale: parseInt(target.dataset.cycleInhale),
                    hold: parseInt(target.dataset.cycleHold),
                    exhale: parseInt(target.dataset.cycleExhale),
                };
                const totalCycleTime = (cycle.inhale + cycle.hold + cycle.exhale) * 1000;
                let loops = 3;
                const doBreathCycle = () => {
                    if (loops <= 0) {
                        clearInterval(breathInterval);
                        status.textContent = 'Complete!';
                        target.disabled = false;
                        closeToolsModal();
                        triggerAIFollowUp({ type: 'breathing_complete' });
                        return;
                    }
                    status.textContent = 'Breathe In...';
                    pacer.className = 'breathing-pacer inhale';
                    setTimeout(() => {
                        status.textContent = 'Hold...';
                        pacer.className = 'breathing-pacer hold';
                        setTimeout(() => {
                            status.textContent = 'Breathe Out...';
                            pacer.className = 'breathing-pacer exhale';
                            loops--;
                        }, cycle.hold * 1000);
                    }, cycle.inhale * 1000);
                };
                doBreathCycle();
                breathInterval = setInterval(doBreathCycle, totalCycleTime);
                break;
            }
        }
    };

    toolsModalContent.addEventListener('click', toolInteractionListener);
    
    settingsButton.addEventListener('click', () => {
        systemPromptTextarea.value = getSystemPrompt();
        populateVoiceDropdown();
        populateModelDropdown();
        openSettingsModal();
    });

    cancelSettingsButton.addEventListener('click', closeSettingsModal);

    saveSettingsButton.addEventListener('click', () => {
        saveSystemPrompt(systemPromptTextarea.value);
        saveVoiceName(voiceSelectDropdown.value);
        saveModelName(modelSelectDropdown.value);
        closeSettingsModal();
    });

    resetSettingsButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset the prompt to its default state? Any custom changes in this text box will be lost.')) {
            systemPromptTextarea.value = getDefaultSystemPrompt();
            localStorage.removeItem(PROMPT_STORAGE_KEY);
        }
    });

    if (chatMessages && headerTitle) {
        chatMessages.addEventListener('scroll', () => {
            headerTitle.classList.toggle('is-scrolled', chatMessages.scrollTop > 50);
        });
    }

    setupSpeechRecognition();
    refreshUI();
});