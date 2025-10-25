// chat-logic.js
// This file is the "brain" of Aura. It manages all chat state (like history
// and tools), handles generating AI-powered tools, and contains the core
// logic for our proactive agents.

// --- App-wide Constants & Configuration ---

// Keys for storing user settings in the browser's localStorage.
const PROMPT_STORAGE_KEY = 'aura_system_prompt';
const VOICE_STORAGE_KEY = 'aura_voice_name';
const MODEL_STORAGE_KEY = 'aura_model_name';

// --- Crisis Intervention Agent (2-Stage) ---

// 1. The "Watchdog" Prompt: Classifies a message as 'CRISIS' or 'OK'.
const DETECTION_PROMPT = `You are a crisis detection classifier. The user has already indicated they are in a distressed state.
Analyze the following user message for any sign of suicidal ideation, self-harm, or hopelessness.
The user's message is:
---
%MESSAGE%
---
Does this message contain a crisis signal? Respond with ONLY the word 'CRISIS' or 'OK'.`;

// 2. The "Response" Prompt: Used *after* a crisis is detected.
const CRISIS_SYSTEM_PROMPT = `You are a safety-focused AI. A user is in significant distress. Your ONLY task is to write a single, brief, calm message.

// --- ABSOLUTE RULES ---
// - You MUST be direct and calm.
// - You MUST acknowledge the user is in distress, based ONLY on the context provided.
// - You MUST immediately guide the user to the tools that have been opened for them (a Breathing Exercise and a Safety Plan).
// - You MUST NOT offer advice, ask open-ended questions, or make promises like "it will be okay."
// - Keep your response to 2-3 short sentences.`;
// --- End Crisis Agent ---

// --- NEW: Re-Engagement Agent Prompt ---
// This prompt is for the agent that speaks first when it detects
// a user is "stuck" or "withdrawn".
const RE_ENGAGEMENT_PROMPT = `You are Aura. The user has not engaged with this chat for %DAYS% days and may be feeling overwhelmed (%REASON%).
Your goal is to be gentle, supportive, and non-judgmental.

// --- YOUR TASK ---
// 1. Acknowledge it's been a bit, and state that this is completely okay.
// 2. Proactively create a *new*, simple 'checklist' tool. The theme should be 'One small, easy step for today'.
// 3. Embed the \`<tool_create type="checklist" theme="One small, easy step for today" />\` tag.
// 4. Gently let the user know you've created this simple, one-item list to make it easier to start again.
// 5. Keep the message warm and brief.`;
// --- End Re-Engagement Agent ---


// The default "brain" for Aura.
const DEFAULT_SYSTEM_PROMPT = `You are a friendly and helpful assistant named Aura. You are an expert in mental health and project planning. Your goal is to be supportive, empathetic, and proactive.

// =================================================================
// --- NEW: DOCUMENT ANALYSIS ---
// =================================================================
// You may receive text content from a user's uploaded document, such as a doctor's note, prefixed with '[Document Content]:'.
// You MUST use the information from this document to provide more tailored, specific, and relevant advice or summaries.
// Synthesize the document's information into your response naturally. DO NOT simply repeat the document's content back to the user.
// If the document is present, your recommendations should be directly influenced by its contents.

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
const DEFAULT_MODEL = 'gpt-oss:120b-cloud';
const DEFAULT_EMBEDDING_MODEL = 'mxbai-embed-large:latest';
const STATE_STORAGE_KEY = 'multi_chat_app_state';
const OLLAMA_API_BASE_URL = 'http://localhost:11434';

/**
 * Manages all application state, including chats, history, and tools.
 * This is the single source of truth for the app.
 */
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
            completed_tasks: [], // Tracks completed checklist items
            
            // --- Agent State Variables ---
            isHeightenedAwareness: false, // For the Crisis Agent
            lastUserMessageTimestamp: null, // For the Re-Engagement Agent
            reEngagementTriggered: false // Prevents Re-Engagement loops
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
                // Find the next most recent chat to make active
                const chatIds = Object.keys(this.state.chats).sort((a, b) => b - a);
                this.state.activeChatId = chatIds.length > 0 ? chatIds[0] : null;
                // If no chats are left, create a new one
                if (!this.state.activeChatId) {
                    this.createNewChat();
                }
            }
            this.saveState();
        }
    }

    addMessageToActiveChat(role, content) {
        if (this.state.activeChatId) {
            const activeChat = this.state.chats[this.state.activeChatId];
            activeChat.history.push({ role, content });
            
            // Set the chat title from the first user message
            if (activeChat.history.length === 1 && role === 'user') {
                activeChat.title = content.substring(0, 20) + '...';
            }

            // If the user sends a message, update their timestamp and
            // reset the re-engagement agent.
            if (role === 'user') {
                activeChat.lastUserMessageTimestamp = Date.now();
                activeChat.reEngagementTriggered = false;
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
            // Ensure the tool type is an array
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
        // Keep the history log from getting too long
        if(moodTracker.history.length > 10) {
            moodTracker.history.shift();
        }
        
        // --- This is the "Arming" stage of the safety agent ---
        const negativeMoods = ["Sad", "Angry"];
        const positiveMoods = ["Happy", "Okay", "Neutral"];

        if (negativeMoods.includes(mood)) {
            this.setHeightenedAwareness(true);
            console.log("Heightened Awareness ENABLED.");
        } else if (positiveMoods.includes(mood)) {
            this.setHeightenedAwareness(false);
            console.log("Heightened Awareness DISABLED.");
        }
        
        this.saveState();
    }

    completeAndRemoveChecklistItem(toolId, itemIndex) {
        const activeChat = this.state.chats[this.state.activeChatId];
        if (!activeChat || !activeChat.tools || !activeChat.tools.checklist) return null;

        const checklistArray = activeChat.tools.checklist;
        // Find the specific checklist this item belongs to
        const toolIndex = checklistArray.findIndex(list => list.id === toolId);
        if (toolIndex === -1) return null;
        
        const checklist = checklistArray[toolIndex];
        // Remove the item from its list
        const [completedItem] = checklist.items.splice(itemIndex, 1);
        
        // If the checklist is now empty, remove it
        if (checklist.items.length === 0) {
            checklistArray.splice(toolIndex, 1);
        }
        
        // Log the completed task text for the Reflective Agent
        activeChat.completed_tasks.push(completedItem.text);
        if (activeChat.completed_tasks.length > 20) {
            activeChat.completed_tasks.shift(); // Keep list manageable
        }
        
        this.saveState();
        return completedItem.text;
    }

    // --- Data Gathering for Agents ---
    // Gathers all relevant data for both Reflective and Re-Engagement agents
    getAnalysisData() {
        if (!this.state.activeChatId) return null;
        const activeChat = this.state.chats[this.state.activeChatId];
        if (!activeChat) return null;

        let moodHistory = [];
        if (activeChat.tools && activeChat.tools.mood_tracker && activeChat.tools.mood_tracker[0]) {
            moodHistory = activeChat.tools.mood_tracker[0].history || [];
        }

        const completedTasks = activeChat.completed_tasks || [];

        let openTasks = [];
        if (activeChat.tools && activeChat.tools.checklist) {
            activeChat.tools.checklist.forEach(list => {
                list.items.forEach(item => {
                    if (!item.done) {
                        openTasks.push(item.text);
                    }
                });
            });
        }

        // Find any document context from the chat history
        let docContext = [];
        activeChat.history.forEach(msg => {
            if (msg.role === 'user' && msg.content.includes('[Attached:')) {
                docContext.push(msg.content.split('\n')[0]); // Get just the attachment line
            }
        });

        return {
            moodHistory,
            completedTasks,
            openTasks: openTasks, // We pass the full array now
            docContext: docContext.join('\n')
        };
    }

    // --- Crisis Intervention Agent Methods ---
    
    // Gets the awareness state for the active chat
    isChatInHeightenedAwareness() {
        if (this.state.activeChatId && this.state.chats[this.state.activeChatId]) {
            return this.state.chats[this.state.activeChatId].isHeightenedAwareness;
        }
        return false;
    }
    
    // Sets the awareness state for the active chat
    setHeightenedAwareness(value) {
        if (this.state.activeChatId && this.state.chats[this.state.activeChatId]) {
            this.state.chats[this.state.activeChatId].isHeightenedAwareness = value;
            this.saveState();
        }
    }

    /**
     * This is the "watchdog" function. It pre-screens a user's message
     * *if* the app is in heightened awareness.
     * @param {string} messageText - The user's typed message.
     * @returns {string} - 'CRISIS' or 'OK'
     */
    async preScreenMessage(messageText) {
        // If we're not in heightened awareness, don't do anything.
        if (!this.isChatInHeightenedAwareness()) {
            return 'OK';
        }
        
        // If we *are* in heightened awareness, ask the LLM to classify the message
        console.log("Heightened Awareness active. Pre-screening message...");
        const prompt = DETECTION_PROMPT.replace('%MESSAGE%', messageText);
        
        try {
            const modelToUse = getModelName();
            const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelToUse, prompt: prompt, stream: false })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            const result = data.response.trim().toUpperCase();
            
            if (result.includes('CRISIS')) {
                console.log("Watchdog detected: CRISIS");
                return 'CRISIS';
            } else {
                console.log("Watchdog detected: OK");
                return 'OK';
            }
        } catch (error) {
            console.error("Error in preScreenMessage, failing safe:", error);
            return 'OK'; // If the check fails, we must fail-safe and not block the user.
        }
    }

    /**
     * This is the agent's main action. It takes control from the normal
     * chat flow, generates safety tools, and crafts a safe AI response.
     * This is now *only* called after preScreenMessage returns 'CRISIS'.
     */
    async triggerSafetyIntervention(crisisMessageText) {
        // 1. Generate safety tools immediately.
        const breathToolPromise = createToolByType('breathing_exercise');
        const safetyPlanPromise = createSafetyPlanTool(); // Our AI-powered safety plan
        
        const [breathTool, safetyPlan] = await Promise.all([breathToolPromise, safetyPlanPromise]);
        
        // 2. Add the tools to the state
        this.addOrUpdateToolInActiveChat('breathing_exercise', breathTool);
        this.addOrUpdateToolInActiveChat('checklist', safetyPlan);

        // 3. Prepare the safe, constrained AI prompt
        const context = `Context: The user is in a distressed state. Your detection system has flagged their last message as a potential crisis. The message was: "${crisisMessageText}"`;
        const prompt = `${CRISIS_SYSTEM_PROMPT}\n\n${context}\n\nNow, write the message.`;

        // 4. Make the constrained AI call
        const modelToUse = getModelName();
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelToUse, prompt: prompt, stream: false })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const data = await response.json();
        const safeMessage = data.response.trim();

        // 5. Add to history and return the message for the UI
        this.addMessageToActiveChat('ai', safeMessage);
        return safeMessage;
    }
    
    // --- Re-Engagement Agent Methods ---
    
    /**
     * Checks if the user has "withdrawn" from the current chat.
     * This is called when a chat is loaded.
     */
    checkForWithdrawalPattern() {
        if (!this.state.activeChatId) return false;
        const activeChat = this.state.chats[this.state.activeChatId];
        
        // 1. Check if agent has already run or if it's a new chat
        if (activeChat.reEngagementTriggered) return false;
        if (!activeChat.lastUserMessageTimestamp) return false;
        
        // 2. Check time difference
        const now = Date.now();
        const diffDays = (now - activeChat.lastUserMessageTimestamp) / (1000 * 60 * 60 * 24);
        
        if (diffDays <= 3) { // 3-day grace period
            return false;
        }
        
        // 3. If it's been long enough, check the context
        const data = this.getAnalysisData();
        if (!data) return false;
        
        const lastMood = data.moodHistory.length > 0 ? data.moodHistory[data.moodHistory.length - 1].mood : null;
        const openTaskCount = data.openTasks.length;

        // Check for a "stuck" pattern
        const isStuck = (["Sad", "Angry"].includes(lastMood) || openTaskCount >= 5);
        
        if (isStuck) {
            // We have a match. Return the reason to help the AI.
            const reason = lastMood ? `their last mood was "${lastMood}"` : `they have ${openTaskCount} open tasks`;
            return {
                days: Math.round(diffDays),
                reason: reason
            };
        }
        
        return false;
    }

    /**
     * This is the Re-Engagement Agent's main action. It crafts a
     * gentle message and creates a new, simple tool.
     */
    async triggerReEngagement(pattern) {
        if (!this.state.activeChatId) return;
        
        // 1. Set the flag to prevent this from running again
        this.state.chats[this.state.activeChatId].reEngagementTriggered = true;
        this.saveState();
        
        // 2. Prepare the AI prompt
        const prompt = RE_ENGAGEMENT_PROMPT
            .replace('%DAYS%', pattern.days)
            .replace('%REASON%', pattern.reason);
        
        // 3. Call the LLM
        try {
            const modelToUse = getModelName();
            const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelToUse, prompt: prompt, stream: false })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            const rawResponse = data.response.trim();

            // 4. Process the response for the tool it *must* create
            const toolTagRegex = /<tool_create\s+type="([^"]+)"(?:\s+theme="([^"]+)")?\s*\/>/g;
            let cleanedResponse = rawResponse;
            const match = toolTagRegex.exec(rawResponse); // We only expect one
            
            if (match) {
                const toolType = match[1];
                const toolTheme = match[2] || '';
                const toolData = await createToolByType(toolType, toolTheme);
                if (toolData) {
                    // Let's make sure it's a 1-item list, as requested
                    if (toolType === 'checklist' && toolData.items.length > 1) {
                        toolData.items = [toolData.items[0]]; // Only keep the first item
                    }
                    this.addOrUpdateToolInActiveChat(toolType, toolData);
                }
                cleanedResponse = cleanedResponse.replace(match[0], '').trim();
            }

            // 5. Add the AI's message to the chat
            this.addMessageToActiveChat('ai', cleanedResponse);
            return cleanedResponse;
            
        } catch (error) {
            console.error("Error during re-engagement:", error);
            // If it fails, undo the trigger flag so it can try again next time
            this.state.chats[this.state.activeChatId].reEngagementTriggered = false;
            this.saveState();
            return null;
        }
    }


    // --- Getters ---
    getActiveChatHistory() { return this.state.activeChatId ? this.state.chats[this.state.activeChatId].history : []; }
    getActiveChatId() { return this.state.activeChatId; }
}

/**
 * A generic function to ask the AI to generate JSON for a tool.
 * This is the foundation for all our AI-powered tools.
 * @param {string} prompt - The specific prompt for the LLM.
 * @returns {object | null} - The parsed JSON object or null on error.
 */
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

/**
 * Generates the JSON for our crisis-specific safety plan.
 * We trust the LLM to generate the plan's *items*.
 */
async function createSafetyPlanTool() {
    const prompt = `You are an AI assistant that creates JSON for a "Safety Plan Checklist" tool.
- This is for a user in an acute mental health crisis.
- The title MUST be "Immediate Safety Plan".
- Create exactly 5 simple, actionable, grounding items.
- Examples: "Take 5 deep breaths", "Name 3 things you can see", "Hold a piece of ice".
- Your output MUST be only the raw JSON object with this exact structure: { "type": "checklist", "id": "safety-${Date.now()}", "title": "Immediate Safety Plan", "items": [{"text": "...", "done": false}, ...] }`;
    return await generateToolJson(prompt);
}

/**
 * Creates a tool based on its type and an optional theme.
 * This is called by the main AI response parser.
 */
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
- If the theme is 'One small, easy step for today', create ONLY ONE item.
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

/**
 * Converts the current state of all tools into a plain string.
 * This is fed to the AI as context in every message.
 */
function toolsToString(tools) {
    let toolString = '';
    // Define a consistent order
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

/**
 * Formats the raw analysis data for the Reflective Agent's prompt.
 */
function formatReviewDataForAI(data) {
    let summary = "Data Summary:\n";
    summary += `- Completed Tasks: ${data.completedTasks.length > 0 ? data.completedTasks.join(', ') : 'None'}\n`;
    summary += `- Open Tasks: ${data.openTasks.length > 0 ? data.openTasks.map(t => `"${t}"`).join(', ') : 'None'}\n`;
    
    if (data.moodHistory.length > 0) {
        const recentMoods = data.moodHistory.slice(-5).map(m => m.mood).join(', ');
        summary += `- Recent Moods: ${recentMoods}\n`;
    }
    if (data.docContext) {
        summary += `- Project Context: ${data.docContext}\n`;
    }
    return summary;
}

/**
 * This is the Reflective Agent's main action. It gets data,
 * formats it, and asks the AI to synthesize it.
 */
async function runReflectiveReview() {
    const data = chatManager.getAnalysisData();
    if (!data) return "Sorry, I couldn't find any data to review.";

    const dataSummary = formatReviewDataForAI(data);
    
    const REFLECTIVE_PROMPT = `You are Aura. A user has asked for a review of their progress. Your task is to synthesize the following data into a single, supportive summary.

// --- DATA SUMMARY ---
${dataSummary}
// --- END OF DATA ---

Based on this data, first, write a brief, encouraging summary of their progress.

Second, decide if a new tool would help them.
- If they have many open tasks and seem stressed (e.g., "Sad" moods), create an 'affirmation_card' for motivation.
- If they have completed many tasks and seem positive (e.g., "Happy" moods), create a new 'checklist' for 'Next Steps'.

If you create a tool, embed the tag <tool_create type="..." theme="..."/> at the end of your summary.
Speak directly to the user.`;

    try {
        const modelToUse = getModelName();
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelToUse, prompt: REFLECTIVE_PROMPT, stream: false })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

        const responseData = await response.json();
        const rawResponse = responseData.response.trim();

        // We need to process the response for any tools it decided to create
        const toolTagRegex = /<tool_create\s+type="([^"]+)"(?:\s+theme="([^"]+)")?\s*\/>/g;
        let cleanedResponse = rawResponse;
        const matchedTags = [...rawResponse.matchAll(toolTagRegex)];

        if (matchedTags.length > 0) {
            for (const match of matchedTags) {
                const toolType = match[1];
                const toolTheme = match[2] || '';
                const toolData = await createToolByType(toolType, toolTheme);
                if (toolData) chatManager.addOrUpdateToolInActiveChat(toolType, toolData);
                cleanedResponse = cleanedResponse.replace(match[0], '').trim();
            }
        }

        // Save the AI's summary to our chat history
        chatManager.addMessageToActiveChat('ai', cleanedResponse);
        return cleanedResponse;

    } catch (error) {
        console.error("Reflective Review AI call failed:", error);
        // Let the main handler inform the user
        throw error;
    }
}


/**
 * The main function for getting a response from the AI.
 * This is used for all *normal* conversation.
 */
async function getOllamaResponse(prompt, toolFollowUp = null, documentText = null) {
    const modelToUse = getModelName();
    const systemPrompt = getSystemPrompt();
    const chatHistory = chatManager.getActiveChatHistory();
    const activeTools = chatManager.getActiveChatTools();
    const toolsStateString = toolsToString(activeTools);
    
    let userPromptSegment = '';
    
    // Add document context if it exists
    if (documentText) {
        userPromptSegment += `[Document Content]:\n${documentText}\n\n`;
    }

    // Check if this is a follow-up to a tool interaction
    if (toolFollowUp) {
        if (toolFollowUp.type === 'mood_logged') {
            userPromptSegment += `[System Note: The user just logged their mood as "${toolFollowUp.mood}". Respond with empathy and ask an open-ended question about it.]`;
        } else if (toolFollowUp.type === 'checklist_item_completed') {
            userPromptSegment += `[System Note: The user just completed the task "${toolFollowUp.text}" from their checklist. Acknowledge this specific accomplishment and offer encouragement.]`;
        } else if (toolFollowUp.type === 'breathing_complete') {
            userPromptSegment += `[System Note: The user just finished a breathing exercise. Gently ask how they are feeling now.]`;
        }
    } else {
        // Otherwise, it's a standard user message
        userPromptSegment += `User: ${prompt}`;
    }
    
    // Assemble the final prompt with all context
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

// --- Utility Functions ---

function historyToString(history) {
    return history.map(m => {
        return `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`;
    }).join('\n');
}

// --- Settings Getters/Setters ---

function getSystemPrompt() { return localStorage.getItem(PROMPT_STORAGE_KEY) || DEFAULT_SYSTEM_PROMPT; }
function saveSystemPrompt(prompt) { localStorage.setItem(PROMPT_STORAGE_KEY, prompt); }
function getVoiceName() { return localStorage.getItem(VOICE_STORAGE_KEY); }
function saveVoiceName(voiceName) { localStorage.setItem(VOICE_STORAGE_KEY, voiceName); }
function getModelName() { return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL; }
function saveModelName(modelName) { localStorage.setItem(MODEL_STORAGE_KEY, modelName); }
function getDefaultSystemPrompt() { return DEFAULT_SYSTEM_PROMPT; }

// --- App Initialization ---
// Create the one and only chat manager instance
const chatManager = new ChatManager();