(function initializeRequestRuntime(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_REQUEST_RUNTIME = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createRequestRuntime() {
    function failure(name, message) {
        const error = new Error(message);
        error.name = name;
        return error;
    }

    function createRuntime({
        fetchImpl = (...args) => fetch(...args),
        requestTimeoutMs = 90000,
        retrievalTimeoutMs = 3000,
        turnTimeoutMs = 180000,
        cooldownMs = 30000,
        now = () => Date.now()
    } = {}) {
        let turnController = null;
        let turnTimer = null;
        let retrievalRetryAt = 0;
        let retrievalUnavailable = false;

        function throwIfAborted(signal = turnController?.signal) {
            if (signal?.aborted) throw signal.reason || failure('AbortError', 'Response stopped.');
        }

        async function waitFor(operation, {
            signal = turnController?.signal,
            timeoutMs = requestTimeoutMs
        } = {}) {
            throwIfAborted(signal);
            const controller = new AbortController();
            const abort = () => controller.abort(signal.reason || failure('AbortError', 'Response stopped.'));
            signal?.addEventListener('abort', abort, { once: true });
            const timer = setTimeout(() => controller.abort(
                failure('TimeoutError', 'The request took too long. Please try again.')
            ), timeoutMs);
            let onAbort;
            const interrupted = new Promise((_, reject) => {
                onAbort = () => reject(controller.signal.reason);
                controller.signal.addEventListener('abort', onAbort, { once: true });
            });
            try {
                return await Promise.race([operation(controller.signal), interrupted]);
            } finally {
                clearTimeout(timer);
                signal?.removeEventListener('abort', abort);
                controller.signal.removeEventListener('abort', onAbort);
            }
        }

        return {
            beginTurn() {
                if (turnController) throw new Error('A response is already in progress.');
                turnController = new AbortController();
                retrievalUnavailable = false;
                turnTimer = setTimeout(() => turnController?.abort(
                    failure('TimeoutError', 'This response took too long. Please try again.')
                ), turnTimeoutMs);
            },
            endTurn() {
                clearTimeout(turnTimer);
                turnController = null;
                turnTimer = null;
            },
            cancelTurn() {
                turnController?.abort(failure('AbortError', 'Response stopped.'));
            },
            getTurnSignal: () => turnController?.signal,
            throwIfAborted,
            waitFor,
            isRetrievalUnavailable: () => retrievalUnavailable,
            fetchJson(url, options = {}) {
                const { signal = turnController?.signal, timeoutMs = requestTimeoutMs, ...fetchOptions } = options;
                return waitFor(async (requestSignal) => {
                    const response = await fetchImpl(url, { ...fetchOptions, signal: requestSignal });
                    const data = await response.json().catch((error) => {
                        throwIfAborted(requestSignal);
                        if (error instanceof SyntaxError) return null;
                        throw error;
                    });
                    throwIfAborted(requestSignal);
                    return { response, data };
                }, { signal, timeoutMs });
            },
            async retrieve(operation, fallback) {
                const signal = turnController?.signal;
                throwIfAborted(signal);
                if (now() < retrievalRetryAt) {
                    retrievalUnavailable = true;
                    return fallback;
                }
                try {
                    return await waitFor(operation, { signal, timeoutMs: retrievalTimeoutMs });
                } catch (error) {
                    throwIfAborted(signal);
                    if (error.name === 'AbortError') throw error;
                    retrievalUnavailable = true;
                    retrievalRetryAt = now() + cooldownMs;
                    return fallback;
                }
            }
        };
    }

    return { createRuntime };
});
