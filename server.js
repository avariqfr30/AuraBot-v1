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

// Using 127.0.0.1 to prevent Node v18+ IPv6 resolution errors
const chroma = new ChromaClient({ path: "http://127.0.0.1:8000" });
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = 'qwen3-embedding:latest';

// Custom Ollama Embedding Function for ChromaDB
const ollamaEmbeddingFunction = {
    generate: async (texts) => {
        try {
            const response = await axios.post(`${OLLAMA_URL}/api/embed`, {
                model: EMBEDDING_MODEL,
                input: texts 
            });
            return response.data.embeddings;
        } catch (error) {
            console.error("[Ollama Embed] Error:", error.message);
            throw error;
        }
    }
};

// Vector Storage Endpoints
app.post('/api/store_memory', async (req, res) => {
    try {
        const { text, metadata } = req.body;
        const collection = await chroma.getOrCreateCollection({ 
            name: "aura_long_term_memory",
            embeddingFunction: ollamaEmbeddingFunction 
        });
        await collection.add({
            ids: [`mem_${Date.now()}`],
            metadatas: [metadata || {}],
            documents: [text]
        });
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/search_memory', async (req, res) => {
    try {
        const { query } = req.body;
        const collection = await chroma.getOrCreateCollection({ 
            name: "aura_long_term_memory",
            embeddingFunction: ollamaEmbeddingFunction
        });
        const results = await collection.query({
            queryTexts: [query], 
            nResults: 3
        });
        res.json({ results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Google Search Proxy
app.get('/api/search', async (req, res) => {
    const { query } = req.query;
    const { GOOGLE_API_KEY, GOOGLE_CX } = process.env;

    if (!GOOGLE_API_KEY || !GOOGLE_CX) {
        return res.status(500).json({ error: 'Missing Google API credentials in .env' });
    }

    try {
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: { key: GOOGLE_API_KEY, cx: GOOGLE_CX, q: query, num: 3 }
        });
        const results = (response.data.items || []).map(item => ({
            title: item.title,
            snippet: item.snippet,
            link: item.link
        }));
        res.json({ results: JSON.stringify(results) });
    } catch (error) {
        res.status(500).json({ error: 'Google Search failed' });
    }
});

app.listen(PORT, () => console.log(`Aura Backend live on port ${PORT}`));