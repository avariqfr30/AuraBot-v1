'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const forbiddenPublicNames = /(?:^\.env(?:\.|$)|^(?:credentials|secrets)\.json$|^service-account.*\.json$|\.(?:db|sqlite3?|log|pem|key|p12|pfx|crt|cer|der|secret|secrets|token)$)/i;
const pagesWorkflow = /(?:actions\/deploy-pages|actions-gh-pages|\bgh-pages\b|pages:\s*write)/i;

const exposed = [];
const workflowRoot = path.join(root, '.github', 'workflows');
if (fs.existsSync(workflowRoot)) {
    for (const entry of fs.readdirSync(workflowRoot, { withFileTypes: true })) {
        if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) continue;
        const target = path.join(workflowRoot, entry.name);
        if (pagesWorkflow.test(fs.readFileSync(target, 'utf8'))) exposed.push(target);
    }
}
const publicRoot = path.join(root, 'public');
const pending = fs.existsSync(publicRoot) ? [publicRoot] : [];
while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const target = path.join(current, entry.name);
        if (entry.isSymbolicLink()) exposed.push(target);
        else if (entry.isDirectory()) pending.push(target);
        else if (forbiddenPublicNames.test(entry.name)) exposed.push(target);
    }
}

if (exposed.length) {
    console.error('Public-exposure guard failed:');
    for (const target of exposed) console.error(`- ${path.relative(root, target)}`);
    process.exitCode = 1;
} else {
    console.log('Public-exposure guard passed.');
}
