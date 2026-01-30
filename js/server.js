// server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(cors()); // Allow requests from your frontend
app.use(express.static(path.join(__dirname, '..'))); // Serve static files from project root

// The single endpoint for performing a web search
app.get('/api/search', async (req, res) => {
    const userQuery = req.query.query;
    const googleApiKey = process.env.GOOGLE_API_KEY;
    const googleCseId = process.env.GOOGLE_CSE_ID;

    if (!userQuery) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }
    if (!googleApiKey || !googleCseId) {
        return res.status(500).json({ error: 'Server is missing Google API key or CSE ID' });
    }

    try {
        console.log(`Performing live search for: "${userQuery}"`);
        const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
            params: {
                key: googleApiKey,
                cx: googleCseId,
                q: userQuery,
                dateRestrict: 'd1', // Last day for real-time latest
                sort: 'date', // Sort by date for latest
                num: 5 // Number of results
            }
        });

        // Extract relevant results
        const results = response.data.items ? response.data.items.map(item => ({
            title: item.title,
            link: item.link,
            snippet: item.snippet
        })) : [];

        res.json({ results });

    } catch (error) {
        console.error('Error fetching from Google Search API:', error);
        res.status(500).json({ error: 'Failed to fetch search results' });
    }
});

app.listen(PORT, () => {
    console.log(`Aura proxy server listening on http://localhost:${PORT}`);
    console.log(`Open http://localhost:${PORT}/index.html in your browser`);
});