// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3000;

app.use(cors()); // Allow requests from your frontend

// The single endpoint for performing a web search
app.get('/api/search', async (req, res) => {
    const userQuery = req.query.query;
    const tavilyApiKey = process.env.TAVILY_API_KEY;

    if (!userQuery) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }
    if (!tavilyApiKey) {
        return res.status(500).json({ error: 'Server is missing API key' });
    }

    try {
        console.log(`Performing live search for: "${userQuery}"`);
        const response = await axios.post('https://api.tavily.com/search', {
            api_key: tavilyApiKey,
            query: userQuery,
            search_depth: "basic",
            include_answer: true,
            max_results: 3
        });

        // We return Tavily's concise answer for the AI to use
        const conciseResult = response.data.answer || "No specific answer found, but search results are available.";
        res.json({ results: conciseResult });

    } catch (error) {
        console.error('Error fetching from Tavily API:', error);
        res.status(500).json({ error: 'Failed to fetch search results' });
    }
});

app.listen(PORT, () => {
    console.log(`Aura proxy server listening on http://localhost:${PORT}`);
});