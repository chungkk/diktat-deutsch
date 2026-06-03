import mongoose, { Schema, Document } from 'mongoose';

export interface IProgress extends Document {
  userId: mongoose.Types.ObjectId;
  lessonId: mongoose.Types.ObjectId;
  currentIndex: number;
  completedIndices: number[];
  bookmarkedIndices: number[];
  correctInputs: Record<string, Record<string, string>>;
  score: number;
  totalAttempts: number;
  lastAccessedAt: Date;
  isCompleted: boolean;
}

const ProgressSchema: Schema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  lessonId: {
    type: Schema.Types.ObjectId,
    ref: 'Lesson',
    required: true,
  },
  currentIndex: {
    type: Number,
    default: 0,
  },
  completedIndices: [{
    type: Number,
  }],
  bookmarkedIndices: [{
    type: Number,
  }],
  score: {
    type: Number,
    default: 0,
  },
  totalAttempts: {
    type: Number,
    default: 0,
  },
  correctInputs: {
    type: Schema.Types.Mixed,
    default: {},
  },
  lastAccessedAt: {
    type: Date,
    default: Date.now,
  },
  isCompleted: {
    type: Boolean,
    default: false,
  },
});

ProgressSchema.index({ userId: 1, lessonId: 1 }, { unique: true });

export default mongoose.models.Progress || mongoose.model<IProgress>('Progress', ProgressSchema);
