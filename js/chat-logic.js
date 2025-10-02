// chat-logic.js
// This file holds the core client-side logic for Aura. It manages chat state,
// tool interactions, and communication with the Ollama API.

// --- App-wide Constants & Configuration ---

// Keys for storing user settings in the browser's localStorage.
const PROMPT_STORAGE_KEY = 'aura_system_prompt';
const VOICE_STORAGE_KEY = 'aura_voice_name';
const MODEL_STORAGE_KEY = 'aura_model_name';

// The default "brain" for Aura. This detailed prompt defines its persona, rules, and capabilities.
const DEFAULT_SYSTEM_PROMPT = `You are a friendly and helpful assistant named Aura. You are an expert in mental health and project planning. Your goal is to be supportive, empathetic, and proactive.

// =================================================================
// --- CORE BEHAVIOR: PROACTIVE TOOL CREATION & FOLLOW-UP ---
// =================================================================
// **1. Tool Creation**
// You can create tools for the user. When a tool is needed, embed a special XML tag in your response: \`<tool_create type="[tool_name]" theme="[optional_theme]" />\`.
// The user will not see this tag. Your conversational text should naturally lead into the tool's creation.

// **2. Tool Follow-Up**
// When the user interacts with a tool (e.g., logs a mood, completes a task), you will receive a [System Note] with that information.
// You MUST respond conversationally to the System Note. For example, if the user logs their mood as "Sad", offer empathy. If they complete a task, congratulate them.

**--- AVAILABLE TOOLS AND THEIR TRIGGERS ---**

1.  **Mood Tracker**
    -   **Type:** \`mood_tracker\`
    -   **Trigger:** Use this the FIRST time a user states a strong, simple emotion (e.g., "I feel sad," "I'm so happy").
    -   **Condition:** DO NOT use this tag if a Mood Tracker tool already exists in the [Current Toolbox State].
    -   **Example Tag:** \`<tool_create type="mood_tracker" />\`

2.  **Checklist**
    -   **Type:** \`checklist\`
    -   **Trigger:** Use this when a user wants a plan, needs to organize tasks, sets a goal, or feels stuck.
    -   **Theme:** The \`theme\` attribute should be the topic of the checklist.
    -   **Example Tag:** \`<tool_create type="checklist" theme="plan the user's upcoming beach trip" />\`

3.  **Affirmation Card**
    -   **Type:** \`affirmation_card\`
    -   **Trigger:** Use this when a user expresses self-doubt, needs motivation, or feels discouraged.
    -   **Theme:** The \`theme\` attribute should be the reason for the affirmation.
    -   **Example Tag:** \`<tool_create type="affirmation_card" theme="building confidence for a new job" />\`

4.  **Breathing Exercise**
    -   **Type:** \`breathing_exercise\`
    -   **Trigger:** Use this when a user expresses feelings of high stress, anxiety, or panic.
    -   **Example Tag:** \`<tool_create type="breathing_exercise" />\`

// =================================================================
// --- CONVERSATIONAL STYLE ---
// =================================================================
- Your tone is warm, encouraging, and relaxed. Use contractions (you're, it's, let's).
- Be supportive and proactive. Confidently create tools you think will help and then inform the user what you've done.`;
const DEFAULT_MODEL = 'gemma3:4b';
const DEFAULT_EMBEDDING_MODEL = 'mxbai-embed-large:latest';
const STATE_STORAGE_KEY = 'multi_chat_app_state';
const OLLAMA_API_BASE_URL = 'http://localhost:11434';

class ChatManager {
    constructor() {
        this.state = this.loadState() || {
            chats: {},
            activeChatId: null
        };
        if (!this.state.activeChatId) {
            this.createNewChat();
        }
    }

    loadState() {
        try {
            const serializedState = localStorage.getItem(STATE_STORAGE_KEY);
            return serializedState ? JSON.parse(serializedState) : null;
        } catch (error) {
            console.error("Error loading state from localStorage:", error);
            return null;
        }
    }

    saveState() {
        try {
            const serializedState = JSON.stringify(this.state);
            localStorage.setItem(STATE_STORAGE_KEY, serializedState);
        } catch (error) {
            console.error("Error saving state to localStorage:", error);
        }
    }

    createNewChat() {
        const newChatId = Date.now().toString();
        this.state.chats[newChatId] = {
            id: newChatId,
            title: 'New Chat',
            history: [],
            memories: [],
            tools: {},
            completed_tasks: []
        };
        this.state.activeChatId = newChatId;
        this.saveState();
    }
    
    setActiveChat(chatId) {
        if (this.state.chats[chatId]) {
            this.state.activeChatId = chatId;
            this.saveState();
        }
    }

    deleteChat(chatId) {
        if (this.state.chats[chatId]) {
            delete this.state.chats[chatId];
            if (this.state.activeChatId === chatId) {
                const chatIds = Object.keys(this.state.chats).sort((a, b) => b - a);
                this.state.activeChatId = chatIds.length > 0 ? chatIds[0] : null;
                if (!this.state.activeChatId) {
                    this.createNewChat();
                }
            }
            this.saveState();
        }
    }

    addMessageToActiveChat(role, content) {
        if (this.state.activeChatId) {
            const history = this.state.chats[this.state.activeChatId].history;
            history.push({ role, content });
            if (history.length === 1 && role === 'user') {
                this.state.chats[this.state.activeChatId].title = content.substring(0, 20) + '...';
            }
            this.saveState();
        }
    }
    
    addOrUpdateToolInActiveChat(toolName, toolData) {
        if (this.state.activeChatId && this.state.chats[this.state.activeChatId]) {
            const activeChat = this.state.chats[this.state.activeChatId];
            if (!activeChat.tools) {
                activeChat.tools = {};
            }
            if (!Array.isArray(activeChat.tools[toolName])) {
                activeChat.tools[toolName] = [];
            }
            activeChat.tools[toolName].push(toolData);
            this.saveState();
        }
    }
    
    getActiveChatTools() {
        if (this.state.activeChatId && this.state.chats[this.state.activeChatId]) {
            return this.state.chats[this.state.activeChatId].tools || {};
        }
        return {};
    }
    
    logMoodToTracker(mood) {
        const activeChat = this.state.chats[this.state.activeChatId];
        if (!activeChat || !activeChat.tools || !activeChat.tools.mood_tracker || activeChat.tools.mood_tracker.length === 0) {
            return;
        }
        const moodTracker = activeChat.tools.mood_tracker[0];
        if (!moodTracker.history) {
            moodTracker.history = [];
        }
        moodTracker.history.push({ mood: mood, timestamp: new Date().toISOString() });
        if(moodTracker.history.length > 10) {
            moodTracker.history.shift();
        }
        this.saveState();
    }

    completeAndRemoveChecklistItem(toolId, itemIndex) {
        const activeChat = this.state.chats[this.state.activeChatId];
        if (!activeChat || !activeChat.tools || !activeChat.tools.checklist) return null;
        const checklistArray = activeChat.tools.checklist;
        const toolIndex = checklistArray.findIndex(list => list.id === toolId);
        if (toolIndex === -1) return null;
        const checklist = checklistArray[toolIndex];
        const [completedItem] = checklist.items.splice(itemIndex, 1);
        if (checklist.items.length === 0) {
            checklistArray.splice(toolIndex, 1);
        }
        activeChat.completed_tasks.push(completedItem.text);
        if (activeChat.completed_tasks.length > 20) {
            activeChat.completed_tasks.shift();
        }
        this.saveState();
        return completedItem.text;
    }

    getActiveChatHistory() { return this.state.activeChatId ? this.state.chats[this.state.activeChatId].history : []; }
    getActiveChatId() { return this.state.activeChatId; }
}

async function generateToolJson(prompt) {
    const modelToUse = getModelName();
    try {
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelToUse, prompt, stream: false, format: 'json' })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return JSON.parse(data.response);
    } catch (error) {
        console.error('Error generating tool JSON:', error);
        return null;
    }
}

async function createToolByType(type, theme = '') {
    switch (type) {
        case 'mood_tracker': {
            const prompt = `You are an AI assistant that creates JSON for a "Mood Tracker" tool.
- Your output MUST be only the raw JSON object.
- The object must have this exact structure: { "type": "mood_tracker", "id": "mood-${Date.now()}", "title": "Your Mood Tracker", "options": ["Happy", "Okay", "Neutral", "Sad", "Angry"], "history": [] }`;
            return await generateToolJson(prompt);
        }
        case 'checklist': {
            const prompt = `An AI assistant needs to create a checklist for a user based on the theme: "${theme}".
- Create a friendly, encouraging title for the checklist.
- Create 3 to 5 short, actionable checklist items.
- Your output MUST be only the raw JSON object with this exact structure: { "type": "checklist", "id": "checklist-${Date.now()}", "title": "...", "items": [{"text": "...", "done": false}] }`;
            return await generateToolJson(prompt);
        }
        case 'affirmation_card': {
             const prompt = `You are an AI assistant that creates JSON for an "Affirmation Card".
- The theme is: "${theme}".
- Generate a friendly, encouraging title.
- Generate an array of 2-3 short, powerful affirmation strings for the "text" property.
- Your output MUST be only the raw JSON object with this exact structure: { "type": "affirmation_card", "id": "affirm-${Date.now()}", "title": "...", "text": ["...", "..."], "buttonText": "I will remember this." }`;
            return await generateToolJson(prompt);
        }
        case 'breathing_exercise': {
            const prompt = `Create a JSON object for a standard breathing exercise. The output must be ONLY the raw JSON object with this exact structure: { "type": "breathing_exercise", "id": "breathe-${Date.now()}", "title": "A Quick Breathing Exercise", "cycle": { "inhale": 4, "hold": 4, "exhale": 6 } }`;
            return await generateToolJson(prompt);
        }
        default:
            return null;
    }
}

function toolsToString(tools) {
    let toolString = '';
    const toolOrder = ['mood_tracker', 'checklist', 'affirmation_card', 'breathing_exercise'];

    toolOrder.forEach(toolName => {
        if (tools[toolName] && tools[toolName].length > 0) {
            tools[toolName].forEach(toolInstance => {
                switch (toolName) {
                    case 'mood_tracker':
                         toolString += `- Mood Tracker: "${toolInstance.title}" is available.\n`;
                         break;
                    case 'checklist':
                        toolString += `- Checklist: "${toolInstance.title}"\n`;
                        toolInstance.items.forEach((item, index) => {
                            toolString += `  ${index + 1}. ${item.text}\n`;
                        });
                        break;
                    case 'affirmation_card':
                        toolString += `- Affirmation Card: "${toolInstance.title}"\n`;
                        if (Array.isArray(toolInstance.text)) {
                            toolInstance.text.forEach(affirmation => {
                                toolString += `  - "${affirmation}"\n`;
                            });
                        }
                        break;
                    case 'breathing_exercise':
                        toolString += `- Breathing Exercise: "${toolInstance.title}" is available.\n`;
                        break;
                }
            });
        }
    });

    return toolString.trim() || 'None';
}

async function getOllamaResponse(prompt, toolFollowUp = null) {
    const modelToUse = getModelName();
    const systemPrompt = getSystemPrompt();
    const chatHistory = chatManager.getActiveChatHistory();
    const activeTools = chatManager.getActiveChatTools();
    const toolsStateString = toolsToString(activeTools);
    
    let userPromptSegment = `User: ${prompt}`;

    if (toolFollowUp) {
        if (toolFollowUp.type === 'mood_logged') {
            userPromptSegment = `[System Note: The user just logged their mood as "${toolFollowUp.mood}". Respond with empathy and ask an open-ended question about it.]`;
        } else if (toolFollowUp.type === 'checklist_item_completed') {
            userPromptSegment = `[System Note: The user just completed the task "${toolFollowUp.text}" from their checklist. Acknowledge this specific accomplishment and offer encouragement.]`;
        } else if (toolFollowUp.type === 'breathing_complete') {
            userPromptSegment = `[System Note: The user just finished a breathing exercise. Gently ask how they are feeling now.]`;
        }
    }
    
    const fullPrompt = `${systemPrompt}\n\n[Current Toolbox State]:\n${toolsStateString}\n\n[Conversation History]:\n${historyToString(chatHistory)}\n\n${userPromptSegment}`;

    try {
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelToUse, prompt: fullPrompt, stream: false })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data.response.trim();
    } catch (error) {
        console.error('Error in getOllamaResponse:', error);
        return `I'm sorry, an error occurred: ${error.message}`;
    }
}

function historyToString(history) {
    return history.map(m => {
        return `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`;
    }).join('\n');
}

function getSystemPrompt() { return localStorage.getItem(PROMPT_STORAGE_KEY) || DEFAULT_SYSTEM_PROMPT; }
function saveSystemPrompt(prompt) { localStorage.setItem(PROMPT_STORAGE_KEY, prompt); }
function getVoiceName() { return localStorage.getItem(VOICE_STORAGE_KEY); }
function saveVoiceName(voiceName) { localStorage.setItem(VOICE_STORAGE_KEY, voiceName); }
function getModelName() { return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL; }
function saveModelName(modelName) { localStorage.setItem(MODEL_STORAGE_KEY, modelName); }
function getDefaultSystemPrompt() { return DEFAULT_SYSTEM_PROMPT; }

const chatManager = new ChatManager();