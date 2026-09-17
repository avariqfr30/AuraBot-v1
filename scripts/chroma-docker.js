#!/usr/bin/env node

'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveRuntimePaths } = require('../lib/runtime-paths');

const rootDir = path.resolve(__dirname, '..');

function runDocker(command, args) {
    const paths = resolveRuntimePaths(process.env, rootDir);
    const child = spawn('docker', ['compose', command, ...args], {
        cwd: rootDir,
        env: {
            ...process.env,
            AURA_CHROMA_DOCKER_PATH: paths.chromaPath
        },
        stdio: 'inherit'
    });

    child.once('error', (error) => {
        console.error(`Failed to start Docker Compose: ${error.message}`);
        process.exitCode = 1;
    });
    child.once('exit', (code, signal) => {
        if (signal) process.kill(process.pid, signal);
        process.exitCode = code || 0;
    });
}

const [command] = process.argv.slice(2);
if (command === 'up') {
    runDocker('up', ['-d', 'chromadb']);
} else if (command === 'stop') {
    runDocker('stop', ['chromadb']);
} else if (command === 'logs') {
    runDocker('logs', ['-f', 'chromadb']);
} else {
    console.error('Usage: node scripts/chroma-docker.js <up|stop|logs>');
    process.exitCode = 2;
}
