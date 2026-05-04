import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const response = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'de',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const subtitles = (response.segments || []).map((seg: { start: number; end: number; text: string }) => ({
      start: seg.start,
      dur: seg.end - seg.start,
      text: seg.text.trim(),
    }));

    return NextResponse.json({ subtitles });
  } catch (error: unknown) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Transkription fehlgeschlagen' },
      { status: 500 }
    );
  }
}

export const config = {
  api: {
    bodyParser: false,
  },
};
