const DEFAULT_LOCAL_APP_ORIGIN = 'http://127.0.0.1:3000';
const ACTIVE_APP_ORIGIN = window.location.origin.startsWith('http')
    ? window.location.origin
    : DEFAULT_LOCAL_APP_ORIGIN;

window.AURA_CONFIG = {
    appOrigin: ACTIVE_APP_ORIGIN,
    apiBaseUrl: `${ACTIVE_APP_ORIGIN}/api`,
    ollamaBaseUrl: `${ACTIVE_APP_ORIGIN}/api/ollama`,
    defaultModel: 'medgemma1.5:4b',
    defaultModelPreference: 'auto',
    modelRouting: {
        gptModel: 'gpt-oss:120b-cloud',
        medModel: 'medgemma1.5:4b'
    },
    preferredModels: [
        'medgemma1.5:4b',
        'gpt-oss:120b-cloud',
        'dcarrascosa/medgemma-1.5-4b-it:Q4_K_M',
        'medgemma-1.5-4b-it:Q4_K_M',
        'google/medgemma-1.5-4b-it'
    ],
    defaultTheme: 'dark',
    ollamaOptions: {
        default: {
            num_ctx: 8192,
            num_predict: 896
        },
        analysis: {
            num_ctx: 6144,
            num_predict: 384
        },
        cleanup: {
            num_ctx: 6144,
            num_predict: 448
        },
        json: {
            num_ctx: 6144,
            num_predict: 512
        }
    }
};
