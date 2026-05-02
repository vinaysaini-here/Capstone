import asyncHandler from 'express-async-handler';
import Cart from '../models/Cart.js';
import Book from '../models/Book.js';

const populateCart = (query) =>
    query.populate('items.book', 'title author imageUrl price stock');

const formatCart = (cart) => {
    const items = (cart?.items || [])
        .filter((item) => item.book)
        .map((item) => ({
            _id: item.book._id,
            bookId: item.book._id,
            title: item.book.title,
            author: item.book.author,
            imageUrl: item.book.imageUrl,
            price: item.price,
            qty: item.quantity,
            quantity: item.quantity,
            stock: item.book.stock,
        }));

    return {
        _id: cart?._id,
        userId: cart?.user,
        items,
        totalPrice: items.reduce((total, item) => total + item.price * item.quantity, 0),
    };
};

const getOrCreateCart = async (userId) => {
    let cart = await Cart.findOne({ user: userId });

    if (!cart) {
        cart = await Cart.create({ user: userId, items: [] });
    }

    return cart;
};

export const getCart = asyncHandler(async (req, res) => {
    const cart = await populateCart(Cart.findOne({ user: req.user._id }));
    res.json(formatCart(cart));
});

export const addItemToCart = asyncHandler(async (req, res) => {
    const { bookId, quantity = 1 } = req.body;

    if (!bookId) {
        res.status(400);
        throw new Error('Book id is required');
    }

    const book = await Book.findById(bookId);

    if (!book) {
        res.status(404);
        throw new Error('Book not found');
    }

    if (book.stock < 1) {
        res.status(400);
        throw new Error('Book is out of stock');
    }

    const safeQuantity = Math.max(1, Number(quantity) || 1);
    const cart = await getOrCreateCart(req.user._id);
    const existingItem = cart.items.find((item) => item.book.toString() === bookId);

    if (existingItem) {
        existingItem.quantity += safeQuantity;
        existingItem.price = book.price;
    } else {
        cart.items.push({
            book: book._id,
            quantity: safeQuantity,
            price: book.price,
        });
    }

    await cart.save();

    const populatedCart = await populateCart(Cart.findById(cart._id));
    res.status(201).json(formatCart(populatedCart));
});

export const updateCartItem = asyncHandler(async (req, res) => {
    const { quantity } = req.body;
    const safeQuantity = Number(quantity);

    if (!Number.isInteger(safeQuantity) || safeQuantity < 1) {
        res.status(400);
        throw new Error('Quantity must be at least 1');
    }

    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
        res.status(404);
        throw new Error('Cart not found');
    }

    const item = cart.items.find((cartItem) => cartItem.book.toString() === req.params.bookId);

    if (!item) {
        res.status(404);
        throw new Error('Cart item not found');
    }

    item.quantity = safeQuantity;
    await cart.save();

    const populatedCart = await populateCart(Cart.findById(cart._id));
    res.json(formatCart(populatedCart));
});

export const removeCartItem = asyncHandler(async (req, res) => {
    const cart = await Cart.findOne({ user: req.user._id });

    if (!cart) {
        res.status(404);
        throw new Error('Cart not found');
    }

    cart.items = cart.items.filter((item) => item.book.toString() !== req.params.bookId);
    await cart.save();

    const populatedCart = await populateCart(Cart.findById(cart._id));
    res.json(formatCart(populatedCart));
});

export const clearCart = asyncHandler(async (req, res) => {
    await Cart.findOneAndUpdate({ user: req.user._id }, { items: [] }, { upsert: true });
    res.json({ items: [], totalPrice: 0 });
});
