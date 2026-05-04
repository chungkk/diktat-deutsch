import mongoose, { Schema, Document } from 'mongoose';

export interface ISubtitle {
  start: number;
  dur: number;
  text: string;
}

export interface ILesson extends Document {
  title: string;
  description: string;
  videoType: 'youtube' | 'local';
  youtubeId?: string;
  videoUrl?: string;
  subtitles: ISubtitle[];
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  createdAt: Date;
  isPublished: boolean;
}

const SubtitleSchema: Schema = new Schema({
  start: { type: Number, required: true },
  dur: { type: Number, required: true },
  text: { type: String, required: true },
}, { _id: false });

const LessonSchema: Schema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    default: '',
  },
  videoType: {
    type: String,
    enum: ['youtube', 'local'],
    required: true,
  },
  youtubeId: {
    type: String,
  },
  videoUrl: {
    type: String,
  },
  subtitles: [SubtitleSchema],
  level: {
    type: String,
    enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    default: 'A1',
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  isPublished: {
    type: Boolean,
    default: false,
  },
});

export default mongoose.models.Lesson || mongoose.model<ILesson>('Lesson', LessonSchema);
