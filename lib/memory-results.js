const MEMORY_COLLECTION = 'aura_long_term_memory';

function buildMemoryMatches(results) {
    const ids = Array.isArray(results?.ids?.[0]) ? results.ids[0] : [];
    const documents = Array.isArray(results?.documents?.[0]) ? results.documents[0] : [];
    const distances = Array.isArray(results?.distances?.[0]) ? results.distances[0] : [];
    const metadatas = Array.isArray(results?.metadatas?.[0]) ? results.metadatas[0] : [];

    return ids.flatMap((id, index) => {
        const text = typeof documents[index] === 'string' ? documents[index].trim() : '';
        if (!id || !text) return [];

        const metadata = metadatas[index] && typeof metadatas[index] === 'object'
            ? metadatas[index]
            : {};
        const distance = Number(distances[index]);

        return [{
            id: String(id),
            text,
            distance: Number.isFinite(distance) ? distance : null,
            provenance: {
                source: 'conversation_vector',
                collection: MEMORY_COLLECTION,
                chatId: String(metadata.chatId || ''),
                role: String(metadata.role || ''),
                timestamp: Number(metadata.timestamp) || 0
            }
        }];
    });
}

module.exports = {
    MEMORY_COLLECTION,
    buildMemoryMatches
};
