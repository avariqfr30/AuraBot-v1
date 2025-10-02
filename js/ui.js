// ui.js
// This file handles all direct manipulation of the DOM. It's responsible for
// rendering messages, updating the chat list, and managing modals.

// --- DOM Element References ---
const chatMessages = document.getElementById('chatMessages');
const chatList = document.getElementById('chatList');
const settingsModal = document.getElementById('settingsModal');
const toolsModal = document.getElementById('toolsModal');
const toolsModalContent = document.getElementById('toolsModalContent');
const toolsButton = document.getElementById('toolsButton');

// A simple utility to clear the chat window.
function clearChatMessages() {
    chatMessages.innerHTML = '';
}

// --- Rendering functions for IN-CHAT tools ---

// Renders the interactive mood tracker buttons inside a chat bubble.
function renderMoodTracker(tool) {
    const container = document.createElement('div');
    const title = document.createElement('p');
    title.className = 'font-semibold mb-2';
    title.textContent = tool.title;
    container.appendChild(title);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'mood-tracker-container';
    
    const emojis = { "Happy": '😊', "Okay": '🙂', "Neutral": '😐', "Sad": '😔', "Angry": '😠' };

    tool.options.forEach(option => {
        const button = document.createElement('button');
        button.className = 'mood-button';
        button.textContent = emojis[option] || '❓';
        button.dataset.action = 'log_mood';
        button.dataset.mood = option;
        buttonContainer.appendChild(button);
    });

    container.appendChild(buttonContainer);
    return container;
}

// --- Rendering functions for the TOOLS MODAL ---

// Renders a single checklist instance in the toolbox modal.
function renderChecklistInModal(checklist, container) {
    const section = document.createElement('div');
    let html = `<h4 class="text-xl font-bold mb-3 text-gray-200">${checklist.title}</h4>`;
    html += '<ul class="space-y-3">';
    checklist.items.forEach((item, index) => {
        html += `<li class="flex items-center">
            <input type="checkbox" id="modal-${checklist.id}-item-${index}" 
                   class="h-5 w-5 rounded border-gray-500 bg-gray-800 text-pink-600 focus:ring-pink-500 mr-4" 
                   data-tool-type="checklist" 
                   data-tool-id="${checklist.id}" 
                   data-item-index="${index}" ${item.done ? 'checked' : ''}>
            <label for="modal-${checklist.id}-item-${index}" class="transition-colors duration-200 text-lg ${item.done ? 'line-through text-gray-500' : 'text-gray-200'}">
                ${item.text}
            </label>
        </li>`;
    });
    html += '</ul>';
    section.innerHTML = html;
    container.appendChild(section);
}

// Renders a single breathing exercise instance in the toolbox modal.
function renderBreathingExerciseInModal(exercise, container) {
    const section = document.createElement('div');
    section.className = 'breathing-exercise-container';
    section.innerHTML = `
        <h4 class="text-xl font-bold mb-2 text-gray-200">${exercise.title}</h4>
        <div class="breathing-pacer"></div>
        <div class="breathing-status">Press Start</div>
        <button class="tool-button" data-action="start_breathing" data-tool-type="breathing_exercise" data-cycle-inhale="${exercise.cycle.inhale}" data-cycle-hold="${exercise.cycle.hold}" data-cycle-exhale="${exercise.cycle.exhale}">Start</button>
    `;
    container.appendChild(section);
}

// Renders a single affirmation card instance in the toolbox modal.
function renderAffirmationCardInModal(card, container) {
    const section = document.createElement('div');
    section.className = 'affirmation-card mt-4';
    
    let affirmationHTML = '';
    // This now handles the new format where 'text' is an array of strings,
    // but it also includes a fallback for the old single-string format.
    if (Array.isArray(card.text)) {
        affirmationHTML = `<ul class="space-y-2 list-disc list-inside affirmation-text">${card.text.map(t => `<li>"${t}"</li>`).join('')}</ul>`;
    } else {
        affirmationHTML = `<p class="affirmation-text">"${card.text}"</p>`;
    }

    section.innerHTML = `
        <h4 class="text-xl font-bold mb-3 text-gray-200">${card.title || "Your Affirmation"}</h4>
        ${affirmationHTML}
        <button class="tool-button" data-action="commit_affirmation" data-tool-type="affirmation_card" data-affirmation-text="${Array.isArray(card.text) ? card.text.join(' ') : card.text}">${card.buttonText}</button>
    `;
    container.appendChild(section);
}

/**
 * The main function for rendering the toolbox content. It now iterates through
 * arrays of tools, allowing multiple instances of each type to be displayed.
 */
function renderToolsInModal(tools) {
    toolsModalContent.innerHTML = '';
    let hasTools = false;
    // We'll render tools in a specific order for consistency in the UI.
    const renderOrder = ['checklist', 'breathing_exercise', 'affirmation_card'];

    renderOrder.forEach(toolName => {
        // Check if the array for the tool type exists and has items.
        if (tools[toolName] && tools[toolName].length > 0) {
            // Loop through each instance of the tool (e.g., each checklist).
            tools[toolName].forEach(toolInstance => {
                if (hasTools) { // Add a divider between each tool for visual separation.
                    const divider = document.createElement('hr');
                    divider.className = 'my-6 border-gray-700';
                    toolsModalContent.appendChild(divider);
                }
                hasTools = true;
                
                switch (toolName) {
                    case 'checklist':
                        renderChecklistInModal(toolInstance, toolsModalContent);
                        break;
                    case 'breathing_exercise':
                        renderBreathingExerciseInModal(toolInstance, toolsModalContent);
                        break;
                    case 'affirmation_card':
                        renderAffirmationCardInModal(toolInstance, toolsModalContent);
                        break;
                }
            });
        }
    });

    if (!hasTools) {
        toolsModalContent.innerHTML = '<p class="text-gray-400">No tools have been created for this chat yet.</p>';
    }
}


// Adds a message bubble to the chat window.
function addMessage(sender, content) {
    const messageDiv = document.createElement('div');
    const isUser = sender === 'user';
    messageDiv.className = isUser ? 'flex justify-end' : 'flex justify-start';
    const chatBubble = document.createElement('div');
    chatBubble.className = `chat-bubble max-w-[75%] p-4 rounded-xl shadow-md ${isUser ? 'user' : 'ai'}`;

    // If the content is an object, it's an interactive tool.
    if (sender === 'ai' && typeof content === 'object' && content.type) {
        switch(content.type) {
            case 'mood_tracker':
                chatBubble.appendChild(renderMoodTracker(content));
                break;
            default:
                // Don't render unknown tool types in the chat.
                return; 
        }
    } else {
        // Otherwise, it's a regular text message.
        const p = document.createElement('p');
        p.textContent = content;
        chatBubble.innerHTML = '';
        if (isUser) {
            chatBubble.appendChild(p);
        } else {
             // Use Marked and DOMPurify to safely render Markdown from the AI.
             chatBubble.innerHTML = DOMPurify.sanitize(marked.parse(String(content)));
        }
    }
    
    messageDiv.appendChild(chatBubble);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll to the bottom.
}

// Renders the entire chat history for the active conversation.
function displayChat(history) {
    clearChatMessages();
    history.forEach(message => {
        addMessage(message.role, message.content);
    });
}

// Renders the list of conversations in the sidebar.
function renderChatList(chats, activeChatId) {
    chatList.innerHTML = '';
    const validChats = Object.values(chats).filter(chat => chat && chat.id && chat.title);
    const sortedChats = validChats.sort((a, b) => b.id - a.id); // Show newest first.
    sortedChats.forEach(chat => {
        const chatTab = document.createElement('div');
        chatTab.className = `flex justify-between items-center p-3 rounded-md cursor-pointer transition duration-200 ${chat.id === activeChatId ? 'bg-gray-800' : 'hover:bg-gray-800'}`;
        chatTab.dataset.chatId = chat.id;

        const chatTitle = document.createElement('span');
        chatTitle.textContent = chat.title;
        chatTitle.className = 'truncate';

        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-chat-button text-gray-400 hover:text-red-500 transition duration-200';
        deleteButton.dataset.chatId = chat.id;
        deleteButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>`;

        chatTab.appendChild(chatTitle);
        chatTab.appendChild(deleteButton);
        chatList.appendChild(chatTab);
    });
}

// Shows or hides the toolbox button based on whether tools exist.
function toggleToolsButton(hasTools) {
    if (hasTools) {
        toolsButton.classList.remove('hidden');
    } else {
        toolsButton.classList.add('hidden');
    }
}

// --- Modal Management ---
function openToolsModal() { toolsModal.classList.remove('hidden'); }
function closeToolsModal() { toolsModal.classList.add('hidden'); }

// Shows the "..." typing indicator.
function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typingIndicator';
    typingDiv.className = 'flex justify-start';
    typingDiv.innerHTML = `<div class="chat-bubble bg-gray-800 max-w-[75%] p-4 rounded-xl shadow-md"><div class="flex items-center space-x-1.5"><div class="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce" style="animation-delay: -0.3s;"></div><div class="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce" style="animation-delay: -0.15s;"></div><div class="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce"></div></div></div>`;
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Hides the typing indicator.
function hideTypingIndicator() {
    const typingDiv = document.getElementById('typingIndicator');
    if (typingDiv) typingDiv.remove();
}

// Changes the microphone button's color to indicate recording status.
function setMicButtonState(state = 'idle') {
    const micButton = document.getElementById('micButton');
    if (state === 'listening') {
        micButton.classList.remove('bg-gray-700', 'hover:bg-gray-600');
        micButton.classList.add('bg-red-600', 'hover:bg-red-700');
    } else {
        micButton.classList.remove('bg-red-600', 'hover:bg-red-700');
        micButton.classList.add('bg-gray-700', 'hover:bg-gray-600');
    }
}

// --- Settings Modal Management ---
function openSettingsModal() { settingsModal.classList.remove('hidden'); }
function closeSettingsModal() { settingsModal.classList.add('hidden'); }