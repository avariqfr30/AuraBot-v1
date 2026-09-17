#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { resolveRuntimePaths } = require('../lib/runtime-paths');

const rootDir = path.resolve(__dirname, '..');
const { logFile } = resolveRuntimePaths(process.env, rootDir);

if (!fs.existsSync(logFile)) {
    console.log(`No Chroma log file found at ${logFile}.`);
    process.exit(0);
}

const tail = spawn('tail', ['-f', logFile], { stdio: 'inherit' });
tail.once('error', (error) => {
    console.error(`Failed to follow Chroma logs: ${error.message}`);
    process.exitCode = 1;
});
tail.once('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exitCode = code || 0;
});
