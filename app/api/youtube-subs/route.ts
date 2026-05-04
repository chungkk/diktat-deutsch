import { NextRequest, NextResponse } from 'next/server';
import { getSubtitles } from 'youtube-captions-scraper';

export async function POST(req: NextRequest) {
  try {
    const { videoId, lang } = await req.json();

    if (!videoId) {
      return NextResponse.json({ error: 'Video ID ist erforderlich' }, { status: 400 });
    }

    const captions = await getSubtitles({
      videoID: videoId,
      lang: lang || 'de',
    });

    const subtitles = captions.map((cap: { start: string; dur: string; text: string }) => ({
      start: parseFloat(cap.start),
      dur: parseFloat(cap.dur),
      text: cap.text,
    }));

    return NextResponse.json({ subtitles });
  } catch (error: unknown) {
    console.error('Error fetching YouTube captions:', error);
    return NextResponse.json(
      { error: 'Untertitel konnten nicht geladen werden. Bitte prüfen Sie die Video-ID.' },
      { status: 500 }
    );
  }
}
