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

    // Use WORD-level timestamps for precise subtitle alignment
    const response = await openai.audio.transcriptions.create({
      file: file,
      model: 'whisper-1',
      language: 'de',
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
      temperature: 0,
      prompt: 'Hallo und herzlich willkommen. Dies ist eine deutsche Sendung. Bitte transkribieren Sie alles genau, einschließlich aller Wörter, Satzzeichen und Pausen.',
    });

    // ── Build subtitles from word-level timestamps ──
    const MAX_SUBTITLE_LENGTH = 80;
    const subtitles: { start: number; dur: number; text: string }[] = [];

    interface TimedWord { word: string; start: number; end: number }
    const words: TimedWord[] = (
      (response as unknown as { words?: TimedWord[] }).words || []
    ).filter(w => w.word && w.word.trim());

    if (words.length === 0) {
      // Fallback: use segments if available
      for (const seg of (response.segments || []) as { start: number; end: number; text: string }[]) {
        const trimmed = seg.text.trim();
        if (trimmed) subtitles.push({ start: seg.start, dur: seg.end - seg.start, text: trimmed });
      }
    } else {
      const CONJUNCTIONS = new Set([
        'und', 'oder', 'aber', 'denn', 'sondern', 'doch',
        'weil', 'dass', 'als', 'wenn', 'ob', 'obwohl',
      ]);

      function isBreakAfter(w: string): 'sentence' | 'comma' | null {
        if (/[.!?]$/.test(w)) return 'sentence';
        if (/,$/.test(w)) return 'comma';
        return null;
      }

      function isBreakBefore(w: string): boolean {
        return CONJUNCTIONS.has(w.toLowerCase().replace(/[^a-zäöüß]/g, ''));
      }

      function flush(group: TimedWord[]) {
        if (group.length === 0) return;
        const text = group.map(w => w.word).join(' ').trim();
        if (!text) return;
        subtitles.push({
          start: group[0].start,
          dur: group[group.length - 1].end - group[0].start,
          text,
        });
      }

      let currentGroup: TimedWord[] = [];
      let currentLen = 0;

      for (let i = 0; i < words.length; i++) {
        const w = words[i];
        const wordText = w.word.trim();
        const addedLen = currentLen === 0 ? wordText.length : wordText.length + 1;

        if (currentLen + addedLen > MAX_SUBTITLE_LENGTH && currentGroup.length > 0) {
          flush(currentGroup);
          currentGroup = [];
          currentLen = 0;
        }

        currentGroup.push(w);
        currentLen += addedLen;

        const breakType = isBreakAfter(wordText);
        if (breakType === 'sentence') {
          flush(currentGroup);
          currentGroup = [];
          currentLen = 0;
        } else if (breakType === 'comma' && currentLen >= 30) {
          flush(currentGroup);
          currentGroup = [];
          currentLen = 0;
        } else if (i + 1 < words.length && isBreakBefore(words[i + 1].word.trim()) && currentLen >= 25) {
          flush(currentGroup);
          currentGroup = [];
          currentLen = 0;
        }
      }

      flush(currentGroup);
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
