// app.js
// This is the main entry point for the application. It connects all the pieces:
// UI elements, chat logic, and user event handling.

document.addEventListener('DOMContentLoaded', () => {
    // --- Element References ---
    // Get all the interactive elements from the HTML page.
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

    // A curated list of models for the user to choose from.
    const availableModels = [
        'gemma3:4b',
        'gemma3:4b-it-qat',
        'gemma3n:e4b-it-q4_K_M',
        'deepseek-r1:8b',
        'llama3:8b-instruct-q5_K_M',
        'llama3.2:3b',
        'qwen3:4b-q4_K_M',
        'deepseek-v3.1:671b-cloud',
        'gpt-oss:120b-cloud'
    ];

    // --- State Variables ---
    let isRecording = false;
    let recognition;
    let voices = [];
    const synth = window.speechSynthesis;
    let lastInputMode = 'text'; // 'text' or 'voice'
    let breathInterval;

    // --- Speech Synthesis (Text-to-Speech) Setup ---

    // Fetches and populates the dropdown with available system voices.
    function populateVoiceDropdown() {
        voices = synth.getVoices();
        voiceSelectDropdown.innerHTML = '';
        const systemVoice = getVoiceName(); // Get the currently saved voice
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

    // Speaks the AI's response text aloud.
    function speakResponse(text) {
        // A simple cleanup to remove characters that can't be spoken, like emojis.
        const cleanedText = text.replace(/[^\w\s.,?!'"-]/g, '').trim();

        if (!cleanedText) return; // Don't try to speak an empty string.

        const selectedVoiceName = getVoiceName();
        const utterance = new SpeechSynthesisUtterance(cleanedText);
        if (selectedVoiceName) {
            const selectedVoice = voices.find(voice => voice.name === selectedVoiceName);
            if (selectedVoice) { utterance.voice = selectedVoice; }
        }
        synth.speak(utterance);
    }

    // --- Speech Recognition (Speech-to-Text) Setup ---
    function setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            micButton.style.display = 'none'; // Hide mic if the browser doesn't support it.
            return;
        }
        recognition = new SpeechRecognition();
        recognition.interimResults = false;
        recognition.lang = 'en-US';
        recognition.onstart = () => { isRecording = true; setMicButtonState('listening'); };
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            userInput.value = transcript;
            handleSendMessage('voice'); // Automatically send the message after transcription.
        };
        recognition.onend = () => { isRecording = false; setMicButtonState('idle'); };
        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            isRecording = false;
            setMicButtonState('idle');
        };
    }
    setupSpeechRecognition();

    // --- Core Application Logic ---

    // Handles sending a message, whether from text input or voice.
    async function handleSendMessage(inputMode = 'text') {
        lastInputMode = inputMode;
        const message = userInput.value.trim();
        if (!message) return;

        addMessage('user', message);
        chatManager.addMessageToActiveChat('user', message);
        userInput.value = '';
        showTypingIndicator();

        // Let the agentic router decide what to do.
        const history = chatManager.getActiveChatHistory();
        const toolDecision = await decideAndExecuteTool(message, history);
        
        hideTypingIndicator();
        
        let followUp = null;
        switch (toolDecision.tool) {
            case 'checklist':
                chatManager.addOrUpdateToolInActiveChat('checklist', toolDecision.content);
                followUp = { type: 'persistent_tool_created', toolName: 'checklist' };
                break;
            case 'breathing_exercise':
                chatManager.addOrUpdateToolInActiveChat('breathing_exercise', toolDecision.content);
                followUp = { type: 'persistent_tool_created', toolName: 'breathing exercise' };
                break;
            case 'affirmation_card':
                chatManager.addOrUpdateToolInActiveChat('affirmation_card', toolDecision.content);
                followUp = { type: 'persistent_tool_created', toolName: 'affirmation card' };
                break;
            case 'add_to_checklist':
                chatManager.addItemToActiveChecklist(toolDecision.itemText);
                followUp = { type: 'item_added', text: toolDecision.itemText };
                break;
            case 'generate_more_items':
                if (toolDecision.newItems && toolDecision.newItems.length > 0) {
                    chatManager.addItemToActiveChecklist(toolDecision.newItems);
                    followUp = { type: 'more_items_added', count: toolDecision.newItems.length };
                }
                break;
            case 'mood_tracker':
                // Mood tracker is a special case that displays in chat, not in the toolbox.
                chatManager.addMessageToActiveChat('ai', toolDecision.content);
                addMessage('ai', toolDecision.content);
                break;
            case 'search':
                followUp = { type: 'search', results: toolDecision.results };
                break;
            case 'chat':
            default:
                // No tool action needed, just a conversational reply.
                break;
        }

        // If a tool was used (other than mood tracker), get a follow-up response from the AI.
        if (toolDecision.tool !== 'mood_tracker') {
             await triggerAIFollowUp(message, followUp);
        }

        refreshUI();
    }

    // Triggers a conversational response from the AI, providing context about any tool actions.
    async function triggerAIFollowUp(prompt, toolFollowUp) {
        showTypingIndicator();
        const response = await getOllamaResponse(prompt, toolFollowUp);
        hideTypingIndicator();
        addMessage('ai', response);
        // If the user's last input was voice, read the AI response aloud.
        if (lastInputMode === 'voice') {
            speakResponse(response);
        }
    }

    // A central function to update all parts of the UI based on the current state.
    function refreshUI() {
        const allChats = chatManager.state.chats;
        const activeChatId = chatManager.getActiveChatId();
        renderChatList(allChats, activeChatId);

        const history = chatManager.getActiveChatHistory();
        displayChat(history);

        const activeTools = chatManager.getActiveChatTools();
        const hasAnyTools = Object.values(activeTools).some(toolArray => toolArray.length > 0);
        toggleToolsButton(hasAnyTools);
    }

    // Populates the model selection dropdown in the settings.
    function populateModelDropdown() {
        modelSelectDropdown.innerHTML = '';
        const currentModel = getModelName();
        availableModels.forEach(model => {
            const option = document.createElement('option');
            option.textContent = model;
            option.value = model;
            if (model === currentModel) {
                option.selected = true;
            }
            modelSelectDropdown.appendChild(option);
        });
    }

    // --- Event Listeners ---
    // Sets up all the user interactions for the page.

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
    
    // Handles clicks on the chat list for switching or deleting chats.
    chatListContainer.addEventListener('click', (event) => {
        const deleteButton = event.target.closest('.delete-chat-button');
        const chatTab = event.target.closest('[data-chat-id]');

        if (deleteButton) {
            event.stopPropagation(); // Prevents the chat from being switched when deleting.
            if (confirm('Are you sure you want to delete this chat?')) {
                chatManager.deleteChat(deleteButton.getAttribute('data-chat-id'));
                refreshUI();
            }
        } else if (chatTab) {
            chatManager.setActiveChat(chatTab.getAttribute('data-chat-id'));
            refreshUI();
        }
    });
    
    // Handles opening the toolbox modal.
    toolsButton.addEventListener('click', () => {
        const tools = chatManager.getActiveChatTools();
        renderToolsInModal(tools);
        openToolsModal();
    });
    closeToolsButton.addEventListener('click', closeToolsModal);
    
    // Handles checking off a checklist item in the toolbox.
    toolsModalContent.addEventListener('change', async (event) => {
        const target = event.target;
        if (target.type === 'checkbox' && target.dataset.toolType === 'checklist') {
            const itemIndex = parseInt(target.dataset.itemIndex);
            const toolId = target.dataset.toolId; // Get the ID of the specific checklist.
            if (target.checked && toolId) {
                // Pass both the toolId and itemIndex to the manager.
                const itemText = chatManager.completeAndRemoveChecklistItem(toolId, itemIndex);
                renderToolsInModal(chatManager.getActiveChatTools()); // Re-render to show removal.
                if (itemText) {
                    closeToolsModal();
                    await triggerAIFollowUp(
                        `The user just completed a task.`, 
                        { type: 'checklist_item_completed', text: itemText }
                    );
                }
            }
        }
    });

    // A shared listener for tool interactions in both the chat and the toolbox.
    const toolInteractionListener = async (event) => {
        const target = event.target.closest('[data-action]');
        if (!target) return;

        const action = target.dataset.action;
        let followUp = null;

        switch (action) {
            case 'log_mood': {
                target.closest('.mood-tracker-container').querySelectorAll('button').forEach(btn => btn.disabled = true);
                target.style.transform = 'scale(1.2)';
                followUp = { type: 'mood_logged', mood: target.dataset.mood };
                break;
            }
            case 'commit_affirmation': {
                target.textContent = 'Committed!';
                target.disabled = true;
                followUp = { type: 'affirmation_committed', text: target.dataset.affirmationText };
                break;
            }
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
                        if (target.closest('#toolsModalContent')) {
                           closeToolsModal();
                        }
                        triggerAIFollowUp('', { type: 'breathing_complete' });
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

        if (followUp) {
            if (target.closest('#toolsModalContent')) {
                closeToolsModal();
            }
            await triggerAIFollowUp('', followUp);
        }
    };

    chatMessages.addEventListener('click', toolInteractionListener);
    toolsModalContent.addEventListener('click', toolInteractionListener);
    
    // Handles opening the settings modal and populating it with current settings.
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

    // Handles the new "Reset to Default" button.
    resetSettingsButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset the prompt to its default state? Any custom changes in this text box will be lost.')) {
            // Use our helper function from chat-logic.js to get the true default prompt.
            systemPromptTextarea.value = getDefaultSystemPrompt();
            // We also clear the saved value from storage. This is key! It means if the user
            // resets and then closes the modal without saving, the app will correctly
            // fall back to the default prompt on the next load.
            localStorage.removeItem(PROMPT_STORAGE_KEY);
        }
    });

    // --- Initial Application Load ---
    // This function gets everything started when the page first loads.
    refreshUI();
});