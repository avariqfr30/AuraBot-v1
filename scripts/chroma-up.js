#!/usr/bin/env node

const fs = require('fs');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const pidFile = path.join(rootDir, '.chroma.pid');
const logFile = path.join(rootDir, 'chroma.log');
const chromaPath = process.env.CHROMA_PATH || path.join(rootDir, 'chroma-data');
const chromaHost = process.env.CHROMA_HOST || '127.0.0.1';
const chromaPort = Number(process.env.CHROMA_PORT || 8000);

function getCandidateBinaries() {
    const fromVenv = path.join(rootDir, '.venv', 'bin', 'chroma');
    const pathEntries = (process.env.PATH || '')
        .split(path.delimiter)
        .filter(Boolean)
        .map((entry) => path.join(entry, 'chroma'));

    return [fromVenv, ...pathEntries];
}

function resolveChromaBinary() {
    return getCandidateBinaries().find((candidate) => {
        try {
            fs.accessSync(candidate, fs.constants.X_OK);
            return true;
        } catch (_error) {
            return false;
        }
    });
}

function isProcessRunning(pid) {
    try {
        process.kill(pid, 0);
        return true;
    } catch (_error) {
        return false;
    }
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function isPortOpen() {
    return new Promise((resolve) => {
        const socket = net.createConnection({ host: chromaHost, port: chromaPort });

        const finish = (result) => {
            socket.removeAllListeners();
            socket.destroy();
            resolve(result);
        };

        socket.once('connect', () => finish(true));
        socket.once('error', () => finish(false));
        socket.setTimeout(500, () => finish(false));
    });
}

async function main() {
    const chromaBin = resolveChromaBinary();

    if (!chromaBin) {
        console.error('Chroma CLI not found.');
        console.error('Install it with:');
        console.error('  python3 -m venv .venv');
        console.error('  ./.venv/bin/python -m pip install -U pip chromadb');
        process.exit(1);
    }

    if (fs.existsSync(pidFile)) {
        const existingPid = Number(fs.readFileSync(pidFile, 'utf8').trim());
        if (existingPid && isProcessRunning(existingPid)) {
            console.log(`Chroma is already running on PID ${existingPid}`);
            process.exit(0);
        }
        fs.rmSync(pidFile, { force: true });
    }

    if (await isPortOpen()) {
        console.log(`Chroma is already listening on http://${chromaHost}:${chromaPort}`);
        process.exit(0);
    }

    fs.mkdirSync(chromaPath, { recursive: true });
    const logFd = fs.openSync(logFile, 'a');
    const child = spawn(
        chromaBin,
        ['run', '--path', chromaPath, '--host', chromaHost, '--port', String(chromaPort)],
        {
            cwd: rootDir,
            detached: true,
            stdio: ['ignore', logFd, logFd]
        }
    );

    child.unref();
    fs.writeFileSync(pidFile, `${child.pid}\n`);

    for (let attempt = 0; attempt < 10; attempt += 1) {
        if (await isPortOpen()) {
            console.log(`Chroma started on http://${chromaHost}:${chromaPort} with PID ${child.pid}`);
            process.exit(0);
        }
        await wait(500);
    }

    console.error('Failed to start Chroma. Recent log output:');
    try {
        const logContent = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-20).join('\n');
        console.error(logContent);
    } catch (_error) {}
    process.exit(1);
}

main();
