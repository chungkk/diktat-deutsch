import { NextRequest, NextResponse } from 'next/server';
import { verifyMobileToken } from '@/lib/mobileAuth';
import dbConnect from '@/lib/mongodb';
import Progress from '@/models/Progress';

function corsResponse(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}

// PUT update bookmarks
export async function PUT(req: NextRequest) {
  const user = verifyMobileToken(req);
  if (!user) {
    return corsResponse(NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 }));
  }

  try {
    const { lessonId, bookmarkedIndices } = await req.json();

    if (!lessonId || !Array.isArray(bookmarkedIndices)) {
      return corsResponse(NextResponse.json({ error: 'Ungültige Daten' }, { status: 400 }));
    }

    await dbConnect();

    const progress = await Progress.findOneAndUpdate(
      { userId: user.id, lessonId },
      { bookmarkedIndices },
      { upsert: true, new: true }
    );

    return corsResponse(NextResponse.json(progress));
  } catch (error: unknown) {
    console.error('Mobile bookmarks error:', error);
    return corsResponse(NextResponse.json({ error: 'Fehler' }, { status: 500 }));
  }
}

// Handle preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'PUT, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  return response;
}
