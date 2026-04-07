import express from 'express';
import {
    addOrderItems,
    verifyPayment,
    getOrderById,
    getMyOrders,
} from '../controllers/order.controller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/checkout').post(protect, addOrderItems);
router.route('/verify').post(protect, verifyPayment);
router.route('/myorders').get(protect, getMyOrders);
router.route('/:id').get(protect, getOrderById);

export default router;
