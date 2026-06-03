import * as SecureStore from 'expo-secure-store';

const BASE_URL = 'https://ckk.pro/api/mobile';

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('token');
}

export async function setToken(token: string) {
  await SecureStore.setItemAsync('token', token);
}

export async function clearToken() {
  await SecureStore.deleteItemAsync('token');
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data as T;
}

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export interface Subtitle {
  start: number;
  dur: number;
  text: string;
}

export interface Lesson {
  _id: string;
  slug: string;
  title: string;
  description: string;
  level: string;
  videoType: string;
  youtubeId?: string;
  thumbnail?: string;
  duration?: number;
  subtitles: Subtitle[];
  createdAt: string;
}

export interface Progress {
  lessonId: string;
  completedIndices: number[];
  score: number;
  totalAttempts: number;
  isCompleted: boolean;
}

export const api = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (username: string, email: string, password: string) =>
    request<AuthResponse>('/register', { method: 'POST', body: JSON.stringify({ username, email, password }) }),

  getLessons: () => request<Lesson[]>('/lessons'),

  getProgress: () => request<Progress[]>('/progress'),

  getLessonProgress: (lessonId: string) =>
    request<Progress>(`/progress?lessonId=${lessonId}`),

  saveProgress: (data: {
    lessonId: string;
    currentIndex: number;
    completedIndices: number[];
    score: number;
    totalAttempts: number;
    isCompleted: boolean;
  }) => request<Progress>('/progress', { method: 'POST', body: JSON.stringify(data) }),
};
