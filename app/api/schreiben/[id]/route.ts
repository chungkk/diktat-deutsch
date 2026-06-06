import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import WritingProject from '@/models/WritingProject';

// GET a single writing project
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
    }

    const userId = (session.user as { id?: string })?.id;
    const { id } = await params;
    await dbConnect();

    const project = await WritingProject.findOne({ _id: id, userId });
    if (!project) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error: unknown) {
    console.error('Error fetching project:', error);
    return NextResponse.json({ error: 'Fehler' }, { status: 500 });
  }
}

// PUT update a writing project
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
    }

    const userId = (session.user as { id?: string })?.id;
    const { id } = await params;
    const { title, content, level } = await req.json();

    await dbConnect();

    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (content !== undefined) updateData.content = content;
    if (level !== undefined) updateData.level = level;

    const project = await WritingProject.findOneAndUpdate(
      { _id: id, userId },
      updateData,
      { new: true }
    );

    if (!project) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error: unknown) {
    console.error('Error updating project:', error);
    return NextResponse.json({ error: 'Fehler beim Speichern' }, { status: 500 });
  }
}

// DELETE a writing project
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
    }

    const userId = (session.user as { id?: string })?.id;
    const { id } = await params;

    await dbConnect();

    const project = await WritingProject.findOneAndDelete({ _id: id, userId });
    if (!project) {
      return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error deleting project:', error);
    return NextResponse.json({ error: 'Fehler beim Löschen' }, { status: 500 });
  }
}
