import mongoose, { Schema, Document } from 'mongoose';

export interface ISubtitle {
  start: number;
  dur: number;
  text: string;
}

export interface ILesson extends Document {
  title: string;
  slug: string;
  description: string;
  videoType: 'youtube' | 'local';
  youtubeId?: string;
  videoUrl?: string;
  thumbnail?: string;
  duration?: number;
  subtitles: ISubtitle[];
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  createdAt: Date;
  isPublished: boolean;
  sortOrder: number;
}

const SubtitleSchema: Schema = new Schema({
  start: { type: Number, required: true },
  dur: { type: Number, required: true },
  text: { type: String, required: true },
}, { _id: false });

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 80);
}

const LessonSchema: Schema = new Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  slug: {
    type: String,
    unique: true,
    index: true,
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
  thumbnail: {
    type: String,
  },
  duration: {
    type: Number,
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
  sortOrder: {
    type: Number,
    default: 0,
  },
});

// Auto-generate slug from title before saving
LessonSchema.pre('save', async function () {
  if (this.isModified('title') || !this.slug) {
    let base = generateSlug(this.title as string);
    let slug = base;
    let counter = 1;
    const Model = mongoose.models.Lesson || mongoose.model('Lesson', LessonSchema);
    while (await Model.findOne({ slug, _id: { $ne: this._id } })) {
      slug = `${base}-${counter++}`;
    }
    this.slug = slug;
  }
});

export default mongoose.models.Lesson || mongoose.model<ILesson>('Lesson', LessonSchema);
