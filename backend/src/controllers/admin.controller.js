import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import User from '../models/User.js';
import Book from '../models/Book.js';

// @desc    Get dashboard statistics
// @route   GET /api/admin/stats
// @access  Private/Admin
export const getDashboardStats = asyncHandler(async (req, res) => {
    const totalUsers = await User.countDocuments();
    const totalBooks = await Book.countDocuments();
    const totalOrders = await Order.countDocuments();

    // Calculate total sales
    const orders = await Order.find({ isPaid: true });
    const totalSales = orders.reduce((acc, order) => acc + order.totalPrice, 0);

    // Recent orders
    const recentOrders = await Order.find()
        .populate('user', 'name email')
        .sort({ createdAt: -1 })
        .limit(5);

    // Sales by month (for chart)
    const salesByMonth = await Order.aggregate([
        { $match: { isPaid: true } },
        {
            $group: {
                _id: { $month: "$createdAt" },
                totalRevenue: { $sum: "$totalPrice" },
            }
        },
        { $sort: { "_id": 1 } }
    ]);

    // Map month numbers to names
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const formattedSales = salesByMonth.map(item => ({
        month: monthNames[item._id - 1],
        revenue: item.totalRevenue
    }));

    res.json({
        totalUsers,
        totalBooks,
        totalOrders,
        totalSales,
        recentOrders,
        salesData: formattedSales
    });
});

// @desc    Get all orders
// @route   GET /api/admin/orders
// @access  Private/Admin
export const getAllOrders = asyncHandler(async (req, res) => {
    const { status, startDate, endDate } = req.query;
    const query = {};

    if (status && status !== 'All') {
        if (status === 'Paid') query.isPaid = true;
        if (status === 'Pending') query.isPaid = false;
        if (status === 'Delivered') query.isDelivered = true;
        if (status === 'Processing') query.orderStatus = 'Processing';
        if (status === 'Cancelled') query.orderStatus = 'Cancelled';
    }

    if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) query.createdAt.$gte = new Date(startDate);
        if (endDate) {
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }
    }

    const orders = await Order.find(query)
        .populate('user', 'name email')
        .sort({ createdAt: -1 });
    res.json(orders);
});

// @desc    Update order status
// @route   PUT /api/admin/order/:id/status
// @access  Private/Admin
export const updateOrderStatus = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id);

    if (order) {
        order.isDelivered = req.body.isDelivered ?? order.isDelivered;
        order.isPaid = req.body.isPaid ?? order.isPaid;
        order.orderStatus = req.body.orderStatus ?? order.orderStatus;
        order.paymentStatus = req.body.paymentStatus ?? order.paymentStatus;
        
        if (req.body.isDelivered) {
            order.deliveredAt = Date.now();
            order.orderStatus = 'Delivered';
        }
        
        if (req.body.isPaid && !order.paidAt) {
            order.paidAt = Date.now();
            order.paymentStatus = 'Paid';
        }

        const updatedOrder = await order.save();
        res.json(updatedOrder);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
export const getAllUsers = asyncHandler(async (req, res) => {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
});

// @desc    Update user role (toggle admin)
// @route   PUT /api/admin/user/:id/role
// @access  Private/Admin
export const updateUserRole = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (user) {
        user.role = user.role === 'admin' ? 'user' : 'admin';
        const updatedUser = await user.save();
        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            role: updatedUser.role,
        });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Delete a user
// @route   DELETE /api/admin/user/:id
// @access  Private/Admin
export const deleteUser = asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);

    if (user) {
        if (user.role === 'admin') {
            res.status(400);
            throw new Error('Cannot delete an admin user');
        }
        await User.deleteOne({ _id: user._id });
        res.json({ message: 'User removed' });
    } else {
        res.status(404);
        throw new Error('User not found');
    }
});

// @desc    Get reports data
// @route   GET /api/admin/reports
// @access  Private/Admin
export const getReports = asyncHandler(async (req, res) => {
    // Top selling books
    const topBooks = await Order.aggregate([
        { $unwind: "$orderItems" },
        {
            $group: {
                _id: "$orderItems.book",
                title: { $first: "$orderItems.title" },
                totalSold: { $sum: "$orderItems.qty" },
                revenue: { $sum: { $multiply: ["$orderItems.price", "$orderItems.qty"] } }
            }
        },
        { $sort: { totalSold: -1 } },
        { $limit: 10 }
    ]);

    // Daily orders for the last 7 days
    const dailyOrders = await Order.aggregate([
        {
            $match: {
                createdAt: { $gte: new Date(new Date().setDate(new Date().getDate() - 7)) }
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                orders: { $sum: 1 },
                revenue: { $sum: "$totalPrice" }
            }
        },
        { $sort: { "_id": 1 } }
    ]);

    res.json({
        topBooks,
        dailyOrders
    });
});
