'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');

const ROOT_DIR = path.resolve(__dirname, '..');

test('Docker runtime wrapper rejects data directories inside public before invoking Docker', async () => {
    const result = await new Promise((resolve) => {
        const child = spawn(process.execPath, ['scripts/chroma-docker.js', 'up'], {
            cwd: ROOT_DIR,
            env: {
                ...process.env,
                AURA_DATA_DIR: path.join(ROOT_DIR, 'public', 'runtime')
            },
            stdio: ['ignore', 'pipe', 'pipe']
        });
        let stderr = '';
        child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
        child.once('exit', (code) => resolve({ code, stderr }));
    });

    assert.equal(result.code, 1);
    assert.match(result.stderr, /AURA_DATA_DIR must be outside the public directory/);
});
