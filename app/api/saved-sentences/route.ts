import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Progress from '@/models/Progress';

// GET all saved/bookmarked sentences across all lessons for the current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
    }

    const userId = (session.user as { id?: string })?.id;

    await dbConnect();

    // Find all progress entries that have bookmarked sentences, populate lesson data
    const progressEntries = await Progress.find({
      userId,
      bookmarkedIndices: { $exists: true, $not: { $size: 0 } },
    }).populate('lessonId', 'title slug level subtitles youtubeId thumbnail');

    // Transform into a flat list of saved sentences with lesson context
    const savedSentences = progressEntries
      .filter((p) => p.lessonId) // Skip entries where lesson was deleted
      .flatMap((p) => {
        const lesson = p.lessonId as {
          _id: string;
          title: string;
          slug: string;
          level: string;
          subtitles: { start: number; dur: number; text: string }[];
          youtubeId?: string;
          thumbnail?: string;
        };

        return (p.bookmarkedIndices || [])
          .filter((idx: number) => idx >= 0 && idx < lesson.subtitles.length)
          .map((idx: number) => ({
            lessonId: lesson._id,
            lessonTitle: lesson.title,
            lessonSlug: lesson.slug,
            lessonLevel: lesson.level,
            youtubeId: lesson.youtubeId,
            sentenceIndex: idx,
            text: lesson.subtitles[idx].text,
            start: lesson.subtitles[idx].start,
            dur: lesson.subtitles[idx].dur,
            isCompleted: p.completedIndices?.includes(idx) || false,
          }));
      });

    return NextResponse.json(savedSentences);
  } catch (error: unknown) {
    console.error('Error fetching saved sentences:', error);
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}
