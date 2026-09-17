'use strict';

const { AsyncLocalStorage } = require('node:async_hooks');

const requestContext = new AsyncLocalStorage();

class RequestTimeoutError extends Error {
    constructor(label, timeoutMs) {
        super(`${label} timed out after ${timeoutMs}ms`);
        this.name = 'RequestTimeoutError';
        this.code = 'ETIMEDOUT';
        this.timeoutMs = timeoutMs;
        this.label = label;
        this.isRequestTimeout = true;
    }
}

function normalizeTimeoutMs(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function isRequestTimeout(error) {
    return Boolean(error?.isRequestTimeout || error?.code === 'ETIMEDOUT');
}

function getRequestSignal() {
    return requestContext.getStore()?.signal;
}

function isRequestAborted() {
    return Boolean(getRequestSignal()?.aborted);
}

function runWithRequestContext(signal, callback) {
    return requestContext.run({ signal }, callback);
}

function createAbortController(parentSignals) {
    const signals = (Array.isArray(parentSignals) ? parentSignals : [parentSignals])
        .filter((signal) => signal && typeof signal.addEventListener === 'function');
    const controller = new AbortController();

    const parentAbortListeners = signals.map((parentSignal) => {
        const parentAbortListener = () => {
            if (!controller.signal.aborted) {
                controller.abort(parentSignal.reason);
            }
        };

        if (parentSignal.aborted) {
            parentAbortListener();
        } else {
            parentSignal.addEventListener('abort', parentAbortListener, { once: true });
        }

        return { parentSignal, parentAbortListener };
    });

    return {
        controller,
        cleanup() {
            parentAbortListeners.forEach(({ parentSignal, parentAbortListener }) => {
                parentSignal.removeEventListener('abort', parentAbortListener);
            });
        }
    };
}

function cancelResponseBody(response, reason) {
    try {
        const cancelResult = response?.body?.cancel?.(reason);
        if (cancelResult && typeof cancelResult.catch === 'function') {
            cancelResult.catch(() => {});
        }
    } catch (_error) {
        // The timeout is already being surfaced; body cancellation is best effort.
    }
}

/**
 * Run a fetch request with one deadline covering connection, headers, and body.
 * The original fetch function remains responsible for protocol/status errors.
 */
async function fetchWithTimeout(fetchImpl, input, init = {}, options = {}) {
    if (typeof fetchImpl !== 'function') {
        throw new TypeError('fetchImpl must be a function');
    }

    const timeoutMs = normalizeTimeoutMs(options.timeoutMs, 10_000);
    const label = String(options.label || 'Upstream request');
    const readBody = options.readBody !== false;
    const parentSignals = [init?.signal, input?.signal, getRequestSignal()];
    const { controller, cleanup } = createAbortController(parentSignals);
    const timeoutError = new RequestTimeoutError(label, timeoutMs);

    if (controller.signal.aborted) {
        const abortReason = controller.signal.reason || new Error(`${label} was aborted`);
        cleanup();
        throw abortReason;
    }

    let timedOut = false;
    let response = null;
    let timer = null;
    let abortListener = null;

    const timeoutPromise = new Promise((_resolve, reject) => {
        timer = setTimeout(() => {
            timedOut = true;
            controller.abort(timeoutError);
            cancelResponseBody(response, timeoutError);
            reject(timeoutError);
        }, timeoutMs);
    });
    const abortPromise = new Promise((_resolve, reject) => {
        abortListener = () => reject(controller.signal.reason || new Error(`${label} was aborted`));
        controller.signal.addEventListener('abort', abortListener, { once: true });
    });

    const requestInit = {
        ...init,
        signal: controller.signal
    };

    try {
        const fetchPromise = Promise.resolve().then(() => fetchImpl(input, requestInit));
        fetchPromise.catch(() => {});
        response = await Promise.race([fetchPromise, timeoutPromise, abortPromise]);

        if (!readBody || !response || typeof response.arrayBuffer !== 'function') {
            return response;
        }

        const bodyPromise = response.arrayBuffer();
        bodyPromise.catch(() => {});
        const body = await Promise.race([bodyPromise, timeoutPromise, abortPromise]);

        if (typeof Response !== 'function') {
            return response;
        }

        const hasNoBody = [204, 205, 304].includes(response.status);
        return new Response(hasNoBody ? null : body, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
        });
    } catch (error) {
        if (timedOut) {
            throw timeoutError;
        }
        throw error;
    } finally {
        if (timer) clearTimeout(timer);
        if (abortListener) controller.signal.removeEventListener('abort', abortListener);
        cleanup();
    }
}

function memoizeRecoverablePromise(factory, getCurrent, setCurrent) {
    const current = getCurrent();
    if (current) return current;

    const promise = Promise.resolve().then(factory);
    setCurrent(promise);
    promise.catch(() => {
        if (getCurrent() === promise) {
            setCurrent(null);
        }
    });
    return promise;
}

function createRequestAbortController(req, res) {
    const controller = new AbortController();
    let clientAborted = false;
    let cleaned = false;

    const abort = () => {
        clientAborted = true;
        if (!controller.signal.aborted) {
            controller.abort(new Error('Client disconnected'));
        }
    };
    const onRequestAborted = () => abort();
    const onResponseClose = () => {
        if (!res?.writableEnded) abort();
    };

    req?.once?.('aborted', onRequestAborted);
    res?.once?.('close', onResponseClose);

    return {
        signal: controller.signal,
        wasClientAborted: () => clientAborted,
        cleanup() {
            if (cleaned) return;
            cleaned = true;
            req?.off?.('aborted', onRequestAborted);
            res?.off?.('close', onResponseClose);
        }
    };
}

module.exports = {
    RequestTimeoutError,
    normalizeTimeoutMs,
    isRequestTimeout,
    getRequestSignal,
    isRequestAborted,
    runWithRequestContext,
    fetchWithTimeout,
    memoizeRecoverablePromise,
    createRequestAbortController
};
