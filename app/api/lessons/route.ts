import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Lesson from '@/models/Lesson';

// GET all published lessons (for users) or all lessons (for admin)
export async function GET() {
  try {
    await dbConnect();
    const session = await getServerSession(authOptions);

    let filter = {};
    if (!(session?.user as { role?: string })?.role || (session?.user as { role?: string })?.role !== 'admin') {
      filter = { isPublished: true };
    }

    const lessons = await Lesson.find(filter).sort({ createdAt: -1 });
    return NextResponse.json(lessons);
  } catch (error: unknown) {
    console.error('Error fetching lessons:', error);
    return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 });
  }
}

// POST create a new lesson (admin only)
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role?: string })?.role !== 'admin') {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    const body = await req.json();
    await dbConnect();

    const lesson = await Lesson.create(body);
    return NextResponse.json(lesson, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating lesson:', error);
    return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 });
  }
}
