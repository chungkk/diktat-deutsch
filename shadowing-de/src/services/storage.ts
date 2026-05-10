import * as FileSystem from 'expo-file-system/legacy';
import { Lesson, OfflineLesson, LessonProgress } from '../types';

const LESSONS_DIR = `${FileSystem.documentDirectory}lessons/`;
const PROGRESS_FILE = `${FileSystem.documentDirectory}progress.json`;

// Ensure the lessons directory exists
async function ensureDir() {
  const info = await FileSystem.getInfoAsync(LESSONS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(LESSONS_DIR, { intermediates: true });
  }
}

// ──────────────────────────────────────────
// Lesson Storage (Offline)
// ──────────────────────────────────────────

export async function saveLesson(lesson: Lesson): Promise<void> {
  await ensureDir();
  const offlineLesson: OfflineLesson = {
    ...lesson,
    downloadedAt: new Date().toISOString(),
  };
  const path = `${LESSONS_DIR}${lesson._id}.json`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(offlineLesson));
}

export async function saveLessons(lessons: Lesson[]): Promise<void> {
  await ensureDir();
  for (const lesson of lessons) {
    await saveLesson(lesson);
  }
}

export async function getOfflineLessons(): Promise<OfflineLesson[]> {
  await ensureDir();
  const files = await FileSystem.readDirectoryAsync(LESSONS_DIR);
  const jsonFiles = files.filter(f => f.endsWith('.json'));

  const lessons: OfflineLesson[] = [];
  for (const file of jsonFiles) {
    try {
      const content = await FileSystem.readAsStringAsync(`${LESSONS_DIR}${file}`);
      lessons.push(JSON.parse(content));
    } catch {
      // Skip corrupted files
    }
  }

  // Sort by createdAt ascending (oldest first)
  return lessons.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export async function getOfflineLesson(id: string): Promise<OfflineLesson | null> {
  try {
    const path = `${LESSONS_DIR}${id}.json`;
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const content = await FileSystem.readAsStringAsync(path);
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export async function deleteOfflineLesson(id: string): Promise<void> {
  try {
    const path = `${LESSONS_DIR}${id}.json`;
    await FileSystem.deleteAsync(path, { idempotent: true });
  } catch {
    // Ignore
  }
}

export async function deleteAllOfflineLessons(): Promise<void> {
  try {
    await FileSystem.deleteAsync(LESSONS_DIR, { idempotent: true });
    await ensureDir();
  } catch {
    // Ignore
  }
}

export async function getOfflineStorageSize(): Promise<number> {
  await ensureDir();
  const files = await FileSystem.readDirectoryAsync(LESSONS_DIR);
  let total = 0;
  for (const file of files) {
    try {
      const info = await FileSystem.getInfoAsync(`${LESSONS_DIR}${file}`);
      if (info.exists && 'size' in info) {
        total += info.size || 0;
      }
    } catch {
      // Skip
    }
  }
  return total;
}

// ──────────────────────────────────────────
// Progress Storage (Local)
// ──────────────────────────────────────────

async function loadAllProgress(): Promise<Record<string, LessonProgress>> {
  try {
    const info = await FileSystem.getInfoAsync(PROGRESS_FILE);
    if (!info.exists) return {};
    const content = await FileSystem.readAsStringAsync(PROGRESS_FILE);
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function saveAllProgress(data: Record<string, LessonProgress>): Promise<void> {
  await FileSystem.writeAsStringAsync(PROGRESS_FILE, JSON.stringify(data));
}

export async function getProgress(lessonId: string): Promise<LessonProgress | null> {
  const all = await loadAllProgress();
  return all[lessonId] || null;
}

export async function saveProgress(progress: LessonProgress): Promise<void> {
  const all = await loadAllProgress();
  all[progress.lessonId] = progress;
  await saveAllProgress(all);
}

export async function getAllProgress(): Promise<Record<string, LessonProgress>> {
  return loadAllProgress();
}
