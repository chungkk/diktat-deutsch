import { NextRequest, NextResponse } from 'next/server';

interface iTunesEpisode {
  trackId: number;
  trackName: string;
  collectionName: string;
  description: string;
  shortDescription: string;
  releaseDate: string;
  trackTimeMillis: number;
  episodeUrl: string;
  artworkUrl600: string;
  artworkUrl160: string;
  collectionId: number;
  feedUrl: string;
  trackViewUrl: string;
}

// GET: list episodes for a podcast show
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // Accept either a showId or default to "Anna und die wilden Tiere"
    const showId = searchParams.get('showId') || '1568289553';
    const limit = searchParams.get('limit') || '50';

    // Use iTunes Lookup API to get episodes
    const lookupUrl = `https://itunes.apple.com/lookup?id=${showId}&entity=podcastEpisode&limit=${limit}`;
    const res = await fetch(lookupUrl, { next: { revalidate: 3600 } });
    const data = await res.json();

    if (!data.results || data.results.length === 0) {
      return NextResponse.json({ error: 'Podcast nicht gefunden' }, { status: 404 });
    }

    // First result is the show itself, rest are episodes
    const show = data.results[0];
    const episodes = data.results
      .slice(1)
      .filter((e: iTunesEpisode) => e.trackId)
      .map((e: iTunesEpisode) => ({
        id: e.trackId,
        title: e.trackName,
        description: e.shortDescription || e.description || '',
        date: e.releaseDate,
        durationMs: e.trackTimeMillis,
        audioUrl: e.episodeUrl,
        artwork: e.artworkUrl160,
        artworkLarge: e.artworkUrl600,
      }));

    return NextResponse.json({
      show: {
        id: show.collectionId,
        name: show.collectionName,
        artist: show.artistName,
        artwork: show.artworkUrl600,
        feedUrl: show.feedUrl,
      },
      episodes,
    });
  } catch (error) {
    console.error('Podcast API error:', error);
    return NextResponse.json({ error: 'Fehler beim Laden' }, { status: 500 });
  }
}
