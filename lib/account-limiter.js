'use strict';

function limitError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

function createAccountLimiter({ limit, concurrent, windowMs, now = () => Date.now() }) {
    if (![limit, concurrent, windowMs].every((value) => Number.isSafeInteger(value) && value > 0)) {
        throw new TypeError('Positive limiter values are required');
    }
    const accounts = new Map();
    return {
        acquire(accountId) {
            const id = String(accountId || '');
            if (!id) throw limitError('AURA_RATE_LIMIT', 'An account is required');
            const timestamp = now();
            let state = accounts.get(id) || { windowStart: timestamp, count: 0, active: 0 };
            if ((timestamp - state.windowStart) >= windowMs) {
                state = { windowStart: timestamp, count: 0, active: state.active };
            }
            if (state.active >= concurrent) {
                throw limitError('AURA_CONCURRENCY_LIMIT', 'Too many requests are already running for this account');
            }
            if (state.count >= limit) {
                throw limitError('AURA_RATE_LIMIT', 'This account has reached its short-term request limit');
            }
            state.count += 1;
            state.active += 1;
            accounts.set(id, state);
            let released = false;
            return () => {
                if (released) return;
                released = true;
                state.active = Math.max(0, state.active - 1);
            };
        }
    };
}

module.exports = { createAccountLimiter };
