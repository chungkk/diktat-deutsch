import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Progress from '@/models/Progress';

// GET user progress for a lesson
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const lessonId = searchParams.get('lessonId');

    await dbConnect();

    const userId = (session.user as { id?: string })?.id;

    if (lessonId) {
      const progress = await Progress.findOne({ userId, lessonId });
      return NextResponse.json(progress || { currentIndex: 0, completedIndices: [], bookmarkedIndices: [], correctInputs: {}, score: 0, totalAttempts: 0 });
    }

    // Get all progress for user
    const allProgress = await Progress.find({ userId }).populate('lessonId');
    return NextResponse.json(allProgress);
  } catch (error: unknown) {
    console.error('Error fetching progress:', error);
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}

// POST update progress
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
    }

    const { lessonId, currentIndex, completedIndices, bookmarkedIndices, correctInputs, score, totalAttempts, isCompleted } = await req.json();
    const userId = (session.user as { id?: string })?.id;

    // Validate required fields
    if (!lessonId) {
      return NextResponse.json({ error: 'lessonId fehlt' }, { status: 400 });
    }
    if (!Array.isArray(completedIndices)) {
      return NextResponse.json({ error: 'completedIndices muss ein Array sein' }, { status: 400 });
    }

    await dbConnect();

    const updateData: Record<string, unknown> = {
      currentIndex: Math.max(0, Number(currentIndex) || 0),
      completedIndices,
      score: Math.max(0, Number(score) || 0),
      totalAttempts: Math.max(0, Number(totalAttempts) || 0),
      isCompleted: Boolean(isCompleted),
      lastAccessedAt: new Date(),
    };
    if (Array.isArray(bookmarkedIndices)) {
      updateData.bookmarkedIndices = bookmarkedIndices;
    }
    if (correctInputs && typeof correctInputs === 'object') {
      updateData.correctInputs = correctInputs;
    }

    const progress = await Progress.findOneAndUpdate(
      { userId, lessonId },
      updateData,
      { upsert: true, new: true }
    );

    return NextResponse.json(progress);
  } catch (error: unknown) {
    console.error('Error updating progress:', error);
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}
