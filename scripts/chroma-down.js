#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const pidFile = path.join(rootDir, '.chroma.pid');

function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (_error) {
        return false;
    }
}

function main() {
    if (!fs.existsSync(pidFile)) {
        console.log('Chroma is not running from this workspace.');
        process.exit(0);
    }

    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    fs.rmSync(pidFile, { force: true });

    if (!pid || !isProcessRunning(pid)) {
        console.log(`No running Chroma process found for PID ${pid || 'unknown'}`);
        process.exit(0);
    }

    process.kill(pid, 'SIGTERM');
    console.log(`Stopped Chroma PID ${pid}`);
}

main();
