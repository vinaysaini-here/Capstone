import mongoose from 'mongoose';

const quizQuestionSchema = new mongoose.Schema(
    {
        question: { type: String, required: true, trim: true },
        options: {
            type: [String],
            required: true,
            validate: {
                validator: (value) => Array.isArray(value) && value.length === 4,
                message: 'Each quiz question must have exactly 4 options',
            },
        },
        correctAnswer: { type: String, required: true, trim: true },
        explanation: { type: String, required: true, trim: true },
    },
    { _id: false }
);

const quizSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        note: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Book',
            required: true,
        },
        title: { type: String, required: true },
        subject: { type: String, required: true },
        questions: [quizQuestionSchema],
        sourceExcerpt: { type: String, required: true },
        sourceHash: { type: String, required: true },
        promptVersion: { type: String, default: 'smart-learning-v1' },
    },
    { timestamps: true }
);

quizSchema.index({ user: 1, note: 1, sourceHash: 1 });

const Quiz = mongoose.model('Quiz', quizSchema);
export default Quiz;
