import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Lesson from '@/models/Lesson';

// GET single lesson (by _id or slug)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await dbConnect();

    // Support both ObjectId and slug
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(id);
    const lesson = isObjectId
      ? await Lesson.findById(id)
      : await Lesson.findOne({ slug: id });

    if (!lesson) {
      return NextResponse.json({ error: 'Lektion nicht gefunden' }, { status: 404 });
    }

    const session = await getServerSession(authOptions);
    const isAdmin = (session?.user as { role?: string })?.role === 'admin';
    if (!lesson.isPublished && !isAdmin) {
      return NextResponse.json({ error: 'Lektion nicht gefunden' }, { status: 404 });
    }

    return NextResponse.json(lesson);
  } catch (error: unknown) {
    console.error('Error fetching lesson:', error);
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}

// PUT update lesson (admin only)
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role?: string })?.role !== 'admin') {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    await dbConnect();

    const { title, description, level, videoType, youtubeId, videoUrl, subtitles, isPublished, thumbnail, duration, sortOrder } = body;
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (level !== undefined) updateData.level = level;
    if (videoType !== undefined) updateData.videoType = videoType;
    if (youtubeId !== undefined) updateData.youtubeId = youtubeId;
    if (videoUrl !== undefined) updateData.videoUrl = videoUrl;
    if (subtitles !== undefined) updateData.subtitles = subtitles;
    if (isPublished !== undefined) updateData.isPublished = isPublished;
    if (thumbnail !== undefined) updateData.thumbnail = thumbnail;
    if (duration !== undefined) updateData.duration = duration;
    if (sortOrder !== undefined) updateData.sortOrder = sortOrder;

    const lesson = await Lesson.findByIdAndUpdate(id, updateData, { new: true });
    if (!lesson) {
      return NextResponse.json({ error: 'Lektion nicht gefunden' }, { status: 404 });
    }
    return NextResponse.json(lesson);
  } catch (error: unknown) {
    console.error('Error updating lesson:', error);
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}

// DELETE lesson (admin only)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role?: string })?.role !== 'admin') {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    const { id } = await params;
    await dbConnect();

    const lesson = await Lesson.findByIdAndDelete(id);
    if (!lesson) {
      return NextResponse.json({ error: 'Lektion nicht gefunden' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Lektion gelöscht' });
  } catch (error: unknown) {
    console.error('Error deleting lesson:', error);
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}
