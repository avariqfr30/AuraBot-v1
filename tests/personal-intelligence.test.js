const assert = require('node:assert/strict');
const personalIntelligence = require('../public/js/personal-intelligence');

class MemoryStorage {
    constructor(entries = {}) {
        this.values = new Map(Object.entries(entries));
    }

    get length() {
        return this.values.size;
    }

    key(index) {
        return [...this.values.keys()][index] ?? null;
    }

    getItem(key) {
        return this.values.has(key) ? this.values.get(key) : null;
    }

    setItem(key, value) {
        this.values.set(String(key), String(value));
    }

    removeItem(key) {
        this.values.delete(String(key));
    }
}

class FailingProfileSettingStorage extends MemoryStorage {
    constructor(entries = {}) {
        super(entries);
        this.failedWrites = 0;
    }

    setItem(key, value) {
        if (this.failedWrites === 0 && String(key).startsWith('aura_profile_setting_v1:')) {
            this.failedWrites += 1;
            throw new Error('simulated storage failure');
        }
        super.setItem(key, value);
    }
}

class FailingLegacyStateStorage extends MemoryStorage {
    constructor(entries = {}) {
        super(entries);
        this.failedWrites = 0;
    }

    setItem(key, value) {
        if (
            this.failedWrites === 0 &&
            String(key).startsWith(STORAGE_KEYS.PROFILE_STATE_PREFIX)
        ) {
            this.failedWrites += 1;
            throw new Error('simulated state migration failure');
        }
        super.setItem(key, value);
    }
}

function createFactory(...ids) {
    let index = 0;
    return () => ids[index++] || 'profile-fallback-12345678';
}

const { STORAGE_KEYS, profileStateKey, profileSettingKey } = personalIntelligence;

const initializedStorage = new MemoryStorage();
const initialized = personalIntelligence.createManager(initializedStorage, {
    now: () => 100,
    idFactory: createFactory('profile-default-12345678')
});
assert.deepEqual(initialized.listProfiles(), [{
    id: 'profile-default-12345678',
    name: 'My Profile',
    createdAt: 100,
    updatedAt: 100,
    personalIntelligenceState: 'not_enabled'
}]);
assert.equal(initialized.getActiveProfileId(), 'profile-default-12345678');

const legacyId = 'profile-legacy-12345678';
const legacyStorage = new MemoryStorage({
    [STORAGE_KEYS.LEGACY_FEEDBACK_PROFILE_ID]: legacyId,
    [STORAGE_KEYS.LEGACY_MEMORY_ENABLED]: 'true',
    [STORAGE_KEYS.LEGACY_STATE]: JSON.stringify({ chats: [{ id: 'chat-1' }] }),
    unrelated_key: 'preserved'
});
const migrated = personalIntelligence.createManager(legacyStorage, { now: () => 200 });
assert.equal(migrated.getActiveProfileId(), legacyId);
assert.equal(migrated.getPersonalIntelligenceState(), 'active');
assert.deepEqual(migrated.loadProfileState(), { chats: [{ id: 'chat-1' }] });
assert.equal(legacyStorage.getItem(STORAGE_KEYS.LEGACY_STATE), null);
assert.equal(legacyStorage.getItem('unrelated_key'), 'preserved');

const existingProfileId = 'profile-existing-12345678';
const repairableMigrationStorage = new MemoryStorage({
    [STORAGE_KEYS.REGISTRY]: JSON.stringify({
        version: 1,
        profiles: [{
            id: existingProfileId,
            name: 'Existing',
            createdAt: 250,
            updatedAt: 250,
            personalIntelligenceState: 'not_enabled'
        }]
    }),
    [STORAGE_KEYS.ACTIVE_PROFILE_ID]: existingProfileId,
    [STORAGE_KEYS.LEGACY_STATE]: JSON.stringify({ chats: [{ id: 'legacy-chat' }] })
});
const repairedMigration = personalIntelligence.createManager(repairableMigrationStorage);
assert.deepEqual(repairedMigration.loadProfileState(), { chats: [{ id: 'legacy-chat' }] });
assert.equal(repairableMigrationStorage.getItem(STORAGE_KEYS.LEGACY_STATE), null);

const interruptedCopyState = JSON.stringify({ chats: [{ id: 'copied-chat' }] });
const interruptedMigrationStorage = new MemoryStorage({
    [STORAGE_KEYS.REGISTRY]: JSON.stringify({
        version: 1,
        profiles: [{
            id: existingProfileId,
            name: 'Existing',
            createdAt: 260,
            updatedAt: 260,
            personalIntelligenceState: 'not_enabled'
        }]
    }),
    [STORAGE_KEYS.ACTIVE_PROFILE_ID]: existingProfileId,
    [STORAGE_KEYS.LEGACY_STATE]: interruptedCopyState,
    [profileStateKey(existingProfileId)]: interruptedCopyState
});
personalIntelligence.createManager(interruptedMigrationStorage);
assert.equal(interruptedMigrationStorage.getItem(STORAGE_KEYS.LEGACY_STATE), null);

const differingMigrationStorage = new MemoryStorage({
    [STORAGE_KEYS.REGISTRY]: interruptedMigrationStorage.getItem(STORAGE_KEYS.REGISTRY),
    [STORAGE_KEYS.ACTIVE_PROFILE_ID]: existingProfileId,
    [STORAGE_KEYS.LEGACY_STATE]: interruptedCopyState,
    [profileStateKey(existingProfileId)]: JSON.stringify({ chats: [{ id: 'different-chat' }] })
});
personalIntelligence.createManager(differingMigrationStorage);
assert.equal(differingMigrationStorage.getItem(STORAGE_KEYS.LEGACY_STATE), interruptedCopyState);
assert.equal(
    JSON.parse(differingMigrationStorage.getItem(STORAGE_KEYS.REGISTRY)).legacyStateMigrationComplete,
    true
);
const differingMigration = personalIntelligence.createManager(differingMigrationStorage);
const conflictSecondProfile = differingMigration.createProfile('Conflict-safe second');
differingMigration.switchProfile(conflictSecondProfile.id);
assert.equal(differingMigration.loadProfileState(), null);
assert.equal(differingMigrationStorage.getItem(STORAGE_KEYS.LEGACY_STATE), interruptedCopyState);

const retryStateStorage = new FailingLegacyStateStorage({
    [STORAGE_KEYS.LEGACY_STATE]: JSON.stringify({ chats: [{ id: 'retry-chat' }] })
});
const interruptedStateManager = personalIntelligence.createManager(retryStateStorage, {
    idFactory: createFactory('profile-state-retry-12345678')
});
assert.equal(
    JSON.parse(retryStateStorage.getItem(STORAGE_KEYS.REGISTRY)).legacyStateMigrationComplete,
    false
);
const retriedStateManager = personalIntelligence.createManager(retryStateStorage);
assert.deepEqual(retriedStateManager.loadProfileState(), { chats: [{ id: 'retry-chat' }] });
assert.equal(retryStateStorage.getItem(STORAGE_KEYS.LEGACY_STATE), null);
assert.equal(
    JSON.parse(retryStateStorage.getItem(STORAGE_KEYS.REGISTRY)).legacyStateMigrationComplete,
    true
);

const legacySettingsStorage = new MemoryStorage({
    aura_experience_style: 'focused',
    aura_location_enabled: 'true',
    aura_location_context: JSON.stringify({ city: 'Jakarta' })
});
const legacySettings = personalIntelligence.createManager(legacySettingsStorage, {
    idFactory: createFactory('profile-settings-12345678', 'profile-clean-12345678')
});
const settingsProfile = legacySettings.getActiveProfile();
assert.equal(legacySettings.getProfileSetting('aura_experience_style'), 'focused');
assert.equal(legacySettings.getProfileSetting('aura_location_enabled'), true);
assert.deepEqual(legacySettings.getProfileSetting('aura_location_context'), { city: 'Jakarta' });
assert.equal(legacySettingsStorage.getItem('aura_experience_style'), null);
assert.equal(legacySettingsStorage.getItem('aura_location_enabled'), null);
assert.equal(legacySettingsStorage.getItem('aura_location_context'), null);
const cleanProfile = legacySettings.createProfile('Clean');
legacySettings.switchProfile(cleanProfile.id);
assert.equal(legacySettings.getProfileSetting('aura_experience_style', null), null);
assert.equal(legacySettings.getProfileSetting('aura_location_enabled', null), null);
assert.equal(legacySettings.getProfileSetting('aura_location_context', null), null);
legacySettings.switchProfile(settingsProfile.id);

const retryMigrationStorage = new FailingProfileSettingStorage({
    aura_experience_style: 'focused'
});
personalIntelligence.createManager(retryMigrationStorage, {
    idFactory: createFactory('profile-retry-12345678')
});
assert.equal(
    JSON.parse(retryMigrationStorage.getItem(STORAGE_KEYS.REGISTRY)).personalSettingsMigrationComplete,
    false
);
assert.equal(retryMigrationStorage.getItem('aura_experience_style'), 'focused');
const retriedMigration = personalIntelligence.createManager(retryMigrationStorage);
assert.equal(retriedMigration.getProfileSetting('aura_experience_style'), 'focused');
assert.equal(retryMigrationStorage.getItem('aura_experience_style'), null);
assert.equal(
    JSON.parse(retryMigrationStorage.getItem(STORAGE_KEYS.REGISTRY)).personalSettingsMigrationComplete,
    true
);

const conflictingSettingsProfileId = 'profile-conflict-12345678';
const conflictingSettingsStorage = new MemoryStorage({
    [STORAGE_KEYS.LEGACY_FEEDBACK_PROFILE_ID]: conflictingSettingsProfileId,
    [STORAGE_KEYS.LEGACY_EXPERIENCE_STYLE]: 'focused',
    [profileSettingKey(conflictingSettingsProfileId, STORAGE_KEYS.LEGACY_EXPERIENCE_STYLE)]: JSON.stringify('gentle')
});
const conflictingSettings = personalIntelligence.createManager(conflictingSettingsStorage);
assert.equal(conflictingSettings.getProfileSetting(STORAGE_KEYS.LEGACY_EXPERIENCE_STYLE), 'gentle');
assert.equal(conflictingSettingsStorage.getItem(STORAGE_KEYS.LEGACY_EXPERIENCE_STYLE), 'focused');
assert.equal(
    JSON.parse(conflictingSettingsStorage.getItem(STORAGE_KEYS.REGISTRY)).personalSettingsMigrationComplete,
    true
);
const settingsConflictSecond = conflictingSettings.createProfile('Conflict-safe second');
conflictingSettings.switchProfile(settingsConflictSecond.id);
assert.equal(conflictingSettings.getProfileSetting(STORAGE_KEYS.LEGACY_EXPERIENCE_STYLE, null), null);
assert.equal(conflictingSettingsStorage.getItem(STORAGE_KEYS.LEGACY_EXPERIENCE_STYLE), 'focused');

const lifecycleStorage = new MemoryStorage();
const lifecycle = personalIntelligence.createManager(lifecycleStorage, {
    now: () => 300,
    idFactory: createFactory('profile-primary-12345678', 'profile-second-12345678')
});
const primary = lifecycle.getActiveProfile();
const second = lifecycle.createProfile('  Team\n Profile  ');
assert.equal(second.name, 'Team Profile');
assert.equal(lifecycle.renameProfile(second.id, '  Work   Focus  ').name, 'Work Focus');
assert.equal(lifecycle.switchProfile(second.id).id, second.id);
assert.equal(lifecycle.getActiveProfileId(), second.id);
assert.equal(lifecycle.deleteProfile(primary.id), true);
assert.equal(lifecycle.getActiveProfileId(), second.id);
assert.equal(lifecycle.deleteProfile(second.id), false);
assert.equal(lifecycle.listProfiles().length, 1);

assert.equal(lifecycle.getPersonalIntelligenceState(), 'not_enabled');
assert.equal(lifecycle.setPersonalIntelligenceEnabled(false), 'not_enabled');
assert.equal(lifecycle.setPersonalIntelligenceEnabled(true), 'active');
assert.equal(lifecycle.isPersonalIntelligenceActive(), true);
assert.equal(lifecycle.setPersonalIntelligenceEnabled(false), 'paused');
assert.equal(lifecycle.isPersonalIntelligenceActive(), false);
assert.equal(lifecycle.setPersonalIntelligenceEnabled(true), 'active');

const isolationStorage = new MemoryStorage();
const isolation = personalIntelligence.createManager(isolationStorage, {
    idFactory: createFactory('profile-one-12345678', 'profile-two-12345678')
});
const one = isolation.getActiveProfile();
const two = isolation.createProfile('Second');
assert.equal(isolation.saveProfileState({ chats: ['one'] }), true);
assert.equal(isolation.setProfileSetting('tone', 'calm'), true);
assert.equal(isolation.switchProfile(two.id).id, two.id);
assert.equal(isolation.loadProfileState(), null);
assert.equal(isolation.getProfileSetting('tone', 'default'), 'default');
assert.equal(isolation.saveProfileState({ chats: ['two'] }), true);
assert.equal(isolation.setProfileSetting('tone', 'direct'), true);
assert.deepEqual(isolation.loadProfileState(), { chats: ['two'] });
assert.equal(isolation.switchProfile(one.id).id, one.id);
assert.deepEqual(isolation.loadProfileState(), { chats: ['one'] });
assert.equal(isolation.getProfileSetting('tone'), 'calm');
assert.equal(isolation.saveProfileState('profile-state-12345678'), true);
assert.equal(isolation.loadProfileState(), 'profile-state-12345678');
assert.equal(isolation.deleteProfile(two.id), true);
assert.equal(isolationStorage.getItem(profileStateKey(two.id)), null);
assert.equal(isolationStorage.getItem(profileSettingKey(two.id, 'tone')), null);

const clearAllStorage = new MemoryStorage({
    aura_theme: 'dark',
    unrelated_key: 'preserved'
});
const clearAll = personalIntelligence.createManager(clearAllStorage, {
    now: () => 400,
    idFactory: createFactory(
        'profile-clear-one-12345678',
        'profile-clear-two-12345678',
        'profile-clear-fresh-12345678'
    )
});
const clearOne = clearAll.getActiveProfile();
const clearTwo = clearAll.createProfile('Second');
clearAll.saveProfileState({ chats: ['one'] }, clearOne.id);
clearAll.setProfileSetting('tone', 'calm', clearOne.id);
clearAll.saveProfileState({ chats: ['two'] }, clearTwo.id);
clearAll.setProfileSetting('tone', 'direct', clearTwo.id);
const freshProfile = clearAll.clearAllProfileData();
assert.equal(freshProfile.id, 'profile-clear-fresh-12345678');
assert.equal(freshProfile.name, 'My Profile');
assert.equal(freshProfile.personalIntelligenceState, 'not_enabled');
assert.deepEqual(clearAll.listProfiles(), [freshProfile]);
assert.equal(clearAll.getActiveProfileId(), freshProfile.id);
assert.equal(clearAllStorage.getItem(profileStateKey(clearOne.id)), null);
assert.equal(clearAllStorage.getItem(profileStateKey(clearTwo.id)), null);
assert.equal(clearAllStorage.getItem(profileSettingKey(clearOne.id, 'tone')), null);
assert.equal(clearAllStorage.getItem(profileSettingKey(clearTwo.id, 'tone')), null);
assert.equal(clearAll.loadProfileState(), null);
assert.equal(clearAll.getProfileSetting('tone', null), null);
assert.equal(clearAllStorage.getItem(STORAGE_KEYS.LEGACY_FEEDBACK_PROFILE_ID), null);
assert.equal(clearAllStorage.getItem(STORAGE_KEYS.LEGACY_MEMORY_ENABLED), null);
assert.equal(clearAllStorage.getItem('aura_theme'), 'dark');
assert.equal(clearAllStorage.getItem('unrelated_key'), 'preserved');

console.log('personal intelligence tests passed');
