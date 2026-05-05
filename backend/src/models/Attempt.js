import mongoose from 'mongoose';

const attemptAnswerSchema = new mongoose.Schema(
    {
        questionIndex: { type: Number, required: true },
        question: { type: String, required: true },
        selectedAnswer: { type: String, default: '' },
        correctAnswer: { type: String, required: true },
        explanation: { type: String, required: true },
        isCorrect: { type: Boolean, required: true },
    },
    { _id: false }
);

const attemptSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        quiz: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Quiz',
            required: true,
        },
        note: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Book',
            required: true,
        },
        title: { type: String, required: true },
        subject: { type: String, required: true },
        answers: [attemptAnswerSchema],
        totalQuestions: { type: Number, required: true },
        correctAnswers: { type: Number, required: true },
        wrongAnswers: { type: Number, required: true },
        accuracy: { type: Number, required: true },
        durationSeconds: { type: Number, default: 0 },
    },
    { timestamps: true }
);

attemptSchema.index({ user: 1, createdAt: -1 });

const Attempt = mongoose.model('Attempt', attemptSchema);
export default Attempt;
