// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { ChromaClient } = require('chromadb');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Use 127.0.0.1 to avoid Node.js IPv6 resolution issues
const chroma = new ChromaClient({ path: "http://127.0.0.1:8000" });
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = 'qwen3-embedding:latest'; // Ensure this model is pulled in Ollama

// --- Custom Ollama Embedding Function ---
const ollamaEmbeddingFunction = {
    generate: async (texts) => {
        try {
            const response = await axios.post(`${OLLAMA_URL}/api/embed`, {
                model: EMBEDDING_MODEL,
                input: texts 
            });
            return response.data.embeddings;
        } catch (error) {
            console.error("[Ollama Embed] Failed to generate embeddings:", error.message);
            throw error;
        }
    }
};

// --- Vector Storage ---
app.post('/api/store_memory', async (req, res) => {
    try {
        const { text, metadata, id } = req.body;
        const collection = await chroma.getOrCreateCollection({ 
            name: "aura_long_term_memory",
            embeddingFunction: ollamaEmbeddingFunction 
        });
        await collection.add({
            ids: [id || `mem_${Date.now()}`],
            metadatas: [metadata || {}],
            documents: [text]
        });
        res.json({ success: true });
    } catch (error) {
        console.error("[Vector Store] Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/search_memory', async (req, res) => {
    try {
        const { query, nResults = 3 } = req.body;
        const collection = await chroma.getOrCreateCollection({ 
            name: "aura_long_term_memory",
            embeddingFunction: ollamaEmbeddingFunction
        });
        const results = await collection.query({
            queryTexts: [query], 
            nResults: nResults
        });
        res.json({ results });
    } catch (error) {
        console.error("[Vector Search] Error:", error.message);
        res.status(500).json({ error: error.message });
    }
});

// --- Google Search Proxy ---
app.get('/api/search', async (req, res) => {
    const { query } = req.query;
    const { GOOGLE_API_KEY, GOOGLE_CX } = process.env;

    if (!query) return res.status(400).json({ error: 'Query parameter is required' });
    if (!GOOGLE_API_KEY || !GOOGLE_CX) return res.status(500).json({ error: 'Missing Google API credentials' });

    try {
        console.log(`[SearchAgent] Executing: "${query}"`);
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: { key: GOOGLE_API_KEY, cx: GOOGLE_CX, q: query, num: 3 }
        });

        const items = response.data.items || [];
        const results = items.map(({ title, snippet, link }) => ({ title, snippet, link }));
        
        res.json({ results: results.length ? JSON.stringify(results) : "No results found." });
    } catch (error) {
        console.error('[SearchAgent] API Error:', error.message);
        res.status(500).json({ error: 'Search failed' });
    }
});

app.listen(PORT, () => console.log(`Aura search & vector proxy live on port ${PORT}`));