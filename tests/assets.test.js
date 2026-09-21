'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

test('client page loads only packaged scripts and styles', () => {
    assert.doesNotMatch(html, /<script[^>]+src="https?:\/\//i);
    assert.match(html, /css\/tailwind\.generated\.css/);
    assert.match(html, /js\/vendor\/marked\.js/);
    assert.match(html, /js\/vendor\/purify\.js/);
    assert.match(html, /href="https:\/\/ollama\.com\/privacy"/);
    assert.doesNotMatch(html, /ollamaCloudConsentCheckbox/);
});

test('packaged assets needed by the chat page exist after build', () => {
    for (const file of [
        'public/css/tailwind.generated.css',
        'public/js/vendor/marked.js',
        'public/js/vendor/purify.js'
    ]) {
        assert.ok(fs.statSync(path.join(root, file)).size > 1000, `${file} must be built`);
    }
});
