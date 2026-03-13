document.addEventListener('DOMContentLoaded', () => {
    const userInput = document.getElementById('userInput');
    const sendButton = document.getElementById('sendButton');
    const newChatButton = document.getElementById('newChatButton');
    const chatListContainer = document.getElementById('chatList');
    const toolsButton = document.getElementById('toolsButton');
    const fileInput = document.getElementById('fileInput');
    const insightsButton = document.getElementById('insightsButton');
    
    let attachedFile = null;

    // --- Core Chat Handling ---
    async function handleSendMessage() {
        const message = userInput.value.trim();
        if (!message && !attachedFile) return;

        let documentText = null;
        if (attachedFile) {
            documentText = await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsText(attachedFile);
            });
        }

        const displayMessage = attachedFile ? `[Attached: ${attachedFile.name}]\n\n${message}` : message;
        addMessage('user', displayMessage);
        chatManager.addMessageToActiveChat('user', message);
        
        userInput.value = '';
        if (attachedFile) { attachedFile = null; document.getElementById('fileAttachmentIndicator').classList.add('hidden'); }

        showTypingIndicator();
        
        // 1. Pre-Screen for Crisis
        const screenResult = await chatManager.preScreenMessage(message);
        if (screenResult === 'CRISIS') {
            const safeMessage = await chatManager.triggerSafetyIntervention(message);
            hideTypingIndicator();
            addMessage('ai', safeMessage);
            refreshUI(); return;
        }

        // 2. Normal Route
        const rawResponse = await getOllamaResponse(message, null, documentText);
        hideTypingIndicator();

        // 3. Process Tools
        // This robust regex catches single/double quotes, weird spacing, and missing closing slashes
        const toolTagRegex = /<tool_create[^>]*type=["']([^"']+)["'][^>]*(?:theme=["']([^"']+)["'])?[^>]*\/?>/gi;   
        let cleanedResponse = rawResponse;
        const matchedTags = [...rawResponse.matchAll(toolTagRegex)];

        if (matchedTags.length > 0) matchedTags.forEach(m => addToolStatusMessage(m[1]));
        
        for (const match of matchedTags) {
            const toolData = await createToolByType(match[1], match[2] || '');
            if (toolData) chatManager.addOrUpdateToolInActiveChat(match[1], toolData);
            cleanedResponse = cleanedResponse.replace(match[0], '').trim();
        }
        removeToolStatusMessages();

        addMessage('ai', cleanedResponse);
        chatManager.addMessageToActiveChat('ai', rawResponse);
        refreshUI();
    }

    async function triggerAIFollowUp(followUp) {
        showTypingIndicator();
        const response = await getOllamaResponse('', followUp);
        hideTypingIndicator();
        addMessage('ai', response);
        chatManager.addMessageToActiveChat('ai', response);
        refreshUI();
    }

    function refreshUI() {
        renderChatList(chatManager.state.chats, chatManager.getActiveChatId());
        displayChat(chatManager.getActiveChatHistory());
        const tools = chatManager.getActiveChatTools();
        toggleToolsButton(Object.values(tools).some(arr => arr && arr.length > 0));
    }

    async function checkAgents() {
        const pattern = chatManager.checkForWithdrawalPattern();
        if (pattern) {
             showTypingIndicator();
             const msg = await chatManager.triggerReEngagement(pattern);
             hideTypingIndicator();
             if (msg) { addMessage('ai', msg); refreshUI(); }
        }
    }

    // --- Event Listeners ---
    userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSendMessage(); });
    sendButton.addEventListener('click', () => handleSendMessage());
    newChatButton.addEventListener('click', () => { chatManager.createNewChat(); refreshUI(); });
    
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            attachedFile = file;
            const ind = document.getElementById('fileAttachmentIndicator');
            ind.innerHTML = `<span>${file.name}</span><button id="removeFile" class="ml-2 text-gray-500 hover:text-white">&times;</button>`;
            ind.classList.remove('hidden');
            document.getElementById('removeFile').onclick = () => { attachedFile = null; ind.classList.add('hidden'); };
        }
    });

    chatListContainer.addEventListener('click', (e) => {
        const delBtn = e.target.closest('.delete-chat-button');
        const tab = e.target.closest('[data-chat-id]');
        if (delBtn) {
            if (confirm('Delete chat?')) { chatManager.deleteChat(delBtn.dataset.chatId); refreshUI(); }
        } else if (tab && tab.dataset.chatId !== chatManager.getActiveChatId()) {
            chatManager.setActiveChat(tab.dataset.chatId); refreshUI(); checkAgents();
        }
    });

    toolsButton.addEventListener('click', () => { renderToolsInModal(chatManager.getActiveChatTools()); openToolsModal(); });
    document.getElementById('closeToolsButton').addEventListener('click', closeToolsModal);
    
    // Insights listeners
    if (insightsButton) insightsButton.addEventListener('click', openInsightsModal);
    document.getElementById('closeInsightsButton').addEventListener('click', closeInsightsModal);

    // Tool interactions
    document.getElementById('toolsModalContent').addEventListener('click', async (e) => {
        const target = e.target.closest('[data-action]');
        if (!target) return;
        const action = target.dataset.action;
        
        if (action === 'log_mood') {
            chatManager.logMoodToTracker(target.dataset.mood);
            closeToolsModal(); await triggerAIFollowUp({ type: 'mood_logged', mood: target.dataset.mood });
        } else if (action === 'commit_affirmation') {
            target.textContent = 'Committed!'; target.disabled = true;
        } else if (action === 'save_thought_record') {
            const card = target.closest('.thought-record-card');
            const data = {};
            card.querySelectorAll('textarea').forEach(t => data[t.dataset.field] = t.value);
            chatManager.updateThoughtRecord(target.dataset.toolId, data);
            target.textContent = 'Saved!'; setTimeout(() => target.textContent = 'Save Record', 1500);
        }
    });

    document.getElementById('toolsModalContent').addEventListener('change', async (e) => {
        if (e.target.type === 'checkbox' && e.target.dataset.toolType === 'checklist') {
            const text = chatManager.completeAndRemoveChecklistItem(e.target.dataset.toolId, parseInt(e.target.dataset.itemIndex));
            if (text) { closeToolsModal(); await triggerAIFollowUp({ type: 'checklist_item_completed', text }); }
        }
    });

    document.body.addEventListener('click', async (e) => {
        const target = e.target.closest('a.content-link');
        if (target && target.dataset.topic) {
            e.preventDefault();
            const content = await fetchMarkdownContent(target.dataset.topic);
            if (content) showContentModal(target.dataset.topic.replace(/-/g, ' '), content);
        }
    });

    refreshUI();
    checkAgents();
});