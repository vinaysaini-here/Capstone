import express from 'express';
import {
    chatAssistant,
    generateSummary,
    getRecommendations,
    semanticSearch
} from '../controllers/ai.controller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/chat', chatAssistant);
router.post('/summarize', generateSummary);
router.post('/recommendations', getRecommendations);
router.post('/semantic-search', semanticSearch);

export default router;
