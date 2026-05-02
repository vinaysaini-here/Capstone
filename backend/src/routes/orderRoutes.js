import express from 'express';
import {
    addOrderItems,
    downloadInvoice,
    getSavedAddress,
    verifyPayment,
    getOrderById,
    getMyOrders,
    saveAddress,
} from '../controllers/order.controller.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.route('/checkout').post(protect, addOrderItems);
router.route('/verify').post(protect, verifyPayment);
router.route('/address').get(protect, getSavedAddress).put(protect, saveAddress);
router.route('/myorders').get(protect, getMyOrders);
router.route('/:id/invoice').get(protect, downloadInvoice);
router.route('/:id').get(protect, getOrderById);

export default router;
