// chat-logic.js
// This file holds the core client-side logic for Aura. It manages chat state,
// tool interactions, and communication with the Ollama API.

// --- App-wide Constants & Configuration ---

// Keys for storing user settings in the browser's localStorage.
const PROMPT_STORAGE_KEY = 'aura_system_prompt';
const VOICE_STORAGE_KEY = 'aura_voice_name';
const MODEL_STORAGE_KEY = 'aura_model_name';

// The default "brain" for Aura. This detailed prompt defines its persona, rules, and capabilities.
const DEFAULT_SYSTEM_PROMPT = `You are a friendly and helpful assistant named Aura. You are an expert in two areas: 1) mental and physical health, and 2) project planning and task management. You are designed to be supportive, empathetic, and engaging. Your goal is to be as human-like as possible.

// =================================================================
// --- FACE-TO-FACE CONVERSATIONAL STYLE GUIDE ---
// =================================================================
**Your Vibe**: Your tone should always be warm, encouraging, and relaxed. Imagine you're having a friendly, face-to-face chat with a friend. You are not a formal, robotic assistant.
**Natural Language**: Use contractions (e.g., "you're," "it's," "let's") in every response. It's essential for a natural flow. Use discourse markers like "Well," "Right," or "So," to start sentences where it feels natural.
**Expressive Language**: Instead of using emojis, convey emotion and tone through your words. Use descriptive adjectives and adverbs. For example, instead of writing "That's great! 👍", say "Oh, that's genuinely wonderful to hear." or "That sounds like a fantastic plan."
**Be Proactive & Engaging**: Ask gentle, open-ended questions about how the user is feeling or what they're thinking. Proactively offer to help or brainstorm ideas.
**Personalized Sign-offs**: Keep your sign-offs varied, friendly, and context-aware. Instead of a generic closing, use something like "Take care!", "Talk soon!", or "Enjoy the rest of your day!"

// =================================================================
// --- CONVERSATIONAL RULES ---
// =================================================================
**Greeting Protocol**:
- When a new chat begins, your very first response should be a brief introduction.
- After this initial introduction, you MUST NOT introduce yourself again in the same chat. Simply continue the conversation naturally. Avoid starting follow-up messages with phrases like "Aura here."

**Sign-offs and Questions Protocol**:
- End your responses in a friendly, supportive way (e.g., "Take care!", "Let me know if you need anything else.").
- DO NOT end every message with a question like "How are you feeling?".
- Only ask a follow-up question if you genuinely need more specific information from the user to continue the conversation or provide better help. If the conversation has reached a natural conclusion, use a simple sign-off instead of a question.
// =================================================================

**Golden Rule of Proactivity**: Your primary goal is to be a helpful, proactive companion. When you identify a useful action the user can take (like a checklist item or a breathing exercise), DO NOT ask for permission. Instead, perform the action (e.g., add the item, create the tool) and then confidently inform the user what you have done. Frame it as a helpful step you are taking together.

**Core Agentic Instructions**: Your primary function is to understand the user's implicit needs from their language. You have a set of interactive tools at your disposal. Your goal is to proactively deploy the most appropriate tool to help the user, often without them needing to ask for it explicitly. Some tools are persistent (Checklist, Breathing Exercise, Affirmation Card) and should be offered when a user needs a resource they can return to. Other tools (Mood Tracker) are for in-the-moment interaction.

**Capabilities and Limitations**:
- You have a fixed set of tools. You can ONLY create or modify the tools explicitly listed in your instructions: Checklist, Breathing Exercise, Affirmation Card, and Mood Tracker.
- You CANNOT invent new tools or new categories of tools. For example, you cannot create a "Quick Calmers" section or a "Gratitude Journal".
- When offering a tool, you must use one of the existing tool types. Do not describe or promise functionality that you cannot actually execute. Stick strictly to your programmed abilities.

**Available Tools & Triggers**:
- **Web Search**: Use for facts, recommendations, or to gather information for other tools.
- **Checklist**: Offer when the user needs a concrete, multi-step plan or asks for actionable steps. This includes requests to create, change, or add to a list.
- **Breathing Exercise**: Offer when the user expresses feelings of high stress, anxiety, panic, or feeling overwhelmed. This is a persistent tool that can be saved to the Toolbox.
- **Mood Tracker**: Offer when a user states a strong feeling or emotion. This is a one-time, in-chat tool.
- **Affirmation Card**: Offer when a user expresses self-doubt, a lack of motivation, or states a new personal goal. This is a persistent tool that can be saved to the Toolbox.`;
const DEFAULT_MODEL = 'gemma3:4b';
const DEFAULT_EMBEDDING_MODEL = 'mxbai-embed-large:latest';
const STATE_STORAGE_KEY = 'multi_chat_app_state';
const OLLAMA_API_BASE_URL = 'http://localhost:11434';

/**
 * Manages the entire state of the chat application, including all conversations,
 * the active chat, and interactions with localStorage.
 */
class ChatManager {
    constructor() {
        this.state = this.loadState() || {
            chats: {},
            activeChatId: null
        };
        // If there's no active chat on load, create a fresh one.
        if (!this.state.activeChatId) {
            this.createNewChat();
        }
    }

    // Tries to load the app state from localStorage.
    loadState() {
        try {
            const serializedState = localStorage.getItem(STATE_STORAGE_KEY);
            return serializedState ? JSON.parse(serializedState) : null;
        } catch (error) {
            console.error("Error loading state from localStorage:", error);
            return null;
        }
    }

    // Saves the current app state to localStorage.
    saveState() {
        try {
            const serializedState = JSON.stringify(this.state);
            localStorage.setItem(STATE_STORAGE_KEY, serializedState);
        } catch (error) {
            console.error("Error saving state to localStorage:", error);
        }
    }

    // Creates a new, empty chat session and sets it as the active one.
    createNewChat() {
        const newChatId = Date.now().toString();
        this.state.chats[newChatId] = {
            id: newChatId,
            title: 'New Chat',
            history: [],
            memories: [],
            tools: {}, // The toolbox starts empty.
            completed_tasks: []
        };
        this.state.activeChatId = newChatId;
        this.saveState();
    }
    
    // Sets the currently active chat.
    setActiveChat(chatId) {
        if (this.state.chats[chatId]) {
            this.state.activeChatId = chatId;
            this.saveState();
        }
    }

    // Deletes a chat and switches to the next available one.
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

    // Adds a message (from user or AI) to the active chat's history.
    addMessageToActiveChat(role, content) {
        if (this.state.activeChatId) {
            const history = this.state.chats[this.state.activeChatId].history;
            history.push({ role, content });
            // If this is the first user message, use it to set the chat title.
            if (history.length === 1 && role === 'user') {
                this.state.chats[this.state.activeChatId].title = content.substring(0, 20) + '...';
            }
            this.saveState();
        }
    }
    
    /**
     * The magic happens here: this function now supports multiple tools of the same type.
     * Instead of overwriting, it adds the new tool to an array for that tool type.
     */
    addOrUpdateToolInActiveChat(toolName, toolData) {
        if (this.state.activeChatId && this.state.chats[this.state.activeChatId]) {
            const activeChat = this.state.chats[this.state.activeChatId];
            
            // This handles legacy chats from localStorage that might not have a `.tools` property.
            if (!activeChat.tools) {
                activeChat.tools = {};
            }
            // If an array for this tool type doesn't exist yet, create it.
            if (!Array.isArray(activeChat.tools[toolName])) {
                activeChat.tools[toolName] = [];
            }
            // Add the new tool to the array.
            activeChat.tools[toolName].push(toolData);
            this.saveState();
        }
    }
    
    // Gets the entire toolbox for the active chat.
    getActiveChatTools() {
        if (this.state.activeChatId && this.state.chats[this.state.activeChatId]) {
            // This handles legacy chats by returning an empty object if `.tools` is missing.
            return this.state.chats[this.state.activeChatId].tools || {};
        }
        return {};
    }

    // A helper to get the *first* checklist in the toolbox.
    getActiveChatChecklist() {
        const tools = this.getActiveChatTools();
        if (tools.checklist && tools.checklist.length > 0) {
            return tools.checklist[0];
        }
        return null;
    }
    
    /**
     * Completes a checklist item. It now requires the specific toolId to know
     * *which* checklist to modify in the toolbox.
     */
    completeAndRemoveChecklistItem(toolId, itemIndex) {
        const activeChat = this.state.chats[this.state.activeChatId];
        if (!activeChat || !activeChat.tools || !activeChat.tools.checklist) return null;

        const checklistArray = activeChat.tools.checklist;
        const toolIndex = checklistArray.findIndex(list => list.id === toolId);

        if (toolIndex === -1) return null; // Checklist wasn't found.

        const checklist = checklistArray[toolIndex];
        const [completedItem] = checklist.items.splice(itemIndex, 1);

        // For good housekeeping, if the checklist is now empty, we remove it entirely.
        if (checklist.items.length === 0) {
            checklistArray.splice(toolIndex, 1);
        }
        
        activeChat.completed_tasks.push(completedItem.text);
        if (activeChat.completed_tasks.length > 20) {
            activeChat.completed_tasks.shift(); // Keep the list tidy.
        }

        this.saveState();
        return completedItem.text;
    }

    // Adds a new item to the *first* checklist.
    addItemToActiveChecklist(itemsToAdd) {
        const checklist = this.getActiveChatChecklist();
        if (!checklist) return;

        if (Array.isArray(itemsToAdd)) {
            checklist.items.push(...itemsToAdd);
        } else {
            checklist.items.push({ text: itemsToAdd, done: false });
        }
        this.saveState();
    }

    // Adds a memory (text and its vector embedding) to the active chat.
    addMemoryToActiveChat(memoryObject) {
        if (this.state.activeChatId) {
            const activeChat = this.state.chats[this.state.activeChatId];
            activeChat.memories.push(memoryObject);
            this.saveState();
        }
    }

    getActiveChatHistory() {
        return this.state.activeChatId ? this.state.chats[this.state.activeChatId].history : [];
    }

    getActiveChatMemories() {
        if (this.state.activeChatId && this.state.chats[this.state.activeChatId]) {
            return this.state.chats[this.state.activeChatId].memories;
        }
        return [];
    }
    
    getActiveChatCompletedTasks() {
        if (this.state.activeChatId && this.state.chats[this.state.activeChatId]) {
            return this.state.chats[this.state.activeChatId].completed_tasks;
        }
        return [];
    }

    getActiveChatId() {
        return this.state.activeChatId;
    }
}

// --- Ollama Interaction & AI Logic ---

// Calls the Ollama API to get a vector embedding for a piece of text.
async function getEmbedding(text) {
    try {
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: DEFAULT_EMBEDDING_MODEL,
                prompt: text
            })
        });
        if (!response.ok) throw new Error(`Embedding API error! status: ${response.status}`);
        const data = await response.json();
        return data.embedding;
    } catch (error) {
        console.error('Error getting embedding:', error);
        return null;
    }
}

// Calculates the cosine similarity between two vectors.
function cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB) return 0;
    const dotProduct = vecA.reduce((sum, a, i) => sum + a * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return dotProduct / (magnitudeA * magnitudeB);
}

// Finds the most relevant memories from the current chat based on the user's query.
async function findRelevantMemories(queryText, topK = 4) {
    const memories = chatManager.getActiveChatMemories();
    if (memories.length === 0) return [];

    const queryEmbedding = await getEmbedding(queryText);
    if (!queryEmbedding) return [];

    const scoredMemories = memories
        .map(memory => {
            if (!memory.embedding) return { ...memory, score: 0 }; // Safety check
            const score = cosineSimilarity(queryEmbedding, memory.embedding);
            return { ...memory, score };
        })
        .sort((a, b) => b.score - a.score);

    return scoredMemories.slice(0, topK).map(mem => mem.text);
}

// A mock web search function. In a real app, this would call our backend server.
async function performWebSearch(query) {
    console.log(`Performing simulated web search for: "${query}"`);
    await new Promise(resolve => setTimeout(resolve, 1500));
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('stress') || lowerQuery.includes('anxiety')) {
        return `Web Search Results: Deep breathing exercises can calm the nervous system. A short 10-minute walk outside can improve mood. Listening to calming music reduces stress hormones. Journaling can provide clarity. Mindfulness helps ground you in the present.`;
    } else if (lowerQuery.includes('recommendations') && lowerQuery.includes('south jakarta')) {
        return `Web Search Results: Popular recommendations for places in South Jakarta include the modern COMO Park, the vibrant culinary scene in Senopati, and shopping malls like Pondok Indah Mall. For relaxation, many people enjoy the green spaces at GBK city park.`;
    } else if (lowerQuery.includes('weather')) {
         return `Web Search Results: The current weather in South Jakarta is partly cloudy with a temperature of 31°C.`;
    }
    return `Web Search Results: No specific information found for "${query}".`;
}

// Generates the JSON for a checklist using a dynamic prompt.
async function generateChecklistFromContext(topic, context, history) {
    const modelToUse = getModelName();
    const historyString = historyToString(history);
    let listGenPrompt;
    const projectKeywords = ['plan', 'project', 'organize', 'goal', 'schedule', 'trip'];

    // This logic creates a more tailored checklist depending on the topic.
    if (projectKeywords.some(keyword => topic.toLowerCase().includes(keyword))) {
        listGenPrompt = `You are an expert project manager AI. Based on the user's conversation history AND the provided web search results, generate a highly personalized JSON object for a checklist to help the user with the project: "${topic}". The JSON object must have the following structure: { "type": "checklist", "id": "checklist-${Date.now()}", "title": "A friendly, encouraging title for the project plan", "items": [{"text": "A clear, actionable step or milestone", "done": false}] } Create between 3 and 5 simple, encouraging checklist items that are directly relevant to the user's project described in the history.

Conversation History:
${historyString}

Web Search Results:
${context}`;
    } else {
        // This is the original, more general-purpose prompt.
        listGenPrompt = `You are an AI assistant that creates helpful, actionable checklists. Based on the user's conversation history AND the provided web search results, generate a highly personalized JSON object for a checklist to help the user with the topic: "${topic}". The JSON object must have the following structure: { "type": "checklist", "id": "checklist-${Date.now()}", "title": "A friendly, encouraging title for the list", "items": [{"text": "A short, actionable step", "done": false}] } Create between 3 and 5 simple, encouraging checklist items that are directly relevant to the user's situation described in the history.

Conversation History:
${historyString}

Web Search Results:
${context}`;
    }

    return await generateToolJson(listGenPrompt);
}

// A generic function to get a JSON response from the AI.
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

// Brainstorms and adds more items to an existing checklist.
async function generateMoreChecklistItems(history, existingChecklist, completedTasks) {
    const modelToUse = getModelName();
    const historyString = historyToString(history);
    const existingItemsString = existingChecklist.items.map(item => `- ${item.text}`).join('\n');
    const completedItemsString = completedTasks.map(item => `- ${item}`).join('\n');

    const brainstormPrompt = `You are a helpful AI assistant. The user wants you to add more items to their checklist. Based on their conversation history and the context below, brainstorm one or two new, relevant, and non-repetitive suggestions.

**Conversation History:**
${historyString}

**Existing Checklist Items (Do not repeat these):**
${existingItemsString}

**Recently Completed Tasks (DO NOT SUGGEST THESE AGAIN):**
${completedItemsString}

Generate a JSON array of the new item objects to add. Each object must have the format {"text": "A new actionable step", "done": false}. Output ONLY the raw JSON array.`;

    return await generateToolJson(brainstormPrompt);
}

/**
 * The "Agentic Router". This is a core function where an AI model is used
 * to decide which action to take based on the user's message.
 */
async function decideAndExecuteTool(userPrompt, history) {
    const modelToUse = getModelName();
    const historyString = historyToString(history);
    
    // This prompt is a set of strict rules for the AI to follow.
    const routerPrompt = `You are a strict, rules-based AI router. Your job is to analyze the user's latest message and choose the single most appropriate tool. Follow these rules in order of priority.

**Strict Rules - Follow these in order:**
1.  If the user's message contains keywords of high distress like "anxious", "panicked", "can't breathe", or "freaking out", you MUST choose **BREATHING_EXERCISE**.
2.  If the user explicitly asks to add a COMPLETE, SPECIFIC, ACTIONABLE task to a list (e.g., "add 'Call the doctor's office' to my list"), you MUST choose **ADD_TO_CHECKLIST**. Do NOT use this tool for vague requests like "add an item".
3.  If the user asks for MORE items for a list (e.g., "add more to the list", "can you give me more ideas?", "add something else", "what else can I do?"), you MUST choose **GENERATE_MORE_ITEMS**.
4.  If the user asks for a NEW plan, or to "change," "update," or "replace" the whole list, you MUST choose **CHECKLIST**.
5.  If the user wants to plan a project, set a goal, or organize tasks (e.g., "help me plan my app launch," "I need to organize my study schedule"), you MUST choose **CHECKLIST: [the specific topic of the project or goal]**.
6.  If the user expresses feeling lost, stuck, overwhelmed, or says "I don't know what to do", you MUST choose **CHECKLIST** to provide a concrete plan.
7.  If the user states a strong emotion ("I feel sad," "I'm so happy"), choose **MOOD_TRACKER**.
8.  If the user expresses self-doubt or needs motivation, choose **AFFIRMATION_CARD**.
9.  If none of the above rules apply, decide between **SEARCH** (for facts/recommendations) or **CHAT** (for conversation).

**Conversation History:**
${historyString}

**User's Latest Message:** "${userPrompt}"

Based on the strict rules, which tool is MOST appropriate? Respond ONLY with one of the following formats:
- CHAT
- SEARCH: [search query]
- CHECKLIST: [topic for the new list]
- ADD_TO_CHECKLIST: [the specific, actionable item to add]
- GENERATE_MORE_ITEMS
- BREATHING_EXERCISE
- MOOD_TRACKER
- AFFIRMATION_CARD: [theme for the card]`;

    try {
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelToUse, prompt: routerPrompt, stream: false })
        });
        if (!response.ok) throw new Error("Router model failed");
        const data = await response.json();
        const decision = data.response.trim();

        // --- Execute the chosen tool based on the router's decision ---

        if (decision.startsWith('SEARCH:')) {
            const searchQuery = decision.substring(8).trim();
            const searchResults = await performWebSearch(searchQuery);
            return { tool: 'search', query: searchQuery, results: searchResults };
        } 
        if (decision.startsWith('CHECKLIST:')) {
            const topic = decision.substring(11).trim();
            const searchResults = await performWebSearch(topic);
            const checklistJson = await generateChecklistFromContext(topic, searchResults, history);
            return { tool: 'checklist', content: checklistJson };
        }
        if (decision.startsWith('ADD_TO_CHECKLIST:')) {
            const itemText = decision.substring(18).trim();
            return { tool: 'add_to_checklist', itemText: itemText };
        }
        if (decision === 'GENERATE_MORE_ITEMS') {
            const checklist = chatManager.getActiveChatChecklist();
            const completedTasks = chatManager.getActiveChatCompletedTasks();
            if (checklist) {
                const newItems = await generateMoreChecklistItems(history, checklist, completedTasks);
                return { tool: 'generate_more_items', newItems: newItems };
            }
        }
        if (decision === 'BREATHING_EXERCISE') {
            const toolJson = await generateToolJson(`Create a JSON object for a breathing exercise. Structure: { "type": "breathing_exercise", "id": "breathe-${Date.now()}", "title": "A Quick Breathing Exercise", "cycle": { "inhale": 4, "hold": 4, "exhale": 6 } }`);
            return { tool: 'breathing_exercise', content: toolJson };
        }
        if (decision === 'MOOD_TRACKER') {
            const toolJson = await generateToolJson(`Create a JSON for a mood tracker based on the user's statement. Structure: { "type": "mood_tracker", "id": "mood-${Date.now()}", "title": "How are you feeling right now?", "options": ["Happy", "Okay", "Neutral", "Sad", "Angry"] }`);
            return { tool: 'mood_tracker', content: toolJson };
        }
        // This prompt now asks the AI to create a card with multiple affirmation points.
        if (decision.startsWith('AFFIRMATION_CARD:')) {
            const theme = decision.substring(17).trim();
            const toolJson = await generateToolJson(`Based on the theme "${theme}", create a JSON object for an affirmation card. The 'text' property MUST be an array of short, powerful affirmation strings (between 2 and 4). Structure: { "type": "affirmation_card", "id": "affirm-${Date.now()}", "title": "A Title for Your Card", "text": ["Affirmation 1.", "Affirmation 2."], "buttonText": "I will remember this." }`);
            return { tool: 'affirmation_card', content: toolJson };
        }
        
        // If no other tool matches, just continue the conversation.
        return { tool: 'chat' };
    } catch (error) {
        console.error('Error in agentic router:', error);
        return { tool: 'chat' }; // Fail gracefully to a chat response.
    }
}

// Main function to generate the AI's conversational response.
async function getOllamaResponse(prompt, toolFollowUp = null) {
    const modelToUse = getModelName();
    const systemPrompt = getSystemPrompt();
    const chatHistory = chatManager.getActiveChatHistory();
    
    // Find relevant memories to provide better context to the AI.
    const relevantMemoryTexts = await findRelevantMemories(prompt);
    const memory = relevantMemoryTexts.join('\n');
    
    let userPromptWithNotes = `User: ${prompt}`;
    let contextBlock = '';

    // This block adds "System Notes" to the prompt to give the AI context about
    // a tool action that just happened, so it can respond appropriately.
    if (toolFollowUp) {
        if (toolFollowUp.type === 'search') {
            contextBlock = `[Additional Context from a Web Search]:\n${toolFollowUp.results}\n\n`;
        } else if (toolFollowUp.type === 'persistent_tool_created') {
             userPromptWithNotes = `[System Note: You just created a new "${toolFollowUp.toolName.replace(/_/g, ' ')}" tool for the user. Inform them it's available in their Toolbox and continue the conversation.]\n\nUser: ${prompt}`;
        } else if (toolFollowUp.type === 'item_added') {
            userPromptWithNotes = `[System Note: You added "${toolFollowUp.text}" to the user's checklist. Briefly confirm this and continue the conversation.]\n\nUser: ${prompt}`;
        } else if (toolFollowUp.type === 'more_items_added') {
            userPromptWithNotes = `[System Note: You just brainstormed and added ${toolFollowUp.count} new item(s) to the user's checklist. Confirm this and continue the conversation.]\n\nUser: ${prompt}`;
        } else if (toolFollowUp.type === 'breathing_complete') {
            userPromptWithNotes = `[System Note: The user just finished a breathing exercise. Gently ask how they are feeling now.]`;
        } else if (toolFollowUp.type === 'checklist_item_completed') {
            userPromptWithNotes = `[System Note: The user just completed the task "${toolFollowUp.text}" from their checklist. Acknowledge this specific accomplishment and gently ask how they feel now.]`;
        } else if (toolFollowUp.type === 'mood_logged') {
            userPromptWithNotes = `[System Note: The user just logged their mood as "${toolFollowUp.mood}". Respond with empathy and ask an open-ended question about it.]`;
        } else if (toolFollowUp.type === 'affirmation_committed') {
            userPromptWithNotes = `[System Note: The user just committed to the affirmation "${toolFollowUp.text}". Offer a short, encouraging reinforcement.]`;
        }
    }
    
    // Assemble the final, complete prompt to send to the AI.
    const fullPrompt = `${systemPrompt}\n\n[Conversation History]:\n${historyToString(chatHistory)}\n\n[Relevant Memories for this Chat]:\n${memory}\n\n${contextBlock}${userPromptWithNotes}`;

    try {
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelToUse, prompt: fullPrompt, stream: false })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const aiResponse = data.response.trim();
        chatManager.addMessageToActiveChat('ai', aiResponse);
        const conversationSnippet = `User: ${prompt}\nAssistant: ${aiResponse}`;
        
        // Asynchronously extract and save memories from the latest exchange.
        extractAndSaveMemoriesForActiveChat(conversationSnippet);
        
        return aiResponse;
    } catch (error) {
        console.error('Error in getOllamaResponse:', error);
        return `I'm sorry, an error occurred: ${error.message}`;
    }
}

// Helper to convert the chat history array into a plain string.
function historyToString(history) {
    return history.map(m => {
        if (typeof m.content === 'object' && m.content.type) {
            return `${m.role === 'user' ? 'User' : 'Assistant'}: [Displayed an interactive ${m.content.type.replace(/_/g, ' ')} tool.]`;
        }
        return `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`;
    }).join('\n');
}

// This function uses an AI model to summarize a conversation snippet into key facts.
async function extractAndSaveMemoriesForActiveChat(snippet) {
    const modelToUse = getModelName();
    const summarizerPrompt = `You are a memory extraction bot. Analyze the following conversation snippet and extract key facts about the user that would be useful for a conversational AI to remember. Focus on personal details, preferences, and important context. If there are no key facts to remember, respond with "NONE". Format each fact as a single line, starting with a hyphen. Example: - The user's favorite color is blue.

Conversation:
${snippet}`;

    try {
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelToUse, prompt: summarizerPrompt, stream: false })
        });
        const data = await response.json();
        const facts = data.response.trim();
        
        if (facts.toUpperCase() !== 'NONE') {
            const factLines = facts.split('\n');
            for (const fact of factLines) {
                const cleanFact = fact.replace(/^- /, '').trim();
                if (cleanFact) {
                    const embedding = await getEmbedding(cleanFact);
                    if (embedding) {
                        chatManager.addMemoryToActiveChat({ text: cleanFact, embedding: embedding });
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error in extractAndSaveMemories:', error);
    }
}

// --- Settings Functions ---
function getSystemPrompt() { return localStorage.getItem(PROMPT_STORAGE_KEY) || DEFAULT_SYSTEM_PROMPT; }
function saveSystemPrompt(prompt) { localStorage.setItem(PROMPT_STORAGE_KEY, prompt); }
function getVoiceName() { return localStorage.getItem(VOICE_STORAGE_KEY); }
function saveVoiceName(voiceName) { localStorage.setItem(VOICE_STORAGE_KEY, voiceName); }
function getModelName() { return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL; }
function saveModelName(modelName) { localStorage.setItem(MODEL_STORAGE_KEY, modelName); }

// --- Initialization ---
// Create the single instance of the ChatManager that the app will use.
const chatManager = new ChatManager();