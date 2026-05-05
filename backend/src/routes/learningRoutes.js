import express from 'express';
import {
    askAiExplanation,
    generateQuiz,
    getAnalytics,
    getGeneratedQuizzes,
    getLearningContent,
    getQuizPromptTemplate,
    getResults,
    submitQuiz,
} from '../controllers/learning.controller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/learning-content', getLearningContent);
router.get('/generated-quizzes', getGeneratedQuizzes);
router.post('/generate-quiz', generateQuiz);
router.post('/submit-quiz', submitQuiz);
router.get('/results', getResults);
router.get('/analytics', getAnalytics);
router.post('/ask-ai', askAiExplanation);
router.get('/quiz-prompt', getQuizPromptTemplate);

export default router;
