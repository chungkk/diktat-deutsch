import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { execFile } from 'child_process';

interface VideoEntry {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  url: string;
}

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
      maxBuffer: 20 * 1024 * 1024,
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

    const { channelUrl, maxResults } = await req.json();

    if (!channelUrl) {
      return NextResponse.json({ error: 'Channel URL ist erforderlich' }, { status: 400 });
    }

    // Normalize the URL — yt-dlp can handle channel URLs, /videos, /shorts, etc.
    let url = channelUrl.trim();

    // If they pasted a tab URL like @channel/shorts, ensure it's a full URL
    if (!url.startsWith('http')) {
      url = `https://www.youtube.com/${url}`;
    }

    const limit = Math.min(maxResults || 50, 200);

    // Use yt-dlp to list videos from the channel
    // --flat-playlist: don't download, just list
    // --dump-json: output JSON for each entry
    // --playlist-end: limit number of results
    const result = await runYtDlp([
      '--flat-playlist',
      '--dump-json',
      '--playlist-end', String(limit),
      '--no-warnings',
      url,
    ]);

    const videos: VideoEntry[] = [];
    const lines = result.stdout.trim().split('\n');

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        // yt-dlp flat playlist gives us id, title, duration, etc.
        const videoId = entry.id || entry.url;
        if (!videoId) continue;

        videos.push({
          id: videoId,
          title: entry.title || entry.fulltitle || `Video ${videoId}`,
          duration: entry.duration || 0,
          thumbnail: entry.thumbnails?.[entry.thumbnails.length - 1]?.url
            || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          url: entry.url?.startsWith('http')
            ? entry.url
            : `https://www.youtube.com/watch?v=${videoId}`,
        });
      } catch {
        // Skip unparseable lines
      }
    }

    if (videos.length === 0) {
      return NextResponse.json(
        { error: 'Keine Videos gefunden. Überprüfe die Channel-URL.' },
        { status: 404 }
      );
    }

    return NextResponse.json({ videos, total: videos.length });
  } catch (error: unknown) {
    console.error('Error fetching channel videos:', error);
    return NextResponse.json(
      { error: 'Videos konnten nicht geladen werden. Stelle sicher, dass yt-dlp installiert ist und die URL korrekt ist.' },
      { status: 500 }
    );
  }
}
