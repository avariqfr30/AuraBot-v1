const PROFILE_ID_PATTERN = /^profile-[a-z0-9_-]{8,120}$/i;
const CHAT_ID_PATTERN = /^[a-z0-9_-]{1,160}$/i;

function normalizeProfileId(value) {
    const profileId = typeof value === 'string' ? value.trim() : '';
    return PROFILE_ID_PATTERN.test(profileId) ? profileId : '';
}

function normalizeChatId(value) {
    const chatId = typeof value === 'string' ? value.trim() : '';
    return CHAT_ID_PATTERN.test(chatId) ? chatId : '';
}

function normalizeProfileDataScope(value) {
    const scope = value === undefined ? 'all' : String(value || '').trim().toLowerCase();
    return scope === 'all' || scope === 'memory' ? scope : '';
}

function scopeMemoryMetadata(metadata, profileId) {
    const safeMetadata = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
        ? { ...metadata }
        : {};
    const scopedProfileId = normalizeProfileId(profileId);
    const chatId = normalizeChatId(safeMetadata.chatId);

    delete safeMetadata.profileId;
    delete safeMetadata.chatId;

    return {
        ...safeMetadata,
        ...(scopedProfileId ? { profileId: scopedProfileId } : {}),
        ...(chatId ? { chatId } : {})
    };
}

function buildProfileWhere(profileId, chatId) {
    const scopedProfileId = normalizeProfileId(profileId);
    const scopedChatId = normalizeChatId(chatId);
    const profileFilter = { profileId: { $eq: scopedProfileId } };

    return scopedChatId
        ? { $and: [profileFilter, { chatId: { $eq: scopedChatId } }] }
        : profileFilter;
}

module.exports = {
    normalizeProfileId,
    normalizeChatId,
    normalizeProfileDataScope,
    scopeMemoryMetadata,
    buildProfileWhere
};
