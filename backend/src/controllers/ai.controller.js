import { GoogleGenAI } from '@google/genai';
import Book from '../models/Book.js';

// Initialize Gemini SDK with API Key
console.log( process.env.GEMINI_API_KEY);
const ai = new GoogleGenAI({ apiKey: "AIzaSyBxqTlbqaBnTTUsLge8g43PpJ3y7Yja65c" });
const textModel = 'gemini-2.5-flash';

// ⚡ PERFORMANCE & STABILITY: Timeout wrapper for Gemini API calls (10 seconds)
const generateContentWithTimeout = async (prompt, timeoutMs = 10000) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('AI Request Timeout')), timeoutMs);
    });

    try {
        const result = await Promise.race([
            ai.models.generateContent({ model: textModel, contents: prompt }),
            timeoutPromise
        ]);
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
};

// 🛡️ SAFETY: Clean Markdown JSON wrapper often returned by Gemini
const extractJson = (text) => {
    return text.replace(/```json/gi, '').replace(/```/g, '').trim();
};

// @desc    Chat with Book Assistant
// @route   POST /api/ai/chat
// @access  Public
export const chatAssistant = async (req, res) => {
    try {
        const { query } = req.body;
        
        // 🛡️ SAFETY: Input validation
        if (!query || typeof query !== 'string') {
            return res.status(400).json({ success: false, message: 'Valid query is required' });
        }

        // ⚡ PERFORMANCE: Limit fields and items fetched
        // 🧠 UPGRADE: Fetch real book data for prompt context
        const availableBooks = await Book.find().select('title author category').limit(20).lean();
        
        let catalogContext = 'No books available at the moment.';
        if (availableBooks.length > 0) {
            catalogContext = availableBooks.map(b => `- ${b.title} by ${b.author} (${b.category})`).join('\n');
        }

        // 🧠 UPGRADE: Strict instruction to only use catalog and format properly
        const prompt = `You are a helpful and knowledgeable book assistant for an online bookstore.
User asks: "${query}"

Available Books Catalog:
${catalogContext}

Instructions:
1. Answer concisely and in a friendly tone.
2. If the user asks for recommendations, ONLY recommend books strictly from the provided catalog.
3. If no books in the catalog match the user's request, politely inform them and suggest the closest available option.
4. Format your text nicely.`;

        const response = await generateContentWithTimeout(prompt);

        // 📦 STANDARDIZATION: Unified response format
        res.json({ success: true, data: { answer: response.text } });
    } catch (error) {
        console.error('Gemini Chat Error:', error);
        const msg = error.message === 'AI Request Timeout' ? 'AI request timed out' : 'Error in AI Chat';
        res.status(500).json({ success: false, message: msg });
    }
};

// @desc    Generate book summary
// @route   POST /api/ai/summarize
// @access  Public
export const generateSummary = async (req, res) => {
    try {
        const { bookId } = req.body;
        
        // 🛡️ SAFETY: Input validation
        if (!bookId) {
            return res.status(400).json({ success: false, message: 'Book ID is required' });
        }

        // ⚡ PERFORMANCE: Fetch only needed fields
        const book = await Book.findById(bookId).select('title author description');
        if (!book) {
            return res.status(404).json({ success: false, message: 'Book not found' });
        }

        // 🧠 UPGRADE: Inject full description and request strict format
        const prompt = `Title: "${book.title}"
Author: "${book.author}"
Description: "${book.description || 'No description available.'}"

Task: Provide an engaging summary of this book.
Format your response EXACTLY as follows:
1. A short paragraph summary (max 3-4 sentences).
2. Followed by a list of 3 bullet key points.`;

        const response = await generateContentWithTimeout(prompt);

        // 📦 STANDARDIZATION: Unified response format
        res.json({ success: true, data: { summary: response.text } });
    } catch (error) {
        console.error('Gemini Summary Error:', error);
        const msg = error.message === 'AI Request Timeout' ? 'AI request timed out' : 'Error generating summary';
        res.status(500).json({ success: false, message: msg });
    }
};

// @desc    Get AI recommendations
// @route   POST /api/ai/recommendations
// @access  Private
export const getRecommendations = async (req, res) => {
    try {
        const { interests } = req.body;
        
        // 🛡️ SAFETY: Input validation
        if (!interests) {
            return res.status(400).json({ success: false, message: 'Interests are required' });
        }

        // ⚡ PERFORMANCE: Limit to 50 books to keep payload small
        const allBooks = await Book.find().select('title author category').limit(50).lean();
        if (allBooks.length === 0) {
             return res.json({ success: true, data: [] });
        }

        const catalogText = allBooks.map(b => `${b.title} by ${b.author} (Category: ${b.category})`).join('\n');

        // 🧠 UPGRADE: Return structured JSON strictly from DB
        const prompt = `User interests: "${interests}"

Catalog:
${catalogText}

Task: Pick up to 3 best matching books STRICTLY from the catalog provided above.
Respond ONLY with a valid JSON array of objects. Do not include markdown blocks, text, or explanations outside the JSON.
Format EXACTLY like this:
[
  { "title": "Exact Book Title", "reason": "Short 1-sentence reason for recommendation" }
]`;

        const response = await generateContentWithTimeout(prompt);
        let recommendations = [];
        
        // 🛡️ SAFETY: Safe JSON parsing with fallback
        try {
            recommendations = JSON.parse(extractJson(response.text));
        } catch (e) {
            console.error('Failed to parse Gemini recommendations:', response.text);
            recommendations = [];
        }

        // 📦 STANDARDIZATION: Unified response format
        res.json({ success: true, data: recommendations });
    } catch (error) {
        console.error('Gemini Recs Error:', error);
        const msg = error.message === 'AI Request Timeout' ? 'AI request timed out' : 'Error fetching recommendations';
        res.status(500).json({ success: false, message: msg });
    }
};

// @desc    Semantic search via Gemini
// @route   POST /api/ai/semantic-search
// @access  Public
export const semanticSearch = async (req, res) => {
    try {
        const { query } = req.body;
        
        // 🛡️ SAFETY: Input validation
        if (!query || typeof query !== 'string') {
             return res.status(400).json({ success: false, message: 'Valid query is required' });
        }

        // ⚡ PERFORMANCE: Fetch limited fields and cap catalog size
        const allBooks = await Book.find().select('_id title author category description').limit(50).lean();
        
        if (allBooks.length === 0) {
            return res.json({ success: true, data: { results: [] } });
        }

        const catalogJson = JSON.stringify(allBooks.map(b => ({ id: b._id, title: b.title, desc: b.description })));

        // 🧠 UPGRADE: Improve prompt clarity for robust JSON output
        const prompt = `You are a semantic search engine matching a user's natural language query to a catalog.
User Query: "${query}"

Catalog: ${catalogJson}

Task: Find the best matching books based on the query.
Respond ONLY with a valid JSON array of strings containing the 'id' of the matched books, ranked by relevance.
Ensure the output is JUST a JSON array like ["id1", "id2"]. No markdown, no explanations.`;

        const response = await generateContentWithTimeout(prompt);

        let idArray = [];
        
        // 🛡️ SAFETY: Safe parsing with fallback
        try {
            idArray = JSON.parse(extractJson(response.text));
            if (!Array.isArray(idArray)) idArray = [];
        } catch (e) {
            console.error('Failed to parse Gemini array response:', response.text);
            idArray = [];
        }

        let matchedBooks = [];
        if (idArray.length > 0) {
            // Retrieve full documents for matched IDs, excluding heavy embeddings
            matchedBooks = await Book.find({ _id: { $in: idArray } }).select('-embedding');
            // Maintain AI ranking order
            matchedBooks.sort((a,b) => idArray.indexOf(a._id.toString()) - idArray.indexOf(b._id.toString()));
        }

        // 📦 STANDARDIZATION: Unified response format
        res.json({ success: true, data: { results: matchedBooks } });
    } catch (error) {
        console.error('Gemini Search Error:', error);
        const msg = error.message === 'AI Request Timeout' ? 'AI request timed out' : 'Semantic search failed';
        res.status(500).json({ success: false, message: msg });
    }
};
