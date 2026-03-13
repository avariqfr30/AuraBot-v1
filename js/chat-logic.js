// js/chat-logic.js
// Completely Refactored Architecture: DRY API calls, local Content Store, Master Router, and Vector DB.

// --- 1. CONFIGURATION & PROMPTS ---
const STORAGE_KEYS = { STATE: 'aura_app_state', PROMPT: 'aura_system_prompt', MODEL: 'aura_model_name' };

const PROMPTS = {
    DEFAULT_SYSTEM: `You are Aura, a close friend and empathetic mental health companion. 
You are chatting with a programmer on a messaging app.

[TONE AND VOICE RULES]
- Speak casually, warmly, and concisely, like a real human texting a friend.
- Use natural phrasing, occasional mild slang, and conversational filler (e.g., "honestly," "yeah," "hmm").
- DO NOT sound like a customer service bot, a therapist, or an AI.
- Mirror the user's energy. Be supportive but realistic.

[FORMATTING RULES - STRICT]
- Write in short, text-message-style paragraphs (1-3 sentences max).
- ABSOLUTELY NO bullet points, numbered lists, or bold text. 
- Do not use asterisks for roleplay actions (e.g., *smiles*).
- Use an occasional emoji, but don't overdo it.

[TOOL USAGE RULES - STRICT GUARDRAILS]
You have access to interactive tools, but you must use them RARELY and ONLY when realistically appropriate. 
DO NOT create tools if the user is asking a general question, asking for a definition, or just chatting casually. 
ONLY create a tool if the user is in an ACTIVE state of need.

Available Tools & Exact Triggers:
- 'mood_tracker': Use ONLY if they state a strong, active emotion right now.
- 'checklist': Use ONLY if they explicitly ask for a plan, or are actively overwhelmed by a specific task.
- 'thought_record': Use ONLY if they are actively exhibiting a cognitive distortion.
- 'affirmation_card': Use ONLY if they are actively expressing deep self-doubt or need immediate encouragement.
- 'breathing_exercise': Use ONLY if they are actively panicking, having an anxiety attack, or report high physical stress.

To deploy a tool, embed this exact tag in your response: <tool_create type="[type]" theme="[brief theme]" />`,

    ROUTER: `Analyze the user's message and route it to the correct agent.
[Behavioral Profile]: %PROFILE%
[Message]: "%USER_MESSAGE%"

Routes:
1. CrisisAgent: Suicidal ideation, self-harm, severe active distress.
2. CbtAnalystAgent: Active negative thoughts, exhibiting cognitive distortions, needing behavioral reframing.
3. PlannerAgent: Goal setting, task planning, overcoming executive dysfunction.
4. KnowledgeAgent: Asking for general definitions, facts about mental health, or psychoeducation (e.g., "What is anxiety?", "How does CBT work?").
5. SearchAgent: Needs real-world facts, local contacts, current events, or physical locations.
6. GeneralFriendAgent: Default chat, empathy, standard conversation, or unclear intent.

Respond ONLY with the exact route name.`,

    BEHAVIOR_ANALYZER: `You are Aura's background profiling agent. 
Update the user's behavioral profile based on the recent chat history. 
Focus on updating: communicationStyle, moodPatterns, potentialLapses, and behavioralFacts.
[Current Profile]: %STORE%
[Recent Chat]: %HISTORY%
Respond ONLY with the updated JSON object matching the input structure.`,

    SEARCH_QUERY: `Extract a concise Google search query from this message: "%MESSAGE%". 
If the user asks for local places (like cafes, clinics, or parks), format the query to find articles by appending words like "best recommendations list". 
If it is a crisis, output exactly: "emergency mental health crisis hotline near me". 
Output ONLY the search query.`,

    SEARCH_SYNTHESIS: `You are Aura. Answer the user based ONLY on these real-time search results:
%RESULTS%
[User Message]: %MESSAGE%
Adapt tone based on [Profile]: %PROFILE%
Provide brief markdown links to sources.`,

    KNOWLEDGE_MAPPER: `Map the user question to a key: all-or-nothing-thinking, catastrophizing, discounting-the-positive, emotional-reasoning, fortune-telling, labeling, mental-filter, mind-reading, overgeneralization, personalization, should-statements, thought-record-info, grounding-techniques, grounding, mindfulness-deep-breathing. 
Question: "%MESSAGE%". Respond ONLY with the key or "NULL".`,
    
    KNOWLEDGE_SYNTHESIS: `You are Aura. Answer the user conversationally using this knowledge base:
%CONTENT%
Question: "%MESSAGE%"
Rule: DO NOT generate any <tool_create> tags. Just provide the information naturally.`,

    CRISIS_DETECTION: `Analyze the following message for suicidal ideation, self-harm, or severe hopelessness: "%MESSAGE%". Respond ONLY with 'CRISIS' or 'OK'.`,
    
    RE_ENGAGEMENT: `The user hasn't chatted in %DAYS% days (%REASON%). Be supportive. Create a <tool_create type="checklist" theme="One small, easy step for today" />.`
};

// --- 2. API ABSTRACTION ---
async function _callLLM(prompt, format = null) {
    const model = localStorage.getItem(STORAGE_KEYS.MODEL) || 'llama3:8b'; // Set to your default model
    try {
        const res = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, prompt, stream: false, ...(format && { format }) })
        });
        if (!res.ok) throw new Error(`LLM API Error: ${res.status}`);
        const data = await res.json();
        return data.response.trim();
    } catch (err) {
        console.error("LLM Call Failed:", err);
        return null;
    }
}

async function fetchMarkdownContent(slug) {
    const mapping = {
        'thought-record-info': 'concepts',
        'grounding': 'techniques', 'grounding-techniques': 'techniques', 'mindfulness-deep-breathing': 'techniques'
    };
    const folder = mapping[slug] || 'distortions';
    try {
        const res = await fetch(`contents/${folder}/${slug}.md`);
        return res.ok ? await res.text() : null;
    } catch (e) {
        console.error(`Failed to fetch ${slug}.md`, e);
        return null;
    }
}

// --- 3. STATE MANAGEMENT ---
class ChatManager {
    constructor() {
        this.state = this.loadState() || this.getInitialState();
        if (!this.state.activeChatId) this.createNewChat();
    }

    getInitialState() {
        return {
            chats: {},
            activeChatId: null,
            localContentStore: {
                communicationStyle: "Not yet established.",
                moodPatterns: [],
                potentialLapses: [],
                behavioralFacts: []
            }
        };
    }

    loadState() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.STATE)); }
    saveState() { localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(this.state)); }

    createNewChat() {
        const id = Date.now().toString();
        this.state.chats[id] = { id, title: 'New Chat', history: [], tools: {}, completed_tasks: [], isHeightenedAwareness: false, lastUserMessageTimestamp: Date.now() };
        this.state.activeChatId = id;
        this.saveState();
    }

    setActiveChat(id) { if (this.state.chats[id]) { this.state.activeChatId = id; this.saveState(); } }
    deleteChat(id) { delete this.state.chats[id]; const keys = Object.keys(this.state.chats); this.state.activeChatId = keys.length ? keys[0] : null; if(!this.state.activeChatId) this.createNewChat(); this.saveState(); }

    addMessageToActiveChat(role, content) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat) return;
        chat.history.push({ role, content, timestamp: Date.now() });
        if (chat.history.length === 1 && role === 'user') chat.title = content.substring(0, 20) + '...';
        
        if (role === 'user') {
            chat.lastUserMessageTimestamp = Date.now();
            
            // Vectorize user message into ChromaDB
            this.vectorizeData(content, { role: 'user', timestamp: Date.now() });
            
            // Background Profiler
            if (chat.history.length % 4 === 0) this.runBehaviorAnalyzer();
        }
        this.saveState();
    }

    // Vector Database Store Method
    async vectorizeData(text, metadata = {}) {
        try {
            await fetch('http://127.0.0.1:3000/api/store_memory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, metadata })
            });
        } catch (e) { console.error("Vector DB Store Error", e); }
    }

    // Vector Database Search Method
    async searchVectorData(query) {
        try {
             const res = await fetch('http://127.0.0.1:3000/api/search_memory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ query })
            });
            const data = await res.json();
            return data.results?.documents?.[0]?.join('\n\n') || ""; 
        } catch (e) { return ""; }
    }

    async runBehaviorAnalyzer() {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat || chat.history.length < 4) return;
        const historyStr = chat.history.slice(-8).map(m => `${m.role}: ${m.content}`).join('\n');
        const prompt = PROMPTS.BEHAVIOR_ANALYZER.replace('%STORE%', JSON.stringify(this.state.localContentStore)).replace('%HISTORY%', historyStr);
        const res = await _callLLM(prompt, 'json');
        if (res) {
            try { this.state.localContentStore = typeof res === 'string' ? JSON.parse(res) : res; this.saveState(); } 
            catch (e) {}
        }
    }

    addOrUpdateToolInActiveChat(toolName, toolData) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat) return;
        if (!chat.tools[toolName]) chat.tools[toolName] = [];
        chat.tools[toolName].push(toolData);
        this.saveState();
    }

    logMoodToTracker(mood) {
        const chat = this.state.chats[this.state.activeChatId];
        if (chat?.tools?.mood_tracker?.[0]) {
            chat.tools.mood_tracker[0].history = chat.tools.mood_tracker[0].history || [];
            chat.tools.mood_tracker[0].history.push({ mood, timestamp: new Date().toISOString() });
            chat.isHeightenedAwareness = ["Sad", "Angry"].includes(mood);
            this.saveState();
        }
    }

    completeAndRemoveChecklistItem(toolId, itemIndex) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat?.tools?.checklist) return null;
        const tIdx = chat.tools.checklist.findIndex(l => l.id === toolId);
        if (tIdx === -1) return null;
        const [item] = chat.tools.checklist[tIdx].items.splice(itemIndex, 1);
        if (chat.tools.checklist[tIdx].items.length === 0) chat.tools.checklist.splice(tIdx, 1);
        chat.completed_tasks = chat.completed_tasks || [];
        chat.completed_tasks.push(item.text);
        this.saveState();
        return item.text;
    }

    updateThoughtRecord(toolId, data) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat?.tools?.thought_record) return;
        const idx = chat.tools.thought_record.findIndex(r => r.id === toolId);
        if (idx !== -1) { chat.tools.thought_record[idx] = { ...chat.tools.thought_record[idx], ...data }; this.saveState(); }
    }

    getActiveChatTools() { return this.state.chats[this.state.activeChatId]?.tools || {}; }
    getActiveChatHistory() { return this.state.chats[this.state.activeChatId]?.history || []; }
    getActiveChatId() { return this.state.activeChatId; }

    // --- Proactive Agents ---
    async preScreenMessage(msg) {
        if (!this.state.chats[this.state.activeChatId]?.isHeightenedAwareness) return 'OK';
        const res = await _callLLM(PROMPTS.CRISIS_DETECTION.replace('%MESSAGE%', msg));
        return res?.includes('CRISIS') ? 'CRISIS' : 'OK';
    }

    async triggerSafetyIntervention(msg) {
        this.addOrUpdateToolInActiveChat('breathing_exercise', await createToolByType('breathing_exercise'));
        const prompt = `User in distress: "${msg}". Acknowledge calmly, direct to breathing tool.`;
        return await _callLLM(prompt) || "I hear you. Let's use the breathing exercise together.";
    }

    checkForWithdrawalPattern() {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat || !chat.lastUserMessageTimestamp) return false;
        const days = (Date.now() - chat.lastUserMessageTimestamp) / 86400000;
        return days > 3 ? { days: Math.round(days), reason: "inactive" } : false;
    }

    async triggerReEngagement(pattern) {
        const prompt = PROMPTS.RE_ENGAGEMENT.replace('%DAYS%', pattern.days).replace('%REASON%', pattern.reason);
        return await _callLLM(prompt);
    }
}

window.chatManager = new ChatManager();

// --- 4. TOOL GENERATION ---
async function createToolByType(type, theme = '') {
    const templates = {
        mood_tracker: `{ "type": "mood_tracker", "id": "m-${Date.now()}", "title": "Mood Tracker", "options": ["Happy", "Okay", "Neutral", "Sad", "Angry"] }`,
        checklist: `{ "type": "checklist", "id": "c-${Date.now()}", "title": "${theme || 'Tasks'}", "items": [{"text": "First step", "done": false}] }`,
        thought_record: `{ "type": "thought_record", "id": "tr-${Date.now()}", "title": "Thought Record", "situation": "${theme}" }`,
        affirmation_card: `{ "type": "affirmation_card", "id": "a-${Date.now()}", "title": "Affirmation", "text": ["You got this."] }`,
        breathing_exercise: `{ "type": "breathing_exercise", "id": "b-${Date.now()}", "title": "Breathe", "cycle": {"inhale":4, "hold":4, "exhale":6} }`
    };
    const prompt = `Output ONLY this exact JSON object structure, filling in realistic data for the theme "${theme}": ${templates[type]}`;
    const res = await _callLLM(prompt, 'json');
    return typeof res === 'string' ? JSON.parse(res) : res;
}

// --- 5. MASTER ROUTER & LLM EXECUTION ---
async function getOllamaResponse(userMessage, toolFollowUp = null, documentText = null) {
    const profileStr = JSON.stringify(chatManager.state.localContentStore, null, 2);
    
    // 1. Tool Followups bypass routing
    if (toolFollowUp) {
        const prompt = `${localStorage.getItem(STORAGE_KEYS.PROMPT) || PROMPTS.DEFAULT_SYSTEM}\n[Profile]:\n${profileStr}\n[Note]: User interacted with tool: ${JSON.stringify(toolFollowUp)}`;
        return await _callLLM(prompt) || "I see you used a tool. How are you feeling?";
    }

    // 2. Route Message
    const routerPrompt = PROMPTS.ROUTER.replace('%PROFILE%', profileStr).replace('%USER_MESSAGE%', userMessage);
    const route = await _callLLM(routerPrompt) || 'GeneralFriendAgent';
    
    // 3. Execute Specialized Agent
    if (route.includes('Knowledge')) {
        const key = await _callLLM(PROMPTS.KNOWLEDGE_MAPPER.replace('%MESSAGE%', userMessage));
        if (key && key !== 'NULL') {
            const content = await fetchMarkdownContent(key.toLowerCase());
            if (content) return await _callLLM(PROMPTS.KNOWLEDGE_SYNTHESIS.replace('%USER_MESSAGE%', userMessage).replace('%CONTENT%', content));
        }
    }
    
    if (route.includes('Search')) {
        let query = await _callLLM(PROMPTS.SEARCH_QUERY.replace('%MESSAGE%', userMessage)) || userMessage;
        
        // --- BUILT-IN SANITIZER ---
        // Strip conversational filler ("Here is the query: ") and surrounding quotes
        query = query.replace(/^(here is the query|query):\s*/i, '').trim();
        query = query.replace(/^["']|["']$/g, '').trim();
        
        console.log(`[SearchAgent] Sending sanitized query to proxy: "${query}"`);

        try {
            const res = await fetch(`http://127.0.0.1:3000/api/search?query=${encodeURIComponent(query)}`);
            
            // Explicitly catch 400/500 errors from your Express server
            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || `HTTP error! status: ${res.status}`);
            }
            
            const data = await res.json();
            
            const synthesisPrompt = PROMPTS.SEARCH_SYNTHESIS
                .replace('%RESULTS%', data.results)
                .replace('%MESSAGE%', userMessage)
                .replace('%PROFILE%', profileStr);
                
            return await _callLLM(synthesisPrompt) || "I couldn't synthesize the search results.";
            
        } catch (e) { 
            console.error("[SearchAgent] Full failure details:", e);
            return "I tried to look that up, but I'm having trouble connecting to my search server right now. Check the developer console for details!"; 
        }
    }

    // 4. Default / CBT / Planner Fallback
    
    // Search ChromaDB for relevant semantic history
    const vectorContext = await chatManager.searchVectorData(userMessage);

    const historyStr = chatManager.getActiveChatHistory().map(m => `${m.role}: ${m.content}`).join('\n');
    let finalPrompt = `${localStorage.getItem(STORAGE_KEYS.PROMPT) || PROMPTS.DEFAULT_SYSTEM}
    
    [Behavioral Profile]: ${profileStr}
    
    [Relevant Past Memories]:
    ${vectorContext ? vectorContext : 'No specific past context found.'}

    [Current Session History]:\n${historyStr}
    
    User: ${userMessage}`;
    
    if (documentText) finalPrompt += `\n[Doc Content]: ${documentText}`;

    return await _callLLM(finalPrompt) || "I'm having trouble thinking right now.";
}