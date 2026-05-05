import mongoose from 'mongoose';

const topicStatSchema = new mongoose.Schema(
    {
        topic: { type: String, required: true },
        attempts: { type: Number, required: true, default: 0 },
        averageAccuracy: { type: Number, required: true, default: 0 },
    },
    { _id: false }
);

const performanceHistorySchema = new mongoose.Schema(
    {
        attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'Attempt', required: true },
        quiz: { type: mongoose.Schema.Types.ObjectId, ref: 'Quiz', required: true },
        note: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
        score: { type: Number, required: true },
        subject: { type: String, required: true },
        attemptedAt: { type: Date, required: true },
    },
    { _id: false }
);

const analyticsSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            unique: true,
            required: true,
        },
        totalQuizzesAttempted: { type: Number, default: 0 },
        averageScore: { type: Number, default: 0 },
        strongTopics: [topicStatSchema],
        weakTopics: [topicStatSchema],
        topicBreakdown: [topicStatSchema],
        performanceHistory: [performanceHistorySchema],
        lastQuizGeneratedAt: { type: Date },
    },
    { timestamps: true }
);

const Analytics = mongoose.model('Analytics', analyticsSchema);
export default Analytics;
