import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import WritingProject from '@/models/WritingProject';

// GET all writing projects for the current user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
    }

    const userId = (session.user as { id?: string })?.id;
    await dbConnect();

    const projects = await WritingProject.find({ userId })
      .sort({ updatedAt: -1 })
      .select('title level status corrections.score corrections.createdAt createdAt updatedAt content')
      .lean();

    // Add word count and latest score
    const result = projects.map((p: Record<string, unknown>) => {
      const content = (p.content as string) || '';
      const corrections = (p.corrections as Array<{ score?: number; createdAt?: Date }>) || [];
      return {
        ...p,
        wordCount: content.trim() ? content.trim().split(/\s+/).length : 0,
        latestScore: corrections.length > 0
          ? corrections[corrections.length - 1]?.score
          : null,
        correctionCount: corrections.length,
        content: undefined, // Don't send full content in list
      };
    });

    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error('Error fetching writing projects:', error);
    return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 });
  }
}

// POST create a new writing project
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
    }

    const userId = (session.user as { id?: string })?.id;
    const { title, content, level } = await req.json();

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Titel ist erforderlich' }, { status: 400 });
    }

    await dbConnect();

    const project = await WritingProject.create({
      userId,
      title: title.trim(),
      content: content || '',
      level: level || 'A1',
      status: 'draft',
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error: unknown) {
    console.error('Error creating writing project:', error);
    return NextResponse.json({ error: 'Fehler beim Erstellen' }, { status: 500 });
  }
}
