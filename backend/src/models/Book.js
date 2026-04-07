import mongoose from 'mongoose';

const bookSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: [true, 'Please provide book title'],
            trim: true,
        },
        author: {
            type: String,
            required: [true, 'Please provide author name'],
        },
        description: {
            type: String,
            required: [true, 'Please provide description'],
        },
        price: {
            type: Number,
            required: [true, 'Please provide price'],
        },
        category: {
            type: String,
            required: [true, 'Please provide category'],
        },
        image: {
            type: String,
            default: '/book-placeholder.jpg',
        },
        stock: {
            type: Number,
            default: 10,
        },
        embedding: {
            type: [Number], // For semantic search later
            select: false,
        }
    },
    { timestamps: true }
);

const Book = mongoose.model('Book', bookSchema);
export default Book;
