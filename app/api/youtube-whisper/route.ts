import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { execFile } from 'child_process';
import { readFile, unlink, mkdtemp } from 'fs/promises';
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
      } catch { /* metadata fetch failed, continue with defaults */ }

      // 2) Download audio only (best audio, convert to mp3 for Whisper compatibility)
      const audioPath = join(tmpDir, 'audio.mp3');
      await runYtDlp([
        '--no-warnings',
        '-x', '--audio-format', 'mp3',
        '--audio-quality', '5',  // medium quality, smaller file
        '-o', audioPath,
        videoUrl,
      ]);

      // 3) Read audio file and send to Whisper
      const audioBuffer = await readFile(audioPath);

      // Whisper has a 25MB limit — check file size
      if (audioBuffer.byteLength > 25 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'Audio-Datei ist zu groß für Whisper (max. 25 MB). Versuchen Sie ein kürzeres Video.' },
          { status: 400 }
        );
      }

      const audioFile = new File([audioBuffer], 'audio.mp3', { type: 'audio/mpeg' });

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await openai.audio.transcriptions.create({
        file: audioFile,
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
    } finally {
      // Cleanup temp directory
      try {
        const { readdir, rm } = await import('fs/promises');
        const files = await readdir(tmpDir);
        for (const f of files) await unlink(join(tmpDir, f)).catch(() => {});
        await rm(tmpDir, { recursive: true, force: true });
      } catch { /* ignore cleanup errors */ }
    }
  } catch (error: unknown) {
    console.error('YouTube Whisper transcription error:', error);
    return NextResponse.json(
      { error: 'Whisper-Transkription fehlgeschlagen. Stellen Sie sicher, dass OPENAI_API_KEY gesetzt ist.' },
      { status: 500 }
    );
  }
}

// Allow longer execution for audio download + transcription
export const maxDuration = 120;
