import express from 'express';
import {
    addItemToCart,
    clearCart,
    getCart,
    removeCartItem,
    updateCartItem,
} from '../controllers/cart.controller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.route('/').get(getCart).post(addItemToCart).delete(clearCart);
router.route('/:bookId').put(updateCartItem).delete(removeCartItem);

export default router;
