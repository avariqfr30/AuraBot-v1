#!/usr/bin/env node

const fs = require('fs');
const net = require('net');
const path = require('path');
const crypto = require('node:crypto');
const { spawn } = require('child_process');
const {
    checkChromaHealth,
    describeHealthFailure,
    waitForChromaReady
} = require('../lib/chroma-health');
const { resolveRuntimePaths } = require('../lib/runtime-paths');
const { parsePidRecord } = require('../lib/chroma-process');

const rootDir = path.resolve(__dirname, '..');
const {
    dataDir,
    pidFile,
    logFile,
    chromaPath
} = resolveRuntimePaths(process.env, rootDir);
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
    if (fs.existsSync(pidFile)) {
        const { pid: existingPid } = parsePidRecord(fs.readFileSync(pidFile, 'utf8'));
        if (existingPid && isProcessRunning(existingPid)) {
            const health = await checkChromaHealth({
                host: chromaHost,
                port: chromaPort
            });
            if (health.ok) {
                console.log(`Chroma is already healthy on PID ${existingPid} at http://${chromaHost}:${chromaPort}`);
                return;
            }

            console.error(`Chroma process PID ${existingPid} is running but its heartbeat is unhealthy (${describeHealthFailure(health)}).`);
            console.error('The process was left running. Inspect or stop it manually before retrying.');
            process.exitCode = 1;
            return;
        }
        fs.rmSync(pidFile, { force: true });
    }

    const existingHealth = await checkChromaHealth({
        host: chromaHost,
        port: chromaPort
    });
    if (existingHealth.ok) {
        console.log(`Chroma is already healthy at http://${chromaHost}:${chromaPort}`);
        return;
    }

    if (await isPortOpen()) {
        console.error(`A service is already listening on http://${chromaHost}:${chromaPort}, but its Chroma heartbeat is unhealthy (${describeHealthFailure(existingHealth)}).`);
        console.error('Refusing to start another process or terminate the existing service.');
        process.exitCode = 1;
        return;
    }

    const chromaBin = resolveChromaBinary();

    if (!chromaBin) {
        console.error('Chroma CLI not found.');
        console.error('Install it with:');
        console.error('  python3 -m venv .venv');
        console.error('  ./.venv/bin/python -m pip install -U pip chromadb');
        process.exitCode = 1;
        return;
    }

    fs.mkdirSync(dataDir, { recursive: true });
    fs.mkdirSync(chromaPath, { recursive: true });
    const logFd = fs.openSync(logFile, 'a');
    const processToken = crypto.randomUUID();
    const child = spawn(
        chromaBin,
        ['run', '--path', chromaPath, '--host', chromaHost, '--port', String(chromaPort)],
        {
            cwd: rootDir,
            detached: true,
            env: {
                ...process.env,
                AURA_CHROMA_PROCESS_TOKEN: processToken
            },
            stdio: ['ignore', logFd, logFd]
        }
    );

    child.unref();
    fs.writeFileSync(pidFile, `${JSON.stringify({ pid: child.pid, token: processToken })}\n`);

    const readiness = await waitForChromaReady({
        host: chromaHost,
        port: chromaPort
    });
    if (readiness.ok) {
        console.log(`Chroma started healthy on http://${chromaHost}:${chromaPort} with PID ${child.pid}`);
        return;
    }

    console.error(`Failed to start healthy Chroma with PID ${child.pid} (${describeHealthFailure(readiness)}).`);
    if (readiness.lastAttempt) {
        console.error(`Last heartbeat attempt: ${describeHealthFailure(readiness.lastAttempt)}.`);
    }
    console.error('The process was left running for manual inspection; no automatic termination was attempted.');
    console.error('Recent log output:');
    try {
        const logContent = fs.readFileSync(logFile, 'utf8').trim().split('\n').slice(-20).join('\n');
        console.error(logContent);
    } catch (_error) {}
    process.exitCode = 1;
}

main().catch((error) => {
    console.error(`Failed to start Chroma: ${error.message}`);
    process.exitCode = 1;
});
