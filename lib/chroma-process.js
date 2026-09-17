'use strict';

function parsePidRecord(value) {
    const text = String(value || '').trim();
    try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('legacy pid');
        return {
            pid: Number.isInteger(parsed?.pid) && parsed.pid > 0 ? parsed.pid : 0,
            token: typeof parsed?.token === 'string' ? parsed.token : ''
        };
    } catch (_error) {
        const pid = Number(text);
        return {
            pid: Number.isInteger(pid) && pid > 0 ? pid : 0,
            token: ''
        };
    }
}

function hasExpectedProcessToken(processDescription, token) {
    if (!token) return false;
    return String(processDescription || '')
        .split(/\s+/)
        .includes(`AURA_CHROMA_PROCESS_TOKEN=${token}`);
}

module.exports = {
    hasExpectedProcessToken,
    parsePidRecord
};
