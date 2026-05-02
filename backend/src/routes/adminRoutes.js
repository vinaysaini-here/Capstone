import express from 'express';
import {
    getDashboardStats,
    getAllOrders,
    updateOrderStatus,
    getAllUsers,
    updateUserRole,
    deleteUser,
    getReports
} from '../controllers/admin.controller.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Apply protect and admin middleware to all routes in this file
router.use(protect);
router.use(admin);

// Dashboard
router.route('/stats').get(getDashboardStats);

// Orders
router.route('/orders').get(getAllOrders);
router.route('/order/:id/status').put(updateOrderStatus);

// Users
router.route('/users').get(getAllUsers);
router.route('/user/:id/role').put(updateUserRole);
router.route('/user/:id').delete(deleteUser);

// Reports
router.route('/reports').get(getReports);

export default router;
