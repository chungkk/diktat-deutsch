import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import OpenAI from 'openai';

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role?: string })?.role !== 'admin') {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    const formData = await req.formData();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const file = (formData as any).get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'Keine Datei hochgeladen' }, { status: 400 });
    }

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Use BOTH segment + word timestamps for precise yet natural subtitles
    const response = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'de',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment', 'word'],
      temperature: 0,
      prompt: 'Hallo und herzlich willkommen. Dies ist eine deutsche Sendung. Bitte transkribieren Sie alles genau, einschließlich aller Wörter, Satzzeichen und Pausen.',
    });

    // ── Build subtitles: segment structure + word-level timing ──
    const MAX_SUBTITLE_LENGTH = 80;
    const subtitles: { start: number; dur: number; text: string }[] = [];

    interface TimedWord { word: string; start: number; end: number }
    const allWords: TimedWord[] = (
      (response as unknown as { words?: TimedWord[] }).words || []
    ).filter(w => w.word && w.word.trim());

    type Segment = { start: number; end: number; text: string };
    const segments = ((response.segments || []) as Segment[]).filter(s => s.text.trim());

    function findWordsInRange(segStart: number, segEnd: number): TimedWord[] {
      return allWords.filter(w => w.start >= segStart - 0.05 && w.end <= segEnd + 0.05);
    }

    function splitLongText(text: string): string[] {
      const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 0);
      const result: string[] = [];
      for (const sentence of sentences) {
        if (sentence.length <= MAX_SUBTITLE_LENGTH) { result.push(sentence); continue; }
        const commaParts = sentence.split(/(?<=,)\s*/).map(s => s.trim()).filter(s => s.length > 0);
        const afterComma = mergeFragments(commaParts);
        for (const piece of afterComma) {
          if (piece.length <= MAX_SUBTITLE_LENGTH) result.push(piece);
          else result.push(...splitAtConjunctions(piece));
        }
      }
      return result;
    }

    function mergeFragments(parts: string[]): string[] {
      if (parts.length <= 1) return parts;
      const merged: string[] = [];
      let buffer = parts[0];
      for (let i = 1; i < parts.length; i++) {
        const combined = buffer + ' ' + parts[i];
        if (combined.length <= MAX_SUBTITLE_LENGTH) buffer = combined;
        else { merged.push(buffer); buffer = parts[i]; }
      }
      if (buffer) merged.push(buffer);
      return merged;
    }

    function splitAtConjunctions(text: string): string[] {
      const parts = text.split(/\s+(?=(?:und|oder|aber|denn|sondern|doch|weil|dass|als|wenn|ob|obwohl)\s)/i)
        .map(s => s.trim()).filter(s => s.length > 0);
      return parts.length > 1 ? mergeFragments(parts) : [text];
    }

    for (const seg of segments) {
      const trimmed = seg.text.trim();
      if (!trimmed) continue;

      const segWords = findWordsInRange(seg.start, seg.end);
      const pieces = splitLongText(trimmed);

      if (pieces.length <= 1) {
        const timing = segWords.length > 0
          ? { start: segWords[0].start, end: segWords[segWords.length - 1].end }
          : { start: seg.start, end: seg.end };
        subtitles.push({ start: timing.start, dur: timing.end - timing.start, text: trimmed });
      } else {
        let wordCursor = 0;
        for (const piece of pieces) {
          const pieceTokens = piece.toLowerCase().replace(/[^a-zäöüß0-9\s]/g, '').trim().split(/\s+/).filter(t => t.length > 0);
          const tokenCount = pieceTokens.length;
          if (tokenCount === 0 || wordCursor >= segWords.length) {
            const ratio = piece.length / trimmed.length;
            const dur = (seg.end - seg.start) * ratio;
            subtitles.push({ start: seg.start, dur, text: piece });
            continue;
          }
          const startIdx = wordCursor;
          const endIdx = Math.min(wordCursor + tokenCount - 1, segWords.length - 1);
          wordCursor = endIdx + 1;
          subtitles.push({
            start: segWords[startIdx].start,
            dur: segWords[endIdx].end - segWords[startIdx].start,
            text: piece,
          });
        }
      }
    }

    return NextResponse.json({ subtitles });
  } catch (error: unknown) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Transkription fehlgeschlagen' },
      { status: 500 }
    );
  }
}

export const maxDuration = 60;
