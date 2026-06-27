#!/usr/bin/env node

require('dotenv').config();

const axios = require('axios');
const { ChromaClient } = require('chromadb');
const {
    RESPONSE_EXAMPLE_COLLECTION,
    buildEmbeddingDocument,
    buildMetadata,
    loadApprovedExamples
} = require('../lib/response-examples');

const CHROMA_URL = process.env.CHROMA_URL || 'http://127.0.0.1:8000';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'bge-m3:latest';
const REQUEST_TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 90000);
const chromaTarget = new URL(CHROMA_URL);
const chroma = new ChromaClient({
    host: chromaTarget.hostname,
    port: Number(chromaTarget.port || 8000),
    ssl: chromaTarget.protocol === 'https:'
});

const embeddingFunction = {
    generate: async (texts) => {
        const response = await axios.post(
            `${OLLAMA_URL}/api/embed`,
            { model: EMBEDDING_MODEL, input: texts },
            { timeout: REQUEST_TIMEOUT_MS }
        );
        return response.data.embeddings;
    }
};

async function main() {
    const examples = loadApprovedExamples();
    const collection = await chroma.getOrCreateCollection({
        name: RESPONSE_EXAMPLE_COLLECTION,
        embeddingFunction
    });

    const batchSize = 20;
    for (let index = 0; index < examples.length; index += batchSize) {
        const batch = examples.slice(index, index + batchSize);
        await collection.upsert({
            ids: batch.map((example) => example.id),
            documents: batch.map(buildEmbeddingDocument),
            metadatas: batch.map(buildMetadata)
        });
    }

    console.log(`Seeded ${examples.length} approved examples into ${RESPONSE_EXAMPLE_COLLECTION}.`);
}

main().catch((error) => {
    console.error('Failed to seed response examples:', error.message);
    process.exit(1);
});
