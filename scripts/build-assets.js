#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const vendorDir = path.join(root, 'public', 'js', 'vendor');
fs.mkdirSync(vendorDir, { recursive: true });

for (const [source, destination] of [
    ['node_modules/marked/lib/marked.umd.js', 'public/js/vendor/marked.js'],
    ['node_modules/dompurify/dist/purify.min.js', 'public/js/vendor/purify.js']
]) {
    fs.copyFileSync(path.join(root, source), path.join(root, destination));
}

execFileSync(path.join(root, 'node_modules', '.bin', 'tailwindcss'), [
    '--input', path.join(root, 'public', 'css', 'tailwind.input.css'),
    '--output', path.join(root, 'public', 'css', 'tailwind.generated.css'),
    '--content', path.join(root, 'public', '**', '*.{html,js}'),
    '--minify'
], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, BROWSERSLIST_IGNORE_OLD_DATA: 'true' }
});
