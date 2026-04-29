import express from 'express';
import {
    getBooks,
    getBookById,
    createBook,
    updateBook,
    deleteBook,
} from '../controllers/book.controller.js';
import { protect, admin } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/uploadMiddleware.js';

const router = express.Router();

router.route('/').get(getBooks).post(protect, admin, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'document', maxCount: 1 }]), createBook);
router
    .route('/:id')
    .get(getBookById)
    .put(protect, admin, upload.fields([{ name: 'image', maxCount: 1 }, { name: 'document', maxCount: 1 }]), updateBook)
    .delete(protect, admin, deleteBook);

export default router;
