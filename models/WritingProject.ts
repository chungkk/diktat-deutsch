import mongoose, { Schema, Document } from 'mongoose';

export interface IWritingError {
  original: string;
  corrected: string;
  type: 'Grammatik' | 'Rechtschreibung' | 'Wortschatz' | 'Satzbau' | 'Zeichensetzung';
  explanation: string;
}

export interface ICorrection {
  correctedText: string;
  errors: IWritingError[];
  overallFeedback: string;
  score: number;
  createdAt: Date;
}

export interface IWritingProject extends Document {
  userId: mongoose.Types.ObjectId;
  title: string;
  content: string;
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  corrections: ICorrection[];
  status: 'draft' | 'corrected';
  createdAt: Date;
  updatedAt: Date;
}

const WritingErrorSchema: Schema = new Schema({
  original: { type: String, required: true },
  corrected: { type: String, required: true },
  type: {
    type: String,
    enum: ['Grammatik', 'Rechtschreibung', 'Wortschatz', 'Satzbau', 'Zeichensetzung'],
    required: true,
  },
  explanation: { type: String, required: true },
}, { _id: false });

const CorrectionSchema: Schema = new Schema({
  correctedText: { type: String, required: true },
  errors: [WritingErrorSchema],
  overallFeedback: { type: String, required: true },
  score: { type: Number, required: true, min: 0, max: 100 },
  createdAt: { type: Date, default: Date.now },
}, { _id: true });

const WritingProjectSchema: Schema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200,
  },
  content: {
    type: String,
    default: '',
  },
  level: {
    type: String,
    enum: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'],
    default: 'A1',
  },
  corrections: [CorrectionSchema],
  status: {
    type: String,
    enum: ['draft', 'corrected'],
    default: 'draft',
  },
}, {
  timestamps: true,
});

WritingProjectSchema.index({ userId: 1, updatedAt: -1 });

export default mongoose.models.WritingProject ||
  mongoose.model<IWritingProject>('WritingProject', WritingProjectSchema);
