import { GoogleGenerativeAI } from '@google/generative-ai';
import Book from '../models/Book.js';

// ✅ Proper Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "AIzaSyB1eg1_QRhKAMH3getaP_HNlKiy86tyWcg");

const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash"
});

// ✅ Timeout wrapper
const generateContentWithTimeout = async (prompt, timeoutMs = 10000) => {
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('AI Request Timeout')), timeoutMs);
    });

    try {
        const result = await Promise.race([
            model.generateContent(prompt),
            timeoutPromise
        ]);

        clearTimeout(timeoutId);

        // ✅ Correct response extraction
        return result.response.text();

    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
};

// ✅ Clean JSON
const extractJson = (text) => {
    return text.replace(/```json/gi, '').replace(/```/g, '').trim();
};

//////////////////////////////////////////////////////////////
// ✅ CHAT API
//////////////////////////////////////////////////////////////

export const chatAssistant = async (req, res) => {
    try {
        const { query } = req.body;

        if (!query || typeof query !== 'string') {
            return res.status(400).json({ success: false, message: 'Valid query is required' });
        }

        const availableBooks = await Book.find()
            .select('title author category')
            .limit(20)
            .lean();

        let catalogContext = 'No books available.';
        if (availableBooks.length > 0) {
            catalogContext = availableBooks
                .map(b => `- ${b.title} by ${b.author} (${b.category})`)
                .join('\n');
        }

        const prompt = `You are a helpful bookstore assistant.

User: "${query}"

Books:
${catalogContext}

Answer clearly and shortly.`;

        const text = await generateContentWithTimeout(prompt);

        res.json({
            success: true,
            data: { answer: text }
        });

    } catch (error) {
        console.error('Gemini Chat Error:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Chat error'
        });
    }
};

//////////////////////////////////////////////////////////////
// ✅ SUMMARY API
//////////////////////////////////////////////////////////////

export const generateSummary = async (req, res) => {
    try {
        const { bookId } = req.body;

        if (!bookId) {
            return res.status(400).json({ success: false, message: 'Book ID required' });
        }

        const book = await Book.findById(bookId).select('title author description');

        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }

        const prompt = `
Title: ${book.title}
Author: ${book.author}

Explain in short + 3 bullet points.
`;

        const text = await generateContentWithTimeout(prompt);

        res.json({
            success: true,
            data: { summary: text }
        });

    } catch (error) {
        console.error('Summary Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

//////////////////////////////////////////////////////////////
// ✅ RECOMMENDATIONS API
//////////////////////////////////////////////////////////////

export const getRecommendations = async (req, res) => {
    try {
        const { interests } = req.body;

        if (!interests) {
            return res.status(400).json({ success: false, message: 'Interests required' });
        }

        const books = await Book.find()
            .select('title author category')
            .limit(50)
            .lean();

        const catalog = books.map(b =>
            `${b.title} by ${b.author} (${b.category})`
        ).join('\n');

        const prompt = `
User likes: ${interests}

Books:
${catalog}

Give 3 best recommendations in JSON format:
[
 { "title": "...", "reason": "..." }
]
`;

        const text = await generateContentWithTimeout(prompt);

        let data = [];

        try {
            data = JSON.parse(extractJson(text));
        } catch (e) {
            console.log("Parse fail:", text);
        }

        res.json({
            success: true,
            data
        });

    } catch (error) {
        console.error('Recommendation Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};

//////////////////////////////////////////////////////////////
// ✅ SEMANTIC SEARCH
//////////////////////////////////////////////////////////////

export const semanticSearch = async (req, res) => {
    try {
        const { query } = req.body;

        if (!query) {
            return res.status(400).json({ success: false, message: 'Query required' });
        }

        const books = await Book.find()
            .select('_id title description')
            .limit(50)
            .lean();

        const catalog = JSON.stringify(
            books.map(b => ({
                id: b._id,
                title: b.title,
                desc: b.description
            }))
        );

        const prompt = `
Query: ${query}

Books: ${catalog}

Return matching IDs only as JSON array:
["id1","id2"]
`;

        const text = await generateContentWithTimeout(prompt);

        let ids = [];

        try {
            ids = JSON.parse(extractJson(text));
        } catch (e) {
            console.log("Parse error:", text);
        }

        const results = await Book.find({ _id: { $in: ids } });

        res.json({
            success: true,
            data: { results }
        });

    } catch (error) {
        console.error('Search Error:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};