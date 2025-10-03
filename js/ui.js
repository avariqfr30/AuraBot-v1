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

// --- Rendering functions for the TOOLS MODAL ---

function renderChecklistInModal(checklist, container) {
    const section = document.createElement('div');
    section.className = 'checklist-card'; // Added class for styling
    let html = `
        <h4 class="text-xl font-bold mb-3 text-gray-200">${checklist.title}</h4>
        <div class="checklist-scroll-container">
            <ul class="checklist-columns space-y-3">`;

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

    html += `</ul></div>`;
    section.innerHTML = html;
    container.appendChild(section);
}

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

function renderAffirmationCardInModal(card, container) {
    const section = document.createElement('div');
    section.className = 'affirmation-card mt-4';
    
    let affirmationHTML = Array.isArray(card.text)
        ? `<ul class="space-y-2 list-disc list-outside ml-5 affirmation-text">${card.text.map(t => `<li>"${t}"</li>`).join('')}</ul>`
        : `<p class="affirmation-text">"${card.text}"</p>`;

    section.innerHTML = `
        <h4 class="text-xl font-bold mb-3 text-gray-200">${card.title || "Your Affirmation"}</h4>
        ${affirmationHTML}
        <button class="tool-button mt-4" data-action="commit_affirmation" data-tool-type="affirmation_card" data-affirmation-text="${Array.isArray(card.text) ? card.text.join(' ') : card.text}">${card.buttonText}</button>
    `;
    container.appendChild(section);
}

function renderMoodTrackerInModal(tracker, container) {
    const section = document.createElement('div');
    section.className = 'mood-tracker-card'; // Added class for styling
    const emojis = { "Happy": '😊', "Okay": '🙂', "Neutral": '😐', "Sad": '😔', "Angry": '😠' };
    
    let buttonsHTML = '<div class="mood-tracker-container">';
    tracker.options.forEach(option => {
        buttonsHTML += `<button class="mood-button" data-action="log_mood" data-mood="${option}">${emojis[option] || '❓'}</button>`;
    });
    buttonsHTML += '</div>';

    let historyHTML = '<div class="mt-4"><h5 class="text-lg font-semibold text-gray-300 mb-2">Recent Moods</h5>';
    if (tracker.history && tracker.history.length > 0) {
        historyHTML += '<ul class="text-gray-400 space-y-1 text-sm">';
        tracker.history.slice(-5).reverse().forEach(entry => {
            const date = new Date(entry.timestamp);
            const formattedDate = date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            historyHTML += `<li class="flex justify-between"><span>${emojis[entry.mood]} ${entry.mood}</span> <span>${formattedDate}</span></li>`;
        });
        historyHTML += '</ul>';
    } else {
        historyHTML += '<p class="text-gray-500 text-sm">No moods logged yet.</p>';
    }
    historyHTML += '</div>';

    section.innerHTML = `
        <h4 class="text-xl font-bold mb-3 text-gray-200">${tracker.title}</h4>
        <p class="text-gray-400 mb-3">How are you feeling right now?</p>
        ${buttonsHTML}
        ${historyHTML}
    `;
    container.appendChild(section);
}

function renderToolsInModal(tools) {
    toolsModalContent.innerHTML = '';
    let hasTools = false;
    const renderOrder = ['mood_tracker', 'checklist', 'breathing_exercise', 'affirmation_card'];

    renderOrder.forEach(toolName => {
        if (tools[toolName] && tools[toolName].length > 0) {
            tools[toolName].forEach(toolInstance => {
                if (hasTools) {
                    const divider = document.createElement('hr');
                    divider.className = 'my-6 border-gray-700';
                    toolsModalContent.appendChild(divider);
                }
                hasTools = true;
                
                switch (toolName) {
                    case 'mood_tracker':
                        renderMoodTrackerInModal(toolInstance, toolsModalContent);
                        break;
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

function addMessage(sender, content) {
    const messageDiv = document.createElement('div');
    const isUser = sender === 'user';
    messageDiv.className = isUser ? 'flex justify-end' : 'flex justify-start';
    const chatBubble = document.createElement('div');
    chatBubble.className = `chat-bubble max-w-[75%] p-4 rounded-xl shadow-md ${isUser ? 'user' : 'ai'}`;

    if (isUser) {
        const p = document.createElement('p');
        p.textContent = content;
        chatBubble.appendChild(p);
    } else {
        chatBubble.innerHTML = DOMPurify.sanitize(marked.parse(String(content)));
    }
    
    messageDiv.appendChild(chatBubble);
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// --- NEW: Functions for the tool status bubble ---

/**
 * Adds a temporary status message to the chat indicating a tool is being used.
 * @param {string} toolType The type of tool being used (e.g., 'checklist').
 */
function addToolStatusMessage(toolType) {
    const formattedName = toolType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    const statusDiv = document.createElement('div');
    statusDiv.className = 'flex justify-start tool-status-message'; // Added class for easy removal
    statusDiv.innerHTML = `
        <div class="chat-bubble max-w-[75%] p-3 rounded-xl shadow-md bg-gray-800 text-gray-400 flex items-center space-x-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
            </svg>
            <i>Aura is using the <strong>${formattedName}</strong> tool...</i>
        </div>
    `;
    chatMessages.appendChild(statusDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

/**
 * Removes all tool status messages from the chat.
 */
function removeToolStatusMessages() {
    const statusMessages = document.querySelectorAll('.tool-status-message');
    statusMessages.forEach(msg => msg.remove());
}


function displayChat(history) {
    clearChatMessages();
    history.forEach(message => {
        addMessage(message.role, message.content);
    });
}

function renderChatList(chats, activeChatId) {
    chatList.innerHTML = '';
    const validChats = Object.values(chats).filter(chat => chat && chat.id && chat.title);
    const sortedChats = validChats.sort((a, b) => b.id - a.id);
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

function toggleToolsButton(hasTools) {
    if (hasTools) {
        toolsButton.classList.remove('hidden');
    } else {
        toolsButton.classList.add('hidden');
    }
}

function openToolsModal() { toolsModal.classList.remove('hidden'); }
function closeToolsModal() { toolsModal.classList.add('hidden'); }

function showTypingIndicator() {
    const typingDiv = document.createElement('div');
    typingDiv.id = 'typingIndicator';
    typingDiv.className = 'flex justify-start';
    typingDiv.innerHTML = `<div class="chat-bubble bg-gray-800 max-w-[75%] p-4 rounded-xl shadow-md"><div class="flex items-center space-x-1.5"><div class="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce" style="animation-delay: -0.3s;"></div><div class="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce" style="animation-delay: -0.15s;"></div><div class="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce"></div></div></div>`;
    chatMessages.appendChild(typingDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
    const typingDiv = document.getElementById('typingIndicator');
    if (typingDiv) typingDiv.remove();
}

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

function openSettingsModal() { settingsModal.classList.remove('hidden'); }
function closeSettingsModal() { settingsModal.classList.add('hidden'); }