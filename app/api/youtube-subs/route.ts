import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { execFile } from 'child_process';
import { readFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: { utf8: string }[];
}

function parseJson3(raw: string): { start: number; dur: number; text: string }[] {
  const data = JSON.parse(raw);
  return (data.events || [])
    .filter((e: Json3Event) => e.segs)
    .map((e: Json3Event) => ({
      start: (e.tStartMs || 0) / 1000,
      dur: (e.dDurationMs || 0) / 1000,
      text: (e.segs || []).map(s => s.utf8).join('').trim(),
    }))
    .filter((s: { text: string }) => s.text);
}

function runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const homedir = require('os').homedir();
  const envPath = [
    `${homedir}/.local/bin`,
    '/usr/local/bin',
    '/opt/homebrew/bin',
    process.env.PATH,
  ].join(':');

  return new Promise((resolve, reject) => {
    execFile('yt-dlp', args, {
      timeout: 30_000,
      maxBuffer: 5 * 1024 * 1024,
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

    const { videoId, lang } = await req.json();

    if (!videoId) {
      return NextResponse.json({ error: 'Video ID ist erforderlich' }, { status: 400 });
    }

    const targetLang = lang || 'de';

    // Create a temp directory for the subtitle file
    const tmpDir = await mkdtemp(join(tmpdir(), 'yt-subs-'));
    const outputTemplate = join(tmpDir, 'subs');

    try {
      const { readdir } = await import('fs/promises');
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

      // Fetch video metadata (title, duration, thumbnail)
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

      const findSubFile = async () => {
        const files = await readdir(tmpDir);
        return files.find(f => f.endsWith('.json3'));
      };

      // yt-dlp --sub-lang uses REGEX, not glob! "de.*" matches de, de-DE, de-AT etc.
      const langPattern = `${targetLang}.*`;

      // 1) Try manual subtitles first
      try {
        await runYtDlp([
          '--no-warnings', '--write-sub',
          '--sub-lang', langPattern,
          '--sub-format', 'json3',
          '--skip-download',
          '-o', outputTemplate, videoUrl,
        ]);
      } catch { /* yt-dlp may error, that's fine */ }

      let subFile = await findSubFile();

      // 2) If no manual subs found, try auto-generated
      if (!subFile) {
        try {
          await runYtDlp([
            '--no-warnings', '--write-auto-sub',
            '--sub-lang', langPattern,
            '--sub-format', 'json3',
            '--skip-download',
            '-o', outputTemplate, videoUrl,
          ]);
        } catch { /* ignore */ }
        subFile = await findSubFile();
      }

      if (!subFile) {
        return NextResponse.json(
          { error: 'Keine Untertitel für dieses Video gefunden. Prüfen Sie, ob das Video Untertitel hat.' },
          { status: 404 }
        );
      }

      const raw = await readFile(join(tmpDir, subFile), 'utf-8');
      const subtitles = parseJson3(raw);

      if (subtitles.length === 0) {
        return NextResponse.json(
          { error: 'Untertitel-Datei war leer.' },
          { status: 404 }
        );
      }

      return NextResponse.json({ subtitles, videoTitle, videoDuration, videoThumbnail });
    } finally {
      // Cleanup temp directory
      try {
        const { readdir: rd, rm } = await import('fs/promises');
        const files = await rd(tmpDir);
        for (const f of files) await unlink(join(tmpDir, f));
        await rm(tmpDir, { recursive: true, force: true });
      } catch { /* ignore cleanup errors */ }
    }
  } catch (error: unknown) {
    console.error('Error fetching YouTube captions:', error);
    return NextResponse.json(
      { error: 'Untertitel konnten nicht geladen werden. Stellen Sie sicher, dass yt-dlp installiert ist und die Video-ID korrekt ist.' },
      { status: 500 }
    );
  }
}
