import express from 'express';
import {
    registerUser,
    authUser,
    getUserProfile,
} from '../controllers/auth.controller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/register', registerUser);
router.post('/login', authUser);
router.route('/me').get(protect, getUserProfile);

export default router;
