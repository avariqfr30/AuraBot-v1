#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('node:child_process');
const { resolveRuntimePaths } = require('../lib/runtime-paths');
const {
    hasExpectedProcessToken,
    parsePidRecord
} = require('../lib/chroma-process');

const rootDir = path.resolve(__dirname, '..');
const { pidFile } = resolveRuntimePaths(process.env, rootDir);

function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (_error) {
        return false;
    }
}

function getProcessDescription(pid) {
    const result = spawnSync('ps', ['eww', '-p', String(pid), '-o', 'command='], {
        encoding: 'utf8'
    });
    return result.status === 0 ? result.stdout.trim() : '';
}

function waitForProcessExit(pid, timeoutMs = 5000) {
    const startedAt = Date.now();
    return new Promise((resolve) => {
        const check = () => {
            if (!isProcessRunning(pid)) return resolve(true);
            if ((Date.now() - startedAt) >= timeoutMs) return resolve(false);
            setTimeout(check, 50);
        };
        check();
    });
}

async function main() {
    if (!fs.existsSync(pidFile)) {
        console.log('Chroma is not running from this workspace.');
        return;
    }

    const { pid, token } = parsePidRecord(fs.readFileSync(pidFile, 'utf8'));

    if (!pid || !isProcessRunning(pid)) {
        fs.rmSync(pidFile, { force: true });
        console.log(`No running Chroma process found for PID ${pid || 'unknown'}`);
        return;
    }

    if (!hasExpectedProcessToken(getProcessDescription(pid), token)) {
        console.error(`Refusing to stop PID ${pid}: it cannot be verified as the Chroma process started by this workspace.`);
        console.error(`The PID file was left at ${pidFile} for manual inspection.`);
        process.exitCode = 1;
        return;
    }

    process.kill(pid, 'SIGTERM');
    if (!await waitForProcessExit(pid)) {
        console.error(`Chroma PID ${pid} did not stop within 5 seconds. The PID file was preserved.`);
        process.exitCode = 1;
        return;
    }

    fs.rmSync(pidFile, { force: true });
    console.log(`Stopped Chroma PID ${pid}`);
}

main().catch((error) => {
    console.error(`Failed to stop Chroma: ${error.message}`);
    process.exitCode = 1;
});
