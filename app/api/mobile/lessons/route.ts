import { NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Lesson from '@/models/Lesson';

// Public API for the mobile app — no auth required
// Returns all published lessons with full subtitle data for offline download
export async function GET() {
  try {
    await dbConnect();

    const lessons = await Lesson.find({ isPublished: true })
      .sort({ createdAt: 1 }) // oldest first for sequential learning
      .select('title slug description videoType youtubeId thumbnail duration subtitles level createdAt');

    // Add CORS headers for mobile
    const response = NextResponse.json(lessons);
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET');
    return response;
  } catch (error: unknown) {
    console.error('Mobile API - Error fetching lessons:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

// Handle preflight
export async function OPTIONS() {
  const response = new NextResponse(null, { status: 204 });
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}
