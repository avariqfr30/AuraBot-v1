const DEFAULT_LOCAL_APP_ORIGIN = 'http://127.0.0.1:3000';
const ACTIVE_APP_ORIGIN = window.location.origin.startsWith('http')
    ? window.location.origin
    : DEFAULT_LOCAL_APP_ORIGIN;

window.AURA_CONFIG = {
    appOrigin: ACTIVE_APP_ORIGIN,
    apiBaseUrl: `${ACTIVE_APP_ORIGIN}/api`,
    ollamaBaseUrl: `${ACTIVE_APP_ORIGIN}/api/ollama`,
    defaultModel: 'medgemma1.5:4b',
    preferredModels: [
        'medgemma1.5:4b',
        'dcarrascosa/medgemma-1.5-4b-it:Q4_K_M',
        'medgemma-1.5-4b-it:Q4_K_M',
        'google/medgemma-1.5-4b-it'
    ],
    defaultTheme: 'dark'
};
