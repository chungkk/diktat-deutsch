import { NextRequest, NextResponse } from 'next/server';

// GET: lookup a single podcast episode by its iTunes trackId
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const episodeId = searchParams.get('episodeId');

    if (!episodeId) {
      return NextResponse.json({ error: 'episodeId required' }, { status: 400 });
    }

    // Direct iTunes lookup by episode trackId
    const lookupUrl = `https://itunes.apple.com/lookup?id=${episodeId}`;
    const res = await fetch(lookupUrl, { next: { revalidate: 3600 } });
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      return NextResponse.json({ error: 'Episode nicht gefunden' }, { status: 404 });
    }

    const ep = data.results[0];

    return NextResponse.json({
      id: ep.trackId,
      title: ep.trackName || `Episode ${episodeId}`,
      audioUrl: ep.episodeUrl || '',
      artwork: ep.artworkUrl600 || ep.artworkUrl160 || '',
      durationMs: ep.trackTimeMillis || 0,
      description: ep.shortDescription || ep.description || '',
    });
  } catch (error) {
    console.error('Episode lookup error:', error);
    return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });
  }
}
