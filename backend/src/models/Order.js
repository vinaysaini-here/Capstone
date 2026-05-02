import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            ref: 'User',
        },
        orderItems: [
            {
                title: { type: String, required: true },
                qty: { type: Number, required: true },
                image: { type: String },
                imageUrl: { type: String },
                price: { type: Number, required: true },
                book: {
                    type: mongoose.Schema.Types.ObjectId,
                    required: true,
                    ref: 'Book',
                },
            },
        ],
        paymentMethod: {
            type: String,
            required: true,
            default: 'Razorpay',
        },
        paymentResult: {
            id: { type: String },
            status: { type: String },
            update_time: { type: String },
            email_address: { type: String },
            signature: { type: String },
        },
        razorpayOrderId: {
            type: String,
            index: true,
        },
        address: {
            fullName: { type: String, required: true },
            phone: { type: String, required: true },
            address: { type: String, required: true },
            city: { type: String, required: true },
            state: { type: String, required: true },
            pincode: { type: String, required: true },
        },
        totalPrice: {
            type: Number,
            required: true,
            default: 0.0,
        },
        isPaid: {
            type: Boolean,
            required: true,
            default: false,
        },
        paidAt: {
            type: Date,
        },
        paymentStatus: {
            type: String,
            enum: ['Pending', 'Paid', 'Failed'],
            default: 'Pending',
        },
        orderStatus: {
            type: String,
            enum: ['Placed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'],
            default: 'Placed',
        },
        isDelivered: {
            type: Boolean,
            required: true,
            default: false,
        },
        deliveredAt: {
            type: Date,
        },
    },
    { timestamps: true }
);

const Order = mongoose.model('Order', orderSchema);
export default Order;
