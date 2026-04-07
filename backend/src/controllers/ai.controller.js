import { GoogleGenAI } from '@google/genai';
import Book from '../models/Book.js';

// Initialize Gemini SDK with API Key
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const textModel = 'gemini-2.5-flash';

// @desc    Chat with Book Assistant
// @route   POST /api/ai/chat
// @access  Public
export const chatAssistant = async (req, res) => {
    try {
        const { query } = req.body;
        
        // Context injection 
        const prompt = `You are a helpful and knowledgeable book assistant for an online bookstore. 
User asks: "${query}"
Answer concisely, in a friendly tone, and recommend generic highly-rated books if asked without specific constraints. Format your text nicely.`;

        const response = await ai.models.generateContent({
            model: textModel,
            contents: prompt,
        });

        res.json({ answer: response.text });
    } catch (error) {
        console.error('Gemini Chat Error:', error);
        res.status(500).json({ message: 'Error in AI Chat' });
    }
};

// @desc    Generate book summary
// @route   POST /api/ai/summarize
// @access  Public
export const generateSummary = async (req, res) => {
    try {
        const { bookId } = req.body;
        const book = await Book.findById(bookId);

        if (!book) {
            return res.status(404).json({ message: 'Book not found' });
        }

        const prompt = `Provide a concise and engaging summary for the book titled "${book.title}" by "${book.author}". Also extract 3-5 key points. Format the response nicely.`;

        const response = await ai.models.generateContent({
            model: textModel,
            contents: prompt,
        });

        res.json({ summary: response.text });
    } catch (error) {
        console.error('Gemini Summary Error:', error);
        res.status(500).json({ message: 'Error generating summary' });
    }
};

// @desc    Get AI recommendations
// @route   POST /api/ai/recommendations
// @access  Private
export const getRecommendations = async (req, res) => {
    try {
        // Ideally we would fetch user purchase history/preferences
        // Here we simulate by just taking an interest string or last category
        const { interests } = req.body; // Array of strings or just text

        // Fetch local books to recommend from (in real app, vector search is better)
        const allBooks = await Book.find().select('title author category');
        const catalogText = allBooks.map(b => `${b.title} by ${b.author} (Category: ${b.category})`).join(', ');

        const prompt = `Given the user interests: "${interests}". 
Pick top 3 best matching books strictly from this catalog: [${catalogText}].
Explain briefly why for each.`;

        const response = await ai.models.generateContent({
             model: textModel,
             contents: prompt,
        });

        res.json({ recommendations: response.text });
    } catch (error) {
         console.error('Gemini Recs Error:', error);
         res.status(500).json({ message: 'Error fetching recommendations' });
    }
};

// @desc    Semantic search via Gemini
// @route   POST /api/ai/semantic-search
// @access  Public
export const semanticSearch = async (req, res) => {
     try {
         const { query } = req.body;
         const allBooks = await Book.find().select('title author category description price image');
         
         // We can use Gemini to filter local JSON catalog semantically
         const catalogJson = JSON.stringify(allBooks);
         const prompt = `You are a semantic search engine matching a user's natural language query to a JSON catalog of books.
User Query: "${query}"

Catalog: ${catalogJson}

Respond ONLY with a valid JSON array containing the _id of the books that best match the query, ranked by relevance. Ensure the output is JUST JSON array of strings, e.g. ["id1", "id2"], with no markdown parsing or comments.`;

         const response = await ai.models.generateContent({
              model: textModel,
              contents: prompt,
         });

         let idArray = [];
         try {
             // Gemini might return ```json ... ```, so clean it
             let rawText = response.text.replace(/```json/g, '').replace(/```/g, '').trim();
             idArray = JSON.parse(rawText);
         } catch(e) {
             console.log('Failed to parse Gemini array response', response.text);
         }

         if(!Array.isArray(idArray)) {
             idArray = [];
         }

         const matchedBooks = await Book.find({ _id: { $in: idArray } });
         // To maintain order returned by Gemini:
         matchedBooks.sort((a,b) => idArray.indexOf(a._id.toString()) - idArray.indexOf(b._id.toString()));

         res.json({ results: matchedBooks });
     } catch (error) {
         console.error('Gemini Search Error:', error);
         res.status(500).json({ message: 'Semantic search failed' });
     }
};
