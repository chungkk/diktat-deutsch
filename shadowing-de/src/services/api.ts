import { API } from '../config/api';
import { Lesson } from '../types';

export async function fetchLessons(): Promise<Lesson[]> {
  const response = await fetch(API.LESSONS, {
    headers: {
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Server error: ${response.status}`);
  }

  const data = await response.json();
  return data as Lesson[];
}
