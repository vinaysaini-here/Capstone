import asyncHandler from 'express-async-handler';
import Book from '../models/Book.js';

// @desc    Fetch all books
// @route   GET /api/books
// @access  Public
export const getBooks = asyncHandler(async (req, res) => {
    // Basic search and filter implementation
    const keyword = req.query.keyword
        ? {
              title: {
                  $regex: req.query.keyword,
                  $options: 'i',
              },
          }
        : {};

    const books = await Book.find({ ...keyword });
    res.json(books);
});

// @desc    Fetch single book
// @route   GET /api/books/:id
// @access  Public
export const getBookById = asyncHandler(async (req, res) => {
    const book = await Book.findById(req.params.id);

    if (book) {
        res.json(book);
    } else {
        res.status(404);
        throw new Error('Book not found');
    }
});

// @desc    Create a book
// @route   POST /api/books
// @access  Private/Admin
export const createBook = asyncHandler(async (req, res) => {
    const book = new Book({
        title: 'Sample Book',
        author: 'Sample Author',
        description: 'Sample description',
        price: 0,
        category: 'Sample Category',
        image: '/images/sample.jpg',
        stock: 10,
    });

    const createdBook = await book.save();
    res.status(201).json(createdBook);
});

// @desc    Update a book
// @route   PUT /api/books/:id
// @access  Private/Admin
export const updateBook = asyncHandler(async (req, res) => {
    const { title, author, description, price, category, image, stock } = req.body;

    const book = await Book.findById(req.params.id);

    if (book) {
        book.title = title || book.title;
        book.author = author || book.author;
        book.description = description || book.description;
        book.price = price || book.price;
        book.category = category || book.category;
        book.image = image || book.image;
        book.stock = stock || book.stock;

        const updatedBook = await book.save();
        res.json(updatedBook);
    } else {
        res.status(404);
        throw new Error('Book not found');
    }
});

// @desc    Delete a book
// @route   DELETE /api/books/:id
// @access  Private/Admin
export const deleteBook = asyncHandler(async (req, res) => {
    const book = await Book.findById(req.params.id);

    if (book) {
        await book.deleteOne();
        res.json({ message: 'Book removed' });
    } else {
        res.status(404);
        throw new Error('Book not found');
    }
});
