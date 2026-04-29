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
    try {
        const { title, author, description, price, category, stock } = req.body  || {};

        // ✅ Validation
        if (!title || !author || !price) {
            res.status(400);
            
            throw new Error('Title, Author and Price are required');
        }

        // Default values
        let imageUrl = 'https://images.pexels.com/photos/11527060/pexels-photo-11527060.jpeg';
        let fileUrl = '';

        // ✅ Safe file handling
        if (req.files) {
            // Image
            if (req.files.image && req.files.image.length > 0) {
                imageUrl = `/uploads/books/${req.files.image[0].filename}`;
            }

            // PDF / Document
            if (req.files.document && req.files.document.length > 0) {
                fileUrl = `/uploads/books/${req.files.document[0].filename}`;
            }
        }

        // ✅ Create book
        const book = new Book({
            title,
            author,
            description: description || '',
            price: Number(price),
            category: category || 'General',
            imageUrl,
            fileUrl,
            stock: stock ? Number(stock) : 0,
        });

        const createdBook = await book.save();

        res.status(201).json({
            success: true,
            message: 'Book created successfully',
            data: createdBook,
        });

    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: error.message || 'Server Error',
        });
    }
});

// @desc    Update a book
// @route   PUT /api/books/:id
// @access  Private/Admin
export const updateBook = asyncHandler(async (req, res) => {
    const { title, author, description, price, category, stock } = req.body;

    const book = await Book.findById(req.params.id);

    if (book) {
        book.title = title || book.title;
        book.author = author || book.author;
        book.description = description || book.description;
        book.price = price || book.price;
        book.category = category || book.category;
        book.stock = stock || book.stock;

        if (req.files) {
            if (req.files.image && req.files.image.length > 0) {
                book.imageUrl = `/uploads/books/${req.files.image[0].filename}`;
            }
            if (req.files.document && req.files.document.length > 0) {
                book.fileUrl = `/uploads/books/${req.files.document[0].filename}`;
            }
        }

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
