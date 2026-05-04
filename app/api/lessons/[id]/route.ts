import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Lesson from '@/models/Lesson';

// GET single lesson
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await dbConnect();
    const lesson = await Lesson.findById(id);
    if (!lesson) {
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

    const lesson = await Lesson.findByIdAndUpdate(id, body, { new: true });
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
