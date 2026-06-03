import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Progress from '@/models/Progress';
import { getMobileUser } from '@/lib/mobile-auth';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

export async function GET(req: NextRequest) {
  try {
    const user = await getMobileUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401, headers: corsHeaders() });
    }

    await dbConnect();
    const { searchParams } = new URL(req.url);
    const lessonId = searchParams.get('lessonId');

    if (lessonId) {
      const progress = await Progress.findOne({ userId: user._id, lessonId });
      return NextResponse.json(progress || {
        currentIndex: 0, completedIndices: [], bookmarkedIndices: [], score: 0, totalAttempts: 0,
      }, { headers: corsHeaders() });
    }

    const allProgress = await Progress.find({ userId: user._id });
    return NextResponse.json(allProgress, { headers: corsHeaders() });
  } catch (error) {
    console.error('Mobile progress GET error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getMobileUser(req);
    if (!user) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401, headers: corsHeaders() });
    }

    const { lessonId, currentIndex, completedIndices, score, totalAttempts, isCompleted } = await req.json();

    if (!lessonId || !Array.isArray(completedIndices)) {
      return NextResponse.json({ error: 'Ungültige Daten' }, { status: 400, headers: corsHeaders() });
    }

    await dbConnect();

    const progress = await Progress.findOneAndUpdate(
      { userId: user._id, lessonId },
      {
        currentIndex: Math.max(0, Number(currentIndex) || 0),
        completedIndices,
        score: Math.max(0, Number(score) || 0),
        totalAttempts: Math.max(0, Number(totalAttempts) || 0),
        isCompleted: Boolean(isCompleted),
        lastAccessedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    return NextResponse.json(progress, { headers: corsHeaders() });
  } catch (error) {
    console.error('Mobile progress POST error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500, headers: corsHeaders() });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}
