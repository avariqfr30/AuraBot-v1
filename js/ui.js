// ui.js
// Handles DOM manipulation: rendering messages, lists, modals.

// --- DOM Element References ---
const chatMessages = document.getElementById('chatMessages');
const chatList = document.getElementById('chatList');
const settingsModal = document.getElementById('settingsModal');
const toolsModal = document.getElementById('toolsModal');
const toolsModalContent = document.getElementById('toolsModalContent');
const toolsButton = document.getElementById('toolsButton');
const themeToggleButton = document.getElementById('themeToggleButton');
let contentModalElement = null;

// --- Utility Functions ---
function clearChatMessages() { chatMessages.innerHTML = ''; }

// --- Rendering functions for the TOOLS MODAL ---
function renderChecklistInModal(checklist, container) {
    const section = document.createElement('div');
    section.className = 'checklist-card tool-card';
    let html = `<h4 class="text-xl font-bold mb-3 text-gray-200">${checklist.title}</h4><div class="checklist-scroll-container"><ul class="checklist-columns space-y-3">`;
    (checklist.items || []).forEach((item, index) => {
        html += `
            <li class="flex items-center">
                <input type="checkbox" id="modal-${checklist.id}-item-${index}"
                       class="h-5 w-5 rounded border-gray-500 bg-gray-800 text-pink-600 focus:ring-pink-500 mr-4 shrink-0"
                       data-tool-type="checklist" data-tool-id="${checklist.id}" data-item-index="${index}" ${item.done ? 'checked' : ''}>
                <label for="modal-${checklist.id}-item-${index}" class="transition-colors duration-200 text-lg ${item.done ? 'line-through text-gray-500' : 'text-gray-200'}">
                    ${item.text}
                </label>
            </li>`;
    });
    html += `</ul></div>`; section.innerHTML = html; container.appendChild(section);
}
function renderBreathingExerciseInModal(exercise, container) {
    const section = document.createElement('div');
    section.className = 'breathing-exercise-container tool-card';
    section.innerHTML = `
        <h4 class="text-xl font-bold mb-2 text-gray-200">${exercise.title}</h4>
        <div class="breathing-pacer"></div>
        <div class="breathing-status">Press Start</div>
        <button class="tool-button mt-4" data-action="start_breathing" data-tool-type="breathing_exercise" data-cycle-inhale="${exercise.cycle.inhale}" data-cycle-hold="${exercise.cycle.hold}" data-cycle-exhale="${exercise.cycle.exhale}">Start</button>`;
    container.appendChild(section);
}
function renderAffirmationCardInModal(card, container) {
    const section = document.createElement('div');
    section.className = 'affirmation-card tool-card';
    let affirmationHTML = Array.isArray(card.text)
        ? `<ul class="space-y-2 list-disc list-outside ml-5 affirmation-text">${card.text.map(t => `<li>"${t}"</li>`).join('')}</ul>`
        : `<p class="affirmation-text">"${card.text}"</p>`;
    section.innerHTML = `
        <h4 class="text-xl font-bold mb-3 text-gray-200">${card.title || "Your Affirmation"}</h4>
        ${affirmationHTML}
        <button class="tool-button mt-4" data-action="commit_affirmation" data-tool-type="affirmation_card" data-affirmation-text="${Array.isArray(card.text) ? card.text.join(' ') : card.text}">${card.buttonText}</button>`;
    container.appendChild(section);
}
function renderMoodTrackerInModal(tracker, container) {
    const section = document.createElement('div');
    section.className = 'mood-tracker-card tool-card';
    const emojis = { "Happy": '😊', "Okay": '🙂', "Neutral": '😐', "Sad": '😔', "Angry": '😠' };
    let buttonsHTML = '<div class="flex flex-wrap justify-center gap-3 mb-4">';
    (tracker.options || []).forEach(option => { buttonsHTML += `<button class="mood-button text-3xl p-2 rounded-full hover:bg-gray-700 transition" data-action="log_mood" data-mood="${option}" title="${option}">${emojis[option] || '❓'}</button>`; });
    buttonsHTML += '</div>';
    let historyHTML = '<div class="mt-4"><h5 class="text-lg font-semibold text-gray-300 mb-2">Recent Moods</h5>';
    if (tracker.history?.length > 0) {
        historyHTML += '<ul class="text-gray-400 space-y-1 text-sm">';
        tracker.history.slice(-5).reverse().forEach(entry => {
            const date = new Date(entry.timestamp);
            const formattedDate = date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            historyHTML += `<li class="flex justify-between items-center"><span>${emojis[entry.mood]} ${entry.mood}</span> <span class="text-xs">${formattedDate}</span></li>`;
        });
        historyHTML += '</ul>';
    } else { historyHTML += '<p class="text-gray-500 text-sm">No moods logged yet.</p>'; }
    historyHTML += '</div>';
    section.innerHTML = `
        <h4 class="text-xl font-bold mb-3 text-gray-200">${tracker.title}</h4>
        <p class="text-gray-400 mb-4">How are you feeling right now?</p>${buttonsHTML}${historyHTML}`;
    container.appendChild(section);
}
function renderThoughtRecordInModal(record, container) {
    const section = document.createElement('div');
    section.className = 'thought-record-card tool-card'; section.dataset.toolId = record.id;
    const createTextarea = (idSuffix, label, value) => `
        <div class="mb-3">
            <label for="${record.id}-${idSuffix}" class="block text-sm font-medium text-gray-300 mb-1">${label}</label>
            <textarea id="${record.id}-${idSuffix}" data-field="${idSuffix}" rows="3" class="w-full p-2 bg-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-200">${value || ''}</textarea>
        </div>`;
    section.innerHTML = `
        <h4 class="text-xl font-bold mb-4 text-gray-200">${record.title}</h4>
        ${createTextarea('situation', 'Situation (What happened?)', record.situation)}
        ${createTextarea('automaticThoughts', 'Automatic Thoughts (What went through your mind?)', record.automaticThoughts)}
        ${createTextarea('emotions', 'Emotions (How did you feel? Rate 0-100)', record.emotions)}
        ${createTextarea('cognitiveDistortions', 'Cognitive Distortions (Any thinking traps?)', record.cognitiveDistortions)}
        ${createTextarea('evidenceFor', 'Evidence FOR the thought', record.evidenceFor)}
        ${createTextarea('evidenceAgainst', 'Evidence AGAINST the thought', record.evidenceAgainst)}
        ${createTextarea('balancedThought', 'Alternative / Balanced Thought', record.balancedThought)}
        ${createTextarea('outcomeEmotions', 'Outcome (How do you feel now? Rate 0-100)', record.outcomeEmotions)}
        <button class="tool-button mt-3" data-action="save_thought_record" data-tool-id="${record.id}">Save Record</button>
        <p class="text-xs text-gray-500 mt-2">Your record is saved locally in this chat.</p>
         <a href="#" class="content-link text-xs text-pink-400 hover:underline mt-1 block" data-topic="thought-record-info">Learn more about Thought Records</a>`;
    container.appendChild(section);
}
function renderToolsInModal(tools) {
    toolsModalContent.innerHTML = '';
    let hasTools = false;
    const renderOrder = ['mood_tracker', 'checklist', 'thought_record', 'breathing_exercise', 'affirmation_card'];
    renderOrder.forEach(toolName => {
        if (tools[toolName]?.length > 0) {
            hasTools = true;
            tools[toolName].forEach(toolInstance => {
                switch (toolName) {
                    case 'mood_tracker': renderMoodTrackerInModal(toolInstance, toolsModalContent); break;
                    case 'checklist': renderChecklistInModal(toolInstance, toolsModalContent); break;
                    case 'thought_record': renderThoughtRecordInModal(toolInstance, toolsModalContent); break;
                    case 'breathing_exercise': renderBreathingExerciseInModal(toolInstance, toolsModalContent); break;
                    case 'affirmation_card': renderAffirmationCardInModal(toolInstance, toolsModalContent); break;
                }
            });
        }
    });
    if (!hasTools) { toolsModalContent.innerHTML = '<p class="text-gray-400 text-center w-full">No tools created yet.</p>'; }
}

// --- Chat Message Handling ---
function addMessage(sender, content) {
    const messageDiv = document.createElement('div');
    const isUser = sender === 'user';
    messageDiv.className = isUser ? 'flex justify-end' : 'flex justify-start';
    const chatBubble = document.createElement('div');
    chatBubble.className = `chat-bubble max-w-[75%] p-4 rounded-xl shadow-md ${isUser ? 'user' : 'ai'}`;
    if (isUser) {
        const p = document.createElement('p'); p.textContent = content; chatBubble.appendChild(p);
    } else {
        chatBubble.innerHTML = DOMPurify.sanitize(marked.parse(String(content)));
    }
    messageDiv.appendChild(chatBubble); chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}
function addToolStatusMessage(toolType) {
    const formattedName = toolType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const statusDiv = document.createElement('div');
    statusDiv.className = 'flex justify-start tool-status-message';
    statusDiv.innerHTML = `<div class="chat-bubble max-w-[75%] ...">...<i>Aura is using <strong>${formattedName}</strong>...</i></div>`; // Shortened
    chatMessages.appendChild(statusDiv); chatMessages.scrollTop = chatMessages.scrollHeight;
}
function removeToolStatusMessages() {
    document.querySelectorAll('.tool-status-message').forEach(msg => msg.remove());
}
function displayChat(history) {
    clearChatMessages();
    (history || []).forEach(message => { addMessage(message.role, message.content); });
    processContentLinks();
}

// --- Other UI Updates ---
function renderChatList(chats, activeChatId) {
    chatList.innerHTML = '';
    const validChats = Object.values(chats || {}).filter(chat => chat?.id && chat.title);
    const sortedChats = validChats.sort((a, b) => b.id - a.id);
    sortedChats.forEach(chat => {
        const chatTab = document.createElement('div');
        chatTab.className = `flex justify-between items-center p-3 rounded-md cursor-pointer ... ${chat.id === activeChatId ? 'bg-gray-800' : 'hover:bg-gray-800'}`; // Shortened
        chatTab.dataset.chatId = chat.id;
        const chatTitle = document.createElement('span'); chatTitle.textContent = chat.title; chatTitle.className = 'truncate';
        const deleteButton = document.createElement('button'); deleteButton.className = 'delete-chat-button ...'; deleteButton.dataset.chatId = chat.id; deleteButton.innerHTML = `<svg>...</svg>`; // Shortened
        chatTab.appendChild(chatTitle); chatTab.appendChild(deleteButton);
        chatList.appendChild(chatTab);
    });
}
function toggleToolsButton(hasTools) { toolsButton.classList.toggle('hidden', !hasTools); }

// --- Modal Visibility ---
function openToolsModal() { toolsModal.classList.remove('hidden'); }
function closeToolsModal() { toolsModal.classList.add('hidden'); }
function openSettingsModal() { settingsModal.classList.remove('hidden'); }
function closeSettingsModal() { settingsModal.classList.add('hidden'); }

// --- Indicators & States ---
function showTypingIndicator() {
     const typingDiv = document.createElement('div'); typingDiv.id = 'typingIndicator'; typingDiv.className = 'flex justify-start';
     typingDiv.innerHTML = `<div class="chat-bubble ..."><div class="flex ..."><div class="w-2.5 h-2.5 ... animate-bounce"></div>...</div></div>`; // Shortened
     chatMessages.appendChild(typingDiv); chatMessages.scrollTop = chatMessages.scrollHeight;
}
function hideTypingIndicator() { document.getElementById('typingIndicator')?.remove(); }
function setMicButtonState(state = 'idle') {
    const micButton = document.getElementById('micButton');
    if (state === 'listening') micButton.classList.replace('bg-gray-700', 'bg-red-600'); else micButton.classList.replace('bg-red-600', 'bg-gray-700');
    if (state === 'listening') micButton.classList.replace('hover:bg-gray-600', 'hover:bg-red-700'); else micButton.classList.replace('hover:bg-red-700', 'hover:bg-gray-600');
}

// --- Content Modal Functions ---
function showContentModal(title, markdownContent) {
    closeContentModal();
    contentModalElement = document.createElement('div'); contentModalElement.id = 'contentModal'; contentModalElement.className = 'fixed inset-0 z-[60] ... flex items-center justify-center p-4'; // Shortened
    const modalContent = document.createElement('div'); modalContent.className = 'relative bg-gray-900 ... max-w-2xl ... max-h-[80vh] overflow-y-auto glass-liquid'; // Shortened
    const renderedContent = DOMPurify.sanitize(marked.parse(markdownContent));
    modalContent.innerHTML = `
        <h3 class="text-2xl font-bold mb-4 text-gray-100">${title}</h3>
        <div class="prose prose-invert max-w-none text-gray-300">${renderedContent}</div>
        <div class="mt-6 flex justify-end">
            <button id="closeContentButton" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md transition duration-200">Close</button>
        </div>`;
    contentModalElement.appendChild(modalContent); document.body.appendChild(contentModalElement);
    document.getElementById('closeContentButton').addEventListener('click', closeContentModal);
}
function closeContentModal() { if (contentModalElement) { contentModalElement.remove(); contentModalElement = null; } }

// --- Content Link Processing ---
function processContentLinks() {
    const lastMessageBubble = chatMessages.querySelector('.chat-bubble.ai:last-of-type');
    if (!lastMessageBubble) return;
    const linkTagRegex = /&lt;link_content\s+topic="([^"]+)"\s*\/&gt;/g;
    lastMessageBubble.innerHTML = lastMessageBubble.innerHTML.replace(
        linkTagRegex, (match, topicSlug) => {
            const title = topicSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return `<a href="#" class="content-link text-pink-400 hover:underline font-semibold" data-topic="${topicSlug}">Learn about ${title}</a>`; // Slightly changed text
        }
    );
}

// --- Theme Handling ---
function applyTheme(theme) {
    if (theme === 'light') { document.documentElement.setAttribute('data-theme', 'light'); /* ... add/remove classes ... */ }
    else { document.documentElement.setAttribute('data-theme', 'dark'); /* ... add/remove classes ... */ }
    localStorage.setItem('aura_theme', theme);
}
document.addEventListener('DOMContentLoaded', () => {
    const saved = localStorage.getItem('aura_theme') || 'dark'; applyTheme(saved);
    if (themeToggleButton) { /* ... add listener ... */ }
});