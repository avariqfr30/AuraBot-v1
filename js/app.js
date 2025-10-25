// app.js
// This is the "glue" file. It connects our UI elements (from ui.js)
// to our brain (from chat-logic.js). It handles all user event
// listeners like button clicks and text input.

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

    // List of models you might have available
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

    // --- State Variables ---
    let isRecording = false;
    let recognition;
    let voices = [];
    const synth = window.speechSynthesis;
    let lastInputMode = 'text'; // 'text' or 'voice'
    let breathInterval; // To control the breathing pacer
    let attachedFile = null; // Holds the file for a single message

    // --- Voice & Speech Functions ---

    function populateVoiceDropdown() {
        voices = synth.getVoices();
        voiceSelectDropdown.innerHTML = '';
        const systemVoice = getVoiceName(); // from chat-logic.js
        voices.forEach(voice => {
            const option = document.createElement('option');
            option.textContent = voice.name;
            option.value = voice.name;
            if (voice.name === systemVoice) { option.selected = true; }
            voiceSelectDropdown.appendChild(option);
        });
    }
    
    // Fires when browser has loaded all available voices
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceDropdown;
    }

    function speakResponse(text) {
        // Clean the text of any markdown or tags the synth can't read
        const cleanedText = text.replace(/[^\w\s.,?!'"-]/g, '').trim();
        if (!cleanedText) return;
        
        const selectedVoiceName = getVoiceName(); // from chat-logic.js
        const utterance = new SpeechSynthesisUtterance(cleanedText);
        
        if (selectedVoiceName) {
            const selectedVoice = voices.find(voice => voice.name === selectedVoiceName);
            if (selectedVoice) { utterance.voice = selectedVoice; }
        }
        synth.speak(utterance);
    }

    function setupSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("Speech Recognition not supported by this browser.");
            micButton.style.display = 'none'; // Hide the button if it won't work
            return;
        }
        
        recognition = new SpeechRecognition();
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            isRecording = true;
            setMicButtonState('listening'); // from ui.js
        };

        recognition.onresult = (event) => {
            // When we get a final result, auto-send the message
            userInput.value = event.results[0][0].transcript;
            handleSendMessage('voice');
        };

        recognition.onend = () => {
            isRecording = false;
            setMicButtonState('idle'); // from ui.js
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error', event.error);
            isRecording = false;
            setMicButtonState('idle'); // from ui.js
        };
    }
    
    // --- File Handling Functions ---
    
    function readFileAsText(file) {
        return new Promise((resolve, reject) => {
            // Only allow text-based files for now
            if (!file.type.startsWith('text/') && !file.name.endsWith('.md')) {
                console.warn("Unsupported file type. Supports .txt and .md.");
                addMessage('ai', "Sorry, that file type is not supported. Please upload a plain text file (.txt, .md)."); // from ui.js
                return resolve(null); // Resolve with null to signal a soft failure
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
        
        // Add a listener to the new 'x' button to remove the file
        document.getElementById('removeAttachedFile').addEventListener('click', () => {
            attachedFile = null;
            fileInput.value = ''; // Clear the file input's memory
            fileAttachmentIndicator.classList.add('hidden');
        });
    }

    // --- Core Chat Function ---

    /**
     * This is the main function that handles sending a message.
     * It checks for agents, reads files, and gets the AI response.
     */
    async function handleSendMessage(inputMode = 'text') {
        lastInputMode = inputMode;
        const message = userInput.value.trim();
        
        // Don't send an empty message unless a file is attached
        if (!message && !attachedFile) return;

        // --- Crisis Intervention Agent (Hook) ---
        // Pre-screen the message *before* it's sent.
        // This 'preScreenMessage' function is the "watchdog".
        try {
            const screenResult = await chatManager.preScreenMessage(message); // from chat-logic.js
            
            if (screenResult === 'CRISIS') {
                console.warn("Crisis pattern detected by LLM Watchdog. Intervening.");
                userInput.value = ''; // Clear the crisis input
                
                // This call takes over, generates tools, and gets a safe response
                const safeMessage = await chatManager.triggerSafetyIntervention(message); // from chat-logic.js
                
                // Now update the UI with the intervention
                addMessage('ai', safeMessage); // from ui.js
                refreshUI(); // Update chat list, show new tools on button, etc.
                openToolsModal(); // Force the modal open to show the safety tools
                
                return; // IMPORTANT: Stop normal message processing
            }
            // If result is 'OK', we just continue to the normal flow.
            
        } catch (e) {
            // If the crisis check itself fails, we must not send the message.
            // Log the error and stop.
            console.error("Critical error during crisis pre-screen:", e);
            addMessage('ai', "I'm sorry, an error occurred while processing your message."); // from ui.js
            return;
        }
        // --- End Crisis Intervention ---

        // --- Reflective Agent (Hook) ---
        // Check if the user is asking for a review
        if (message.toLowerCase().startsWith("aura, review")) {
            console.log("Reflective agent triggered.");
            addMessage('user', message);
            chatManager.addMessageToActiveChat('user', message); // from chat-logic.js
            userInput.value = '';
            
            showTypingIndicator(); // from ui.js
            try {
                const summaryMessage = await runReflectiveReview(); // from chat-logic.js
                hideTypingIndicator(); // from ui.js
                addMessage('ai', summaryMessage); // from ui.js
            } catch (e) {
                console.error("Error during reflective review:", e);
                hideTypingIndicator(); // from ui.js
                addMessage('ai', "I'm sorry, I had trouble summarizing your progress."); // from ui.js
            }
            
            refreshUI(); // Update UI with any new tools the agent made
            return; // IMPORTANT: Stop normal message processing
        }
        // --- End Reflective Agent ---

        // --- Normal Message Flow ---
        
        let documentText = null;
        if (attachedFile) {
            try {
                documentText = await readFileAsText(attachedFile);
                if (documentText === null) { 
                    // File was invalid, stop processing
                    attachedFile = null;
                    fileInput.value = '';
                    fileAttachmentIndicator.classList.add('hidden');
                    return; 
                }
            } catch (error) {
                console.error("Error reading file:", error);
                addMessage('ai', "Sorry, I couldn't read the attached file."); // from ui.js
                return;
            }
        }
        
        // Show the user's message in the chat
        const displayMessage = attachedFile ? `[Attached: ${attachedFile.name}]\n\n${message}` : message;
        addMessage('user', displayMessage); // from ui.js
        chatManager.addMessageToActiveChat('user', message); // from chat-logic.js
        userInput.value = '';
        
        // Clean up the file attachment UI
        if (attachedFile) {
            attachedFile = null;
            fileInput.value = '';
            fileAttachmentIndicator.classList.add('hidden');
        }

        showTypingIndicator(); // from ui.js

        // Get the AI's response
        const rawResponse = await getOllamaResponse(message, null, documentText); // from chat-logic.js
        
        // Check the response for any <tool_create> tags
        const toolTagRegex = /<tool_create\s+type="([^"]+)"(?:\s+theme="([^"]+)")?\s*\/>/g;
        let cleanedResponse = rawResponse;
        const matchedTags = [...rawResponse.matchAll(toolTagRegex)];

        hideTypingIndicator(); // from ui.js

        // If we found tools, show a status message while we create them
        if (matchedTags.length > 0) {
            const uniqueToolTypes = new Set(matchedTags.map(match => match[1]));
            uniqueToolTypes.forEach(toolType => addToolStatusMessage(toolType)); // from ui.js
        }

        // Process each tool tag
        for (const match of matchedTags) {
            const toolType = match[1];
            const toolTheme = match[2] || '';
            const toolData = await createToolByType(toolType, toolTheme); // from chat-logic.js
            if (toolData) {
                chatManager.addOrUpdateToolInActiveChat(toolType, toolData); // from chat-logic.js
            }
            // Remove the tag from the response so the user doesn't see it
            cleanedResponse = cleanedResponse.replace(match[0], '').trim();
        }

        removeToolStatusMessages(); // from ui.js
        addMessage('ai', cleanedResponse); // from ui.js
        chatManager.addMessageToActiveChat('ai', cleanedResponse); // from chat-logic.js
        
        // Speak the response if the user used voice input
        if (lastInputMode === 'voice') {
            speakResponse(cleanedResponse);
        }
        
        refreshUI();
    }
    
    /**
     * Called after a user interacts with a tool (e.g., logs mood).
     * This function asks the AI for a *contextual follow-up*.
     */
    async function triggerAIFollowUp(followUp) {
        showTypingIndicator(); // from ui.js
        const response = await getOllamaResponse('', followUp); // from chat-logic.js
        hideTypingIndicator(); // from ui.js
        
        addMessage('ai', response); // from ui.js
        chatManager.addMessageToActiveChat('ai', response); // from chat-logic.js
        
        if (lastInputMode === 'voice') {
            speakResponse(response);
        }
        refreshUI();
    }

    /**
     * A central function to refresh all UI components that depend on state.
     */
    function refreshUI() {
        const allChats = chatManager.state.chats;
        const activeChatId = chatManager.getActiveChatId();
        renderChatList(allChats, activeChatId); // from ui.js
        
        const history = chatManager.getActiveChatHistory();
        displayChat(history); // from ui.js
        
        const activeTools = chatManager.getActiveChatTools();
        const hasAnyTools = Object.values(activeTools).some(toolArray => toolArray && toolArray.length > 0);
        toggleToolsButton(hasAnyTools); // from ui.js
    }
    
    /**
     * --- Agent Runner ---
     * This function runs when a chat is loaded to check for agent triggers.
     */
    async function checkAndRunAgents() {
        // --- Re-Engagement Agent Check ---
        try {
            const withdrawalPattern = chatManager.checkForWithdrawalPattern(); // from chat-logic.js
            if (withdrawalPattern) {
                console.log("Withdrawal pattern detected. Engaging...");
                showTypingIndicator(); // from ui.js
                
                const message = await chatManager.triggerReEngagement(withdrawalPattern); // from chat-logic.js
                
                hideTypingIndicator(); // from ui.js
                if (message) {
                    addMessage('ai', message); // from ui.js
                    refreshUI(); // Re-render to show the new tool
                }
            }
        } catch (e) {
            console.error("Error during re-engagement check:", e);
        }
        
        // --- Cognitive Pattern Agent Check ---
        try {
            const patternData = chatManager.checkForCognitivePattern(); // from chat-logic.js
            if (patternData) {
                console.log("Cognitive data found. Analyzing for patterns...");
                showTypingIndicator(); // from ui.js
                
                const message = await chatManager.triggerCognitiveAnalysis(patternData); // from chat-logic.js
                
                hideTypingIndicator(); // from ui.js
                if (message) {
                    // This message is the AI's insight
                    addMessage('ai', message); // from ui.js
                    refreshUI(); // Re-render to show the new tool
                }
            }
        } catch (e) {
            console.error("Error during cognitive analysis:", e);
        }
    }
    
    /**
     * Fills the model dropdown in settings with our list.
     */
    function populateModelDropdown() {
        modelSelectDropdown.innerHTML = '';
        const currentModel = getModelName(); // from chat-logic.js
        availableModels.forEach(model => {
            const option = document.createElement('option');
            option.textContent = model;
            option.value = model;
            if (model === currentModel) option.selected = true;
            modelSelectDropdown.appendChild(option);
        });
    }

    // --- Event Listeners ---

    // Send message on Enter key (but not Shift+Enter)
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault(); // Stop newline from being added
            handleSendMessage('text');
        }
    });

    // Send message on button click
    sendButton.addEventListener('click', () => handleSendMessage('text'));

    // Toggle voice recording
    micButton.addEventListener('click', () => {
        if (isRecording) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });

    // Start a new chat
    newChatButton.addEventListener('click', () => {
        chatManager.createNewChat();
        refreshUI();
        // New chats don't need agents run on them
    });
    
    // Listen for a file to be selected
    fileInput.addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            attachedFile = file;
            showFileAttachment(file); // from ui.js
        }
    });

    // Handle clicks on the chat list (for switching or deleting chats)
    chatListContainer.addEventListener('click', (event) => {
        const deleteButton = event.target.closest('.delete-chat-button');
        const chatTab = event.target.closest('[data-chat-id]');
        
        if (deleteButton) {
            // User clicked the 'x' button
            event.stopPropagation(); // Stop the chatTab click from firing
            if (confirm('Are you sure you want to delete this chat?')) {
                chatManager.deleteChat(deleteButton.getAttribute('data-chat-id'));
                refreshUI();
                checkAndRunAgents(); // Check agents on the *new* active chat
            }
        } else if (chatTab) {
            // User clicked to switch to a different chat
            chatManager.setActiveChat(chatTab.getAttribute('data-chat-id'));
            refreshUI();
            checkAndRunAgents(); // Check agents on the switched-to chat
        }
    });
    
    // Open the tools modal
    toolsButton.addEventListener('click', () => {
        renderToolsInModal(chatManager.getActiveChatTools()); // from ui.js
        openToolsModal(); // from ui.js
    });
    closeToolsButton.addEventListener('click', closeToolsModal); // from ui.js
    
    // --- Tool Interaction Listeners ---

    // Listen for checkbox changes *inside* the tools modal
    toolsModalContent.addEventListener('change', async (event) => {
        const target = event.target;
        // Handle completing a checklist item
        if (target.type === 'checkbox' && target.dataset.toolType === 'checklist') {
            const itemIndex = parseInt(target.dataset.itemIndex);
            const toolId = target.dataset.toolId;
            
            if (target.checked && toolId) {
                // This function removes the item and returns its text
                const itemText = chatManager.completeAndRemoveChecklistItem(toolId, itemIndex);
                
                // Re-render the modal to show the item is gone
                renderToolsInModal(chatManager.getActiveChatTools()); // from ui.js
                
                if (itemText) {
                    // If the item was successfully removed, close the modal and trigger a follow-up
                    closeToolsModal(); // from ui.js
                    await triggerAIFollowUp({ type: 'checklist_item_completed', text: itemText });
                }
            }
        }
    });

    // Listen for button clicks *inside* the tools modal
    const toolInteractionListener = async (event) => {
        const target = event.target.closest('[data-action]');
        if (!target) return; // Clicked on empty space

        const action = target.dataset.action;
        switch (action) {
            // --- Log Mood ---
            case 'log_mood': {
                const mood = target.dataset.mood;
                
                // This function now *also* sets the heightened awareness flag
                chatManager.logMoodToTracker(mood); // from chat-logic.js
                
                // The intervention logic is no longer here.
                // We just proceed with the normal follow-up.
                // The "watchdog" is now armed for the *next* text message.
                
                renderToolsInModal(chatManager.getActiveChatTools()); // from ui.js
                closeToolsModal(); // from ui.js
                await triggerAIFollowUp({ type: 'mood_logged', mood: mood });
                break;
            }
            
            // --- Commit Affirmation ---
            case 'commit_affirmation':
                target.textContent = 'Committed!';
                target.disabled = true;
                // No AI follow-up for this one
                break;

            // --- Start Breathing Exercise ---
            case 'start_breathing': {
                const container = target.closest('.breathing-exercise-container');
                if (!container) return;
                
                const pacer = container.querySelector('.breathing-pacer');
                const status = container.querySelector('.breathing-status');
                target.disabled = true; // Disable start button
                
                // Clear any previous breathing exercise
                if (breathInterval) clearInterval(breathInterval);

                const cycle = {
                    inhale: parseInt(target.dataset.cycleInhale),
                    hold: parseInt(target.dataset.cycleHold),
                    exhale: parseInt(target.dataset.cycleExhale),
                };
                const totalCycleTime = (cycle.inhale + cycle.hold + cycle.exhale) * 1000;
                let loops = 3; // Do the cycle 3 times

                const doBreathCycle = () => {
                    if (loops <= 0) {
                        // We're done
                        clearInterval(breathInterval);
                        status.textContent = 'Complete!';
                        target.disabled = false; // Re-enable start button
                        closeToolsModal(); // from ui.js
                        // Trigger a follow-up
                        triggerAIFollowUp({ type: 'breathing_complete' });
                        return;
                    }

                    // --- Start one cycle ---
                    status.textContent = 'Breathe In...';
                    pacer.className = 'breathing-pacer inhale'; // from ui.js
                    
                    setTimeout(() => {
                        status.textContent = 'Hold...';
                        pacer.className = 'breathing-pacer hold'; // from ui.js
                        
                        setTimeout(() => {
                            status.textContent = 'Breathe Out...';
                            pacer.className = 'breathing-pacer exhale'; // from ui.js
                            loops--;
                        }, cycle.hold * 1000);
                    }, cycle.inhale * 1000);
                };
                
                doBreathCycle(); // Start the first cycle
                // Set the interval for all subsequent cycles
                breathInterval = setInterval(doBreathCycle, totalCycleTime);
                break;
            }
        }
    };

    toolsModalContent.addEventListener('click', toolInteractionListener);
    
    // --- Settings Modal Listeners ---
    
    settingsButton.addEventListener('click', () => {
        systemPromptTextarea.value = getSystemPrompt(); // from chat-logic.js
        populateVoiceDropdown();
        populateModelDropdown();
        openSettingsModal(); // from ui.js
    });

    cancelSettingsButton.addEventListener('click', closeSettingsModal); // from ui.js

    saveSettingsButton.addEventListener('click', () => {
        saveSystemPrompt(systemPromptTextarea.value); // from chat-logic.js
        saveVoiceName(voiceSelectDropdown.value); // from chat-logic.js
        saveModelName(modelSelectDropdown.value); // from chat-logic.js
        closeSettingsModal(); // from ui.js
    });

    resetSettingsButton.addEventListener('click', () => {
        if (confirm('Are you sure you want to reset the prompt to its default state? Any custom changes in this text box will be lost.')) {
            systemPromptTextarea.value = getDefaultSystemPrompt(); // from chat-logic.js
            localStorage.removeItem(PROMPT_STORAGE_KEY);
        }
    });

    // --- Final Initialization ---
    
    // Fancy header scroll effect
    if (chatMessages && headerTitle) {
        chatMessages.addEventListener('scroll', () => {
            // 'is-scrolled' class is defined in style.css
            headerTitle.classList.toggle('is-scrolled', chatMessages.scrollTop > 50);
        });
    }

    // Set up speech recognition on load
    setupSpeechRecognition();
    
    // Load the initial chat state into the UI
    refreshUI();
    
    // Run agents on the initially loaded chat
    checkAndRunAgents();
});