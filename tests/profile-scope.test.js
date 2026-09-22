const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

let profileScope = null;
try {
    profileScope = require('../lib/profile-scope');
} catch (_error) {
    profileScope = null;
}

assert.equal(
    typeof profileScope?.normalizeProfileId,
    'function',
    'normalizeProfileId must be implemented'
);
assert.equal(
    typeof profileScope?.normalizeChatId,
    'function',
    'normalizeChatId must be implemented'
);
assert.equal(
    typeof profileScope?.scopeMemoryMetadata,
    'function',
    'scopeMemoryMetadata must be implemented'
);
assert.equal(
    typeof profileScope?.buildProfileWhere,
    'function',
    'buildProfileWhere must be implemented'
);
assert.equal(
    typeof profileScope?.normalizeProfileDataScope,
    'function',
    'normalizeProfileDataScope must be implemented'
);

const profileId = 'profile-User_12345678';
assert.equal(profileScope.normalizeProfileId(`  ${profileId}  `), profileId);
assert.equal(profileScope.normalizeProfileId('profile-short'), '');
assert.equal(profileScope.normalizeProfileId('other-User_12345678'), '');

assert.equal(profileScope.normalizeChatId('  chat_20260731-abc  '), 'chat_20260731-abc');
assert.equal(profileScope.normalizeChatId('chat with spaces'), '');
assert.equal(profileScope.normalizeChatId('x'.repeat(161)), '');
assert.equal(profileScope.normalizeProfileDataScope(undefined), 'all');
assert.equal(profileScope.normalizeProfileDataScope(' all '), 'all');
assert.equal(profileScope.normalizeProfileDataScope('memory'), 'memory');
assert.equal(profileScope.normalizeProfileDataScope('feedback'), '');

const clientMetadata = {
    profileId: 'profile-attacker-12345678',
    chatId: '  chat_20260731-abc  ',
    role: 'user',
    timestamp: 123
};
assert.deepEqual(profileScope.scopeMemoryMetadata(clientMetadata, profileId), {
    profileId,
    chatId: 'chat_20260731-abc',
    role: 'user',
    timestamp: 123
});
assert.deepEqual(clientMetadata, {
    profileId: 'profile-attacker-12345678',
    chatId: '  chat_20260731-abc  ',
    role: 'user',
    timestamp: 123
}, 'scoping must not mutate caller metadata');

assert.deepEqual(profileScope.scopeMemoryMetadata({
    profileId: 'profile-attacker-12345678',
    chatId: 'not safe'
}, profileId), { profileId });

assert.deepEqual(profileScope.buildProfileWhere(profileId), {
    profileId: { $eq: profileId }
});
assert.deepEqual(profileScope.buildProfileWhere(profileId, ' chat_20260731-abc '), {
    $and: [
        { profileId: { $eq: profileId } },
        { chatId: { $eq: 'chat_20260731-abc' } }
    ]
});

const serverJs = fs.readFileSync(path.resolve(__dirname, '..', 'server.js'), 'utf8');
assert.match(serverJs, /require\('\.\/lib\/profile-scope'\)/);
assert.doesNotMatch(serverJs, /function normalizeLocalProfileId/);
assert.match(
    serverJs,
    /app\.post\('\/api\/store_memory'[\s\S]*?normalizeProfileId\(req\.body\?\.profileId\)[\s\S]*?scopeMemoryMetadata\(metadata, profileId\)/
);
assert.match(
    serverJs,
    /app\.post\('\/api\/search_memory'[\s\S]*?normalizeProfileId\(req\.body\?\.profileId\)[\s\S]*?approvedMemoryWhere\(profileId, chatId, hostedConfig\.enabled \? req\.accountId : null\)/
);
assert.match(
    serverJs,
    /app\.post\('\/api\/profile_data\/delete'[\s\S]*?normalizeProfileDataScope\(req\.body\?\.scope\)[\s\S]*?normalizeChatId\(rawChatId\)[\s\S]*?scope === 'memory'[\s\S]*?getMemoryCollection\(\)[\s\S]*?accountWhere\(profileId, chatId,[\s\S]*?getPersonalResponseExampleCollection\(\)[\s\S]*?accountWhere\(profileId, null,/
);
assert.match(
    serverJs,
    /rawChatId[\s\S]*?normalizeChatId\(rawChatId\)[\s\S]*?rawChatId !== undefined[\s\S]*?return res\.status\(400\)/
);
assert.match(
    serverJs,
    /completedScopes[\s\S]*?partial:[\s\S]*?completedScopes/
);

console.log('profile scope tests passed');
