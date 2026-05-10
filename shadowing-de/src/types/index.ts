// Types matching the backend Lesson model

export interface Subtitle {
  start: number;
  dur: number;
  text: string;
}

export interface Lesson {
  _id: string;
  title: string;
  slug: string;
  description: string;
  videoType: 'youtube' | 'local';
  youtubeId?: string;
  videoUrl?: string;
  thumbnail?: string;
  duration?: number;
  subtitles: Subtitle[];
  level: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
  createdAt: string;
}

export interface OfflineLesson extends Lesson {
  downloadedAt: string;
  fileSize?: number;
}

// Local progress tracking (no server sync needed for offline)
export interface LessonProgress {
  lessonId: string;
  currentIndex: number;
  completedIndices: number[];
  phase: 'shadowing' | 'diktat';
  lastAccessedAt: string;
}
