'use strict';

const http = require('node:http');

const DEFAULT_TIMEOUT_MS = 750;
const DEFAULT_MAX_WAIT_MS = 10000;
const DEFAULT_RETRY_DELAY_MS = 250;
const MAX_RESPONSE_BYTES = 16 * 1024;
const HEARTBEAT_PATH = '/api/v2/heartbeat';

function asPositiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
}

function isSuccessfulHeartbeat(payload) {
    return Boolean(
        payload &&
        typeof payload === 'object' &&
        Number.isFinite(payload['nanosecond heartbeat']) &&
        payload['nanosecond heartbeat'] >= 0
    );
}

function hasJsonContentType(headers = {}) {
    const contentType = String(headers['content-type'] || '')
        .split(';', 1)[0]
        .trim()
        .toLowerCase();
    return !contentType || contentType === 'application/json' || contentType.endsWith('+json');
}

function createHealthError(message, code) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function requestHeartbeat({
    host = '127.0.0.1',
    port = 8000,
    timeoutMs = DEFAULT_TIMEOUT_MS
} = {}) {
    const requestTimeoutMs = asPositiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS);

    return new Promise((resolve, reject) => {
        let settled = false;
        let response = null;
        let timeout = null;

        const finish = (callback, value) => {
            if (settled) return;
            settled = true;
            if (timeout) clearTimeout(timeout);
            callback(value);
        };

        const fail = (error) => finish(reject, error);
        const succeed = (value) => finish(resolve, value);

        const request = http.request({
            hostname: host,
            port,
            path: HEARTBEAT_PATH,
            method: 'GET',
            headers: { Accept: 'application/json' },
            agent: false
        }, (incomingResponse) => {
            response = incomingResponse;
            const chunks = [];
            let responseBytes = 0;

            incomingResponse.setEncoding('utf8');
            incomingResponse.on('data', (chunk) => {
                responseBytes += Buffer.byteLength(chunk, 'utf8');
                if (responseBytes > MAX_RESPONSE_BYTES) {
                    const error = createHealthError(
                        `Chroma heartbeat response exceeded ${MAX_RESPONSE_BYTES} bytes.`,
                        'ERESPONSESIZE'
                    );
                    incomingResponse.destroy(error);
                    request.destroy(error);
                    fail(error);
                    return;
                }
                chunks.push(chunk);
            });
            incomingResponse.on('end', () => succeed({
                statusCode: incomingResponse.statusCode || 0,
                headers: incomingResponse.headers,
                body: chunks.join('')
            }));
            incomingResponse.on('error', fail);
        });

        timeout = setTimeout(() => {
            const error = createHealthError(
                `Chroma heartbeat timed out after ${requestTimeoutMs}ms.`,
                'ETIMEDOUT'
            );
            if (response) response.destroy(error);
            request.destroy(error);
            fail(error);
        }, requestTimeoutMs);

        request.on('error', fail);
        request.end();
    });
}

async function checkChromaHealth(options = {}) {
    const startedAt = Date.now();
    const timeoutMs = asPositiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS);

    try {
        const response = await requestHeartbeat({ ...options, timeoutMs });

        if (response.statusCode !== 200) {
            return {
                ok: false,
                reason: 'http_error',
                message: `Chroma heartbeat returned HTTP ${response.statusCode}.`,
                statusCode: response.statusCode,
                body: response.body,
                durationMs: Date.now() - startedAt
            };
        }

        let payload;

        try {
            payload = JSON.parse(response.body);
        } catch (_error) {
            return {
                ok: false,
                reason: 'invalid_json',
                message: 'Chroma heartbeat returned a non-JSON response.',
                statusCode: response.statusCode,
                body: response.body,
                durationMs: Date.now() - startedAt
            };
        }

        if (!hasJsonContentType(response.headers)) {
            return {
                ok: false,
                reason: 'invalid_content_type',
                message: `Chroma heartbeat returned content type ${response.headers['content-type'] || 'unknown'}.`,
                statusCode: response.statusCode,
                payload,
                body: response.body,
                durationMs: Date.now() - startedAt
            };
        }

        if (!isSuccessfulHeartbeat(payload)) {
            return {
                ok: false,
                reason: 'invalid_heartbeat',
                message: 'Chroma heartbeat JSON did not contain a numeric "nanosecond heartbeat".',
                statusCode: response.statusCode,
                payload,
                body: response.body,
                durationMs: Date.now() - startedAt
            };
        }

        return {
            ok: true,
            reason: 'healthy',
            message: 'Chroma heartbeat is healthy.',
            statusCode: response.statusCode,
            payload,
            body: response.body,
            durationMs: Date.now() - startedAt
        };
    } catch (error) {
        return {
            ok: false,
            reason: error.code === 'ETIMEDOUT'
                ? 'timeout'
                : error.code === 'ERESPONSESIZE'
                    ? 'response_too_large'
                    : 'connection_error',
            message: error.message || 'Chroma heartbeat request failed.',
            errorCode: error.code,
            durationMs: Date.now() - startedAt
        };
    }
}

async function waitForChromaReady({
    host = '127.0.0.1',
    port = 8000,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxWaitMs = DEFAULT_MAX_WAIT_MS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS
} = {}) {
    const requestTimeoutMs = asPositiveInteger(timeoutMs, DEFAULT_TIMEOUT_MS);
    const maxWait = asPositiveInteger(maxWaitMs, DEFAULT_MAX_WAIT_MS);
    const retryDelay = asPositiveInteger(retryDelayMs, DEFAULT_RETRY_DELAY_MS);
    const deadline = Date.now() + maxWait;
    let attempts = 0;
    let lastAttempt = null;

    while (Date.now() < deadline) {
        attempts += 1;
        const remainingMs = Math.max(1, deadline - Date.now());
        lastAttempt = await checkChromaHealth({
            host,
            port,
            timeoutMs: Math.min(requestTimeoutMs, remainingMs)
        });

        if (lastAttempt.ok) {
            return { ...lastAttempt, attempts, maxWaitMs: maxWait };
        }

        const sleepMs = Math.min(retryDelay, Math.max(0, deadline - Date.now()));
        if (sleepMs <= 0) break;
        await new Promise((resolve) => setTimeout(resolve, sleepMs));
    }

    return {
        ok: false,
        reason: 'startup_timeout',
        message: `Chroma did not become healthy within ${maxWait}ms.`,
        attempts,
        maxWaitMs: maxWait,
        lastAttempt
    };
}

function describeHealthFailure(result) {
    if (!result || result.ok) return '';
    const detail = result.message || 'unknown heartbeat failure';
    return `${result.reason}: ${detail}`;
}

module.exports = {
    DEFAULT_TIMEOUT_MS,
    DEFAULT_MAX_WAIT_MS,
    DEFAULT_RETRY_DELAY_MS,
    HEARTBEAT_PATH,
    checkChromaHealth,
    describeHealthFailure,
    hasJsonContentType,
    isSuccessfulHeartbeat,
    requestHeartbeat,
    waitForChromaReady
};
