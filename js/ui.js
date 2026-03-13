const chatMessages = document.getElementById('chatMessages');
const chatList = document.getElementById('chatList');
const settingsModal = document.getElementById('settingsModal');
const toolsModal = document.getElementById('toolsModal');
const toolsModalContent = document.getElementById('toolsModalContent');
const toolsButton = document.getElementById('toolsButton');
let contentModalElement = null;

function clearChatMessages() { chatMessages.innerHTML = ''; }

// --- Tool Rendering Functions ---
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
        : `<p class="affirmation-text">"${card.text || ''}"</p>`;
    section.innerHTML = `
        <h4 class="text-xl font-bold mb-3 text-gray-200">${card.title || "Your Affirmation"}</h4>
        ${affirmationHTML}
        <button class="tool-button mt-4" data-action="commit_affirmation" data-tool-type="affirmation_card">I will remember this.</button>`;
    container.appendChild(section);
}

function renderMoodTrackerInModal(tracker, container) {
    const section = document.createElement('div');
    section.className = 'mood-tracker-card tool-card';
    const emojis = { "Happy": '😊', "Okay": '🙂', "Neutral": '😐', "Sad": '😔', "Angry": '😠' };
    let buttonsHTML = '<div class="flex flex-wrap justify-center gap-3 mb-4">';
    (tracker.options || ["Happy", "Okay", "Neutral", "Sad", "Angry"]).forEach(option => { buttonsHTML += `<button class="mood-button text-3xl p-2 rounded-full hover:bg-gray-700 transition" data-action="log_mood" data-mood="${option}" title="${option}">${emojis[option] || '❓'}</button>`; });
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
        <h4 class="text-xl font-bold mb-3 text-gray-200">${tracker.title || 'Your Mood Tracker'}</h4>
        <p class="text-gray-400 mb-4">How are you feeling right now?</p>${buttonsHTML}${historyHTML}`;
    container.appendChild(section);
}

function renderThoughtRecordInModal(record, container) {
    const section = document.createElement('div');
    section.className = 'thought-record-card tool-card'; section.dataset.toolId = record.id;
    const escapeHTML = (str) => str?.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;') || '';
    
    const createTextarea = (idSuffix, label, value) => `
        <div class="mb-3">
            <label for="${record.id}-${idSuffix}" class="block text-sm font-medium text-gray-300 mb-1">${label}</label>
            <textarea id="${record.id}-${idSuffix}" data-field="${idSuffix}" rows="3" class="w-full p-2 bg-gray-800 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-500 text-gray-200">${escapeHTML(value)}</textarea>
        </div>`;
    
    section.innerHTML = `
        <h4 class="text-xl font-bold mb-4 text-gray-200">${record.title || 'Thought Record'}</h4>
        <div class="thought-record-columns">
            ${createTextarea('situation', 'Situation (What happened?)', record.situation)}
            ${createTextarea('automaticThoughts', 'Automatic Thoughts', record.automaticThoughts)}
            ${createTextarea('emotions', 'Emotions (Rate 0-100)', record.emotions)}
            ${createTextarea('cognitiveDistortions', 'Cognitive Distortions', record.cognitiveDistortions)}
            ${createTextarea('evidenceFor', 'Evidence FOR the thought', record.evidenceFor)}
            ${createTextarea('evidenceAgainst', 'Evidence AGAINST the thought', record.evidenceAgainst)}
            ${createTextarea('balancedThought', 'Balanced Thought', record.balancedThought)}
            ${createTextarea('outcomeEmotions', 'Outcome (Rate 0-100)', record.outcomeEmotions)}
        </div>
        <button class="tool-button mt-3" data-action="save_thought_record" data-tool-id="${record.id}">Save Record</button>
        <p class="text-xs text-gray-500 mt-2">Your record is saved locally in this chat.</p>
        <a href="#" class="content-link text-xs text-pink-400 hover:underline mt-1 block" data-topic="thought-record-info">Learn more about Thought Records</a>`;
    container.appendChild(section);
}
function renderWebSearchInModal(search, container) {
    const section = document.createElement('div');
    section.className = 'web-search-card tool-card';
    let html = `<h4 class="text-xl font-bold mb-3 text-gray-200">${search.title}</h4><div class="search-results">`;
    (search.results || []).forEach((result, index) => {
        html += `
            <div class="search-result mb-4">
                <h5 class="text-lg font-semibold text-pink-400"><a href="${result.link}" target="_blank" class="hover:underline">${result.title}</a></h5>
                <p class="text-gray-300 text-sm">${result.snippet}</p>
            </div>`;
    });
    html += `</div>`; section.innerHTML = html; container.appendChild(section);
}
function renderToolsInModal(tools) {
    toolsModalContent.innerHTML = '';
    let hasTools = false;
    const renderOrder = ['mood_tracker', 'checklist', 'thought_record', 'breathing_exercise', 'affirmation_card', 'web_search'];
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
                    case 'web_search': renderWebSearchInModal(toolInstance, toolsModalContent); break;
                }
            });
        }
    });
    if (!hasTools) { toolsModalContent.innerHTML = '<p class="text-gray-400 text-center w-full">No tools created yet.</p>'; }

    // Trigger modal resize after content is rendered
    setTimeout(() => {
        if (typeof openToolsModal === 'function') {
            // Re-run the adaptive sizing logic
            const modalContainer = document.querySelector('.toolbox-modal-container');
            if (modalContainer && !toolsModal.classList.contains('hidden')) {
                const viewportHeight = window.innerHeight;
                const viewportWidth = window.innerWidth;
                const contentHeight = toolsModalContent.scrollHeight;
                const headerHeight = 120;
                const footerHeight = 80;

                const optimalHeight = Math.min(
                    contentHeight + headerHeight + footerHeight,
                    viewportHeight * 0.9
                );

                let optimalWidth;
                if (viewportWidth < 640) {
                    optimalWidth = viewportWidth - 32;
                } else if (viewportWidth < 1024) {
                    optimalWidth = Math.min(viewportWidth * 0.9, 1000);
                } else {
                    optimalWidth = Math.min(viewportWidth * 0.85, 1400);
                }

                modalContainer.style.maxHeight = `${optimalHeight}px`;
                modalContainer.style.width = `${optimalWidth}px`;
                modalContainer.style.maxWidth = `${optimalWidth}px`;
            }
        }
    }, 50);
}

// --- Chat Messages ---
function addMessage(sender, content) {
    const messageDiv = document.createElement('div');
    const isUser = sender === 'user';
    messageDiv.className = isUser ? 'flex justify-end mb-4' : 'flex justify-start mb-4';
    const chatBubble = document.createElement('div');
    chatBubble.className = `chat-bubble max-w-[75%] p-4 rounded-xl shadow-md ${isUser ? 'user' : 'ai'}`;
    if (isUser) {
        const p = document.createElement('p'); p.textContent = content; chatBubble.appendChild(p);
    } else {
        chatBubble.innerHTML = DOMPurify.sanitize(marked.parse(String(content || '')));
    }
    messageDiv.appendChild(chatBubble); chatMessages.appendChild(messageDiv);
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

function addToolStatusMessage(toolType) {
    const formattedName = toolType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const statusDiv = document.createElement('div');
    statusDiv.className = 'flex justify-start tool-status-message mb-4';
    statusDiv.innerHTML = `
        <div class="chat-bubble max-w-[75%] p-3 rounded-xl shadow-md bg-gray-800 text-gray-400 flex items-center space-x-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
            </svg>
            <i>Aura is using the <strong>${formattedName}</strong> tool...</i>
        </div>`;
    chatMessages.appendChild(statusDiv); chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

function removeToolStatusMessages() { document.querySelectorAll('.tool-status-message').forEach(msg => msg.remove()); }

function displayChat(history) {
    clearChatMessages();
    (history || []).forEach(message => { addMessage(message.role, message.content); });
    processContentLinks();
}

function renderChatList(chats, activeChatId) {
    chatList.innerHTML = '';
    const sortedChats = Object.values(chats || {}).filter(c => c?.id).sort((a, b) => b.id - a.id);
    sortedChats.forEach(chat => {
        const chatTab = document.createElement('div');
        chatTab.className = `flex justify-between items-center p-3 rounded-lg cursor-pointer mb-1 ${chat.id === activeChatId ? 'bg-gray-700 text-white' : 'text-gray-300 hover:bg-gray-800'}`;
        chatTab.dataset.chatId = chat.id;
        
        const chatTitle = document.createElement('span'); 
        chatTitle.textContent = chat.title; chatTitle.className = 'truncate text-sm font-medium';
        
        const deleteBtn = document.createElement('button'); 
        deleteBtn.className = 'delete-chat-button text-gray-500 hover:text-red-500 ml-2'; 
        deleteBtn.dataset.chatId = chat.id; 
        deleteBtn.innerHTML = `<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>`;
        
        chatTab.appendChild(chatTitle); chatTab.appendChild(deleteBtn);
        chatList.appendChild(chatTab);
    });
}

function toggleToolsButton(hasTools) { toolsButton.classList.toggle('hidden', !hasTools); }

// --- Modal Visibility ---
function openToolsModal() {
    toolsModal.classList.remove('hidden');
    // Make modal adaptive to content and screen size
    setTimeout(() => {
        const modalContainer = document.querySelector('.toolbox-modal-container');
        const modalContent = toolsModalContent;

        if (modalContainer && modalContent) {
            // Reset any previous sizing
            modalContainer.style.maxHeight = '';
            modalContainer.style.height = '';

            // Calculate optimal dimensions
            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            const contentHeight = modalContent.scrollHeight;
            const headerHeight = 120; // Approximate header + padding
            const footerHeight = 80; // Approximate footer + padding

            // Adaptive height: use content height but cap at viewport
            const optimalHeight = Math.min(
                contentHeight + headerHeight + footerHeight,
                viewportHeight * 0.9 // Max 90% of viewport
            );

            // Adaptive width: responsive based on screen size and content
            let optimalWidth;
            if (viewportWidth < 640) {
                // Mobile: use most of screen width
                optimalWidth = viewportWidth - 32; // Account for margins
            } else if (viewportWidth < 1024) {
                // Tablet: use 90% of screen width
                optimalWidth = Math.min(viewportWidth * 0.9, 1000);
            } else {
                // Desktop: use content-based width up to max
                optimalWidth = Math.min(viewportWidth * 0.85, 1400);
            }

            // Apply adaptive sizing
            modalContainer.style.maxHeight = `${optimalHeight}px`;
            modalContainer.style.width = `${optimalWidth}px`;
            modalContainer.style.maxWidth = `${optimalWidth}px`;

            // Center the modal
            modalContainer.style.margin = '0 auto';
        }
    }, 10); // Small delay to ensure content is rendered
}
function closeToolsModal() { toolsModal.classList.add('hidden'); }
function openSettingsModal() { settingsModal.classList.remove('hidden'); }
function closeSettingsModal() { settingsModal.classList.add('hidden'); }

// --- Indicators & States ---
function showTypingIndicator() {
    if (document.getElementById('typingIndicator')) return;
    const typingDiv = document.createElement('div'); typingDiv.id = 'typingIndicator'; typingDiv.className = 'flex justify-start mb-4';
    typingDiv.innerHTML = `<div class="chat-bubble bg-gray-800 max-w-[75%] p-4 rounded-xl shadow-md"><div class="flex items-center space-x-1.5"><div class="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce" style="animation-delay: -0.3s;"></div><div class="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce" style="animation-delay: -0.15s;"></div><div class="w-2.5 h-2.5 bg-gray-500 rounded-full animate-bounce"></div></div></div>`;
    chatMessages.appendChild(typingDiv); chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}
function hideTypingIndicator() { document.getElementById('typingIndicator')?.remove(); }

// --- Modals ---
function openToolsModal() { document.getElementById('toolsModal').classList.remove('hidden'); }
function closeToolsModal() { document.getElementById('toolsModal').classList.add('hidden'); }
function openSettingsModal() { document.getElementById('settingsModal').classList.remove('hidden'); }
function closeSettingsModal() { document.getElementById('settingsModal').classList.add('hidden'); }

// Insights Modal Render
function openInsightsModal() {
    const modal = document.getElementById('insightsModal');
    const container = document.getElementById('insightsContent');
    const store = window.chatManager ? window.chatManager.state.localContentStore : {};

    const renderList = (arr, emptyMsg) => {
        if (!arr || arr.length === 0) return `<p class="text-gray-500 italic">${emptyMsg}</p>`;
        return `<ul class="list-disc list-inside space-y-1">${arr.map(i => `<li>${i}</li>`).join('')}</ul>`;
    };

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-gray-800 p-4 rounded-lg">
                <h4 class="text-pink-400 font-semibold mb-2">Communication Style</h4>
                <p>${store.communicationStyle || "Not established."}</p>
            </div>
            <div class="bg-gray-800 p-4 rounded-lg">
                <h4 class="text-pink-400 font-semibold mb-2">Behavioral Facts</h4>
                ${renderList(store.behavioralFacts, "No facts learned yet.")}
            </div>
            <div class="bg-gray-800 p-4 rounded-lg">
                <h4 class="text-pink-400 font-semibold mb-2">Mood Patterns</h4>
                ${renderList(store.moodPatterns, "No strong patterns detected.")}
            </div>
            <div class="bg-gray-800 p-4 rounded-lg border border-red-900">
                <h4 class="text-red-400 font-semibold mb-2">Potential Lapses to Watch</h4>
                ${renderList(store.potentialLapses, "No immediate risks detected.")}
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
}
function closeInsightsModal() { document.getElementById('insightsModal').classList.add('hidden'); }

function showContentModal(title, markdownContent) {
    closeContentModal();
    contentModalElement = document.createElement('div'); contentModalElement.id = 'contentModal'; contentModalElement.className = 'fixed inset-0 z-[60] overflow-y-auto bg-black bg-opacity-75 flex items-center justify-center p-4';
    const modalContent = document.createElement('div'); modalContent.className = 'relative bg-gray-900 rounded-lg p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto';
    modalContent.innerHTML = `
        <h3 class="text-2xl font-bold mb-4 text-gray-100">${title}</h3>
        <div class="prose prose-invert max-w-none text-gray-300">${DOMPurify.sanitize(marked.parse(markdownContent))}</div>
        <div class="mt-6 flex justify-end">
            <button id="closeContentButton" class="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-md">Close</button>
        </div>`;
    contentModalElement.appendChild(modalContent); document.body.appendChild(contentModalElement);
    document.getElementById('closeContentButton').addEventListener('click', closeContentModal);
}
function closeContentModal() { if (contentModalElement) { contentModalElement.remove(); contentModalElement = null; } }

function processContentLinks() {
    const lastMessageBubble = chatMessages.querySelector('.chat-bubble.ai:last-of-type');
    if (!lastMessageBubble) return;
    const linkTagRegex = /&lt;link_content\s+topic="([^"]+)"\s*\/&gt;|<link_content\s+topic="([^"]+)"\s*\/>/g;
    lastMessageBubble.innerHTML = lastMessageBubble.innerHTML.replace(
        linkTagRegex, (match, topic1, topic2) => {
            const slug = topic1 || topic2; if (!slug) return match;
            const title = slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            return `<a href="#" class="content-link text-pink-400 hover:underline font-semibold" data-topic="${slug}">Learn about ${title}</a>`;
        }
    );
}

// --- Theme Handling ---
function applyTheme(theme) {
    // Only dark mode logic
    document.documentElement.setAttribute('data-theme', 'dark');
    document.body.classList.add('bg-gray-950', 'text-gray-200');
    document.body.classList.remove('bg-white', 'text-gray-900');
    localStorage.setItem('aura_theme', 'dark');
    if (themeToggleButton) themeToggleButton.setAttribute('aria-pressed', 'false'); // Assuming button still exists but doesn't toggle
}

// --- Window Resize Handler for Adaptive Modal ---
function handleWindowResize() {
    const modalContainer = document.querySelector('.toolbox-modal-container');
    if (modalContainer && !toolsModal.classList.contains('hidden')) {
        // Re-apply adaptive sizing on window resize
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;
        const contentHeight = toolsModalContent.scrollHeight;
        const headerHeight = 120;
        const footerHeight = 80;

        const optimalHeight = Math.min(
            contentHeight + headerHeight + footerHeight,
            viewportHeight * 0.9
        );

        let optimalWidth;
        if (viewportWidth < 640) {
            optimalWidth = viewportWidth - 32;
        } else if (viewportWidth < 1024) {
            optimalWidth = Math.min(viewportWidth * 0.9, 1000);
        } else {
            optimalWidth = Math.min(viewportWidth * 0.85, 1400);
        }

        modalContainer.style.maxHeight = `${optimalHeight}px`;
        modalContainer.style.width = `${optimalWidth}px`;
        modalContainer.style.maxWidth = `${optimalWidth}px`;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    applyTheme('dark');
    // Add window resize listener for adaptive modal
    window.addEventListener('resize', handleWindowResize);
});