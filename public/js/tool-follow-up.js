(function initializeToolFollowUp(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_TOOL_FOLLOW_UP = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createToolFollowUp() {
    const MOODS = new Set(['Happy', 'Okay', 'Neutral', 'Sad', 'Angry']);

    function cleanText(value, limit = 180) {
        return String(value || '')
            .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
            .replace(/<[^>]*>/g, ' ')
            .replace(/[\u0000-\u001f\u007f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, limit);
    }

    function resolve(event = {}) {
        const type = String(event?.type || '');
        if (type === 'mood_logged') {
            const rawMood = cleanText(event.mood, 32);
            const mood = MOODS.has(rawMood) ? rawMood : 'a mood';
            return {
                eventDescription: 'Tool event: The user logged ' + mood + ' in the mood tracker.',
                contextQuery: '',
                guidance: 'Acknowledge the selected mood without assuming its cause, calling it progress, diagnosing, or offering another tool. Leave room to talk or continue.',
                fallback: mood === 'Sad' || mood === 'Angry'
                    ? 'You logged feeling ' + mood + '. I’m here if you want to talk about it, and it’s okay if you don’t.'
                    : 'You logged feeling ' + mood + '. We can talk about it or keep going, whichever feels useful.'
            };
        }

        const completed = {
            checklist_item_completed: 'checklist',
            medication_step_completed: 'medication checklist',
            follow_up_step_completed: 'follow-up plan'
        };
        const toolName = completed[type];
        if (toolName) {
            const step = cleanText(event.text) || 'a step';
            const medication = type === 'medication_step_completed';
            return {
                eventDescription: 'Tool event: The user marked a ' + toolName + ' step complete: ' + JSON.stringify(step) + '.',
                contextQuery: step,
                guidance: medication
                    ? 'Acknowledge only the organizational check. Do not infer that medication was taken or give dosing advice. Do not offer another tool.'
                    : 'Acknowledge this specific step without claiming the whole plan is complete or overcelebrating. Mention a next step only if it follows naturally. Do not offer another tool.',
                fallback: medication
                    ? 'That check is marked complete. If you have a medication question, the label or a pharmacist can help confirm the details.'
                    : JSON.stringify(step) + ' is checked off. We can look at the next step when you’re ready.'
            };
        }

        return {
            eventDescription: 'Tool event: An Aura tool was updated.',
            contextQuery: '',
            guidance: 'Acknowledge the update briefly. Do not assume an outcome or offer another tool.',
            fallback: 'The tool is updated. We can continue whenever you’re ready.'
        };
    }

    return { resolve };
});
