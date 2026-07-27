// js/ui.js
const chatMessages = document.getElementById('chatMessages');
const chatList = document.getElementById('chatList');
const settingsModal = document.getElementById('settingsModal');
const toolsModal = document.getElementById('toolsModal');
const toolsModalContent = document.getElementById('toolsModalContent');
const toolsButton = document.getElementById('toolsButton');
let contentModalElement = null;
let activeModalElement = null;
let modalReturnFocus = null;

function activateModal(modal) {
    if (!modal) return;
    activeModalElement = modal;
    modalReturnFocus = document.activeElement;
    modal.classList.remove('hidden');
    const dialog = modal.querySelector('[role="dialog"]') || modal;
    window.requestAnimationFrame(() => dialog.focus());
}

function deactivateModal(modal) {
    if (!modal) return;
    if (modal !== contentModalElement) modal.classList.add('hidden');
    if (activeModalElement === modal) activeModalElement = null;
    const returnTarget = modalReturnFocus;
    modalReturnFocus = null;
    if (returnTarget && document.contains(returnTarget)) returnTarget.focus();
}

function getFocusableElements(modal) {
    return [...modal.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((element) => !element.closest('.hidden'));
}

function closeActiveModal() {
    if (!activeModalElement) return;
    if (activeModalElement === contentModalElement) return closeContentModal();
    if (activeModalElement === settingsModal) return closeSettingsModal();
    if (activeModalElement === toolsModal) return closeToolsModal();
    if (activeModalElement.id === 'insightsModal') return closeInsightsModal();
}

document.addEventListener('keydown', (event) => {
    if (!activeModalElement) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closeActiveModal();
        return;
    }
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements(activeModalElement);
    if (!focusable.length) {
        event.preventDefault();
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const dialog = activeModalElement.querySelector('[role="dialog"]') || activeModalElement;
    if (!activeModalElement.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
    } else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
});

document.addEventListener('click', (event) => {
    if (activeModalElement && event.target === activeModalElement) closeActiveModal();
});

function clearChatMessages() {
    chatMessages.innerHTML = '';
    chatMessages.classList.remove('is-empty');
}

function escapeHTML(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function showSourcesModal(links = []) {
    const validLinks = (links || []).filter((link) => link?.href && link?.label);
    if (!validLinks.length) return;

    closeContentModal();
    contentModalElement = document.createElement('div');
    contentModalElement.id = 'contentModal';
    contentModalElement.className = 'fixed inset-0 z-[60] overflow-y-auto bg-black bg-opacity-75 flex items-center justify-center p-4';

    const modalContent = document.createElement('div');
    modalContent.className = 'relative liquid-glass liquid-panel rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto';
    modalContent.setAttribute('data-liquid', '');
    modalContent.setAttribute('role', 'dialog');
    modalContent.setAttribute('aria-modal', 'true');
    modalContent.setAttribute('aria-labelledby', 'contentTitle');
    modalContent.tabIndex = -1;

    const sourceItemsHtml = validLinks.map((link, index) => `
        <li class="source-modal-item">
            <a href="${escapeHTML(link.href)}" target="_blank" rel="noopener noreferrer" class="source-modal-link">
                <span class="source-modal-index">${index + 1}.</span>
                <span class="source-modal-label">${escapeHTML(link.label)}</span>
            </a>
        </li>
    `).join('');

    modalContent.innerHTML = `
        <h3 id="contentTitle" class="text-2xl font-bold mb-4 text-gray-100">Sources</h3>
        <div class="source-modal-copy">Open any source below if you want to inspect the underlying material.</div>
        <ol class="source-modal-list">${sourceItemsHtml}</ol>
        <div class="mt-6 flex justify-end">
            <button type="button" id="closeContentButton" class="px-4 py-2 rounded-xl transition duration-200">Close</button>
        </div>`;

    contentModalElement.appendChild(modalContent);
    document.body.appendChild(contentModalElement);
    activateModal(contentModalElement);
    if (window.setupLiquidGlassInteractions) window.setupLiquidGlassInteractions();
    document.getElementById('closeContentButton').addEventListener('click', closeContentModal);
}

function renderEmptyState() {
    chatMessages.classList.add('is-empty');
    chatMessages.innerHTML = `
        <section class="empty-state-panel" aria-label="Start a new conversation">
            <div class="empty-state-badge" aria-hidden="true">
                <svg width="42" height="42" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
                    <path d="M50 10 C 20 10, 10 30, 10 50 C 10 90, 40 100, 50 100 C 60 100, 90 90, 90 50 C 90 30, 80 10, 50 10 Z" fill="#0d1118"/>
                    <path d="M30 10 L 25 20 L 40 25 Z" fill="#0d1118"/>
                    <path d="M70 10 L 75 20 L 60 25 Z" fill="#0d1118"/>
                    <path d="M50 70 C 40 70, 35 60, 35 60 L 65 60 C 65 60, 60 70, 50 70 Z" fill="white"/>
                    <path d="M40 85 C 40 95, 60 95, 60 85 L 60 70 L 40 70 Z" fill="white"/>
                    <circle cx="35" cy="45" r="5" fill="white"/>
                    <circle cx="65" cy="45" r="5" fill="white"/>
                </svg>
            </div>
            <h2 class="empty-state-title">What do you want to work through?</h2>
            <p class="empty-state-subtitle">Talk naturally. Aura will stay with the current topic, use personal context only when it fits, and offer practical help without pushing it.</p>
            <div class="prompt-chip-grid">
                <button type="button" class="prompt-chip" data-prompt-suggestion="I want to talk through something that has been on my mind.">Talk something through</button>
                <button type="button" class="prompt-chip" data-prompt-suggestion="Help me make a calm, realistic plan for what I need to do.">Make a calm plan</button>
                <button type="button" class="prompt-chip" data-prompt-suggestion="Help me understand a health question in clear, careful language.">Understand a health question</button>
            </div>
        </section>`;
}

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

function renderSafetyPlanInModal(plan, container) {
    const section = document.createElement('div');
    section.className = 'safety-plan-card tool-card';
    const renderList = (items, emptyText) => {
        if (!Array.isArray(items) || items.length === 0) return `<p class="text-sm text-gray-500">${escapeHTML(emptyText)}</p>`;
        return `<ul class="list-disc list-inside space-y-1 text-sm">${items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`;
    };
    const contacts = Array.isArray(plan.peopleToContact)
        ? plan.peopleToContact
            .map((entry) => {
                const name = escapeHTML(entry?.name || 'Contact');
                const contact = escapeHTML(entry?.contact || 'Add details');
                return `<li>${name}: ${contact}</li>`;
            })
            .join('')
        : '';

    section.innerHTML = `
        <h4 class="text-xl font-bold mb-3 text-gray-200">${escapeHTML(plan.title || 'Personal Safety Plan')}</h4>
        <div class="space-y-3">
            <div><h5 class="font-semibold text-sm mb-1">Warning Signs</h5>${renderList(plan.warningSigns, 'Add personal warning signs.')}</div>
            <div><h5 class="font-semibold text-sm mb-1">Grounding Steps</h5>${renderList(plan.groundingSteps, 'Add grounding steps that work for you.')}</div>
            <div><h5 class="font-semibold text-sm mb-1">People To Contact</h5>${contacts ? `<ul class="list-disc list-inside space-y-1 text-sm">${contacts}</ul>` : '<p class="text-sm text-gray-500">Add trusted contacts.</p>'}</div>
            <div><h5 class="font-semibold text-sm mb-1">Safer Environment</h5>${renderList(plan.saferEnvironment, 'Add actions that increase immediate safety.')}</div>
            <div><h5 class="font-semibold text-sm mb-1">Professional Support</h5>${renderList(plan.professionalSupport, 'Add clinician or support resources.')}</div>
            <div><h5 class="font-semibold text-sm mb-1">Reasons To Stay</h5>${renderList(plan.reasonsToStay, 'Add personal anchors worth protecting.')}</div>
        </div>`;
    container.appendChild(section);
}

function renderMedicationChecklistInModal(checklist, container) {
    const section = document.createElement('div');
    section.className = 'medication-checklist-card tool-card';
    const checks = Array.isArray(checklist.checks) ? checklist.checks : [];
    let checksHTML = '<ul class="checklist-columns space-y-3">';
    checks.forEach((item, index) => {
        checksHTML += `
            <li class="flex items-center">
                <input type="checkbox" id="modal-${escapeHTML(checklist.id)}-med-${index}"
                       class="h-5 w-5 rounded border-gray-500 bg-gray-800 text-pink-600 focus:ring-pink-500 mr-4 shrink-0"
                       data-tool-type="medication_checklist" data-tool-id="${escapeHTML(checklist.id)}" data-item-index="${index}" ${item.done ? 'checked' : ''}>
                <label for="modal-${escapeHTML(checklist.id)}-med-${index}" class="transition-colors duration-200 text-base ${item.done ? 'line-through text-gray-500' : 'text-gray-200'}">
                    ${escapeHTML(item.text)}
                </label>
            </li>`;
    });
    checksHTML += '</ul>';

    section.innerHTML = `
        <h4 class="text-xl font-bold mb-2 text-gray-200">${escapeHTML(checklist.title || 'Medication Safety Checklist')}</h4>
        <p class="text-sm text-gray-400 mb-3">${escapeHTML(checklist.medicationName || 'Medication')}</p>
        ${checksHTML}
        ${checklist.notes ? `<p class="text-xs text-gray-500 mt-3">${escapeHTML(checklist.notes)}</p>` : ''}`;
    container.appendChild(section);
}

function renderAppointmentPrepInModal(prep, container) {
    const section = document.createElement('div');
    section.className = 'appointment-prep-card tool-card';
    const renderList = (items) => {
        if (!Array.isArray(items) || items.length === 0) return '<p class="text-sm text-gray-500">No items yet.</p>';
        return `<ul class="list-disc list-inside space-y-1 text-sm">${items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`;
    };

    section.innerHTML = `
        <h4 class="text-xl font-bold mb-2 text-gray-200">${escapeHTML(prep.title || 'Appointment Prep')}</h4>
        <p class="text-sm text-gray-400 mb-3">${escapeHTML(prep.summary || '')}</p>
        <div class="space-y-3">
            <div><h5 class="font-semibold text-sm mb-1">Symptom Timeline</h5>${renderList(prep.symptomTimeline)}</div>
            <div><h5 class="font-semibold text-sm mb-1">Questions To Ask</h5>${renderList(prep.questions)}</div>
            <div><h5 class="font-semibold text-sm mb-1">Medications To Mention</h5>${renderList(prep.medsToMention)}</div>
        </div>`;
    container.appendChild(section);
}

function renderFollowUpPlanInModal(plan, container) {
    const section = document.createElement('div');
    section.className = 'follow-up-plan-card tool-card';
    const checkpoints = Array.isArray(plan.checkpoints) ? plan.checkpoints : [];
    let html = '<ul class="checklist-columns space-y-3">';
    checkpoints.forEach((item, index) => {
        const label = `${escapeHTML(item.when || 'Soon')}: ${escapeHTML(item.action || 'Action step')}`;
        html += `
            <li class="flex items-center">
                <input type="checkbox" id="modal-${escapeHTML(plan.id)}-follow-${index}"
                       class="h-5 w-5 rounded border-gray-500 bg-gray-800 text-pink-600 focus:ring-pink-500 mr-4 shrink-0"
                       data-tool-type="follow_up_plan" data-tool-id="${escapeHTML(plan.id)}" data-item-index="${index}" ${item.done ? 'checked' : ''}>
                <label for="modal-${escapeHTML(plan.id)}-follow-${index}" class="transition-colors duration-200 text-base ${item.done ? 'line-through text-gray-500' : 'text-gray-200'}">
                    ${label}
                </label>
            </li>`;
    });
    html += '</ul>';

    section.innerHTML = `
        <h4 class="text-xl font-bold mb-3 text-gray-200">${escapeHTML(plan.title || 'Follow-up Plan')}</h4>
        ${html}`;
    container.appendChild(section);
}

function renderThoughtRecordInModal(record, container) {
    const section = document.createElement('div');
    section.className = 'thought-record-card tool-card'; section.dataset.toolId = record.id;

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

function renderToolsInModal(tools) {
    toolsModalContent.innerHTML = '';
    let hasTools = false;
    const renderOrder = [
        'mood_tracker',
        'checklist',
        'safety_plan',
        'medication_checklist',
        'appointment_prep',
        'follow_up_plan',
        'thought_record',
        'breathing_exercise',
        'affirmation_card'
    ];
    renderOrder.forEach(toolName => {
        if (tools[toolName]?.length > 0) {
            hasTools = true;
            tools[toolName].forEach(toolInstance => {
                switch (toolName) {
                    case 'mood_tracker': renderMoodTrackerInModal(toolInstance, toolsModalContent); break;
                    case 'checklist': renderChecklistInModal(toolInstance, toolsModalContent); break;
                    case 'safety_plan': renderSafetyPlanInModal(toolInstance, toolsModalContent); break;
                    case 'medication_checklist': renderMedicationChecklistInModal(toolInstance, toolsModalContent); break;
                    case 'appointment_prep': renderAppointmentPrepInModal(toolInstance, toolsModalContent); break;
                    case 'follow_up_plan': renderFollowUpPlanInModal(toolInstance, toolsModalContent); break;
                    case 'thought_record': renderThoughtRecordInModal(toolInstance, toolsModalContent); break;
                    case 'breathing_exercise': renderBreathingExerciseInModal(toolInstance, toolsModalContent); break;
                    case 'affirmation_card': renderAffirmationCardInModal(toolInstance, toolsModalContent); break;
                }
            });
        }
    });
    if (!hasTools) { toolsModalContent.innerHTML = '<p class="text-gray-400 text-center w-full">No tools created yet.</p>'; }
}

// --- Chat Messages ---
function renderToolOffer(offer, options = {}) {
    const normalized = window.AURA_TOOL_ARTIFACTS?.normalizeToolOffer(offer);
    if (!normalized) return null;

    const labels = {
        mood_tracker: 'mood tracker',
        checklist: 'checklist',
        thought_record: 'thought record',
        affirmation_card: 'grounding card',
        breathing_exercise: 'breathing reset',
        safety_plan: 'safety plan',
        medication_checklist: 'medication checklist',
        appointment_prep: 'appointment prep card',
        follow_up_plan: 'follow-up plan'
    };
    const card = document.createElement('section');
    card.className = `tool-offer-card is-${normalized.status}`;
    card.setAttribute('aria-label', `Optional ${labels[normalized.type] || 'support tool'}`);

    const heading = document.createElement('div');
    heading.className = 'tool-offer-heading';
    heading.textContent = `Would a ${labels[normalized.type] || 'support tool'} help?`;
    card.appendChild(heading);

    const description = document.createElement('p');
    description.className = 'tool-offer-description';
    description.textContent = normalized.theme;
    card.appendChild(description);

    const actionRow = document.createElement('div');
    actionRow.className = 'tool-offer-actions';
    if (normalized.status === 'pending') {
        actionRow.innerHTML = `
            <button type="button" class="tool-offer-button primary" data-action="create_tool_offer">Create</button>
            <button type="button" class="tool-offer-button secondary" data-action="dismiss_tool_offer">Not now</button>`;
    } else if (normalized.status === 'creating') {
        actionRow.innerHTML = '<span class="tool-offer-status" role="status">Creating…</span>';
    } else if (normalized.status === 'created') {
        actionRow.innerHTML = '<button type="button" class="tool-offer-button secondary" data-action="open_tools">Created · Open Toolbox</button>';
    } else {
        actionRow.innerHTML = '<span class="tool-offer-status">Not now</span>';
    }

    actionRow.querySelectorAll('[data-action]').forEach((button) => {
        button.dataset.chatId = String(options.chatId || '');
        button.dataset.messageIndex = String(options.messageIndex ?? '');
    });
    card.appendChild(actionRow);
    return card;
}

function addMessage(sender, content, options = {}) {
    chatMessages.querySelector('.empty-state-panel')?.remove();
    chatMessages.classList.remove('is-empty');
    const messageDiv = document.createElement('div');
    const isUser = sender === 'user';
    messageDiv.className = isUser ? 'flex justify-end mb-4' : 'flex justify-start mb-4';
    const chatBubble = document.createElement('div');
    chatBubble.className = `chat-bubble max-w-[75%] p-4 rounded-xl shadow-md ${isUser ? 'user' : 'ai'}`;

    const extractSourceLinksFromMessage = (messageText) => {
        const raw = String(messageText || '');
        const markdownLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/gi;
        const lines = raw.split('\n');
        const links = [];
        const bodyLines = [];

        lines.forEach((line) => {
            if (!/^\s*Sources:\s*/i.test(line)) {
                bodyLines.push(line);
                return;
            }

            const sourceText = line.replace(/^\s*Sources:\s*/i, '');
            const lineLinks = [...sourceText.matchAll(markdownLinkRegex)].map((match) => ({
                label: (match[1] || '').trim(),
                href: (match[2] || '').trim()
            })).filter((link) => link.label && link.href);

            if (lineLinks.length > 0) {
                links.push(...lineLinks);
                return;
            }

            const urlRegex = /(https?:\/\/[^\s,]+)/gi;
            const plainUrls = [...sourceText.matchAll(urlRegex)].map((match) => ({
                label: (match[1] || '').trim(),
                href: (match[1] || '').trim()
            })).filter((link) => link.label && link.href);

            if (plainUrls.length > 0) {
                links.push(...plainUrls);
            }
        });

        const dedupedLinks = links.filter((link, index, items) =>
            items.findIndex((candidate) => candidate.href === link.href) === index
        );

        return {
            body: bodyLines.join('\n').trim(),
            links: dedupedLinks
        };
    };

    if (isUser) {
        const p = document.createElement('p'); p.textContent = content; chatBubble.appendChild(p);

        if (Number.isInteger(options.messageIndex)) {
            const actionRow = document.createElement('div');
            actionRow.className = 'message-action-row mt-3 flex justify-end';
            actionRow.innerHTML = `<button type="button" class="message-action-button" data-action="edit_resend_message" data-message-index="${options.messageIndex}">Edit &amp; Resend</button>`;
            chatBubble.appendChild(actionRow);
        }
    } else {
        const safeContent = typeof window.getDisplaySafeAssistantContent === 'function'
            ? window.getDisplaySafeAssistantContent(content)
            : String(content || '');
        const { body, links } = extractSourceLinksFromMessage(safeContent);
        chatBubble.innerHTML = DOMPurify.sanitize(
            marked.parse(body || "That came through a little messy. Ask again and I'll clean it up.")
        );
        const toolOfferCard = renderToolOffer(options.toolOffer, options);
        if (toolOfferCard) chatBubble.appendChild(toolOfferCard);

        if (links.length > 0) {
            messageDiv.className = 'flex flex-col items-start mb-4 gap-2';
            const sourceRow = document.createElement('div');
            sourceRow.className = 'source-link-row';
            const sourceButton = document.createElement('button');
            sourceButton.type = 'button';
            sourceButton.className = 'source-link-button';
            sourceButton.textContent = 'Sources';
            sourceButton.setAttribute('aria-label', `Open ${links.length} sources`);
            sourceButton.addEventListener('click', () => showSourcesModal(links));
            sourceRow.appendChild(sourceButton);

            messageDiv.appendChild(chatBubble);
            messageDiv.appendChild(sourceRow);
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
            return;
        }
    }
    messageDiv.appendChild(chatBubble); chatMessages.appendChild(messageDiv);
    chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

function addToolStatusMessage(toolType) {
    chatMessages.querySelector('.empty-state-panel')?.remove();
    chatMessages.classList.remove('is-empty');
    const formattedName = toolType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    const actionCopy = {
        mood_tracker: 'Aura is opening a mood tracker.',
        checklist: 'Aura is turning this into a checklist.',
        thought_record: 'Aura is setting up a thought record.',
        affirmation_card: 'Aura is making an affirmation card.',
        breathing_exercise: 'Aura is opening a breathing reset.',
        safety_plan: 'Aura is building a safety plan.',
        medication_checklist: 'Aura is organizing a medication checklist.',
        appointment_prep: 'Aura is preparing an appointment card.',
        follow_up_plan: 'Aura is setting up a follow-up plan.'
    };
    const statusDiv = document.createElement('div');
    statusDiv.className = 'flex justify-start tool-status-message mb-4';
    statusDiv.innerHTML = `
        <div class="chat-bubble max-w-[75%] p-3 rounded-xl shadow-md bg-gray-800 text-gray-400 flex items-center space-x-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 animate-spin" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" />
            </svg>
            <i>${actionCopy[toolType] || `Aura is setting up ${formattedName}.`}</i>
        </div>`;
    chatMessages.appendChild(statusDiv); chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}

function removeToolStatusMessages() { document.querySelectorAll('.tool-status-message').forEach(msg => msg.remove()); }

function displayChat(history) {
    const liveMode = chatMessages.getAttribute('aria-live') || 'polite';
    chatMessages.setAttribute('aria-live', 'off');
    clearChatMessages();
    if (!history || history.length === 0) {
        renderEmptyState();
        window.requestAnimationFrame(() => chatMessages.setAttribute('aria-live', liveMode));
        return;
    }
    const chatId = window.chatManager?.getActiveChatId?.() || '';
    (history || []).forEach((message, index) => {
        addMessage(message.role, message.content, {
            messageIndex: index,
            chatId,
            toolOffer: message.toolOffer
        });
    });
    processContentLinks();
    window.requestAnimationFrame(() => chatMessages.setAttribute('aria-live', liveMode));
}

function renderChatList(chats, activeChatId) {
    chatList.innerHTML = '';
    const sortedChats = Object.values(chats || {}).filter(c => c?.id).sort((a, b) => b.id - a.id);
    sortedChats.forEach(chat => {
        const chatTab = document.createElement('div');
        chatTab.className = `chat-tab ${chat.id === activeChatId ? 'bg-gray-700 text-white' : 'text-gray-300'}`;

        const selectButton = document.createElement('button');
        selectButton.type = 'button';
        selectButton.className = 'chat-tab-select';
        selectButton.dataset.chatId = chat.id;
        selectButton.setAttribute('role', 'tab');
        selectButton.setAttribute('aria-selected', chat.id === activeChatId ? 'true' : 'false');
        selectButton.setAttribute('aria-controls', 'chatMessages');
        selectButton.tabIndex = chat.id === activeChatId ? 0 : -1;

        const chatTitle = document.createElement('span');
        chatTitle.textContent = chat.title;
        chatTitle.className = 'chat-tab-title';
        selectButton.appendChild(chatTitle);

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'delete-chat-button ml-1';
        deleteBtn.dataset.chatId = chat.id;
        deleteBtn.setAttribute('aria-label', `Delete ${chat.title}`);
        deleteBtn.innerHTML = `<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>`;

        chatTab.appendChild(selectButton);
        chatTab.appendChild(deleteBtn);
        chatList.appendChild(chatTab);
    });
}

function toggleToolsButton(hasTools) { toolsButton.classList.toggle('hidden', !hasTools); }
function showTypingIndicator(message = 'Aura is thinking this through.') {
    if (document.getElementById('typingIndicator')) return;
    chatMessages.setAttribute('aria-busy', 'true');
    chatMessages.querySelector('.empty-state-panel')?.remove();
    chatMessages.classList.remove('is-empty');
    const typingDiv = document.createElement('div'); typingDiv.id = 'typingIndicator'; typingDiv.className = 'flex justify-start mb-4';
    typingDiv.innerHTML = `<div class="chat-bubble bg-gray-800 max-w-[75%] p-4 rounded-xl shadow-md"><div class="typing-content"><div class="typing-dots"><span style="animation-delay: -0.3s;"></span><span style="animation-delay: -0.15s;"></span><span></span></div><span class="typing-status">${escapeHTML(message)}</span></div></div>`;
    chatMessages.appendChild(typingDiv); chatMessages.scrollTo({ top: chatMessages.scrollHeight, behavior: 'smooth' });
}
function updateTypingIndicator(message) {
    const target = document.querySelector('#typingIndicator .typing-status');
    if (target) target.textContent = message;
}
function hideTypingIndicator() {
    document.getElementById('typingIndicator')?.remove();
    chatMessages.setAttribute('aria-busy', 'false');
}

// --- Modals ---
function openToolsModal() { activateModal(toolsModal); }
function closeToolsModal() { deactivateModal(toolsModal); }
function openSettingsModal() { activateModal(settingsModal); }
function closeSettingsModal() { deactivateModal(settingsModal); }

// Insights Modal Render
function openInsightsModal() {
    const modal = document.getElementById('insightsModal');
    const container = document.getElementById('insightsContent');
    const store = window.chatManager ? window.chatManager.getActiveContentStore() : {};
    const userStore = window.chatManager ? window.chatManager.getUserMemoryStore() : {};
    const userMemoryEnabled = localStorage.getItem(STORAGE_KEYS.USER_MEMORY_ENABLED) === 'true';
    const prefs = store.responsePreferences || {};

    const renderList = (arr, emptyMsg) => {
        if (!arr || arr.length === 0) {
            return `<p class="text-gray-500 italic">${escapeHTML(emptyMsg)}</p>`;
        }
        return `<ul class="list-disc list-inside space-y-1">${arr.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`;
    };

    container.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="bg-gray-800 p-4 rounded-lg">
                <h4 class="text-pink-400 font-semibold mb-2">Communication Style</h4>
                <p>${escapeHTML(store.communicationStyle || "Not established.")}</p>
            </div>
            <div class="bg-gray-800 p-4 rounded-lg">
                <h4 class="text-pink-400 font-semibold mb-2">Relevant Context</h4>
                ${renderList(store.behavioralFacts, "No personal context noted yet.")}
            </div>
            <div class="bg-gray-800 p-4 rounded-lg">
                <h4 class="text-pink-400 font-semibold mb-2">Mood Patterns</h4>
                ${renderList(store.moodPatterns, "No strong patterns detected.")}
            </div>
            <div class="bg-gray-800 p-4 rounded-lg border border-white/10">
                <h4 class="text-pink-400 font-semibold mb-2">Patterns Worth Noticing</h4>
                ${renderList(store.potentialLapses, "No recurring caution patterns noted.")}
            </div>
            <div class="bg-gray-800 p-4 rounded-lg border border-blue-900">
                <h4 class="text-blue-300 font-semibold mb-2">Response Preferences</h4>
                <p class="text-sm">Tone: ${escapeHTML(prefs.likelyTone || 'neutral')}</p>
                <p class="text-sm">Detail: ${escapeHTML(prefs.detailLevel || 'balanced')}</p>
                <p class="text-sm">Reassurance: ${escapeHTML(prefs.reassuranceLevel || 'medium')}</p>
                <p class="text-sm">Technical depth: ${escapeHTML(prefs.technicalLevel || 'plain')}</p>
                <p class="text-sm">Structure: ${escapeHTML(prefs.structureLevel || 'paragraphs')}</p>
                <p class="text-sm">Directness: ${escapeHTML(prefs.directnessLevel || 'balanced')}</p>
            </div>
            <div class="bg-gray-800 p-4 rounded-lg border border-cyan-900">
                <h4 class="text-cyan-300 font-semibold mb-2">Persistent Companion Memory</h4>
                <p class="text-sm mb-2">${userMemoryEnabled ? 'Enabled across chats on this device.' : 'Disabled.'}</p>
                ${renderList(userStore.behavioralFacts, "No durable cross-chat memory stored yet.")}
            </div>
        </div>
    `;
    activateModal(modal);
}
function closeInsightsModal() { deactivateModal(document.getElementById('insightsModal')); }

function showContentModal(title, markdownContent) {
    closeContentModal();
    contentModalElement = document.createElement('div'); contentModalElement.id = 'contentModal'; contentModalElement.className = 'fixed inset-0 z-[60] overflow-y-auto bg-black bg-opacity-75 flex items-center justify-center p-4';
    const modalContent = document.createElement('div'); modalContent.className = 'relative liquid-glass liquid-panel rounded-3xl p-6 w-full max-w-2xl shadow-2xl max-h-[80vh] overflow-y-auto'; modalContent.setAttribute('data-liquid', ''); modalContent.setAttribute('role', 'dialog'); modalContent.setAttribute('aria-modal', 'true'); modalContent.setAttribute('aria-labelledby', 'contentTitle'); modalContent.tabIndex = -1;
    modalContent.innerHTML = `
        <h3 id="contentTitle" class="text-2xl font-bold mb-4 text-gray-100">${escapeHTML(title)}</h3>
        <div class="prose prose-invert max-w-none text-gray-300">${DOMPurify.sanitize(marked.parse(markdownContent))}</div>
        <div class="mt-6 flex justify-end">
            <button type="button" id="closeContentButton" class="px-4 py-2 rounded-xl transition duration-200">Close</button>
        </div>`;
    contentModalElement.appendChild(modalContent); document.body.appendChild(contentModalElement);
    activateModal(contentModalElement);
    if (window.setupLiquidGlassInteractions) window.setupLiquidGlassInteractions();
    document.getElementById('closeContentButton').addEventListener('click', closeContentModal);
}
function closeContentModal() {
    if (!contentModalElement) return;
    const modal = contentModalElement;
    deactivateModal(modal);
    modal.remove();
    contentModalElement = null;
}

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
