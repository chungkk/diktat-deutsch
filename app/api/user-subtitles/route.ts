import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import UserSubtitle from '@/models/UserSubtitle';

// GET — fetch user's custom subtitles for a lesson
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const userId = (session.user as { id?: string })?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const lessonId = req.nextUrl.searchParams.get('lessonId');
    if (!lessonId) {
      return NextResponse.json({ error: 'lessonId ist erforderlich' }, { status: 400 });
    }

    await dbConnect();

    const userSub = await UserSubtitle.findOne({ userId, lessonId });
    if (!userSub) {
      return NextResponse.json({ exists: false });
    }

    return NextResponse.json({
      exists: true,
      subtitles: userSub.subtitles,
      updatedAt: userSub.updatedAt,
    });
  } catch (error: unknown) {
    console.error('Error fetching user subtitles:', error);
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}

// PUT — save/update user's custom subtitles for a lesson
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const userId = (session.user as { id?: string })?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const body = await req.json();
    const { lessonId, subtitles } = body;

    if (!lessonId || !Array.isArray(subtitles)) {
      return NextResponse.json({ error: 'lessonId und subtitles sind erforderlich' }, { status: 400 });
    }

    await dbConnect();

    const userSub = await UserSubtitle.findOneAndUpdate(
      { userId, lessonId },
      { subtitles, updatedAt: new Date() },
      { upsert: true, new: true }
    );

    return NextResponse.json({
      exists: true,
      subtitles: userSub.subtitles,
      updatedAt: userSub.updatedAt,
    });
  } catch (error: unknown) {
    console.error('Error saving user subtitles:', error);
    return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 });
  }
}

// DELETE — remove user's custom subtitles (reset to original)
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const userId = (session.user as { id?: string })?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
    }

    const lessonId = req.nextUrl.searchParams.get('lessonId');
    if (!lessonId) {
      return NextResponse.json({ error: 'lessonId ist erforderlich' }, { status: 400 });
    }

    await dbConnect();

    await UserSubtitle.findOneAndDelete({ userId, lessonId });

    return NextResponse.json({ message: 'Zurückgesetzt', exists: false });
  } catch (error: unknown) {
    console.error('Error deleting user subtitles:', error);
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}
