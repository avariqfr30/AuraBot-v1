(function initializeHostedClient(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_HOSTED_CLIENT = api;
    if (typeof window !== 'undefined' && window.document) {
        const client = api.createHostedClient({
            fetchImpl: (...args) => window.fetch(...args),
            localStorage: window.localStorage,
            onStatus: (message) => {
                const status = window.document.getElementById('accountSyncStatus');
                if (status) status.textContent = message;
            }
        });
        window.AURA_HOSTED = client;
        window.AURA_HOSTED_READY = client.initialize();
        window.addEventListener('beforeunload', (event) => {
            if (!client.hasUnsavedChanges()) return;
            event.preventDefault();
            event.returnValue = '';
        });
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createHostedClientApi() {
    function deviceSettingsStorage(raw, accountId) {
        const prefix = `aura_device_setting_v1:${accountId}:`;
        return {
            getItem(key) { return raw.getItem(`${prefix}${key}`); },
            setItem(key, value) { raw.setItem(`${prefix}${key}`, value); },
            removeItem(key) { raw.removeItem(`${prefix}${key}`); }
        };
    }

    function createHostedClient({ fetchImpl, localStorage, onStatus = () => {} }) {
        if (typeof fetchImpl !== 'function' || !localStorage) throw new TypeError('Browser fetch and storage are required');
        let values = new Map();
        let version = 0;
        let csrfToken = '';
        let dirty = false;
        let syncing = null;
        let failure = null;
        let enabled = false;
        let accountId = '';
        let searchConsent = false;
        let allowedModels = [];
        let primaryModel = '';
        let medicalModel = '';

        async function json(url, options = {}) {
            const response = await fetchImpl(url, {
                credentials: 'same-origin',
                cache: 'no-store',
                ...options
            });
            const body = await response.json().catch(() => ({}));
            return { response, body };
        }

        async function flush() {
            while (dirty) {
                dirty = false;
                const snapshot = Object.fromEntries(values);
                const { response, body } = await json('/api/account/state', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Aura-CSRF': csrfToken },
                    body: JSON.stringify({ version, storage: snapshot })
                });
                if (!response.ok) {
                    dirty = true;
                    failure = response.status === 409
                        ? new Error('Your account changed on another device. Export this profile before reloading.')
                        : new Error('Could not sync this profile. Your changes remain in this tab.');
                    onStatus(failure.message);
                    throw failure;
                }
                version = Number(body.version);
                failure = null;
            }
            onStatus('Saved to your Aura account.');
        }

        function scheduleSync() {
            if (!enabled) return;
            dirty = true;
            if (failure) return;
            if (!syncing) {
                syncing = Promise.resolve()
                    .then(flush)
                    .finally(() => { syncing = null; });
                syncing.catch(() => {});
            }
        }

        const storage = {
            get length() { return values.size; },
            key(index) { return [...values.keys()][index] ?? null; },
            getItem(key) { return values.get(String(key)) ?? null; },
            setItem(key, value) {
                const name = String(key);
                const text = String(value);
                if (values.get(name) === text) return;
                values.set(name, text);
                scheduleSync();
            },
            removeItem(key) {
                if (!values.delete(String(key))) return;
                scheduleSync();
            }
        };

        const client = {
            storage,
            settingsStorage: localStorage,
            get enabled() { return enabled; },
            get version() { return version; },
            get searchConsent() { return searchConsent; },
            get allowedModels() { return [...allowedModels]; },
            get primaryModel() { return primaryModel; },
            get medicalModel() { return medicalModel; },
            get accountId() { return accountId; },
            get csrfToken() { return csrfToken; },
            get error() { return failure; },
            hasUnsavedChanges() { return enabled && (dirty || Boolean(syncing)); },
            async initialize() {
                const runtime = await json('/api/runtime');
                if (!runtime.response.ok) throw new Error('Could not determine how Aura is running.');
                if (runtime.body.mode !== 'hosted') return client;
                const bootstrap = await json('/api/account/bootstrap');
                if (bootstrap.response.status === 401) {
                    const error = new Error('Sign in to Aura to access your account.');
                    error.code = 'AUTH_REQUIRED';
                    throw error;
                }
                if (!bootstrap.response.ok) throw new Error('Could not load your Aura account.');
                const data = bootstrap.body;
                if (!data.accountId || !data.csrfToken || !Number.isSafeInteger(data.version)) {
                    throw new Error('Aura returned an invalid account snapshot.');
                }
                accountId = data.accountId;
                csrfToken = data.csrfToken;
                version = data.version;
                searchConsent = data.searchConsent === true;
                allowedModels = Array.isArray(data.models) ? data.models.map(String).filter(Boolean) : [];
                primaryModel = String(data.primaryModel || '');
                medicalModel = String(data.medicalModel || primaryModel);
                if (!allowedModels.includes(primaryModel) || !allowedModels.includes(medicalModel)) {
                    throw new Error('Aura returned an invalid model configuration.');
                }
                values = new Map(Object.entries(data.storage || {}));
                client.settingsStorage = deviceSettingsStorage(localStorage, accountId);
                enabled = true;
                onStatus('Aura account ready.');
                return client;
            },
            async waitForSync() {
                if (failure) throw failure;
                if (syncing) await syncing;
                if (failure) throw failure;
                if (dirty) {
                    scheduleSync();
                    if (syncing) await syncing;
                }
            },
            async setSearchConsent(next) {
                if (!enabled || typeof next !== 'boolean') throw new Error('A signed-in account is required.');
                const { response, body } = await json('/api/account/search-consent', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'X-Aura-CSRF': csrfToken },
                    body: JSON.stringify({ enabled: next })
                });
                if (!response.ok) throw new Error('Could not change external research consent.');
                searchConsent = body.enabled === true;
                return searchConsent;
            },
            async importProfileExport(exported) {
                if (!enabled) throw new Error('Sign in before importing a profile.');
                if (
                    exported?.version !== 'aura-profile-export-v3' ||
                    !exported.profile || typeof exported.profile.name !== 'string' ||
                    !exported.state || typeof exported.state !== 'object' ||
                    !exported.state.chats || typeof exported.state.chats !== 'object'
                ) throw new Error('Choose an Aura profile export from the earlier app.');
                if (new TextEncoder().encode(JSON.stringify(exported)).byteLength > 3 * 1024 * 1024) {
                    throw new Error('This profile export is too large to import safely.');
                }
                await client.waitForSync();
                const registry = JSON.parse(values.get('aura_profiles_v1') || '{}');
                if (!Array.isArray(registry.profiles) || registry.profiles.length >= 30) {
                    throw new Error('This account cannot add another profile.');
                }
                const id = `profile-${crypto.randomUUID()}`;
                const name = exported.profile.name.replace(/\0/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Imported Profile';
                const timestamp = Date.now();
                const profile = {
                    id, name, createdAt: timestamp, updatedAt: timestamp,
                    personalIntelligenceState: exported.personalIntelligenceState === 'not_enabled'
                        ? 'not_enabled'
                        : 'paused'
                };
                const state = JSON.parse(JSON.stringify(exported.state));
                const entries = state.feedbackLearning?.entries;
                if (entries && typeof entries === 'object') {
                    Object.values(entries).forEach((entry) => {
                        if (entry && typeof entry === 'object') {
                            entry.promotedExampleId = '';
                            entry.promotedAt = 0;
                        }
                    });
                }
                registry.profiles.push(profile);
                values.set('aura_profiles_v1', JSON.stringify(registry));
                values.set('aura_active_profile_id', id);
                values.set(`aura_profile_state_v1:${id}`, JSON.stringify(state));
                const settings = exported.settings || {};
                const profileSettings = {
                    aura_experience_style: settings.experienceStyle,
                    aura_response_detail: settings.responseDetail,
                    aura_location_enabled: false
                };
                Object.entries(profileSettings).forEach(([key, value]) => {
                    if (value !== undefined && value !== null) {
                        values.set(`aura_profile_setting_v1:${id}:${key}`, JSON.stringify(value));
                    }
                });
                scheduleSync();
                await client.waitForSync();
                return profile;
            },
            async deleteAccount() {
                if (!enabled) throw new Error('Sign in before deleting an account.');
                if (syncing) await syncing.catch(() => {});
                const { response, body } = await json('/api/account', {
                    method: 'DELETE', headers: { 'X-Aura-CSRF': csrfToken }
                });
                if (!response.ok || body.deleted !== true) {
                    throw new Error(body.error || 'Could not delete your account. Please try again.');
                }
                const prefix = `aura_device_setting_v1:${accountId}:`;
                const keys = [];
                for (let index = 0; index < localStorage.length; index += 1) {
                    const key = localStorage.key(index);
                    if (key?.startsWith(prefix)) keys.push(key);
                }
                keys.forEach((key) => localStorage.removeItem(key));
                values.clear();
                enabled = false;
                accountId = '';
                csrfToken = '';
                searchConsent = false;
                dirty = false;
                failure = null;
                if (typeof window !== 'undefined') window.location.assign('/');
            },
            async signOut() {
                if (!enabled) return;
                await client.waitForSync();
                const { response } = await json('/api/auth/logout', {
                    method: 'POST', headers: { 'X-Aura-CSRF': csrfToken }
                });
                if (!response.ok) throw new Error('Could not sign out.');
                accountId = '';
                enabled = false;
                values.clear();
                if (typeof window !== 'undefined') window.location.assign('/');
            }
        };
        return client;
    }

    return { createHostedClient };
});
