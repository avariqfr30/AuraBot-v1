(function initializePersonalIntelligence(root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.AURA_PERSONAL_INTELLIGENCE = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPersonalIntelligence() {
    const STORAGE_KEYS = {
        REGISTRY: 'aura_profiles_v1',
        ACTIVE_PROFILE_ID: 'aura_active_profile_id',
        LEGACY_STATE: 'aura_app_state',
        PROFILE_STATE_PREFIX: 'aura_profile_state_v1:',
        LEGACY_FEEDBACK_PROFILE_ID: 'aura_feedback_profile_id',
        LEGACY_MEMORY_ENABLED: 'aura_user_memory_enabled',
        LEGACY_EXPERIENCE_STYLE: 'aura_experience_style',
        LEGACY_LOCATION_ENABLED: 'aura_location_enabled',
        LEGACY_LOCATION_CONTEXT: 'aura_location_context'
    };
    const PROFILE_SETTING_PREFIX = 'aura_profile_setting_v1:';
    const LEGACY_PERSONAL_SETTING_KEYS = [
        STORAGE_KEYS.LEGACY_EXPERIENCE_STYLE,
        STORAGE_KEYS.LEGACY_LOCATION_ENABLED,
        STORAGE_KEYS.LEGACY_LOCATION_CONTEXT
    ];
    const PROFILE_ID_PATTERN = /^profile-[a-z0-9_-]{8,120}$/i;
    const PROFILE_STATES = new Set(['not_enabled', 'active', 'paused']);
    const DEFAULT_PROFILE_NAME = 'My Profile';
    const PROFILE_NAME_MAX_LENGTH = 80;

    function normalizeProfileId(value) {
        const id = String(value || '').trim();
        return PROFILE_ID_PATTERN.test(id) ? id : '';
    }

    function normalizeProfileName(value) {
        const name = String(value || '')
            .replace(/\0/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, PROFILE_NAME_MAX_LENGTH);
        return name || DEFAULT_PROFILE_NAME;
    }

    function normalizePersonalIntelligenceState(value) {
        return PROFILE_STATES.has(value) ? value : 'not_enabled';
    }

    function parseJson(value, fallback) {
        if (typeof value !== 'string') return fallback;
        try {
            return JSON.parse(value);
        } catch (_error) {
            return fallback;
        }
    }

    function profileStateKey(profileId) {
        return `${STORAGE_KEYS.PROFILE_STATE_PREFIX}${profileId}`;
    }

    function profileSettingKey(profileId, setting) {
        return `${PROFILE_SETTING_PREFIX}${profileId}:${setting}`;
    }

    function createDefaultId() {
        return `profile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }

    function createManager(storage, { now = () => Date.now(), idFactory = createDefaultId } = {}) {
        if (!storage || typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function') {
            throw new TypeError('A Storage-compatible object is required.');
        }

        const getNow = () => Number(typeof now === 'function' ? now() : now) || Date.now();
        const makeProfileId = (usedIds) => {
            for (let attempt = 0; attempt < 5; attempt += 1) {
                const candidate = normalizeProfileId(idFactory());
                if (candidate && !usedIds.has(candidate)) return candidate;
            }
            let candidate = createDefaultId();
            while (usedIds.has(candidate)) candidate = createDefaultId();
            return candidate;
        };

        function normalizeProfile(value, fallbackId) {
            const id = normalizeProfileId(value?.id || fallbackId);
            if (!id) return null;
            const createdAt = Number(value?.createdAt) || getNow();
            return {
                id,
                name: normalizeProfileName(value?.name),
                createdAt,
                updatedAt: Number(value?.updatedAt) || createdAt,
                personalIntelligenceState: normalizePersonalIntelligenceState(value?.personalIntelligenceState)
            };
        }

        function readRegistry() {
            const parsed = parseJson(storage.getItem(STORAGE_KEYS.REGISTRY), {});
            const rawProfiles = Array.isArray(parsed?.profiles) ? parsed.profiles : [];
            const usedIds = new Set();
            const profiles = rawProfiles.reduce((result, value) => {
                const profile = normalizeProfile(value);
                if (profile && !usedIds.has(profile.id)) {
                    usedIds.add(profile.id);
                    result.push(profile);
                }
                return result;
            }, []);
            return {
                version: 1,
                profiles,
                legacyStateMigrationComplete: Boolean(parsed?.legacyStateMigrationComplete),
                personalSettingsMigrationComplete: Boolean(parsed?.personalSettingsMigrationComplete)
            };
        }

        function writeRegistry(registry) {
            storage.setItem(STORAGE_KEYS.REGISTRY, JSON.stringify({
                version: 1,
                profiles: registry.profiles,
                legacyStateMigrationComplete: Boolean(registry.legacyStateMigrationComplete),
                personalSettingsMigrationComplete: Boolean(registry.personalSettingsMigrationComplete)
            }));
        }

        function copyProfile(profile) {
            return profile ? { ...profile } : null;
        }

        function getStorageKeys() {
            const keys = [];
            const length = Number(storage.length) || 0;
            if (typeof storage.key !== 'function') return keys;
            for (let index = 0; index < length; index += 1) {
                const key = storage.key(index);
                if (typeof key === 'string') keys.push(key);
            }
            return keys;
        }

        function removeProfileData(profileId) {
            storage.removeItem?.(profileStateKey(profileId));
            const settingPrefix = `${PROFILE_SETTING_PREFIX}${profileId}:`;
            getStorageKeys()
                .filter((key) => key.startsWith(settingPrefix))
                .forEach((key) => storage.removeItem?.(key));
        }

        function migrateLegacyState(profileId, registry) {
            if (registry.legacyStateMigrationComplete) return;
            const legacyState = storage.getItem(STORAGE_KEYS.LEGACY_STATE);
            const destinationKey = profileStateKey(profileId);
            if (legacyState === null) {
                registry.legacyStateMigrationComplete = true;
                writeRegistry(registry);
                return;
            }

            let complete = true;
            const destinationState = storage.getItem(destinationKey);
            if (destinationState !== null) {
                if (destinationState === legacyState) {
                    try {
                        storage.removeItem?.(STORAGE_KEYS.LEGACY_STATE);
                    } catch (_error) {
                        complete = false;
                    }
                    if (storage.getItem(STORAGE_KEYS.LEGACY_STATE) !== null) complete = false;
                }
                registry.legacyStateMigrationComplete = complete;
                writeRegistry(registry);
                return;
            }

            try {
                storage.setItem(destinationKey, legacyState);
            } catch (_error) {
                complete = false;
            }
            if (storage.getItem(destinationKey) === legacyState) {
                try {
                    storage.removeItem?.(STORAGE_KEYS.LEGACY_STATE);
                } catch (_error) {
                    complete = false;
                }
            } else {
                complete = false;
            }
            if (storage.getItem(STORAGE_KEYS.LEGACY_STATE) !== null) complete = false;
            registry.legacyStateMigrationComplete = complete;
            writeRegistry(registry);
        }

        function migrateLegacyProfileSettings(profileId, registry) {
            if (registry.personalSettingsMigrationComplete) return;
            let complete = true;
            LEGACY_PERSONAL_SETTING_KEYS.forEach((setting) => {
                const legacyValue = storage.getItem(setting);
                if (legacyValue === null) return;
                const destinationKey = profileSettingKey(profileId, setting);
                const migratedValue = parseJson(legacyValue, legacyValue);
                const serializedValue = JSON.stringify(migratedValue);
                const destinationValue = storage.getItem(destinationKey);
                if (destinationValue !== null) {
                    if (destinationValue !== serializedValue) return;
                    try {
                        storage.removeItem?.(setting);
                    } catch (_error) {
                        complete = false;
                    }
                    if (storage.getItem(setting) !== null) complete = false;
                    return;
                }
                try {
                    storage.setItem(destinationKey, serializedValue);
                    if (storage.getItem(destinationKey) === serializedValue) {
                        storage.removeItem?.(setting);
                    }
                } catch (_error) {
                    complete = false;
                }
                if (storage.getItem(destinationKey) !== serializedValue || storage.getItem(setting) !== null) {
                    complete = false;
                }
            });
            registry.personalSettingsMigrationComplete = complete;
            writeRegistry(registry);
        }

        function initialize() {
            const registry = readRegistry();
            if (registry.profiles.length) {
                writeRegistry(registry);
                const storedActiveId = normalizeProfileId(storage.getItem(STORAGE_KEYS.ACTIVE_PROFILE_ID));
                const activeId = registry.profiles.some((profile) => profile.id === storedActiveId)
                    ? storedActiveId
                    : registry.profiles[0].id;
                storage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_ID, activeId);
                migrateLegacyState(activeId, registry);
                migrateLegacyProfileSettings(activeId, registry);
                return registry;
            }

            const legacyId = normalizeProfileId(storage.getItem(STORAGE_KEYS.LEGACY_FEEDBACK_PROFILE_ID));
            const id = legacyId || makeProfileId(new Set());
            const profile = normalizeProfile({
                id,
                name: DEFAULT_PROFILE_NAME,
                createdAt: getNow(),
                updatedAt: getNow(),
                personalIntelligenceState: storage.getItem(STORAGE_KEYS.LEGACY_MEMORY_ENABLED) === 'true'
                    ? 'active'
                    : 'not_enabled'
            });
            const nextRegistry = {
                version: 1,
                profiles: [profile],
                legacyStateMigrationComplete: false,
                personalSettingsMigrationComplete: false
            };
            writeRegistry(nextRegistry);
            storage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_ID, id);

            migrateLegacyState(id, nextRegistry);
            migrateLegacyProfileSettings(id, nextRegistry);
            return nextRegistry;
        }

        function getActiveProfileId() {
            const registry = initialize();
            const activeId = normalizeProfileId(storage.getItem(STORAGE_KEYS.ACTIVE_PROFILE_ID));
            return registry.profiles.some((profile) => profile.id === activeId)
                ? activeId
                : registry.profiles[0].id;
        }

        function findProfile(profileId) {
            const id = normalizeProfileId(profileId || getActiveProfileId());
            return initialize().profiles.find((profile) => profile.id === id) || null;
        }

        function updateProfile(profileId, change) {
            const registry = initialize();
            const id = normalizeProfileId(profileId || getActiveProfileId());
            const index = registry.profiles.findIndex((profile) => profile.id === id);
            if (index < 0) return null;
            const updated = {
                ...registry.profiles[index],
                ...change,
                updatedAt: getNow()
            };
            registry.profiles[index] = updated;
            writeRegistry(registry);
            return copyProfile(updated);
        }

        const manager = {
            listProfiles() {
                return initialize().profiles.map(copyProfile);
            },

            getActiveProfile() {
                return copyProfile(findProfile(getActiveProfileId()));
            },

            getActiveProfileId,

            createProfile(name = DEFAULT_PROFILE_NAME) {
                const registry = initialize();
                const usedIds = new Set(registry.profiles.map((profile) => profile.id));
                const timestamp = getNow();
                const profile = {
                    id: makeProfileId(usedIds),
                    name: normalizeProfileName(name),
                    createdAt: timestamp,
                    updatedAt: timestamp,
                    personalIntelligenceState: 'not_enabled'
                };
                registry.profiles.push(profile);
                writeRegistry(registry);
                return copyProfile(profile);
            },

            renameProfile(profileId, name) {
                return updateProfile(profileId, { name: normalizeProfileName(name) });
            },

            switchProfile(profileId) {
                const profile = findProfile(profileId);
                if (!profile) return null;
                storage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_ID, profile.id);
                return copyProfile(profile);
            },

            deleteProfile(profileId) {
                const registry = initialize();
                const id = normalizeProfileId(profileId);
                const index = registry.profiles.findIndex((profile) => profile.id === id);
                if (index < 0 || registry.profiles.length === 1) return false;
                registry.profiles.splice(index, 1);
                writeRegistry(registry);
                removeProfileData(id);
                if (storage.getItem(STORAGE_KEYS.ACTIVE_PROFILE_ID) === id) {
                    storage.setItem(STORAGE_KEYS.ACTIVE_PROFILE_ID, registry.profiles[0].id);
                }
                return true;
            },

            getPersonalIntelligenceState(profileId) {
                return normalizePersonalIntelligenceState(findProfile(profileId)?.personalIntelligenceState);
            },

            setPersonalIntelligenceEnabled(enabled, profileId) {
                const current = manager.getPersonalIntelligenceState(profileId);
                let next = current;
                if (enabled === true && (current === 'not_enabled' || current === 'paused')) next = 'active';
                if (enabled === false && current === 'active') next = 'paused';
                const profile = updateProfile(profileId, { personalIntelligenceState: next });
                return profile ? profile.personalIntelligenceState : 'not_enabled';
            },

            isPersonalIntelligenceActive(profileId) {
                return manager.getPersonalIntelligenceState(profileId) === 'active';
            },

            loadProfileState(profileId) {
                const profile = findProfile(profileId);
                return profile ? parseJson(storage.getItem(profileStateKey(profile.id)), null) : null;
            },

            saveProfileState(state, profileId) {
                const profile = findProfile(profileId);
                if (!profile) return false;
                try {
                    storage.setItem(profileStateKey(profile.id), JSON.stringify(state));
                    return true;
                } catch (_error) {
                    return false;
                }
            },

            getProfileSetting(setting, fallbackValue = null, profileId) {
                const profile = findProfile(profileId);
                const key = String(setting || '').replace(/\0/g, '').trim().slice(0, 120);
                if (!profile || !key) return fallbackValue;
                const value = parseJson(storage.getItem(profileSettingKey(profile.id, key)), undefined);
                return value === undefined ? fallbackValue : value;
            },

            setProfileSetting(setting, value, profileId) {
                const profile = findProfile(profileId);
                const key = String(setting || '').replace(/\0/g, '').trim().slice(0, 120);
                if (!profile || !key) return false;
                try {
                    storage.setItem(profileSettingKey(profile.id, key), JSON.stringify(value));
                    return true;
                } catch (_error) {
                    return false;
                }
            },

            removeProfileSetting(setting, profileId) {
                const profile = findProfile(profileId);
                const key = String(setting || '').replace(/\0/g, '').trim().slice(0, 120);
                if (!profile || !key) return false;
                storage.removeItem?.(profileSettingKey(profile.id, key));
                return true;
            },

            clearAllProfileData() {
                const dynamicKeys = getStorageKeys().filter((key) => (
                    key.startsWith(STORAGE_KEYS.PROFILE_STATE_PREFIX) ||
                    key.startsWith(PROFILE_SETTING_PREFIX)
                ));
                const fixedKeys = [
                    STORAGE_KEYS.REGISTRY,
                    STORAGE_KEYS.ACTIVE_PROFILE_ID,
                    STORAGE_KEYS.LEGACY_STATE,
                    STORAGE_KEYS.LEGACY_FEEDBACK_PROFILE_ID,
                    STORAGE_KEYS.LEGACY_MEMORY_ENABLED,
                    ...LEGACY_PERSONAL_SETTING_KEYS
                ];

                [...new Set([...dynamicKeys, ...fixedKeys])]
                    .forEach((key) => storage.removeItem?.(key));

                initialize();
                return manager.getActiveProfile();
            }
        };

        initialize();
        return manager;
    }

    return {
        STORAGE_KEYS,
        PROFILE_SETTING_PREFIX,
        LEGACY_PERSONAL_SETTING_KEYS,
        PROFILE_ID_PATTERN,
        PROFILE_STATES: [...PROFILE_STATES],
        DEFAULT_PROFILE_NAME,
        normalizeProfileId,
        normalizeProfileName,
        normalizePersonalIntelligenceState,
        profileStateKey,
        profileSettingKey,
        createManager
    };
});
