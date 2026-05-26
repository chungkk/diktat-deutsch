import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { execFile } from 'child_process';
import { readFile, unlink, mkdtemp, readdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import OpenAI from 'openai';

function runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const homedir = require('os').homedir();
  const envPath = [
    `${homedir}/.local/bin`,
    '/usr/local/bin',
    '/opt/homebrew/bin',
    process.env.PATH,
  ].join(':');

  const fullArgs = [
    '--force-ipv4',
    '--extractor-args', 'youtube:player_client=default',
    ...args,
  ];

  return new Promise((resolve, reject) => {
    execFile('yt-dlp', fullArgs, {
      timeout: 120_000,
      maxBuffer: 10 * 1024 * 1024,
      env: { ...process.env, PATH: envPath },
    }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve({ stdout, stderr });
    });
  });
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role?: string })?.role !== 'admin') {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    const { videoId } = await req.json();

    if (!videoId) {
      return NextResponse.json({ error: 'Video ID ist erforderlich' }, { status: 400 });
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const tmpDir = await mkdtemp(join(tmpdir(), 'yt-whisper-'));

    try {
      // 1) Fetch video metadata (title, duration, thumbnail)
      let videoTitle = '';
      let videoDuration = 0;
      let videoThumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      try {
        const metaResult = await runYtDlp([
          '--no-warnings', '--dump-json', '--skip-download', videoUrl,
        ]);
        const meta = JSON.parse(metaResult.stdout);
        videoTitle = meta.title || meta.fulltitle || '';
        videoDuration = meta.duration || 0;
        if (meta.thumbnail) videoThumbnail = meta.thumbnail;
      } catch (metaErr) {
        console.warn('Metadata fetch failed (continuing):', metaErr);
      }

      // 2) Download audio only — use output template without extension,
      //    yt-dlp will add the correct extension after conversion
      //    Quality 0 = best (important for Whisper accuracy — low quality causes word loss)
      const outputTemplate = join(tmpDir, 'audio');
      try {
        await runYtDlp([
          '--no-warnings',
          '-x', '--audio-format', 'mp3',
          '--audio-quality', '0',
          '-o', `${outputTemplate}.%(ext)s`,
          videoUrl,
        ]);
      } catch (dlErr) {
        console.error('yt-dlp audio download failed:', dlErr);
        return NextResponse.json(
          { error: `Audio-Download fehlgeschlagen: ${(dlErr as Error).message?.slice(0, 200)}` },
          { status: 500 }
        );
      }

      // Find the downloaded audio file (yt-dlp may name it .mp3, .m4a, .opus, etc.)
      const files = await readdir(tmpDir);
      const audioFile = files.find(f => f.startsWith('audio'));
      if (!audioFile) {
        return NextResponse.json(
          { error: 'Audio-Datei wurde nicht erstellt. Prüfen Sie, ob ffmpeg installiert ist.' },
          { status: 500 }
        );
      }

      const audioPath = join(tmpDir, audioFile);

      // 3) Read audio file and send to Whisper
      const audioBuffer = await readFile(audioPath);
      console.log(`Audio downloaded: ${audioFile} (${(audioBuffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);

      // Whisper has a 25MB limit
      if (audioBuffer.byteLength > 25 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'Audio-Datei ist zu groß für Whisper (max. 25 MB). Versuchen Sie ein kürzeres Video.' },
          { status: 400 }
        );
      }

      // Determine mime type from extension
      const ext = audioFile.split('.').pop() || 'mp3';
      const mimeMap: Record<string, string> = {
        mp3: 'audio/mpeg', m4a: 'audio/mp4', opus: 'audio/opus',
        ogg: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm',
      };
      const mime = mimeMap[ext] || 'audio/mpeg';

      const whisperFile = new File([audioBuffer], `audio.${ext}`, { type: mime });

      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // Use BOTH segment + word timestamps:
        // - Segments give complete, natural sentences with proper punctuation
        // - Words give precise timestamps per word
        // Strategy: keep segment text structure, but use word timestamps for accurate timing
        const response = await openai.audio.transcriptions.create({
          file: whisperFile,
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

        // Find the word timestamps that fall within a time range
        function findWordsInRange(segStart: number, segEnd: number): TimedWord[] {
          return allWords.filter(w => w.start >= segStart - 0.05 && w.end <= segEnd + 0.05);
        }

        // Given a substring and words for the segment, find the best matching words
        // to determine the precise start/end time of that substring
        function getTimingForText(text: string, segWords: TimedWord[], segStart: number, segEnd: number): { start: number; end: number } {
          if (segWords.length === 0) return { start: segStart, end: segEnd };

          // Normalize text for matching
          const textNorm = text.toLowerCase().replace(/[^a-zäöüß0-9\s]/g, '').trim();
          const textTokens = textNorm.split(/\s+/).filter(t => t.length > 0);

          if (textTokens.length === 0) return { start: segStart, end: segEnd };

          // Find the first and last matching word by scanning
          const firstToken = textTokens[0];
          const lastToken = textTokens[textTokens.length - 1];

          let firstWordIdx = -1;
          let lastWordIdx = -1;

          // Find first matching word
          for (let i = 0; i < segWords.length; i++) {
            const wNorm = segWords[i].word.toLowerCase().replace(/[^a-zäöüß0-9]/g, '');
            if (wNorm === firstToken || wNorm.startsWith(firstToken) || firstToken.startsWith(wNorm)) {
              firstWordIdx = i;
              break;
            }
          }

          // Find last matching word (search from end)
          for (let i = segWords.length - 1; i >= 0; i--) {
            const wNorm = segWords[i].word.toLowerCase().replace(/[^a-zäöüß0-9]/g, '');
            if (wNorm === lastToken || wNorm.startsWith(lastToken) || lastToken.startsWith(wNorm)) {
              lastWordIdx = i;
              break;
            }
          }

          return {
            start: firstWordIdx >= 0 ? segWords[firstWordIdx].start : segStart,
            end: lastWordIdx >= 0 ? segWords[lastWordIdx].end : segEnd,
          };
        }

        // Split long segment text into shorter pieces at natural break points
        function splitLongText(text: string): string[] {
          // First split on sentence-ending punctuation
          const sentences = text
            .split(/(?<=[.!?])\s+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);

          const result: string[] = [];
          for (const sentence of sentences) {
            if (sentence.length <= MAX_SUBTITLE_LENGTH) {
              result.push(sentence);
              continue;
            }

            // Split at commas
            const commaParts = sentence
              .split(/(?<=,)\s*/)
              .map(s => s.trim())
              .filter(s => s.length > 0);

            // Merge small comma fragments
            const afterComma = mergeFragments(commaParts);

            // Split remaining long pieces at conjunctions
            for (const piece of afterComma) {
              if (piece.length <= MAX_SUBTITLE_LENGTH) {
                result.push(piece);
              } else {
                result.push(...splitAtConjunctions(piece));
              }
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
            if (combined.length <= MAX_SUBTITLE_LENGTH) {
              buffer = combined;
            } else {
              merged.push(buffer);
              buffer = parts[i];
            }
          }
          if (buffer) merged.push(buffer);
          return merged;
        }

        function splitAtConjunctions(text: string): string[] {
          const parts = text
            .split(/\s+(?=(?:und|oder|aber|denn|sondern|doch|weil|dass|als|wenn|ob|obwohl)\s)/i)
            .map(s => s.trim())
            .filter(s => s.length > 0);
          return parts.length > 1 ? mergeFragments(parts) : [text];
        }

        // Process each segment
        for (const seg of segments) {
          const trimmed = seg.text.trim();
          if (!trimmed) continue;

          const segWords = findWordsInRange(seg.start, seg.end);
          const pieces = splitLongText(trimmed);

          if (pieces.length <= 1) {
            // Single piece — use word timestamps if available
            const timing = segWords.length > 0
              ? { start: segWords[0].start, end: segWords[segWords.length - 1].end }
              : { start: seg.start, end: seg.end };
            subtitles.push({ start: timing.start, dur: timing.end - timing.start, text: trimmed });
          } else {
            // Multiple pieces — find precise timing for each piece using word timestamps
            // Track which words have been "consumed" so each piece gets unique words
            let wordCursor = 0;

            for (const piece of pieces) {
              const pieceTokens = piece.toLowerCase().replace(/[^a-zäöüß0-9\s]/g, '').trim().split(/\s+/).filter(t => t.length > 0);
              const tokenCount = pieceTokens.length;

              if (tokenCount === 0 || wordCursor >= segWords.length) {
                // Fallback: proportional timing from segment
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

        if (subtitles.length === 0) {
          return NextResponse.json(
            { error: 'Whisper konnte keine Sprache im Video erkennen.' },
            { status: 404 }
          );
        }

        return NextResponse.json({ subtitles, videoTitle, videoDuration, videoThumbnail });
      } catch (whisperErr) {
        console.error('Whisper API error:', whisperErr);
        const msg = (whisperErr as Error).message || '';
        return NextResponse.json(
          { error: `Whisper API Fehler: ${msg.slice(0, 300)}` },
          { status: 500 }
        );
      }
    } finally {
      // Cleanup temp directory
      try {
        const tmpFiles = await readdir(tmpDir);
        for (const f of tmpFiles) await unlink(join(tmpDir, f)).catch(() => {});
        const { rm } = await import('fs/promises');
        await rm(tmpDir, { recursive: true, force: true });
      } catch { /* ignore cleanup errors */ }
    }
  } catch (error: unknown) {
    console.error('YouTube Whisper transcription error:', error);
    return NextResponse.json(
      { error: `Unbekannter Fehler: ${(error as Error).message?.slice(0, 300)}` },
      { status: 500 }
    );
  }
}

// Allow longer execution for audio download + transcription
export const maxDuration = 120;

