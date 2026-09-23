'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.resolve(__dirname, '../public/js/ui.js'), 'utf8');
const sandbox = {
    document: {
        getElementById: () => ({}),
        addEventListener: () => {},
        createElement: () => ({ innerHTML: '', className: '', dataset: {} })
    },
    window: {}
};
vm.runInNewContext(source + '\n globalThis.toolRenderers = { renderChecklistInModal, renderBreathingExerciseInModal, renderAffirmationCardInModal, renderMoodTrackerInModal, renderThoughtRecordInModal };', sandbox);

function render(name, tool) {
    const container = { children: [], appendChild(node) { this.children.push(node); } };
    sandbox.toolRenderers[name](tool, container);
    return container.children[0].innerHTML;
}

const unsafe = '<img src=x onerror=alert(1)>';
const checklist = render('renderChecklistInModal', {
    id: '" onfocus="alert(1)', title: unsafe, items: [{ text: unsafe, done: false }]
});
assert.doesNotMatch(checklist, /<img|id="modal-" onfocus=/);
assert.match(checklist, /&lt;img/);

const breathing = render('renderBreathingExerciseInModal', {
    title: unsafe, cycle: { inhale: 4, hold: 4, exhale: 6 }
});
assert.doesNotMatch(breathing, /<img/);

const affirmation = render('renderAffirmationCardInModal', {
    title: unsafe, text: [unsafe]
});
assert.doesNotMatch(affirmation, /<img/);

const mood = render('renderMoodTrackerInModal', {
    title: unsafe, options: ['" onmouseover="alert(1)']
});
assert.doesNotMatch(mood, /<img|data-mood="" onmouseover=/);

const thought = render('renderThoughtRecordInModal', {
    id: '" onfocus="alert(1)', title: unsafe, situation: unsafe
});
assert.doesNotMatch(thought, /<img|data-tool-id="" onfocus=/);

assert.doesNotThrow(() => render('renderChecklistInModal', {
    id: 'old-list', title: 'Old checklist', items: 'invalid saved items'
}));
assert.doesNotThrow(() => render('renderMoodTrackerInModal', {
    title: 'Old tracker', options: 'invalid saved options'
}));
assert.doesNotThrow(() => render('renderBreathingExerciseInModal', {
    title: 'Old breathing card', cycle: null
}));

console.log('tool UI tests passed');
