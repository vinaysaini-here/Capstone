import asyncHandler from 'express-async-handler';
import Order from '../models/Order.js';
import Razorpay from 'razorpay';
import crypto from 'crypto';

// Initialize Razorpay instance
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || 'test_key_id',
    key_secret: process.env.RAZORPAY_KEY_SECRET || 'test_key_secret',
});

// @desc    Create new order and return razorpay order details
// @route   POST /api/orders/checkout
// @access  Private
export const addOrderItems = asyncHandler(async (req, res) => {
    const { orderItems, paymentMethod, totalPrice } = req.body;

    if (orderItems && orderItems.length === 0) {
        res.status(400);
        throw new Error('No order items');
    }

    // 1. Create order in MongoDB
    const order = new Order({
        orderItems,
        user: req.user._id,
        paymentMethod,
        totalPrice,
    });

    const createdOrder = await order.save();

    // 2. Create Razorpay order
    const options = {
        amount: Math.round(totalPrice * 100), // amount in the smallest currency unit (paise)
        currency: 'INR',
        receipt: createdOrder._id.toString(),
    };

    try {
        const rzOrder = await razorpay.orders.create(options);
        res.status(201).json({
            order: createdOrder,
            razorpayOrderId: rzOrder.id,
            amount: rzOrder.amount,
        });
    } catch (error) {
        res.status(500);
        throw new Error('Error creating Razorpay order');
    }
});

// @desc    Verify Razorpay payment
// @route   POST /api/orders/verify
// @access  Private
export const verifyPayment = asyncHandler(async (req, res) => {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id } = req.body;

    const body = razorpay_order_id + '|' + razorpay_payment_id;

    const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');

    if (expectedSignature === razorpay_signature) {
        // Payment is legit
        const order = await Order.findById(order_id);

        if (order) {
            order.isPaid = true;
            order.paidAt = Date.now();
            order.paymentResult = {
                id: razorpay_payment_id,
                status: 'paid',
                update_time: new Date().toISOString(),
                // In actual deployment we might get user email from Razorpay webhook, ignoring here
            };

            const updatedOrder = await order.save();
            res.json({ message: 'Payment verified', order: updatedOrder });
        } else {
            res.status(404);
            throw new Error('Order not found');
        }
    } else {
        res.status(400);
        throw new Error('Invalid signature');
    }
});

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
export const getOrderById = asyncHandler(async (req, res) => {
    const order = await Order.findById(req.params.id).populate('user', 'name email');

    if (order) {
        res.json(order);
    } else {
        res.status(404);
        throw new Error('Order not found');
    }
});

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
export const getMyOrders = asyncHandler(async (req, res) => {
    const orders = await Order.find({ user: req.user._id });
    res.json(orders);
});
