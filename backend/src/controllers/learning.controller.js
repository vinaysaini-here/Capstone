import asyncHandler from 'express-async-handler';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { PDFParse } from 'pdf-parse';
import { GoogleGenAI } from '@google/genai';
import Book from '../models/Book.js';
import Order from '../models/Order.js';
import Quiz from '../models/Quiz.js';
import Attempt from '../models/Attempt.js';
import Analytics from '../models/Analytics.js';

const textModel = 'gemini-2.5-flash';
const QUIZ_GENERATION_LIMIT_PER_DAY = 5;
const MAX_SOURCE_LENGTH = 12000;
const QUIZ_PROMPT_VERSION = 'smart-learning-v1';
let aiClient;

const quizSystemPrompt = `You are an intelligent educational AI.
Generate 15 high-quality multiple choice questions from the study material provided.

Rules:
1. Each question must test understanding, not just memorization.
2. Provide exactly 4 options for each question.
3. Clearly include the correct answer as the full option text.
4. Provide a very short explanation in simple student-friendly language, maximum 2 lines.
5. Return ONLY valid JSON in this exact structure:
[
  {
    "question": "Question text",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_answer": "Exact correct option text",
    "explanation": "Short explanation"
  }
]
6. Do not include markdown fences, headings, or extra text.
7. Avoid duplicate questions.`;

const explanationPrompt = ({ question, correctAnswer }) => `You are a friendly teacher.
Explain this answer in 2 to 3 short lines using simple language.

Question: ${question}
Correct Answer: ${correctAnswer}

Return only the explanation text.`;

const extractJson = (text) => text.replace(/```json/gi, '').replace(/```/g, '').trim();

const getAiClient = () => {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is not configured');
    }

    if (!aiClient) {
        aiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    }

    return aiClient;
};

const generateContentWithTimeout = async (prompt, timeoutMs = 200000) => {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('AI Request Timeout')), timeoutMs);
    });

    try {
        const result = await Promise.race([
            getAiClient().models.generateContent({ model: textModel, contents: prompt }),
            timeoutPromise,
        ]);
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
};

const getPurchasedNotes = async (userId) => {
    const orders = await Order.find({ user: userId, isPaid: true })
        .populate('orderItems.book', 'title author category description fileUrl imageUrl')
        .sort({ createdAt: -1 });

    const notesMap = new Map();

    for (const order of orders) {
        for (const item of order.orderItems) {
            const note = item.book;
            if (!note) continue;

            if (!notesMap.has(note._id.toString())) {
                notesMap.set(note._id.toString(), {
                    _id: note._id,
                    title: note.title,
                    subject: note.category || 'General',
                    author: note.author,
                    description: note.description,
                    fileUrl: note.fileUrl,
                    imageUrl: note.imageUrl,
                    purchasedAt: order.createdAt,
                });
            }
        }
    }

    return Array.from(notesMap.values());
};

const getPurchasedNoteById = async (userId, noteId) => {
    const notes = await getPurchasedNotes(userId);
    return notes.find((note) => note._id.toString() === noteId);
};

const readBookContent = async (book) => {
    const chunks = [];

    if (book.description) {
        chunks.push(book.description);
    }

    if (book.fileUrl) {
        try {
            const localPath = path.join(process.cwd(), book.fileUrl.replace(/^\//, ''));
            const buffer = await fs.readFile(localPath);
            const parser = new PDFParse({ data: buffer });
            const parsed = await parser.getText();
            await parser.destroy();
            if (parsed.text) chunks.push(parsed.text);
        } catch (error) {
            console.error('PDF extraction failed:', error.message);
        }
    }

    const rawContent = chunks.join('\n\n').replace(/\s+/g, ' ').trim();

    if (!rawContent) {
        throw new Error('No study material found for this note');
    }

    return rawContent.slice(0, MAX_SOURCE_LENGTH);
};

const hashContent = (content) =>
    crypto.createHash('sha256').update(content).digest('hex');

const sanitizeQuestions = (questions) => {
    if (!Array.isArray(questions)) return [];

    return questions
        .map((item) => ({
            question: item.question?.trim(),
            options: Array.isArray(item.options) ? item.options.map((option) => String(option).trim()) : [],
            correctAnswer: item.correct_answer?.trim() || item.correctAnswer?.trim(),
            explanation: item.explanation?.trim(),
        }))
        .filter(
            (item) =>
                item.question &&
                item.options.length === 4 &&
                item.correctAnswer &&
                item.explanation &&
                item.options.includes(item.correctAnswer)
        )
        .slice(0, 15);
};

const rebuildAnalytics = async (userId) => {
    const attempts = await Attempt.find({ user: userId }).sort({ createdAt: -1 });

    if (attempts.length === 0) {
        await Analytics.findOneAndUpdate(
            { user: userId },
            {
                totalQuizzesAttempted: 0,
                averageScore: 0,
                strongTopics: [],
                weakTopics: [],
                topicBreakdown: [],
                performanceHistory: [],
            },
            { upsert: true, new: true }
        );
        return;
    }

    const totalQuizzesAttempted = attempts.length;
    const averageScore = Number(
        (attempts.reduce((sum, attempt) => sum + attempt.accuracy, 0) / totalQuizzesAttempted).toFixed(2)
    );

    const topicMap = new Map();
    for (const attempt of attempts) {
        const current = topicMap.get(attempt.subject) || { topic: attempt.subject, attempts: 0, totalAccuracy: 0 };
        current.attempts += 1;
        current.totalAccuracy += attempt.accuracy;
        topicMap.set(attempt.subject, current);
    }

    const topicBreakdown = Array.from(topicMap.values())
        .map((topic) => ({
            topic: topic.topic,
            attempts: topic.attempts,
            averageAccuracy: Number((topic.totalAccuracy / topic.attempts).toFixed(2)),
        }))
        .sort((a, b) => b.averageAccuracy - a.averageAccuracy);

    const strongTopics = topicBreakdown.filter((topic) => topic.averageAccuracy >= 70).slice(0, 3);
    const weakTopics = [...topicBreakdown]
        .filter((topic) => topic.averageAccuracy < 70)
        .sort((a, b) => a.averageAccuracy - b.averageAccuracy)
        .slice(0, 3);

    const performanceHistory = attempts.slice(0, 10).reverse().map((attempt) => ({
        attempt: attempt._id,
        quiz: attempt.quiz,
        note: attempt.note,
        score: attempt.accuracy,
        subject: attempt.subject,
        attemptedAt: attempt.createdAt,
    }));

    await Analytics.findOneAndUpdate(
        { user: userId },
        {
            totalQuizzesAttempted,
            averageScore,
            strongTopics,
            weakTopics,
            topicBreakdown,
            performanceHistory,
        },
        { upsert: true, new: true }
    );
};

export const getLearningContent = asyncHandler(async (req, res) => {
    const notes = await getPurchasedNotes(req.user._id);
    res.json({ success: true, data: notes });
});

export const getGeneratedQuizzes = asyncHandler(async (req, res) => {
    const quizzes = await Quiz.find({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    const attempts = await Attempt.find({ user: req.user._id }).select('quiz accuracy createdAt').lean();

    const attemptsByQuiz = attempts.reduce((acc, attempt) => {
        const key = attempt.quiz.toString();
        if (!acc[key]) acc[key] = [];
        acc[key].push(attempt);
        return acc;
    }, {});

    const payload = quizzes.map((quiz) => ({
        ...quiz,
        questionCount: quiz.questions.length,
        attemptsCount: attemptsByQuiz[quiz._id.toString()]?.length || 0,
        latestScore: attemptsByQuiz[quiz._id.toString()]?.[0]?.accuracy || null,
    }));

    res.json({ success: true, data: payload });
});

export const generateQuiz = asyncHandler(async (req, res) => {
    const { noteId } = req.body;

    if (!noteId) {
        res.status(400);
        throw new Error('Note id is required');
    }

    const purchasedNote = await getPurchasedNoteById(req.user._id, noteId);
    if (!purchasedNote) {
        res.status(403);
        throw new Error('You can only generate quizzes from purchased notes');
    }

    const content = await readBookContent(purchasedNote);
    const sourceHash = hashContent(content);

    const cachedQuiz = await Quiz.findOne({
        user: req.user._id,
        note: noteId,
        sourceHash,
    }).sort({ createdAt: -1 });

    if (cachedQuiz) {
        res.json({ success: true, cached: true, data: cachedQuiz });
        return;
    }

    const generatedToday = await Quiz.countDocuments({
        user: req.user._id,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    });

    if (generatedToday >= QUIZ_GENERATION_LIMIT_PER_DAY) {
        res.status(429);
        throw new Error('Daily quiz generation limit reached. Please try again tomorrow.');
    }

    const prompt = `${quizSystemPrompt}

Subject: ${purchasedNote.subject}
Title: ${purchasedNote.title}

Study Material:
${content}`;

    const response = await generateContentWithTimeout(prompt);
    let parsedQuestions = [];

    try {
        parsedQuestions = JSON.parse(extractJson(response.text));
    } catch (error) {
        console.error('Failed to parse generated quiz JSON:', response.text);
        res.status(500);
        throw new Error('AI returned an invalid quiz format');
    }

    const questions = sanitizeQuestions(parsedQuestions);
    if (questions.length < 10) {
        res.status(500);
        throw new Error('AI generated too few valid questions');
    }

    const quiz = await Quiz.create({
        user: req.user._id,
        note: purchasedNote._id,
        title: purchasedNote.title,
        subject: purchasedNote.subject,
        questions,
        sourceExcerpt: content,
        sourceHash,
        promptVersion: QUIZ_PROMPT_VERSION,
    });

    await Analytics.findOneAndUpdate(
        { user: req.user._id },
        { lastQuizGeneratedAt: new Date() },
        { upsert: true, new: true }
    );

    res.status(201).json({ success: true, cached: false, data: quiz });
});

export const submitQuiz = asyncHandler(async (req, res) => {
    const { quizId, answers = {}, durationSeconds = 0 } = req.body;

    if (!quizId) {
        res.status(400);
        throw new Error('Quiz id is required');
    }

    const quiz = await Quiz.findOne({ _id: quizId, user: req.user._id });
    if (!quiz) {
        res.status(404);
        throw new Error('Quiz not found');
    }

    const normalizedAnswers = quiz.questions.map((question, index) => {
        const selectedAnswer = typeof answers[index] === 'string' ? answers[index] : '';
        return {
            questionIndex: index,
            question: question.question,
            selectedAnswer,
            correctAnswer: question.correctAnswer,
            explanation: question.explanation,
            isCorrect: selectedAnswer === question.correctAnswer,
        };
    });

    const correctAnswers = normalizedAnswers.filter((answer) => answer.isCorrect).length;
    const totalQuestions = quiz.questions.length;
    const wrongAnswers = totalQuestions - correctAnswers;
    const accuracy = Number(((correctAnswers / totalQuestions) * 100).toFixed(2));

    const attempt = await Attempt.create({
        user: req.user._id,
        quiz: quiz._id,
        note: quiz.note,
        title: quiz.title,
        subject: quiz.subject,
        answers: normalizedAnswers,
        totalQuestions,
        correctAnswers,
        wrongAnswers,
        accuracy,
        durationSeconds,
    });

    await rebuildAnalytics(req.user._id);

    res.status(201).json({ success: true, data: attempt });
});

export const getResults = asyncHandler(async (req, res) => {
    const attempts = await Attempt.find({ user: req.user._id })
        .sort({ createdAt: -1 })
        .populate('quiz', 'title subject')
        .lean();

    res.json({ success: true, data: attempts });
});

export const getAnalytics = asyncHandler(async (req, res) => {
    let analytics = await Analytics.findOne({ user: req.user._id }).lean();

    if (!analytics) {
        await rebuildAnalytics(req.user._id);
        analytics = await Analytics.findOne({ user: req.user._id }).lean();
    }

    res.json({
        success: true,
        data: analytics || {
            totalQuizzesAttempted: 0,
            averageScore: 0,
            strongTopics: [],
            weakTopics: [],
            topicBreakdown: [],
            performanceHistory: [],
        },
    });
});

export const askAiExplanation = asyncHandler(async (req, res) => {
    const { question, correctAnswer } = req.body;

    if (!question || !correctAnswer) {
        res.status(400);
        throw new Error('Question and correct answer are required');
    }

    const response = await generateContentWithTimeout(explanationPrompt({ question, correctAnswer }), 12000);
    res.json({ success: true, data: { explanation: response.text.trim() } });
});

export const getQuizPromptTemplate = asyncHandler(async (req, res) => {
    res.json({
        success: true,
        data: {
            version: QUIZ_PROMPT_VERSION,
            prompt: quizSystemPrompt,
        },
    });
});
