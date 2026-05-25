import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import dbConnect from '@/lib/mongodb';
import Lesson from '@/models/Lesson';

// POST: swap sortOrder of two lessons
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role?: string })?.role !== 'admin') {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    const { lessonIdA, lessonIdB } = await req.json();
    if (!lessonIdA || !lessonIdB) {
      return NextResponse.json({ error: 'Zwei Lektions-IDs erforderlich' }, { status: 400 });
    }

    await dbConnect();

    const [a, b] = await Promise.all([
      Lesson.findById(lessonIdA).select('sortOrder'),
      Lesson.findById(lessonIdB).select('sortOrder'),
    ]);

    if (!a || !b) {
      return NextResponse.json({ error: 'Lektion nicht gefunden' }, { status: 404 });
    }

    // Swap sortOrders
    const aOrder = a.sortOrder ?? 0;
    const bOrder = b.sortOrder ?? 0;

    await Promise.all([
      Lesson.findByIdAndUpdate(lessonIdA, { sortOrder: bOrder }),
      Lesson.findByIdAndUpdate(lessonIdB, { sortOrder: aOrder }),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error reordering lessons:', error);
    return NextResponse.json({ error: 'Fehler beim Sortieren' }, { status: 500 });
  }
}
