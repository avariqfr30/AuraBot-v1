// chat-logic.js
// This file is the "brain" of Aura. It manages all chat state (like history
// and tools), handles generating AI-powered tools, and contains the core
// logic for our proactive agents.

// --- App-wide Constants & Configuration ---
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

// --- Re-Engagement Agent Prompt ---
const RE_ENGAGEMENT_PROMPT = `You are Aura. The user has not engaged with this chat for %DAYS% days and may be feeling overwhelmed (%REASON%).
Your goal is to be gentle, supportive, and non-judgmental.

// --- YOUR TASK ---
// 1. Acknowledge it's been a bit, and state that this is completely okay.
// 2. Proactively create a *new*, simple 'checklist' tool. The theme should be 'One small, easy step for today'.
// 3. Embed the \`<tool_create type="checklist" theme="One small, easy step for today" />\` tag.
// 4. Gently let the user know you've created this simple, one-item list to make it easier to start again.
// 5. Keep the message warm and brief.`;
// --- End Re-Engagement Agent ---

// --- Cognitive Pattern Agent Prompt ---
// This prompt now asks the LLM to identify distortions and suggest content links.
const PATTERN_FINDER_PROMPT = `You are an expert AI therapist specializing in Cognitive Behavioral Therapy (CBT).
Your goal is to analyze the user's chat and mood data to find correlations between topics and emotions, and potentially identify cognitive distortions.

// --- DATA ANALYSIS ---
The user has provided the following data from their private journal:

[Positive Mood Context]
The user logged 'Happy' or 'Okay' moods after discussing these topics:
%POSITIVE_CONTEXT%

[Negative Mood Context]
The user logged 'Sad' or 'Angry' moods after discussing these topics:
%NEGATIVE_CONTEXT%
// --- END OF DATA ---

// --- AVAILABLE CONCEPTS/DISTORTIONS (for linking) ---
// You can suggest linking to these topics if relevant using <link_content topic="topic-name-slug"/>
// Examples: all-or-nothing-thinking, catastrophizing, overgeneralization, mental-filter, discounting-the-positive, mind-reading, fortune-telling, emotional-reasoning, labeling, personalization, should-statements, thought-record-info, grounding-techniques, mindfulness-deep-breathing, behavioral-activation

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
};

/**
 * Fetches psychoeducation content from our local store.
 * @param {string} topicSlug - The filename-like topic identifier (e.g., "catastrophizing").
 * @returns {Promise<string | null>} - Markdown content or null if not found.
 */
async function getContent(topicSlug) {
    console.log(`Attempting to get content for: ${topicSlug}`);
    await new Promise(resolve => setTimeout(resolve, 10)); // Simulate async
    return localContentStore[topicSlug.toLowerCase()] || null;
}
// --- End Content Store ---


/**
 * Manages all application state.
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
            memories: [], // <-- *** NEW *** This will now be used
            tools: {},
            completed_tasks: [],
            isHeightenedAwareness: false,
            lastUserMessageTimestamp: null,
            reEngagementTriggered: false,
            cognitiveAgentTriggered: false
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
            const activeChat = this.state.chats[this.state.activeChatId];
            activeChat.history.push({ role, content, timestamp: Date.now() });
            if (activeChat.history.length === 1 && role === 'user') {
                activeChat.title = content.substring(0, 20) + '...';
            }
            if (role === 'user') {
                activeChat.lastUserMessageTimestamp = Date.now();
                activeChat.reEngagementTriggered = false; // Reset agent flag on user activity
            }
            
            // --- *** NEW *** Memory Agent Trigger ---
            // Run memory consolidation every 5 user messages
            if (role === 'user' && activeChat.history.length % 5 === 0 && activeChat.history.length > 0) {
                 console.log("Triggering memory consolidation...");
                 // We don't need to 'await' this, let it run in the background
                 this.runMemoryConsolidation(); 
            }
            // --- End New ---

            this.saveState();
        }
    }
    
    // --- *** NEW *** Memory Agent Function ---
    async runMemoryConsolidation() {
        if (!this.state.activeChatId) return;
        const activeChat = this.state.chats[this.state.activeChatId];
        if (activeChat.history.length < 5) return; // Don't run on short chats

        const historyString = historyToString(activeChat.history.slice(-10)); // Get last 10 messages
        const memoryString = JSON.stringify(activeChat.memories || []);
        
        const prompt = MEMORY_AGENT_PROMPT
            .replace('%CURRENT_MEMORY%', memoryString)
            .replace('%CHAT_HISTORY%', historyString);

        try {
            const modelToUse = getModelName();
            const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelToUse, prompt: prompt, stream: false, format: 'json' })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            
            // Try to parse the JSON response
            let newMemory;
            if (typeof data.response === 'string') {
                newMemory = JSON.parse(data.response);
            } else {
                newMemory = data.response;
            }
            
            activeChat.memories = newMemory; // Update the memories
            this.saveState();
            console.log("MemoryAgent SUCCESS: Memories updated.", activeChat.memories);

        } catch (error) {
            console.error("MemoryAgent FAILED:", error);
            // Don't pollute user chat, just log the error
        }
    }
    // --- End New ---

    addOrUpdateToolInActiveChat(toolName, toolData) {
        if (this.state.activeChatId && this.state.chats[this.state.activeChatId]) {
            const activeChat = this.state.chats[this.state.activeChatId];
            if (!activeChat.tools) activeChat.tools = {};
            if (!Array.isArray(activeChat.tools[toolName])) activeChat.tools[toolName] = [];
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
        if (!activeChat || !activeChat.tools || !activeChat.tools.mood_tracker || !activeChat.tools.mood_tracker[0]) return;
        const moodTracker = activeChat.tools.mood_tracker[0];
        if (!moodTracker.history) moodTracker.history = [];
        moodTracker.history.push({ mood: mood, timestamp: new Date().toISOString() });
        if(moodTracker.history.length > 10) moodTracker.history.shift();
        const negativeMoods = ["Sad", "Angry"];
        const positiveMoods = ["Happy", "Okay", "Neutral"];
        if (negativeMoods.includes(mood)) { this.setHeightenedAwareness(true); console.log("Heightened Awareness ENABLED."); }
        else if (positiveMoods.includes(mood)) { this.setHeightenedAwareness(false); console.log("Heightened Awareness DISABLED."); }
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
        if (checklist.items.length === 0) checklistArray.splice(toolIndex, 1);
        if (!activeChat.completed_tasks) activeChat.completed_tasks = [];
        activeChat.completed_tasks.push(completedItem.text);
        if (activeChat.completed_tasks.length > 20) activeChat.completed_tasks.shift();
        this.saveState();
        return completedItem.text;
    }

    getAnalysisData() {
        if (!this.state.activeChatId || !this.state.chats[this.state.activeChatId]) return null;
        const activeChat = this.state.chats[this.state.activeChatId];
        let moodHistory = [];
        if (activeChat.tools?.mood_tracker?.[0]?.history) moodHistory = activeChat.tools.mood_tracker[0].history;
        const completedTasks = activeChat.completed_tasks || [];
        let openTasks = [];
        if (activeChat.tools?.checklist) {
            activeChat.tools.checklist.forEach(list => {
                list.items.forEach(item => {
                    if (!item.done) openTasks.push(item.text);
                });
            });
        }
        let docContext = [];
        (activeChat.history || []).forEach(msg => {
            if (msg.role === 'user' && msg.content.includes('[Attached:')) {
                docContext.push(msg.content.split('\n')[0]);
            }
        });
        return {
            moodHistory,
            chatHistory: activeChat.history || [],
            completedTasks,
            openTasks,
            docContext: docContext.join('\n')
        };
    }

    updateThoughtRecord(toolId, data) {
         if (!this.state.activeChatId || !this.state.chats[this.state.activeChatId]?.tools?.thought_record) return;
         const activeChat = this.state.chats[this.state.activeChatId];
         const toolIndex = activeChat.tools.thought_record.findIndex(record => record.id === toolId);
         if (toolIndex !== -1) {
             activeChat.tools.thought_record[toolIndex] = { ...activeChat.tools.thought_record[toolIndex], ...data, lastUpdated: new Date().toISOString() };
             this.saveState();
             console.log("Thought Record updated:", toolId);
         }
    }

    // --- Crisis Agent ---
    isChatInHeightenedAwareness() { return this.state.chats[this.state.activeChatId]?.isHeightenedAwareness || false; }
    setHeightenedAwareness(value) { if (this.state.chats[this.state.activeChatId]) { this.state.chats[this.state.activeChatId].isHeightenedAwareness = value; this.saveState(); } }
    async preScreenMessage(messageText) {
        if (!this.isChatInHeightenedAwareness()) return 'OK';
        console.log("Heightened Awareness active. Pre-screening message...");
        const prompt = DETECTION_PROMPT.replace('%MESSAGE%', messageText);
        try {
            const modelToUse = getModelName();
            const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: modelToUse, prompt: prompt, stream: false })
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            const result = data.response.trim().toUpperCase();
            if (result.includes('CRISIS')) { console.log("Watchdog detected: CRISIS"); return 'CRISIS'; }
            else { console.log("Watchdog detected: OK"); return 'OK'; }
        } catch (error) { console.error("Error in preScreenMessage, failing safe:", error); return 'OK'; }
    }
    async triggerSafetyIntervention(crisisMessageText) {
        const breathToolPromise = createToolByType('breathing_exercise');
        const safetyPlanPromise = createSafetyPlanTool();
        const [breathTool, safetyPlan] = await Promise.all([breathToolPromise, safetyPlanPromise]);
        this.addOrUpdateToolInActiveChat('breathing_exercise', breathTool);
        this.addOrUpdateToolInActiveChat('checklist', safetyPlan);
        const context = `Context: The user is in a distressed state. Your detection system has flagged their last message as a potential crisis. The message was: "${crisisMessageText}"`;
        const prompt = `${CRISIS_SYSTEM_PROMPT}\n\n${context}\n\nNow, write the message.`;
        const modelToUse = getModelName();
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelToUse, prompt: prompt, stream: false })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        const safeMessage = data.response.trim();
        this.addMessageToActiveChat('ai', safeMessage);
        return safeMessage;
    }

    // --- Re-Engagement Agent ---
    checkForWithdrawalPattern() {
        if (!this.state.activeChatId) return false;
        const activeChat = this.state.chats[this.state.activeChatId];
        if (activeChat.reEngagementTriggered || !activeChat.lastUserMessageTimestamp) return false;
        const now = Date.now();
        const diffDays = (now - activeChat.lastUserMessageTimestamp) / (1000 * 60 * 60 * 24);
        if (diffDays <= 3) return false;
        const data = this.getAnalysisData();
        if (!data) return false;
        const lastMood = data.moodHistory.length > 0 ? data.moodHistory[data.moodHistory.length - 1].mood : null;
        const openTaskCount = data.openTasks.length;
        const isStuck = (["Sad", "Angry"].includes(lastMood) || openTaskCount >= 5);
        if (isStuck) {
            const reason = lastMood ? `their last mood was "${lastMood}"` : `they have ${openTaskCount} open tasks`;
            return { days: Math.round(diffDays), reason: reason };
        }
        return false;
    }
    async triggerReEngagement(pattern) {
        if (!this.state.activeChatId) return;
        this.state.chats[this.state.activeChatId].reEngagementTriggered = true;
        this.saveState();
        const prompt = RE_ENGAGEMENT_PROMPT.replace('%DAYS%', pattern.days).replace('%REASON%', pattern.reason);
        try {
            const modelToUse = getModelName();
            const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
                 method: 'POST', headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ model: modelToUse, prompt: prompt, stream: false })
             });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            const rawResponse = data.response.trim();
            const toolTagRegex = /<tool_create\s+type="([^"]+)"(?:\s+theme="([^"]+)")?\s*\/>/g;
            let cleanedResponse = rawResponse;
            const match = toolTagRegex.exec(rawResponse);
            if (match) {
                const toolType = match[1]; const toolTheme = match[2] || '';
                const toolData = await createToolByType(toolType, toolTheme);
                if (toolData) {
                    if (toolType === 'checklist' && toolData.items.length > 1) toolData.items = [toolData.items[0]]; // Ensure only one item
                    this.addOrUpdateToolInActiveChat(toolType, toolData);
                }
                cleanedResponse = cleanedResponse.replace(match[0], '').trim();
            }
            this.addMessageToActiveChat('ai', cleanedResponse);
            return cleanedResponse;
        } catch (error) {
            console.error("Error during re-engagement:", error);
            this.state.chats[this.state.activeChatId].reEngagementTriggered = false; this.saveState(); // Reset flag on error
            return null;
        }
    }

    // --- Cognitive Agent ---
    checkForCognitivePattern() {
        if (!this.state.activeChatId) return false;
        const activeChat = this.state.chats[this.state.activeChatId];
        if (activeChat.cognitiveAgentTriggered) return false; // Don't run twice per chat
        const data = this.getAnalysisData();
        if (!data || data.chatHistory.length < 10 || data.moodHistory.length < 5) return false; // Need enough data
        const negativeLogs = data.moodHistory.filter(log => ["Sad", "Angry"].includes(log.mood));
        const positiveLogs = data.moodHistory.filter(log => ["Happy", "Okay"].includes(log.mood));
        if (negativeLogs.length < 2 || positiveLogs.length < 2) return false; // Need contrast
        return { chatHistory: data.chatHistory, negativeLogs, positiveLogs };
    }
    extractContext(allMessages, moodTimestamp) {
        const contextWindowMs = 15 * 60 * 1000; // 15 minute window before mood log
        const moodTime = new Date(moodTimestamp).getTime();
        const contextMessages = allMessages.filter(msg => msg.timestamp >= (moodTime - contextWindowMs) && msg.timestamp < moodTime);
        // Combine content of user messages within the window
        return contextMessages.filter(msg => msg.role === 'user').map(msg => msg.content).join(' \n ');
    }
    async triggerCognitiveAnalysis(patternData) {
        if (!this.state.activeChatId) return;
        this.state.chats[this.state.activeChatId].cognitiveAgentTriggered = true;
        this.saveState();
        let negativeContext = "";
        patternData.negativeLogs.forEach(log => {
            const context = this.extractContext(patternData.chatHistory, log.timestamp);
            if (context) negativeContext += `- Topic before logging "${log.mood}": ${context}\n`;
        });
        let positiveContext = "";
        patternData.positiveLogs.forEach(log => {
            const context = this.extractContext(patternData.chatHistory, log.timestamp);
            if (context) positiveContext += `- Topic before logging "${log.mood}": ${context}\n`;
        });
        if (!negativeContext || !positiveContext) { this.state.chats[this.state.activeChatId].cognitiveAgentTriggered = false; this.saveState(); return null; } // Need both contexts
        const prompt = PATTERN_FINDER_PROMPT.replace('%POSITIVE_CONTEXT%', positiveContext).replace('%NEGATIVE_CONTEXT%', negativeContext);
        try {
            const modelToUse = getModelName();
            const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
                 method: 'POST', headers: { 'Content-Type': 'application/json' },
                 body: JSON.stringify({ model: modelToUse, prompt: prompt, stream: false })
             });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            const rawResponse = data.response.trim();
            if (rawResponse.toUpperCase().includes('NULL')) { console.log("Cognitive agent found no strong pattern."); return null; }
            console.log("Cognitive agent FOUND a pattern. Intervening.");
            const toolTagRegex = /<tool_create\s+type="([^"]+)"(?:\s+theme="([^"]+)")?\s*\/>/g;
            const linkTagRegex = /<link_content\s+topic="([^"]+)"\s*\/>/g;
            let cleanedResponse = rawResponse;
            const toolMatch = toolTagRegex.exec(rawResponse); // Use exec to find first match
            if (toolMatch) {
                const toolType = toolMatch[1]; const toolTheme = toolMatch[2] || '';
                const toolData = await createToolByType(toolType, toolTheme);
                if (toolData) this.addOrUpdateToolInActiveChat(toolType, toolData);
                cleanedResponse = cleanedResponse.replace(toolMatch[0], '').trim(); // Remove the processed tag
            }
            const linkMatch = linkTagRegex.exec(cleanedResponse); // Check response *after* tool tag removed
             if (linkMatch) {
                // Leave the tag in the response for app.js to handle replacement
                cleanedResponse = cleanedResponse.replace(linkMatch[0], `<link_content topic="${linkMatch[1]}"/>`);
                console.log(`Cognitive agent suggested content link: ${linkMatch[1]}`);
             }
            this.addMessageToActiveChat('ai', cleanedResponse);
            return cleanedResponse; // Return the response containing the marker tag if present
        } catch (error) {
            console.error("Error during cognitive analysis:", error);
            this.state.chats[this.state.activeChatId].cognitiveAgentTriggered = false; this.saveState(); // Reset flag on error
            return null;
        }
    }

    // --- Getters ---
    getActiveChatHistory() { return this.state.chats[this.state.activeChatId]?.history || []; }
    getActiveChatId() { return this.state.activeChatId; }
}


// --- Tool Generation Functions ---
async function generateToolJson(prompt) {
    const modelToUse = getModelName();
    try {
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: modelToUse, prompt, stream: false, format: 'json' })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        // Sometimes the response might include ```json ... ```, try to extract if needed
        let jsonString = data.response.trim();
        if (jsonString.startsWith('```json')) {
            jsonString = jsonString.substring(7, jsonString.length - 3).trim();
        } else if (jsonString.startsWith('```')) {
             jsonString = jsonString.substring(3, jsonString.length - 3).trim();
        }
        return JSON.parse(jsonString);
    } catch (error) { console.error('Error generating tool JSON:', error, 'Raw response:', data?.response); return null; }
}
async function createSafetyPlanTool() {
    const prompt = `You are an AI assistant creating JSON for a "Safety Plan Checklist". The title MUST be "Immediate Safety Plan". Create exactly 5 simple, actionable, grounding items (e.g., "Take 5 deep breaths", "Name 3 things you can see"). Output ONLY the raw JSON object: { "type": "checklist", "id": "safety-\${Date.now()}", "title": "Immediate Safety Plan", "items": [{"text": "...", "done": false}, ...] }`;
    return await generateToolJson(prompt);
}
async function createToolByType(type, theme = '') {
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
    
    // --- 1. HANDLE TOOL FOLLOW-UPS (Skip Router) ---
    if (toolFollowUp) {
        console.log("Handling tool follow-up:", toolFollowUp.type);
        let userPromptSegment = '';
        if (toolFollowUp.type === 'mood_logged') userPromptSegment = `[System Note: User logged mood "${toolFollowUp.mood}". Respond with empathy & open question.]`;
        else if (toolFollowUp.type === 'checklist_item_completed') userPromptSegment = `[System Note: User completed task "${toolFollowUp.text}". Acknowledge & encourage.]`;
        else if (toolFollowUp.type === 'breathing_complete') userPromptSegment = `[System Note: User finished breathing exercise. Ask how they feel.]`;
        
        const fullPrompt = `${systemPrompt}\n\n[Long-Term Memory]:\n${memoryString}\n\n[Current Toolbox State]:\n${toolsStateString}\n\n[Conversation History]:\n${historyToString(chatHistory)}\n\n${userPromptSegment}`;
        
        try {
            const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelToUse, prompt: fullPrompt, stream: false }) });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            return data.response.trim();
        } catch (error) {
            console.error('Error in Tool Follow-up:', error);
            return `I'm sorry, an error occurred: ${error.message}`;
        }
    }

    // --- 2. RUN THE MASTER ROUTER ---
    const routerPrompt = ROUTER_PROMPT
        .replace('%MEMORY%', memoryString)
        .replace('%USER_MESSAGE%', userMessage);
    
    try {
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelToUse, prompt: routerPrompt, stream: false }) });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        route = data.response.trim();
        console.log("Master Router Chose:", route);
    } catch (error) {
        console.error("Master Router FAILED:", error);
        route = 'GeneralFriendAgent'; // Fail safe
    }

    // --- 3. EXECUTE THE CHOSEN ROUTE ---
    let finalPrompt;
    switch (route) {
        case 'CrisisAgent':
            // This is already handled by preScreenMessage, but if router catches it,
            // we'll treat it as a high-priority GeneralFriend message.
            // The preScreenMessage is the *real* safety net.
            finalPrompt = `${systemPrompt}\n\n[Long-Term Memory]:\n${memoryString}\n\n[Conversation History]:\n${historyToString(chatHistory)}\n\nUser: ${userMessage}`;
            break;

        case 'CbtAnalystAgent':
            const cbtChatPrompt = `You are Aura, an expert in CBT. The user's last message seems to contain a negative thought pattern.
            [User's Message]: "${userMessage}"
            [Long-Term Memory]: ${memoryString}
            [Chat History]: ${historyToString(chatHistory)}
            
            Your Task:
            1.  Gently validate their feeling.
            2.  Ask a curious question to help them explore the thought.
            3.  Proactively create a "Thought Record" tool to help.
            4.  Embed the <tool_create type="thought_record" theme="${userMessage.substring(0, 50)}..."/> tag.`;
            finalPrompt = cbtChatPrompt;
            break;
        
        case 'PlannerAgent':
            const plannerPrompt = `You are Aura, an expert project planner. The user wants to make a plan.
            [User's Message]: "${userMessage}"
            [Long-Term Memory]: ${memoryString}
            
            Your Task:
            1.  Acknowledge the goal.
            2.  Create a <tool_create type="checklist" theme="Plan: ${userMessage.substring(0, 50)}..."/> tag.
            3.  Tell the user you've created a checklist to help them get started.`;
            finalPrompt = plannerPrompt;
            break;

        case 'KnowledgeAgent':
            // This route is now handled by its own function
            return await handleKnowledgeRoute(userMessage, memoryString, modelToUse);

        case 'GeneralFriendAgent':
        default:
            let userPromptSegment = '';
            if (documentText) userPromptSegment += `[Document Content]:\n${documentText}\n\n`;
            userPromptSegment += `User: ${userMessage}`;
            finalPrompt = `${systemPrompt}\n\n[Long-Term Memory]:\n${memoryString}\n\n[Current Toolbox State]:\n${toolsStateString}\n\n[Conversation History]:\n${historyToString(chatHistory)}\n\n${userPromptSegment}`;
            break;
    }

    // --- 4. FINAL LLM CALL (for all non-knowledge routes) ---
    try {
        const response = await fetch(`${OLLAMA_API_BASE_URL}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: modelToUse, prompt: finalPrompt, stream: false }) });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data.response.trim();
    } catch (error) {
        console.error(`Error in getOllamaResponse (Route: ${route}):`, error);
        return `I'm sorry, an error occurred: ${error.message}`;
    }
}
// --- End Rewritten Function ---


// --- Utility Functions ---
function historyToString(history) { return (history || []).map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`).join('\n'); }

// --- Settings Getters/Setters ---
function getSystemPrompt() { return localStorage.getItem(PROMPT_STORAGE_KEY) || DEFAULT_SYSTEM_PROMPT; }
function saveSystemPrompt(prompt) { localStorage.setItem(PROMPT_STORAGE_KEY, prompt); }
function getVoiceName() { return localStorage.getItem(VOICE_STORAGE_KEY); }
function saveVoiceName(voiceName) { localStorage.setItem(VOICE_STORAGE_KEY, voiceName); }
function getModelName() { return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL; }
function saveModelName(modelName) { localStorage.setItem(MODEL_STORAGE_KEY, modelName); }
function getDefaultSystemPrompt() { return DEFAULT_SYSTEM_PROMPT; }

// --- App Initialization ---
const chatManager = new ChatManager();