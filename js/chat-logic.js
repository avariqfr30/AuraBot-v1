const STORAGE_KEYS = {
    STATE: 'aura_app_state',
    PROMPT: 'aura_system_prompt',
    MODEL: 'aura_model_name',
    THEME: 'aura_theme'
};

const API_ENDPOINTS = {
    ollamaGenerate: `${window.AURA_CONFIG.ollamaBaseUrl}/generate`,
    storeMemory: `${window.AURA_CONFIG.apiBaseUrl}/store_memory`,
    searchMemory: `${window.AURA_CONFIG.apiBaseUrl}/search_memory`,
    osint: `${window.AURA_CONFIG.apiBaseUrl}/osint`
};

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
4. KnowledgeAgent: Asking for general definitions, facts about mental health, or psychoeducation.
5. SearchAgent: Needs open-source research, current facts, verification, local places, organizations, people, companies, timelines, or source-backed real-world details.
6. GeneralFriendAgent: Default chat, empathy, standard conversation, or unclear intent.

Respond ONLY with the exact route name.`,

    BEHAVIOR_ANALYZER: `You are Aura's background profiling agent.
Update the user's behavioral profile based on the recent chat history.
Focus on updating: communicationStyle, moodPatterns, potentialLapses, and behavioralFacts.
[Current Profile]: %STORE%
[Recent Chat]: %HISTORY%
Respond ONLY with the updated JSON object matching the input structure.`,

    SEARCH_PLAN: `You are Aura's OSINT planning agent.
Turn the user message into a compact JSON search plan.

[Behavioral Profile]: %PROFILE%
[User Message]: "%MESSAGE%"

Return ONLY valid JSON with this exact shape:
{
  "primaryQuery": "string",
  "supportingQueries": ["string"],
  "includeNews": true,
  "reason": "string"
}

Rules:
- Keep the primary query concise and specific.
- supportingQueries must contain 0 to 2 distinct strings that add missing context or verification angles.
- Set includeNews to true when freshness matters.
- If the user needs nearby crisis help, use "emergency mental health crisis hotline near me" as the primaryQuery.
- Do not include markdown, commentary, or code fences.`,

    SEARCH_SYNTHESIS: `You are Aura.
Answer the user using ONLY this OSINT brief and the cited sources inside it.

[OSINT Brief]
%OSINT%

[User Message]
%MESSAGE%

[Behavioral Profile]
%PROFILE%

Rules:
- Lead with the direct answer.
- Add the most useful details you found, but stay concise and natural.
- If the evidence is mixed, limited, or time-sensitive, say that plainly.
- Never invent facts that are not supported by the brief.
- Do NOT generate any <tool_create> tags.
- End with one final line in this exact shape:
Sources: [Source Name](https://example.com), [Source Name](https://example.com)`,

    KNOWLEDGE_MAPPER: `Map the user question to a key: all-or-nothing-thinking, catastrophizing, discounting-the-positive, emotional-reasoning, fortune-telling, labeling, mental-filter, mind-reading, overgeneralization, personalization, should-statements, thought-record-info, grounding-techniques, grounding, mindfulness-deep-breathing.
Question: "%MESSAGE%". Respond ONLY with the key or "NULL".`,

    KNOWLEDGE_SYNTHESIS: `You are Aura. Answer the user conversationally using this knowledge base:
%CONTENT%
Question: "%MESSAGE%"
Rule: DO NOT generate any <tool_create> tags. Just provide the information naturally.`,

    CRISIS_DETECTION: `Analyze the following message for suicidal ideation, self-harm, or severe hopelessness: "%MESSAGE%". Respond ONLY with 'CRISIS' or 'OK'.`,

    RE_ENGAGEMENT: `The user hasn't chatted in %DAYS% days (%REASON%). Be supportive. Create a <tool_create type="checklist" theme="One small, easy step for today" />.`
};

function safeParseJson(value, fallback = null) {
    try {
        return typeof value === 'string' ? JSON.parse(value) : value;
    } catch (_error) {
        return fallback;
    }
}

function buildChatTitle(content) {
    if (!content) return 'New Chat';
    return content.length > 24 ? `${content.slice(0, 24)}...` : content;
}

function sanitizeSearchQuery(value) {
    if (typeof value !== 'string') return '';

    return value
        .replace(/^(here is the query|query|search query):\s*/i, '')
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function sanitizeSearchPlan(plan, fallbackMessage) {
    const primaryQuery = sanitizeSearchQuery(plan?.primaryQuery || fallbackMessage);
    const supportingQueries = [...new Set((plan?.supportingQueries || []).map(sanitizeSearchQuery))]
        .filter(Boolean)
        .filter((query) => query !== primaryQuery)
        .slice(0, 2);

    return {
        primaryQuery,
        supportingQueries,
        includeNews: Boolean(plan?.includeNews),
        reason: typeof plan?.reason === 'string' ? plan.reason.trim() : ''
    };
}

function extractErrorMessage(errorPayload, fallbackMessage) {
    if (!errorPayload) return fallbackMessage;
    if (typeof errorPayload === 'string') return errorPayload;
    if (typeof errorPayload.error === 'string') return errorPayload.error;
    if (typeof errorPayload.details === 'string') return errorPayload.details;
    return fallbackMessage;
}

async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options
    });
    const data = await response.json().catch(() => null);

    if (!response.ok) {
        throw new Error(extractErrorMessage(data, `Request failed with status ${response.status}`));
    }

    return data;
}

async function postJson(url, body) {
    return requestJson(url, {
        method: 'POST',
        body: JSON.stringify(body)
    });
}

async function _callLLM(prompt, format = null) {
    const model = localStorage.getItem(STORAGE_KEYS.MODEL) || window.AURA_CONFIG.defaultModel;

    try {
        const data = await postJson(API_ENDPOINTS.ollamaGenerate, {
            model,
            prompt,
            stream: false,
            ...(format ? { format } : {})
        });

        return data.response?.trim() || null;
    } catch (error) {
        console.error('LLM Call Failed:', error);
        return null;
    }
}

async function fetchMarkdownContent(slug) {
    const mapping = {
        'thought-record-info': 'concepts',
        grounding: 'techniques',
        'grounding-techniques': 'techniques',
        'mindfulness-deep-breathing': 'techniques'
    };
    const folder = mapping[slug] || 'distortions';

    try {
        const response = await fetch(`contents/${folder}/${slug}.md`);
        return response.ok ? await response.text() : null;
    } catch (error) {
        console.error(`Failed to fetch ${slug}.md`, error);
        return null;
    }
}

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
                communicationStyle: 'Not yet established.',
                moodPatterns: [],
                potentialLapses: [],
                behavioralFacts: []
            }
        };
    }

    loadState() {
        try {
            return safeParseJson(localStorage.getItem(STORAGE_KEYS.STATE), null);
        } catch (_error) {
            return null;
        }
    }

    saveState() {
        localStorage.setItem(STORAGE_KEYS.STATE, JSON.stringify(this.state));
    }

    createNewChat() {
        const id = Date.now().toString();

        this.state.chats[id] = {
            id,
            title: 'New Chat',
            history: [],
            tools: {},
            completed_tasks: [],
            isHeightenedAwareness: false,
            lastUserMessageTimestamp: Date.now()
        };
        this.state.activeChatId = id;
        this.saveState();
    }

    setActiveChat(id) {
        if (!this.state.chats[id]) return;
        this.state.activeChatId = id;
        this.saveState();
    }

    deleteChat(id) {
        delete this.state.chats[id];

        const remainingChatIds = Object.keys(this.state.chats);
        this.state.activeChatId = remainingChatIds.length ? remainingChatIds[0] : null;

        if (!this.state.activeChatId) this.createNewChat();
        this.saveState();
    }

    addMessageToActiveChat(role, content) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat) return;

        chat.history.push({ role, content, timestamp: Date.now() });

        if (chat.history.length === 1 && role === 'user') {
            chat.title = buildChatTitle(content);
        }

        if (role === 'user') {
            const timestamp = Date.now();
            chat.lastUserMessageTimestamp = timestamp;
            this.vectorizeData(content, { role: 'user', timestamp });

            if (chat.history.length % 4 === 0) {
                this.runBehaviorAnalyzer();
            }
        }

        this.saveState();
    }

    async vectorizeData(text, metadata = {}) {
        if (!text) return;

        try {
            await postJson(API_ENDPOINTS.storeMemory, { text, metadata });
        } catch (error) {
            console.error('Vector DB Store Error', error);
        }
    }

    async searchVectorData(query) {
        if (!query) return '';

        try {
            const data = await postJson(API_ENDPOINTS.searchMemory, { query });
            return data.results?.documents?.[0]?.join('\n\n') || '';
        } catch (_error) {
            return '';
        }
    }

    async runBehaviorAnalyzer() {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat || chat.history.length < 4) return;

        const historyStr = chat.history
            .slice(-8)
            .map((message) => `${message.role}: ${message.content}`)
            .join('\n');

        const prompt = PROMPTS.BEHAVIOR_ANALYZER
            .replace('%STORE%', JSON.stringify(this.state.localContentStore))
            .replace('%HISTORY%', historyStr);

        const response = await _callLLM(prompt, 'json');
        const parsed = safeParseJson(response, null);

        if (parsed && typeof parsed === 'object') {
            this.state.localContentStore = parsed;
            this.saveState();
        }
    }

    addOrUpdateToolInActiveChat(toolName, toolData) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat || !toolData) return;

        if (!chat.tools[toolName]) chat.tools[toolName] = [];
        chat.tools[toolName].push(toolData);
        this.saveState();
    }

    logMoodToTracker(mood) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat?.tools?.mood_tracker?.[0]) return;

        chat.tools.mood_tracker[0].history = chat.tools.mood_tracker[0].history || [];
        chat.tools.mood_tracker[0].history.push({ mood, timestamp: new Date().toISOString() });
        chat.isHeightenedAwareness = ['Sad', 'Angry'].includes(mood);
        this.saveState();
    }

    completeAndRemoveChecklistItem(toolId, itemIndex) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat?.tools?.checklist) return null;

        const checklistIndex = chat.tools.checklist.findIndex((list) => list.id === toolId);
        if (checklistIndex === -1) return null;

        const [item] = chat.tools.checklist[checklistIndex].items.splice(itemIndex, 1);
        if (chat.tools.checklist[checklistIndex].items.length === 0) {
            chat.tools.checklist.splice(checklistIndex, 1);
        }

        chat.completed_tasks = chat.completed_tasks || [];
        chat.completed_tasks.push(item.text);
        this.saveState();
        return item.text;
    }

    updateThoughtRecord(toolId, data) {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat?.tools?.thought_record) return;

        const recordIndex = chat.tools.thought_record.findIndex((record) => record.id === toolId);
        if (recordIndex === -1) return;

        chat.tools.thought_record[recordIndex] = {
            ...chat.tools.thought_record[recordIndex],
            ...data
        };
        this.saveState();
    }

    getActiveChatTools() {
        return this.state.chats[this.state.activeChatId]?.tools || {};
    }

    getActiveChatHistory() {
        return this.state.chats[this.state.activeChatId]?.history || [];
    }

    getActiveChatId() {
        return this.state.activeChatId;
    }

    async preScreenMessage(message) {
        if (!this.state.chats[this.state.activeChatId]?.isHeightenedAwareness) return 'OK';
        const response = await _callLLM(PROMPTS.CRISIS_DETECTION.replace('%MESSAGE%', message));
        return response?.includes('CRISIS') ? 'CRISIS' : 'OK';
    }

    async triggerSafetyIntervention(message) {
        this.addOrUpdateToolInActiveChat(
            'breathing_exercise',
            await createToolByType('breathing_exercise')
        );

        const prompt = `User in distress: "${message}". Acknowledge calmly, direct to breathing tool.`;
        return (await _callLLM(prompt)) || "I hear you. Let's use the breathing exercise together.";
    }

    checkForWithdrawalPattern() {
        const chat = this.state.chats[this.state.activeChatId];
        if (!chat?.lastUserMessageTimestamp) return false;

        const days = (Date.now() - chat.lastUserMessageTimestamp) / 86400000;
        return days > 3 ? { days: Math.round(days), reason: 'inactive' } : false;
    }

    async triggerReEngagement(pattern) {
        const prompt = PROMPTS.RE_ENGAGEMENT
            .replace('%DAYS%', pattern.days)
            .replace('%REASON%', pattern.reason);

        return _callLLM(prompt);
    }
}

window.chatManager = new ChatManager();

async function createToolByType(type, theme = '') {
    const templates = {
        mood_tracker: `{ "type": "mood_tracker", "id": "m-${Date.now()}", "title": "Mood Tracker", "options": ["Happy", "Okay", "Neutral", "Sad", "Angry"] }`,
        checklist: `{ "type": "checklist", "id": "c-${Date.now()}", "title": "${theme || 'Tasks'}", "items": [{"text": "First step", "done": false}] }`,
        thought_record: `{ "type": "thought_record", "id": "tr-${Date.now()}", "title": "Thought Record", "situation": "${theme}" }`,
        affirmation_card: `{ "type": "affirmation_card", "id": "a-${Date.now()}", "title": "Affirmation", "text": ["You got this."] }`,
        breathing_exercise: `{ "type": "breathing_exercise", "id": "b-${Date.now()}", "title": "Breathe", "cycle": {"inhale":4, "hold":4, "exhale":6} }`
    };

    if (!templates[type]) return null;

    const prompt = `Output ONLY this exact JSON object structure, filling in realistic data for the theme "${theme}": ${templates[type]}`;
    const response = await _callLLM(prompt, 'json');
    const parsed = safeParseJson(response, null);

    return parsed && typeof parsed === 'object' ? parsed : null;
}

async function buildSearchPlan(userMessage, profileStr) {
    const response = await _callLLM(
        PROMPTS.SEARCH_PLAN
            .replace('%PROFILE%', profileStr)
            .replace('%MESSAGE%', userMessage),
        'json'
    );

    return sanitizeSearchPlan(safeParseJson(response, null), userMessage);
}

function formatOsintBrief(report) {
    const condensedSearches = (report.searches || []).map((search) => ({
        query: search.query,
        answerBox: search.answerBox,
        knowledgeGraph: search.knowledgeGraph,
        peopleAlsoAsk: search.peopleAlsoAsk,
        relatedSearches: search.relatedSearches,
        topResults: search.organic?.slice(0, 4),
        localResults: search.places?.slice(0, 3)
    }));

    return JSON.stringify(
        {
            executedAt: report.executedAt,
            primaryQuery: report.primaryQuery,
            supportingQueries: report.supportingQueries,
            searches: condensedSearches,
            news: report.news || [],
            sources: report.sources || []
        },
        null,
        2
    );
}

async function getOllamaResponse(userMessage, toolFollowUp = null, documentText = null) {
    const profileStr = JSON.stringify(chatManager.state.localContentStore, null, 2);

    if (toolFollowUp) {
        const prompt = `${localStorage.getItem(STORAGE_KEYS.PROMPT) || PROMPTS.DEFAULT_SYSTEM}
[Profile]:
${profileStr}
[Note]: User interacted with tool: ${JSON.stringify(toolFollowUp)}`;

        return (await _callLLM(prompt)) || 'I see you used a tool. How are you feeling?';
    }

    const routePrompt = PROMPTS.ROUTER
        .replace('%PROFILE%', profileStr)
        .replace('%USER_MESSAGE%', userMessage);
    const route = (await _callLLM(routePrompt)) || 'GeneralFriendAgent';

    if (route.includes('Knowledge')) {
        const key = await _callLLM(PROMPTS.KNOWLEDGE_MAPPER.replace('%MESSAGE%', userMessage));
        if (key && key !== 'NULL') {
            const content = await fetchMarkdownContent(key.toLowerCase());
            if (content) {
                return (
                    (await _callLLM(
                        PROMPTS.KNOWLEDGE_SYNTHESIS
                            .replace('%MESSAGE%', userMessage)
                            .replace('%CONTENT%', content)
                    )) || "I couldn't pull that knowledge entry together right now."
                );
            }
        }
    }

    if (route.includes('Search')) {
        try {
            const searchPlan = await buildSearchPlan(userMessage, profileStr);
            const osintReport = await postJson(API_ENDPOINTS.osint, searchPlan);

            const synthesisPrompt = PROMPTS.SEARCH_SYNTHESIS
                .replace('%OSINT%', formatOsintBrief(osintReport))
                .replace('%MESSAGE%', userMessage)
                .replace('%PROFILE%', profileStr);

            return (
                (await _callLLM(synthesisPrompt)) ||
                "I found some live sources, but I couldn't turn them into a clean answer just yet."
            );
        } catch (error) {
            console.error('[SearchAgent] Full failure details:', error);
            return "I tried to research that, but I'm having trouble reaching my search stack right now.";
        }
    }

    const vectorContext = await chatManager.searchVectorData(userMessage);
    const historyStr = chatManager
        .getActiveChatHistory()
        .map((message) => `${message.role}: ${message.content}`)
        .join('\n');

    let finalPrompt = `${localStorage.getItem(STORAGE_KEYS.PROMPT) || PROMPTS.DEFAULT_SYSTEM}

[Behavioral Profile]: ${profileStr}

[Relevant Past Memories]:
${vectorContext || 'No specific past context found.'}

[Current Session History]:
${historyStr}

User: ${userMessage}`;

    if (documentText) finalPrompt += `\n[Doc Content]: ${documentText}`;

    return (await _callLLM(finalPrompt)) || "I'm having trouble thinking right now.";
}
