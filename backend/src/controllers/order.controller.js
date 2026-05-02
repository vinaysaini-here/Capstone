import asyncHandler from "express-async-handler";
import dotenv from "dotenv";
dotenv.config();
import Order from "../models/Order.js";
import Cart from "../models/Cart.js";
import User from "../models/User.js";
import Razorpay from "razorpay";
import crypto from "crypto";
import PDFDocument from "pdfkit";

let razorpay;

const getRazorpay = () => {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    throw new Error("Razorpay keys missing in .env file");
  }

  if (!razorpay) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  return razorpay;
};

const hasCompleteAddress = (address) =>
  Boolean(
    address?.fullName &&
      address?.phone &&
      address?.address &&
      address?.city &&
      address?.state &&
      address?.pincode
  );

const getPopulatedCart = (userId) =>
  Cart.findOne({ user: userId }).populate("items.book", "title author imageUrl price stock");

const calculateCartTotal = (cart) =>
  (cart?.items || []).reduce((total, item) => total + item.price * item.quantity, 0);

const buildOrderItems = (cart) =>
  cart.items.map((item) => ({
    title: item.book.title,
    qty: item.quantity,
    image: item.book.imageUrl,
    imageUrl: item.book.imageUrl,
    price: item.price,
    book: item.book._id,
  }));

export const getSavedAddress = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("address name");

  res.json({
    hasAddress: hasCompleteAddress(user.address),
    address: user.address || null,
  });
});

export const saveAddress = asyncHandler(async (req, res) => {
  const { fullName, phone, address, city, state, pincode } = req.body;

  if (!fullName || !phone || !address || !city || !state || !pincode) {
    res.status(400);
    throw new Error("All address fields are required");
  }

  const savedAddress = { fullName, phone, address, city, state, pincode };
  await User.findByIdAndUpdate(req.user._id, { address: savedAddress }, { runValidators: true });

  res.json({
    hasAddress: true,
    address: savedAddress,
  });
});

// @desc    Create Razorpay order from the logged-in user's cart
// @route   POST /api/orders/checkout
// @access  Private
export const addOrderItems = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id).select("address");

  if (!hasCompleteAddress(user.address)) {
    res.status(400);
    throw new Error("Please save your delivery address before checkout");
  }

  const cart = await getPopulatedCart(req.user._id);

  if (!cart || cart.items.length === 0) {
    res.status(400);
    throw new Error("Cart is empty");
  }

  const totalPrice = calculateCartTotal(cart);

  if (!totalPrice || totalPrice <= 0) {
    res.status(400);
    throw new Error("Invalid cart total");
  }

  const rzOrder = await getRazorpay().orders.create({
    amount: Math.round(totalPrice * 100),
    currency: "INR",
    receipt: `cart_${req.user._id}_${Date.now()}`,
    notes: {
      userId: req.user._id.toString(),
    },
  });

  res.status(201).json({
    razorpayOrderId: rzOrder.id,
    amount: rzOrder.amount,
    currency: rzOrder.currency,
    totalPrice,
  });
});

// @desc    Verify Razorpay payment and create paid order
// @route   POST /api/orders/verify
// @access  Private
export const verifyPayment = asyncHandler(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    res.status(400);
    throw new Error("Missing payment details");
  }

  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSignature !== razorpay_signature) {
    res.status(400);
    throw new Error("Invalid signature");
  }

  const existingOrder = await Order.findOne({ razorpayOrderId: razorpay_order_id });
  if (existingOrder) {
    res.json({
      message: "Payment already verified",
      order: existingOrder,
    });
    return;
  }

  const user = await User.findById(req.user._id).select("address");

  if (!hasCompleteAddress(user.address)) {
    res.status(400);
    throw new Error("Delivery address missing");
  }

  const cart = await getPopulatedCart(req.user._id);

  if (!cart || cart.items.length === 0) {
    res.status(400);
    throw new Error("Cart is empty");
  }

  const order = await Order.create({
    user: req.user._id,
    orderItems: buildOrderItems(cart),
    address: user.address,
    paymentMethod: "Razorpay",
    paymentResult: {
      id: razorpay_payment_id,
      status: "paid",
      signature: razorpay_signature,
      update_time: new Date().toISOString(),
      email_address: req.user.email,
    },
    razorpayOrderId: razorpay_order_id,
    totalPrice: calculateCartTotal(cart),
    isPaid: true,
    paidAt: Date.now(),
    paymentStatus: "Paid",
    orderStatus: "Placed",
  });

  cart.items = [];
  await cart.save();

  await User.findByIdAndUpdate(req.user._id, { $push: { purchaseHistory: order._id } });

  res.status(201).json({
    message: "Payment verified and order placed successfully",
    order,
  });
});

// @desc    Get order by ID
// @route   GET /api/orders/:id
// @access  Private
export const getOrderById = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate("user", "name email role");

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  const canView = order.user._id.equals(req.user._id) || req.user.role === "admin";
  if (!canView) {
    res.status(403);
    throw new Error("Not authorized to view this order");
  }

  res.json(order);
});

// @desc    Get logged in user orders
// @route   GET /api/orders/myorders
// @access  Private
export const getMyOrders = asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json(orders);
});

export const downloadInvoice = asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id).populate("user", "name email role");

  if (!order) {
    res.status(404);
    throw new Error("Order not found");
  }

  const canView = order.user._id.equals(req.user._id) || req.user.role === "admin";
  if (!canView) {
    res.status(403);
    throw new Error("Not authorized to download this invoice");
  }

  const address = order.address || {
    fullName: order.user?.name || "N/A",
    phone: "N/A",
    address: "N/A",
    city: "N/A",
    state: "N/A",
    pincode: "N/A",
  };

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename=invoice-${order._id.toString()}.pdf`
  );

  const doc = new PDFDocument({ margin: 50 });
  doc.pipe(res);

  doc.fontSize(22).text("AI Bookstore Invoice", { align: "center" });
  doc.moveDown();

  doc.fontSize(11);
  doc.text(`Order ID: ${order._id}`);
  doc.text(`Date: ${new Date(order.createdAt).toLocaleString("en-IN")}`);
  doc.text(`Payment Status: ${order.paymentStatus || (order.isPaid ? "Paid" : "Pending")}`);
  doc.text(`Order Status: ${order.orderStatus || "Placed"}`);
  doc.moveDown();

  doc.fontSize(14).text("Customer", { underline: true });
  doc.fontSize(11).text(`Name: ${order.user?.name || address.fullName}`);
  doc.text(`Email: ${order.user?.email || "N/A"}`);
  doc.moveDown();

  doc.fontSize(14).text("Delivery Address", { underline: true });
  doc.fontSize(11).text(address.fullName);
  doc.text(address.phone);
  doc.text(`${address.address}, ${address.city}`);
  doc.text(`${address.state} - ${address.pincode}`);
  doc.moveDown();

  doc.fontSize(14).text("Items Purchased", { underline: true });
  doc.moveDown(0.5);
  doc.fontSize(11).text("Item", 50, doc.y, { continued: true, width: 250 });
  doc.text("Qty", 330, doc.y, { continued: true, width: 50 });
  doc.text("Price", 390, doc.y, { continued: true, width: 80 });
  doc.text("Amount", 480, doc.y, { width: 80 });
  doc.moveTo(50, doc.y + 4).lineTo(550, doc.y + 4).stroke();
  doc.moveDown();

  order.orderItems.forEach((item) => {
    const y = doc.y;
    doc.text(item.title, 50, y, { width: 250 });
    doc.text(String(item.qty), 330, y, { width: 50 });
    doc.text(`Rs. ${item.price.toFixed(2)}`, 390, y, { width: 80 });
    doc.text(`Rs. ${(item.price * item.qty).toFixed(2)}`, 480, y, { width: 80 });
    doc.moveDown();
  });

  doc.moveDown();
  doc.fontSize(14).text(`Total Amount: Rs. ${order.totalPrice.toFixed(2)}`, {
    align: "right",
  });

  doc.end();
});
