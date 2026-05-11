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
      const outputTemplate = join(tmpDir, 'audio');
      try {
        await runYtDlp([
          '--no-warnings',
          '-x', '--audio-format', 'mp3',
          '--audio-quality', '5',
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
        const response = await openai.audio.transcriptions.create({
          file: whisperFile,
          model: 'whisper-1',
          language: 'de',
          response_format: 'verbose_json',
          timestamp_granularities: ['segment'],
        });

        const subtitles = (response.segments || []).map((seg: { start: number; end: number; text: string }) => ({
          start: seg.start,
          dur: seg.end - seg.start,
          text: seg.text.trim(),
        })).filter((s: { text: string }) => s.text.length > 0);

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

