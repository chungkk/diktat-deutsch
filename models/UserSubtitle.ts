import mongoose, { Schema, Document } from 'mongoose';

export interface IUserSubtitle extends Document {
  userId: mongoose.Types.ObjectId;
  lessonId: mongoose.Types.ObjectId;
  subtitles: { start: number; dur: number; text: string }[];
  updatedAt: Date;
}

const UserSubtitleSchema: Schema = new Schema({
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
  subtitles: [{
    start: { type: Number, required: true },
    dur: { type: Number, required: true },
    text: { type: String, required: true },
    _id: false,
  }],
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

UserSubtitleSchema.index({ userId: 1, lessonId: 1 }, { unique: true });

export default mongoose.models.UserSubtitle || mongoose.model<IUserSubtitle>('UserSubtitle', UserSubtitleSchema);
