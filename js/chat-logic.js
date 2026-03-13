// chat-logic.js
// Completely Refactored Architecture: DRY API calls, local Content Store, Master Router, and Vector DB.

// --- 1. CONFIGURATION & PROMPTS ---
const STORAGE_KEYS = { STATE: 'aura_app_state', PROMPT: 'aura_system_prompt', MODEL: 'aura_model_name' };

const PROMPTS = {
    DEFAULT_SYSTEM: `You are Aura, an empathetic and highly realistic AI mental health companion.
Your goal is to be conversational, natural, and supportive. 

[TOOL USAGE RULES - STRICT GUARDRAILS]
You have access to interactive tools, but you must use them RARELY and ONLY when realistically appropriate. 
DO NOT create tools if the user is asking a general question, asking for a definition, or just chatting casually. 
ONLY create a tool if the user is in an ACTIVE state of need.

Available Tools & Exact Triggers:
- 'mood_tracker': Use ONLY if they state a strong, active emotion right now (e.g., "I am feeling so sad today").
- 'checklist': Use ONLY if they explicitly ask for a plan, or are actively overwhelmed by a specific task.
- 'thought_record': Use ONLY if they are actively exhibiting a cognitive distortion (e.g., "I'm a total failure").
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

<<<<<<< HEAD
// --- YOUR TASK ---
// 1. Analyze the context. Is there a strong, recurring correlation between a specific topic and a negative mood?
// 2. If YES, *also* try to identify a potential Cognitive Distortion pattern in the user's language during those negative contexts.
// 3. If NO strong pattern/distortion is found, stop and output ONLY the word 'NULL'.
// 4. If a pattern IS found:
//    a. Write a brief, gentle, and curious message (2-3 sentences) pointing out the topic/mood correlation. Use "I'm noticing a possible pattern..." or "It seems like...". DO NOT be an authority.
//    b. If you identified a likely distortion, *gently* mention it by name and embed a content link tag for it. Example: "...This might sometimes be related to a pattern called 'Catastrophizing'. <link_content topic="catastrophizing"/>"
//    c. Proactively create a *new* tool to help them *manage this specific trigger or thought pattern*. A 'thought_record' is often useful here, or an 'affirmation_card' related to the trigger topic.
//    d. Embed the \`<tool_create type="tool_type" theme="Relevant Theme"/>\` tag for this new tool at the end of your message.`;
// --- End Cognitive Pattern Agent ---

// --- *** NEW *** Memory Agent Prompt ---
const MEMORY_AGENT_PROMPT = `You are a memory consolidation AI. Your job is to read a conversation and update a JSON object of key facts about the user.
Do NOT add trivial information. Focus ONLY on:
1.  **Core Goals:** (e.g., "User wants to reduce anxiety in social situations.")
2.  **Key People/Entities:** (e.g., "User is stressed about 'Project X' at work.", "User's friend 'Maria' is supportive.")
3.  **Recurring Triggers:** (e.g., "User often feels sad after talking about their family.")
4.  **Stated Preferences:** (e.g., "User prefers a gentle, supportive tone.")

Here is the current memory object:
%CURRENT_MEMORY%

Here is the recent conversation history:
%CHAT_HISTORY%

Respond ONLY with the updated JSON object. Do not add any conversational text.`;
// --- End Memory Agent ---

// --- *** NEW *** Master Agent (Router) Prompt ---
const ROUTER_PROMPT = `You are the master router for Aura, a compassionate AI friend. Your job is to analyze the user's message and route it to the correct specialist.

// --- LONG-TERM MEMORY ---
// Key facts remembered about the user:
%MEMORY%

// --- CONVERSATION CONTEXT ---
// The user's latest message is:
"%USER_MESSAGE%"

// --- AVAILABLE ROUTES ---
1.  **CrisisAgent:** If the message contains suicidal ideation, self-harm, or severe distress.
2.  **CbtAnalystAgent:** If the user is describing a strong negative thought, a difficult situation, or seems to be in a cognitive distortion (e.g., "I always fail," "This is a disaster").
3.  **PlannerAgent:** If the user wants to set a goal, make a plan, or break down a large task.
4.  **KnowledgeAgent:** If the user is asking a factual question about a mental health concept, a CBT term, or a technique Aura might know (e.g., "What is Behavioral Activation?", "Tell me about catastrophizing").
5.  **GeneralFriendAgent:** For all other cases: general chat, follow-ups, empathy, or simple questions.

Respond with ONLY the name of the chosen route (e.g., "CbtAnalystAgent").`;
// --- End Router Prompt ---

// --- *** NEW *** Knowledge Agent (Mapper) Prompt ---
const KNOWLEDGE_MAPPER_PROMPT = `You are a keyword extractor. The user is asking a question. Find the single best-matching key from the available list that answers the user's question.

[User Question]:
"%USER_MESSAGE%"

[Available Keys]:
all-or-nothing-thinking, catastrophizing, overgeneralization, mental-filter, discounting-the-positive, mind-reading, fortune-telling, emotional-reasoning, labeling, personalization, should-statements, thought-record-info, grounding-techniques, mindfulness-deep-breathing, behavioral-activation

Respond with ONLY the matching key (e.g., "behavioral-activation") or "NULL" if no key matches.`;
// --- End Mapper Prompt ---

// --- *** NEW *** Knowledge Agent (Synthesizer) Prompt ---
const KNOWLEDGE_SYNTHESIS_PROMPT = `You are Aura. Your friend asked you a question, and you know the answer.
[User's Question]:
"%USER_MESSAGE%"

[Your Knowledge on the Topic]:
---
%KNOWLEDGE_CONTENT%
---

Your Task:
Answer the user's question in a natural, friendly, and conversational way.
Summarize your knowledge simply. DO NOT just repeat the content. Talk to them like a friend.`;
// --- End Synthesizer Prompt ---

// The default "brain" for Aura (now used as 'GeneralFriendAgent').
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

3.  **Thought Record**
    -   **Type:** \`thought_record\`
    -   **Trigger:** Use when a user expresses a strong negative automatic thought, wants to analyze a feeling, or after identifying a cognitive distortion.
    -   **Theme:** (Optional) The situation or automatic thought to pre-fill.
    -   **Example Tag:** \`<tool_create type="thought_record" theme="Feeling like I failed the presentation" />\`

4.  **Affirmation Card**
    -   **Type:** \`affirmation_card\`
    -   **Trigger:** Use this when a user expresses self-doubt, needs motivation, or feels discouraged.
    -   **Theme:** The \`theme\` attribute should be the reason for the affirmation.
    -   **Example Tag:** \`<tool_create type="affirmation_card" theme="building confidence for a new job" />\`

5.  **Breathing Exercise**
    -   **Type:** \`breathing_exercise\`
    -   **Trigger:** Use this when a user expresses feelings of high stress, anxiety, or panic.
    -   **Example Tag:** \`<tool_create type="breathing_exercise" />\`

6.  **Web Search**
    -   **Type:** \`web_search\`
    -   **Trigger:** Use this when the user asks a factual question that requires up-to-date or external information, such as current events, news, or general knowledge not related to mental health.
    -   **Theme:** The search query.
    -   **Example Tag:** \`<tool_create type="web_search" theme="latest news on AI" />\`

// =================================================================
// --- CONVERSATIONAL STYLE ---
// =================================================================
- Your tone is warm, encouraging, and relaxed. Use contractions (you're, it's, let's).
- Be supportive and proactive. Confidently create tools you think will help and then inform the user what you've done.`;
const DEFAULT_MODEL = 'gpt-oss:120b-cloud';
const DEFAULT_EMBEDDING_MODEL = 'bge-m3:latest';
const STATE_STORAGE_KEY = 'multi_chat_app_state';
// *** MODIFICATION ***
// OLLAMA_API_BASE_URL is now loaded from config.js, so it's removed from here.


// --- Psychoeducation Content Store ---
// Embedded content strings. Ideally, load from local .md files if possible.
const localContentStore = {
    "all-or-nothing-thinking": `## All-or-Nothing Thinking (or Black-and-White Thinking)\n\nSeeing things in absolute, black-and-white categories. If a situation falls short of perfect, you see it as a total failure.\n\n**Example:** "If I don't get an A on this test, I'm a complete idiot."`,
    "catastrophizing": `## Catastrophizing (or Magnification)\n\nExpecting disaster to strike, no matter what. You hear about a problem and automatically think of the worst-case scenario.\n\n**Example:** "If I make a mistake in the presentation, I'll get fired."`,
    "overgeneralization": `## Overgeneralization\n\nYou see a single negative event as a never-ending pattern of defeat by using words such as "always" or "never" when you think about it.\n\n**Example:** After one rejection, thinking "I'll *never* find a partner."`,
    "mental-filter": `## Mental Filter\n\nYou pick out a single negative detail and dwell on it exclusively, so that your vision of all reality becomes darkened, like the drop of ink that colors a beaker of water.\n\n**Example:** Focusing on one critical comment after a successful performance and ignoring all the praise.`,
    "discounting-the-positive": `## Discounting the Positive\n\nRejecting positive experiences by insisting they "don't count" for some reason. This maintains a negative belief that is contradicted by everyday experiences.\n\n**Example:** After receiving praise, thinking "They're just being nice, it doesn't really mean anything."`,
    "mind-reading": `## Mind Reading\n\nAssuming you know what other people are thinking, often negatively, without sufficient evidence.\n\n**Example:** "He thinks I'm incompetent because I asked a question."`,
    "fortune-telling": `## Fortune Telling\n\nPredicting a negative outcome without realistically considering other possibilities.\n\n**Example:** "I'm going to fail this exam, I just know it."`,
    "emotional-reasoning": `## Emotional Reasoning\n\nAssuming that because you *feel* a certain way, it must be true. Letting your feelings guide your interpretation of reality.\n\n**Example:** "I feel inadequate, so I must be worthless."`,
    "labeling": `## Labeling / Mislabeling\n\nAssigning fixed, global labels to yourself or others based on behavior in specific situations, often in an extreme or emotionally charged way. It's an extreme form of overgeneralization.\n\n**Example:** Instead of saying "I made a mistake," you say "I'm a loser."`,
    "personalization": `## Personalization\n\nBelieving that you are the cause of some negative external event which, in fact, you were not primarily responsible for. Also involves taking things personally when they are not connected to you.\n\n**Example:** "My colleague seems upset; it must be something I did."`,
    "should-statements": `## "Should" Statements (or Must, Ought)\n\nHaving a rigid set of rules about how you and others *should* behave. Getting angry or frustrated when these rules are broken. When directed inward, they lead to guilt.\n\n**Example:** "I *should* always be productive." or "He *must* arrive on time."`,
    "thought-record-info": `## Using a Thought Record\n\nA Thought Record helps you identify and challenge unhelpful automatic thoughts. By examining the evidence, you can often find a more balanced perspective.\n\n**Steps:**\n1.  **Situation:** Describe the event objectively.\n2.  **Thoughts:** Write down the automatic thoughts that popped into your head.\n3.  **Emotions:** Note the feelings and their intensity (0-100).\n4.  **Cognitive Distortions:** (Optional) Identify any thinking traps involved.\n5.  **Evidence For/Against:** Act like a detective – what facts support or contradict your thought?\n6.  **Balanced Thought:** Create a more realistic thought based on the evidence.\n7.  **Outcome:** Re-rate your emotions (0-100).`,
    "grounding-techniques": `## Grounding Techniques (5-4-3-2-1 Method)\n\nGrounding helps pull you out of intense anxiety, flashbacks, or overwhelming emotions by reconnecting you to the present moment using your senses.\n\n**Try the 5-4-3-2-1 Method:**\n\n* **5 - SEE:** Look around and name five things you can see right now. (e.g., "I see my keyboard, a blue cup, a window, a crack in the wall, my hand.")\n* **4 - FEEL:** Notice four things you can physically feel. (e.g., "I feel the chair under me, my feet on the floor, the smooth surface of my desk, the air on my skin.")\n* **3 - HEAR:** Listen and identify three sounds. (e.g., "I hear the computer fan, distant traffic, my own breathing.")\n* **2 - SMELL:** Name two things you can smell. If you can't smell anything, name two smells you like. (e.g., "I smell coffee, maybe dust.")\n* **1 - TASTE:** Name one thing you can taste. If nothing, name a taste you enjoy. (e.g., "I can taste the toothpaste from this morning.")\n\nTake a slow breath after each step. This helps anchor you to the 'here and now'.`,
    "mindfulness-deep-breathing": `## Mindfulness & Deep Breathing\n\nMindfulness means paying attention to the present moment, on purpose, without judgment. Deep breathing is a simple way to practice this and calm your nervous system.\n\n**Simple Deep Breathing:**\n\n1.  Find a comfortable position, sitting or lying down.\n2.  Close your eyes gently or soften your gaze.\n3.  Place one hand on your chest and the other on your belly.\n4.  Breathe in slowly and deeply through your nose, feeling your belly rise more than your chest. (Count to 4 if helpful: Inhale, 2, 3, 4)\n5.  Hold the breath gently for a moment. (Count to 4 if helpful: Hold, 2, 3, 4)\n6.  Breathe out slowly and completely through your mouth or nose, feeling your belly fall. (Count to 6 if helpful: Exhale, 2, 3, 4, 5, 6)\n7.  Repeat for several breaths, focusing only on the sensation of breathing. If your mind wanders, gently bring your attention back to your breath.\n\nEven a minute or two can make a difference when feeling stressed or overwhelmed.`,
    "behavioral-activation": `## Behavioral Activation (Taking Small Steps)\n\nWhen feeling depressed or overwhelmed, it's easy to stop doing things, even things you used to enjoy. Behavioral Activation is about gently re-engaging with activities, starting small, to improve your mood and energy.\n\n**The Idea:** Action can come *before* motivation. Doing something small, even if you don't feel like it, can often help you feel a bit better, which then makes it easier to do the next thing.\n\n**How to Start:**\n\n1.  **Identify Small, Achievable Actions:** Think of something simple you *could* do, even if it feels difficult. (e.g., Get out of bed, take a shower, walk around the block for 5 minutes, wash one dish, send one email).\n2.  **Schedule It (Optional but helpful):** Decide *when* you might try it.\n3.  **Do It (Even partially):** Try the action. Don't worry about doing it perfectly or for a long time. Just starting counts.\n4.  **Notice:** Briefly reflect on how you feel *afterwards*. Did anything shift, even slightly?\n\nThe goal isn't immediate happiness, but breaking the cycle of inactivity. Aura's "One small, easy step for today" checklist is based on this principle!`
=======
    CRISIS_DETECTION: `Analyze the following message for suicidal ideation, self-harm, or severe hopelessness: "%MESSAGE%". Respond ONLY with 'CRISIS' or 'OK'.`,
    
    RE_ENGAGEMENT: `The user hasn't chatted in %DAYS% days (%REASON%). Be supportive. Create a <tool_create type="checklist" theme="One small, easy step for today" />.`
>>>>>>> 8b0a9f5 (Push change)
};

// --- 2. API ABSTRACTION ---
async function _callLLM(prompt, format = null) {
    const model = localStorage.getItem(STORAGE_KEYS.MODEL) || 'kimi-k2:1t-cloud';
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
            await fetch('http://localhost:3000/api/store_memory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, metadata })
            });
        } catch (e) { console.error("Vector DB Store Error", e); }
    }

    // Vector Database Search Method
    async searchVectorData(query) {
        try {
             const res = await fetch('http://localhost:3000/api/search_memory', {
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
<<<<<<< HEAD
    let prompt = '';
    switch (type) {
        case 'mood_tracker':
            prompt = `Create JSON for a "Mood Tracker". Structure: { "type": "mood_tracker", "id": "mood-\${Date.now()}", "title": "Your Mood Tracker", "options": ["Happy", "Okay", "Neutral", "Sad", "Angry"], "history": [] }`;
            break;
        case 'checklist':
            prompt = `Create a checklist JSON. Theme: "${theme}". Create 3-5 items. If theme is 'One small, easy step for today', create ONLY ONE item. Structure: { "type": "checklist", "id": "checklist-\${Date.now()}", "title": "...", "items": [{"text": "...", "done": false}] }`;
            break;
        case 'affirmation_card':
             prompt = `Create JSON for an "Affirmation Card". Theme: "${theme}". Generate 2-3 affirmations. Structure: { "type": "affirmation_card", "id": "affirm-\${Date.now()}", "title": "...", "text": ["...", "..."], "buttonText": "I will remember this." }`;
            break;
        case 'breathing_exercise':
            prompt = `Create JSON for a standard breathing exercise. Structure: { "type": "breathing_exercise", "id": "breathe-\${Date.now()}", "title": "A Quick Breathing Exercise", "cycle": { "inhale": 4, "hold": 4, "exhale": 6 } }`;
            break;
        case 'thought_record':
            prompt = `Create JSON for a CBT "Thought Record". Theme (optional situation): "${theme}". Structure: { "type": "thought_record", "id": "tr-\${Date.now()}", "title": "Thought Record", "situation": "${theme || ''}", "automaticThoughts": "", "emotions": "", "cognitiveDistortions": "", "evidenceFor": "", "evidenceAgainst": "", "balancedThought": "", "outcomeEmotions": "" }`;
            break;
        case 'web_search':
            // Special case: perform web search
            try {
                const response = await fetch(`/api/search?query=${encodeURIComponent(theme)}`);
                if (!response.ok) throw new Error(`Search API error: ${response.status}`);
                const data = await response.json();
                return {
                    type: 'web_search',
                    id: `search-${Date.now()}`,
                    title: `Search Results for "${theme}"`,
                    results: data.results
                };
            } catch (error) {
                console.error('Error performing web search:', error);
                return {
                    type: 'web_search',
                    id: `search-${Date.now()}`,
                    title: `Search Results for "${theme}"`,
                    results: [{ title: 'Error', snippet: 'Failed to fetch search results.' }]
                };
            }
        default: return null;
    }
    // All prompts now include instruction to output ONLY raw JSON object.
    prompt += ` Your output MUST be only the raw JSON object with the exact structure specified.`;
    return await generateToolJson(prompt);
}

// --- Agent/Context Formatting ---
function toolsToString(tools) {
    let toolString = '';
    const toolOrder = ['mood_tracker', 'checklist', 'thought_record', 'affirmation_card', 'breathing_exercise', 'web_search'];
    toolOrder.forEach(toolName => {
        if (tools[toolName]?.length > 0) {
            tools[toolName].forEach(toolInstance => {
                switch (toolName) {
                    case 'mood_tracker': toolString += `- Mood Tracker: "${toolInstance.title}" available.\n`; break;
                    case 'checklist': toolString += `- Checklist: "${toolInstance.title}"\n${(toolInstance.items || []).map((item, i) => `  ${i + 1}. ${item.text}`).join('\n')}\n`; break;
                    case 'thought_record': toolString += `- Thought Record: "${toolInstance.title}" (${toolInstance.situation ? 'Situation: '+toolInstance.situation.substring(0,30)+'...' : 'Empty'})\n`; break;
                    case 'affirmation_card': toolString += `- Affirmation Card: "${toolInstance.title}"\n${Array.isArray(toolInstance.text) ? toolInstance.text.map(t => `  - "${t}"`).join('\n') : ''}\n`; break;
                    case 'breathing_exercise': toolString += `- Breathing Exercise: "${toolInstance.title}" available.\n`; break;
                    case 'web_search': toolString += `- Web Search: "${toolInstance.title}"\n${(toolInstance.results || []).map((result, i) => `  ${i + 1}. ${result.title}: ${result.snippet}`).join('\n')}\n`; break;
                }
            });
        }
    });
    return toolString.trim() || 'None';
}
function formatReviewDataForAI(data) {
    let summary = "Data Summary:\n";
    summary += `- Completed Tasks: ${data.completedTasks.length > 0 ? data.completedTasks.join(', ') : 'None'}\n`;
    summary += `- Open Tasks: ${data.openTasks.length > 0 ? data.openTasks.map(t => `"${t}"`).join(', ') : 'None'}\n`;
    if (data.moodHistory.length > 0) { const recentMoods = data.moodHistory.slice(-5).map(m => m.mood).join(', '); summary += `- Recent Moods: ${recentMoods}\n`; }
    if (data.docContext) { summary += `- Project Context: ${data.docContext}\n`; }
    return summary;
}
async function runReflectiveReview() {
    const data = chatManager.getAnalysisData();
    if (!data) return "Sorry, I couldn't find data to review.";
    const dataSummary = formatReviewDataForAI(data);
    const REFLECTIVE_PROMPT = `You are Aura. User asked for review. Synthesize data:\n${dataSummary}\nWrite brief summary. Decide if tool helps (affirmation if stressed/stuck, checklist if positive/done). Embed <tool_create.../> if yes. Speak to user.`; // Simplified instructions
    try {
        const modelToUse = getModelName();
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelToUse, prompt: REFLECTIVE_PROMPT, stream: false }) });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const responseData = await response.json();
        const rawResponse = responseData.response.trim();
        const toolTagRegex = /<tool_create\s+type="([^"]+)"(?:\s+theme="([^"]+)")?\s*\/>/g;
        let cleanedResponse = rawResponse;
        const matchedTags = [...rawResponse.matchAll(toolTagRegex)];
        if (matchedTags.length > 0) {
            for (const match of matchedTags) {
                const toolType = match[1]; const toolTheme = match[2] || '';
                const toolData = await createToolByType(toolType, toolTheme);
                if (toolData) chatManager.addOrUpdateToolInActiveChat(toolType, toolData);
                cleanedResponse = cleanedResponse.replace(match[0], '').trim();
            }
        }
        chatManager.addMessageToActiveChat('ai', cleanedResponse);
        return cleanedResponse;
    } catch (error) { console.error("Reflective Review AI call failed:", error); throw error; }
}


// --- *** NEW *** 100% Local Knowledge Agent Function ---
async function handleKnowledgeRoute(userMessage, memoryString, modelToUse) {
    let topicKey = "NULL";
    const mapperPrompt = KNOWLEDGE_MAPPER_PROMPT.replace('%USER_MESSAGE%', userMessage);

    try {
        // --- Step 1: Call local LLM to find the topic key ---
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelToUse, prompt: mapperPrompt, stream: false }) });
        if (!response.ok) throw new Error(`Mapper HTTP error! status: ${response.status}`);
        const data = await response.json();
        topicKey = data.response.trim();

        if (topicKey === "NULL") {
            // No local content matched, try web search for general knowledge
            console.log("KnowledgeAgent found no match, trying web search.");
            try {
                const searchResponse = await fetch(`/api/search?query=${encodeURIComponent(userMessage)}`);
                if (!searchResponse.ok) throw new Error(`Search API error: ${searchResponse.status}`);
                const searchData = await searchResponse.json();
                // Format search results as knowledge content
                const knowledgeContent = searchData.results.map(result => `${result.title}: ${result.snippet}`).join('\n\n');
                // Proceed to synthesis with search results
                const synthesisPrompt = KNOWLEDGE_SYNTHESIS_PROMPT
                    .replace('%USER_MESSAGE%', userMessage)
                    .replace('%KNOWLEDGE_CONTENT%', knowledgeContent || "No search results found.");
                const synthesisResponse = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelToUse, prompt: synthesisPrompt, stream: false }) });
                if (!synthesisResponse.ok) throw new Error(`Synthesizer HTTP error! status: ${synthesisResponse.status}`);
                const synthesisData = await synthesisResponse.json();
                return synthesisData.response.trim();
            } catch (searchError) {
                console.error("Web search failed, falling back to GeneralFriend:", searchError);
                // Fall back to GeneralFriendAgent
                const fallbackPrompt = `${getSystemPrompt()}\n\n[Long-Term Memory]:\n${memoryString}\n\n[Conversation History]:\n${historyToString(chatManager.getActiveChatHistory())}\n\nUser: ${userMessage}`;
                const fallbackResponse = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelToUse, prompt: fallbackPrompt, stream: false }) });
                if (!fallbackResponse.ok) throw new Error(`Fallback HTTP error! status: ${fallbackResponse.status}`);
                const fallbackData = await fallbackResponse.json();
                return fallbackData.response.trim();
            }
        }

        // --- Step 2: Get the local content using the key ---
        console.log(`KnowledgeAgent found key: ${topicKey}`);
        const knowledgeContent = await getContent(topicKey); // Uses your existing function!
        if (!knowledgeContent) { throw new Error(`Content key ${topicKey} returned null.`); }

        // --- Step 3: Call local LLM to synthesize a friendly answer ---
        const synthesisPrompt = KNOWLEDGE_SYNTHESIS_PROMPT
            .replace('%USER_MESSAGE%', userMessage)
            .replace('%KNOWLEDGE_CONTENT%', knowledgeContent);

        const synthesisResponse = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelToUse, prompt: synthesisPrompt, stream: false }) });
        if (!synthesisResponse.ok) throw new Error(`Synthesizer HTTP error! status: ${synthesisResponse.status}`);
        const synthesisData = await synthesisResponse.json();
        return synthesisData.response.trim();

    } catch (error) {
        console.error("Error in handleKnowledgeRoute:", error);
        return "I'm sorry, I tried to look that up in my notes but ran into a little error.";
    }
}
// --- End New ---


// --- *** REWRITTEN *** Main AI Interaction (getOllamaResponse) ---
async function getOllamaResponse(prompt, toolFollowUp = null, documentText = null) {
    const modelToUse = getModelName();
    const systemPrompt = getSystemPrompt(); // This is the "GeneralFriendAgent" prompt
    const chatHistory = chatManager.getActiveChatHistory();
    const activeTools = chatManager.getActiveChatTools();
    const toolsStateString = toolsToString(activeTools);
    // Get the new long-term memory
    const memoryString = JSON.stringify(chatManager.state.chats[chatManager.getActiveChatId()]?.memories || []);

    let userMessage = prompt;
    let route = 'GeneralFriendAgent'; // Default route
=======
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
>>>>>>> 8b0a9f5 (Push change)
    
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
            const res = await fetch(`http://localhost:3000/api/search?query=${encodeURIComponent(query)}`);
            
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