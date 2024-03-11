require('dotenv').config();
const express = require('express');
const axios = require('axios');
const NodeCache = require('node-cache');
const app = express();
const port = 3000;
const cache = new NodeCache({ stdTTL: 600, checkperiod: 120 });

const FILLOUT_API_BASE_URL = 'https://api.fillout.com/v1/api/forms';

app.get('/:formId/filteredResponses', async (req, res) => {
    const { formId } = req.params;
    const { filters, ...queryParameters } = req.query;

    const cacheKey = `${formId}_${JSON.stringify(filters)}`;
    console.log('Caching data key: ', cacheKey)
    const cachedData = cache.get(cacheKey);

    if (cachedData) {
        console.log('Serving from cache');
        return res.json(cachedData);
    } else {
        console.log(`Cache miss for key: ${cacheKey}`)
        try {
            const filteredConditions = filters ? JSON.parse(filters) : [];
            const response = await axios.get(`${FILLOUT_API_BASE_URL}/${formId}/submissions`, {
                params: queryParameters,
                headers: {
                    Authorization: `Bearer ${process.env.FILLOUT_API_KEY}`
                }
            });
    
            let filteredResponses = filterResponses(response.data.responses, filteredConditions);
            const results = {
                responses: filteredResponses,
                totalResponses: filteredResponses.length,
                pageCount: calculatePageCount(filteredResponses.length, queryParameters.limit || 10)
            };
        
            cache.set(cacheKey, results);
            res.json(results);
        } catch (error) {
            console.log('Error fetching responses from FillOut API: ', error);
            res.status(500).json({ error: 'Error fetching responses from FillOut API' });
        }
    }

});

function filterResponses(responses, filters) {
    return responses.filter(response => filters.every(filter => {
        const questionMatch = response.questions?.some(q => matchFilter(q, filter));
        const calculationMatch = response.calculations?.some(calculate => matchFilter(calculate, filter));
        const urlParameterMatch = response.urlParameters?.some(urlParameter => matchFilter(urlParameter, filter));

        return questionMatch || calculationMatch || urlParameterMatch;
    }));       
}
function matchFilter(item, filter) {
    if (!item || item.id !== filter.id) return false;
    switch (filter.condition) {
        case 'equals':
            return item.value === filter.value;
        case 'does_not_Equals':
            return item.value !== filter.value;
        case 'greater_than':
            return parseFloat(item.value) > parseFloat(filter.value);
        case 'less_than':
            return parseFloat(item.value) < parseFloat(filter.value);
        default:
            return false;
    }
}

function calculatePageCount(totalResponses, limit) {
    return Math.ceil(totalResponses / limit);
}

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});