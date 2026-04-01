const DEFAULT_LOCAL_APP_ORIGIN = 'http://127.0.0.1:3000';
const ACTIVE_APP_ORIGIN = window.location.origin.startsWith('http')
    ? window.location.origin
    : DEFAULT_LOCAL_APP_ORIGIN;

window.AURA_CONFIG = {
    appOrigin: ACTIVE_APP_ORIGIN,
    apiBaseUrl: `${ACTIVE_APP_ORIGIN}/api`,
    ollamaBaseUrl: `${ACTIVE_APP_ORIGIN}/api/ollama`
};
