import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { execFile } from 'child_process';
import { readFile, unlink, mkdtemp } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

interface Json3Segment {
  utf8: string;
  tOffsetMs?: number;
}

interface Json3Event {
  tStartMs?: number;
  dDurationMs?: number;
  segs?: Json3Segment[];
}

function parseJson3(raw: string): { start: number; dur: number; text: string }[] {
  const data = JSON.parse(raw);

  // Step 1: extract all events that have segments, compute accurate dur
  const rawSubs: { start: number; dur: number; text: string }[] = [];

  for (const e of (data.events || []) as Json3Event[]) {
    if (!e.segs) continue;

    const text = e.segs.map(s => s.utf8).join('').trim()
      // Remove bracketed annotations like [Musik], [Music], [Applaus], etc.
      .replace(/\[.*?\]/g, '').trim();
    if (!text) continue;

    const startMs = e.tStartMs || 0;
    const origDurMs = e.dDurationMs || 0;

    // Use word-level tOffsetMs to compute actual spoken duration.
    // Auto-generated subs inflate dDurationMs to cover the next line too.
    // The last segment's tOffsetMs tells when the last word STARTS speaking.
    // Add ~500ms for the final word's length to get true end time.
    let lastOffsetMs = 0;
    for (const seg of e.segs) {
      if (seg.tOffsetMs && seg.tOffsetMs > lastOffsetMs) {
        lastOffsetMs = seg.tOffsetMs;
      }
    }

    // If we have word-level offsets, use them; otherwise fall back to original dur
    const durMs = lastOffsetMs > 0
      ? Math.min(lastOffsetMs + 500, origDurMs)
      : origDurMs;

    rawSubs.push({
      start: startMs / 1000,
      dur: durMs / 1000,
      text,
    });
  }

  // Step 2: cap duration so it never exceeds the next subtitle's start time
  for (let i = 0; i < rawSubs.length - 1; i++) {
    const gap = rawSubs[i + 1].start - rawSubs[i].start;
    if (gap > 0 && gap < rawSubs[i].dur) {
      rawSubs[i].dur = gap;
    }
  }

  return rawSubs;
}

function runYtDlp(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const homedir = require('os').homedir();
  const envPath = [
    `${homedir}/.local/bin`,
    '/usr/local/bin',
    '/opt/homebrew/bin',
    process.env.PATH,
  ].join(':');

  // Force IPv4 and set YouTube player client to avoid PO Token hang
  const fullArgs = [
    '--force-ipv4',
    '--extractor-args', 'youtube:player_client=default',
    ...args,
  ];

  return new Promise((resolve, reject) => {
    execFile('yt-dlp', fullArgs, {
      timeout: 60_000,
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
