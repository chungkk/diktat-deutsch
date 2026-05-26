import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Progress from '@/models/Progress';

// PUT update bookmarks only — uses $set to atomically update ONLY bookmarkedIndices
// without touching any other progress fields (score, completedIndices, etc.)
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
    }

    const { lessonId, bookmarkedIndices } = await req.json();
    const userId = (session.user as { id?: string })?.id;

    if (!lessonId) {
      return NextResponse.json({ error: 'lessonId fehlt' }, { status: 400 });
    }
    if (!Array.isArray(bookmarkedIndices)) {
      return NextResponse.json({ error: 'bookmarkedIndices muss ein Array sein' }, { status: 400 });
    }

    await dbConnect();

    const progress = await Progress.findOneAndUpdate(
      { userId, lessonId },
      { $set: { bookmarkedIndices, lastAccessedAt: new Date() } },
      { upsert: true, new: true }
    );

    return NextResponse.json(progress);
  } catch (error: unknown) {
    console.error('Error updating bookmarks:', error);
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}
