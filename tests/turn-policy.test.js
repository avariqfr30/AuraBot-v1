const assert = require('node:assert/strict');

let turnPolicy = null;
try {
    turnPolicy = require('../js/turn-policy');
} catch {
    turnPolicy = null;
}

assert.equal(
    typeof turnPolicy?.resolveTurnPolicy,
    'function',
    'resolveTurnPolicy must be implemented'
);
assert.equal(
    typeof turnPolicy?.selectRelevantMemories,
    'function',
    'selectRelevantMemories must be implemented'
);
assert.equal(
    typeof turnPolicy?.buildRelevantProfileBundle,
    'function',
    'buildRelevantProfileBundle must be implemented'
);
assert.equal(
    typeof turnPolicy?.resolveReEngagement,
    'function',
    'resolveReEngagement must be implemented'
);
assert.equal(
    typeof turnPolicy?.isExplicitToolRequest,
    'function',
    'isExplicitToolRequest must be implemented'
);
assert.equal(
    typeof turnPolicy?.excludeCurrentTurn,
    'function',
    'excludeCurrentTurn must be implemented'
);
assert.equal(
    typeof turnPolicy?.hasToolRefusal,
    'function',
    'hasToolRefusal must be implemented'
);
assert.equal(
    typeof turnPolicy?.hasImmediateGroundingNeed,
    'function',
    'hasImmediateGroundingNeed must be implemented'
);
assert.equal(
    typeof turnPolicy?.hasContextRejection,
    'function',
    'hasContextRejection must be implemented'
);

assert.equal(turnPolicy.isExplicitToolRequest('What is a safety plan?'), false);
assert.equal(turnPolicy.isExplicitToolRequest('I need a safety plan for tonight.'), true);
assert.equal(turnPolicy.isExplicitToolRequest('Please make me a packing checklist.'), true);
assert.equal(turnPolicy.hasToolRefusal('I am overwhelmed, but no tool—just answer.'), true);
assert.equal(turnPolicy.hasToolRefusal("I don't want a tool. Please listen."), true);
assert.equal(turnPolicy.hasToolRefusal("Don't give me a checklist."), true);
assert.equal(turnPolicy.hasToolRefusal('Please create a checklist for me.'), false);
assert.equal(turnPolicy.hasImmediateGroundingNeed("I'm having a panic attack."), true);
assert.equal(turnPolicy.hasImmediateGroundingNeed('I had a panic attack last month.'), false);
assert.equal(
    turnPolicy.hasContextRejection('Stop connecting this to my old relationship. This is someone new.'),
    true
);

const currentTurnOnly = [{ role: 'user', content: 'What is photosynthesis?' }];
assert.deepEqual(
    turnPolicy.excludeCurrentTurn(currentTurnOnly, 'What is photosynthesis?'),
    []
);
assert.equal(
    turnPolicy.resolveTurnPolicy({
        message: 'What is photosynthesis?',
        route: 'KnowledgeAgent',
        history: currentTurnOnly
    }).continuity.mode,
    'new_topic'
);

const history = [
    { role: 'user', content: 'I am worried my Friday meeting will go badly.' },
    { role: 'ai', content: 'Let us separate what you know from what anxiety is predicting.' }
];

const standalone = turnPolicy.resolveTurnPolicy({
    message: 'What is photosynthesis?',
    route: 'KnowledgeAgent',
    history
});
assert.equal(standalone.continuity.mode, 'new_topic');
assert.equal(standalone.continuity.usePriorTurn, false);

const shortFalseLink = turnPolicy.resolveTurnPolicy({
    message: 'What day is Christmas?',
    route: 'KnowledgeAgent',
    history: [{ role: 'user', content: 'I had a bad day at work.' }]
});
assert.equal(shortFalseLink.continuity.mode, 'new_topic');
assert.equal(shortFalseLink.continuity.usePriorTurn, false);

const followUp = turnPolicy.resolveTurnPolicy({
    message: 'What should I prepare first?',
    route: 'PlannerAgent',
    history
});
assert.equal(followUp.continuity.mode, 'follow_up');
assert.equal(followUp.continuity.usePriorTurn, true);

const terseFollowUp = turnPolicy.resolveTurnPolicy({
    message: 'When?',
    route: 'PlannerAgent',
    history
});
assert.equal(terseFollowUp.continuity.mode, 'follow_up');
assert.equal(terseFollowUp.continuity.usePriorTurn, true);

const explicitTopicShift = turnPolicy.resolveTurnPolicy({
    message: 'Different question: what is photosynthesis?',
    route: 'KnowledgeAgent',
    history
});
assert.equal(explicitTopicShift.continuity.mode, 'new_topic');
assert.equal(explicitTopicShift.continuity.usePriorTurn, false);

const rejectedPriorContext = turnPolicy.resolveTurnPolicy({
    message: 'Stop connecting this to my old relationship. This is someone new.',
    route: 'GeneralFriendAgent',
    history: [
        { role: 'user', content: 'My old relationship ended badly.' },
        { role: 'ai', content: 'That past experience may be shaping this.' }
    ]
});
assert.equal(rejectedPriorContext.continuity.mode, 'new_topic');
assert.equal(rejectedPriorContext.continuity.usePriorTurn, false);

const distortedConclusion = turnPolicy.resolveTurnPolicy({
    message: 'Everyone will think I am incompetent, so there is no point preparing.',
    route: 'CbtAnalystAgent',
    history: []
});
assert.equal(distortedConclusion.stance.mode, 'challenge');
assert.equal(distortedConclusion.stance.intensity, 'gentle');
assert.equal(distortedConclusion.stance.validateEmotionFirst, true);

const personalPreference = turnPolicy.resolveTurnPolicy({
    message: 'I prefer working in the morning.',
    route: 'GeneralFriendAgent',
    history: []
});
assert.notEqual(personalPreference.stance.mode, 'challenge');
assert.notEqual(personalPreference.stance.mode, 'correct');

const emotionalPresence = turnPolicy.resolveTurnPolicy({
    message: 'I held it together all day, but now I feel completely drained.',
    route: 'GeneralFriendAgent',
    history: []
});
assert.equal(emotionalPresence.stance.mode, 'support');
assert.equal(emotionalPresence.stance.validateEmotionFirst, true);

const explicitTool = turnPolicy.resolveTurnPolicy({
    message: 'Make me a meeting checklist.',
    route: 'PlannerAgent',
    history,
    toolCandidate: { type: 'checklist', confidence: 0.96 },
    explicitToolRequest: true
});
assert.equal(explicitTool.initiative.mode, 'act');
assert.equal(explicitTool.tool.mode, 'create');
assert.equal(explicitTool.tool.type, 'checklist');

const repeatedExplicitTool = turnPolicy.resolveTurnPolicy({
    message: 'Create another meeting checklist.',
    route: 'PlannerAgent',
    history,
    toolCandidate: { type: 'checklist', confidence: 0.96 },
    explicitToolRequest: true,
    hasActiveTool: true,
    recentlyDeclinedTool: true
});
assert.equal(repeatedExplicitTool.initiative.mode, 'act');
assert.equal(repeatedExplicitTool.tool.mode, 'create');

const proactiveTool = turnPolicy.resolveTurnPolicy({
    message: 'I feel overwhelmed trying to prepare.',
    route: 'PlannerAgent',
    history,
    toolCandidate: { type: 'checklist', confidence: 0.85 }
});
assert.equal(proactiveTool.initiative.mode, 'offer');
assert.equal(proactiveTool.tool.mode, 'offer');

const immediateGrounding = turnPolicy.resolveTurnPolicy({
    message: 'I am panicking and need help calming down right now.',
    route: 'GeneralFriendAgent',
    history: [],
    toolCandidate: { type: 'breathing_exercise', confidence: 0.9 },
    immediateSupportNeed: true
});
assert.equal(immediateGrounding.initiative.mode, 'act');
assert.equal(immediateGrounding.tool.mode, 'create');

const declinedTool = turnPolicy.resolveTurnPolicy({
    message: 'I still feel overwhelmed.',
    route: 'GeneralFriendAgent',
    history,
    toolCandidate: { type: 'checklist', confidence: 0.85 },
    recentlyDeclinedTool: true
});
assert.equal(declinedTool.initiative.mode, 'respond');
assert.equal(declinedTool.tool.mode, 'none');

const activeTool = turnPolicy.resolveTurnPolicy({
    message: 'Help me keep preparing.',
    route: 'PlannerAgent',
    history,
    toolCandidate: { type: 'checklist', confidence: 0.85 },
    hasActiveTool: true
});
assert.equal(activeTool.initiative.mode, 'respond');
assert.equal(activeTool.tool.mode, 'none');

const memoryMatches = [
    {
        id: 'stale-but-close',
        text: 'My favorite movie is Dune.',
        distance: 0.04,
        provenance: { source: 'conversation_vector', chatId: 'chat-1' }
    },
    {
        id: 'meeting-context',
        text: 'I am worried about my Friday meeting.',
        distance: 0.16,
        provenance: { source: 'conversation_vector', chatId: 'chat-1' }
    },
    {
        id: 'other-chat',
        text: 'I prepare quarterly meeting notes.',
        distance: 0.02,
        provenance: { source: 'conversation_vector', chatId: 'chat-2' }
    },
    {
        id: 'current-turn-duplicate',
        text: 'Help me prepare for the Friday meeting.',
        distance: 0,
        provenance: { source: 'conversation_vector', chatId: 'chat-1' }
    }
];

const relevantMemories = turnPolicy.selectRelevantMemories({
    query: 'Help me prepare for the Friday meeting.',
    matches: memoryMatches,
    chatId: 'chat-1',
    continuity: { mode: 'new_topic', confidence: 0.82, usePriorTurn: false }
});
assert.deepEqual(relevantMemories.map((entry) => entry.id), ['meeting-context']);

const rejectedContextMemories = turnPolicy.selectRelevantMemories({
    query: 'Stop connecting this to my old relationship. This is someone new.',
    matches: [{
        id: 'old-relationship',
        text: 'My old relationship ended badly.',
        distance: 0.01,
        provenance: { source: 'conversation_vector', chatId: 'chat-1' }
    }],
    chatId: 'chat-1',
    continuity: { mode: 'follow_up', confidence: 0.8, usePriorTurn: true }
});
assert.deepEqual(rejectedContextMemories, []);

const ambiguousFollowUpMemories = turnPolicy.selectRelevantMemories({
    query: 'Why?',
    matches: memoryMatches,
    chatId: 'chat-1',
    continuity: { mode: 'follow_up', confidence: 0.78, usePriorTurn: true }
});
assert.deepEqual(ambiguousFollowUpMemories, []);

const explicitRecallMemories = turnPolicy.selectRelevantMemories({
    query: 'What did I tell you before?',
    matches: memoryMatches,
    chatId: 'chat-1',
    explicitRecall: true,
    continuity: { mode: 'new_topic', confidence: 0.82, usePriorTurn: false }
});
assert.deepEqual(
    explicitRecallMemories.map((entry) => entry.id),
    ['current-turn-duplicate', 'stale-but-close']
);

const profileBundle = turnPolicy.buildRelevantProfileBundle({
    query: 'I feel overwhelmed about the Friday meeting.',
    activeProfile: {
        communicationStyle: 'Prefers calm, concise replies.',
        behavioralFacts: [
            'The user has an important Friday meeting.',
            'The user likes the movie Dune.'
        ],
        moodPatterns: ['Anxiety tends to increase before meetings.'],
        potentialLapses: ['Avoids preparation when anxious.'],
        responsePreferences: { detailLevel: 'brief', directnessLevel: 'balanced' }
    },
    durableProfile: {
        behavioralFacts: [
            'The user usually works remotely.',
            'Friday meetings are especially stressful.'
        ]
    },
    includeDurable: true
});
assert.deepEqual(profileBundle, {
    communicationStyle: 'Prefers calm, concise replies.',
    responsePreferences: { detailLevel: 'brief', directnessLevel: 'balanced' },
    activeChat: {
        behavioralFacts: ['The user has an important Friday meeting.'],
        moodPatterns: ['Anxiety tends to increase before meetings.'],
        potentialLapses: []
    },
    durableUserMemory: {
        behavioralFacts: [
            'The user usually works remotely.',
            'Friday meetings are especially stressful.'
        ],
        moodPatterns: [],
        potentialLapses: []
    }
});

const profileWithoutDurableMemory = turnPolicy.buildRelevantProfileBundle({
    query: 'Tell me about my Friday meeting.',
    activeProfile: { behavioralFacts: ['The Friday meeting starts at noon.'] },
    durableProfile: { behavioralFacts: ['Friday meetings are stressful.'] },
    includeDurable: false
});
assert.equal(profileWithoutDurableMemory.durableUserMemory, null);

const mealProfile = turnPolicy.buildRelevantProfileBundle({
    query: 'Suggest an easy dinner.',
    activeProfile: {
        behavioralFacts: ['The user is vegetarian.', 'The user likes the movie Dune.']
    }
});
assert.deepEqual(mealProfile.activeChat.behavioralFacts, ['The user is vegetarian.']);

const namedPersonProfile = turnPolicy.buildRelevantProfileBundle({
    query: 'What gift should I get Mia?',
    activeProfile: {
        behavioralFacts: ['The user has a daughter named Mia.', 'The user works remotely.']
    }
});
assert.deepEqual(namedPersonProfile.activeChat.behavioralFacts, ['The user has a daughter named Mia.']);

const shortRelationshipProfile = turnPolicy.buildRelevantProfileBundle({
    query: 'Help me plan time with my son.',
    activeProfile: {
        behavioralFacts: ['The user has a son.', 'The user likes the movie Dune.']
    }
});
assert.deepEqual(shortRelationshipProfile.activeChat.behavioralFacts, ['The user has a son.']);

const unrelatedShortWordsProfile = turnPolicy.buildRelevantProfileBundle({
    query: 'What is the weather?',
    activeProfile: {
        behavioralFacts: ['The user has a daughter named Mia.', 'The user works remotely.']
    }
});
assert.deepEqual(unrelatedShortWordsProfile.activeChat.behavioralFacts, []);

const workProfile = turnPolicy.buildRelevantProfileBundle({
    query: 'Why do I feel so drained at work?',
    activeProfile: {
        behavioralFacts: ['The open office makes it hard for the user to focus.', 'The user is vegetarian.']
    }
});
assert.deepEqual(
    workProfile.activeChat.behavioralFacts,
    ['The open office makes it hard for the user to focus.']
);

const unrelatedRelationshipProfile = turnPolicy.buildRelevantProfileBundle({
    query: 'My friend hurt me.',
    activeProfile: {
        behavioralFacts: ['The user has a daughter named Mia.']
    }
});
assert.deepEqual(unrelatedRelationshipProfile.activeChat.behavioralFacts, []);

const correctedContextProfile = turnPolicy.buildRelevantProfileBundle({
    query: 'Stop connecting this to my old relationship. This is someone new.',
    activeProfile: {
        communicationStyle: 'Prefers calm replies.',
        responsePreferences: { detailLevel: 'brief' },
        behavioralFacts: ['The previous relationship was painful.'],
        moodPatterns: ['Relationship conflict increases anxiety.']
    },
    durableProfile: {
        behavioralFacts: ['The user recently ended a relationship.']
    },
    includeDurable: true
});
assert.deepEqual(correctedContextProfile, {
    communicationStyle: 'Prefers calm replies.',
    responsePreferences: { detailLevel: 'brief' },
    activeChat: {
        behavioralFacts: [],
        moodPatterns: [],
        potentialLapses: []
    },
    durableUserMemory: {
        behavioralFacts: [],
        moodPatterns: [],
        potentialLapses: []
    }
});

const now = 10 * 86400000;
assert.deepEqual(
    turnPolicy.resolveReEngagement({
        lastUserMessageAt: 5 * 86400000,
        lastReengagementAt: 0,
        now
    }),
    { days: 5, reason: 'inactive' }
);
assert.equal(
    turnPolicy.resolveReEngagement({
        lastUserMessageAt: 5 * 86400000,
        lastReengagementAt: 9 * 86400000,
        now
    }),
    null
);
assert.equal(
    turnPolicy.resolveReEngagement({
        lastUserMessageAt: 8 * 86400000,
        lastReengagementAt: 0,
        now
    }),
    null
);

console.log('turn policy tests passed');
