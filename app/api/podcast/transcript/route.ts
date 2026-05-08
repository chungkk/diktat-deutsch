import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import path from 'path';

interface TTMLWord {
  begin: string;
  end: string;
  text: string;
}

interface TTMLSubtitle {
  start: number;
  dur: number;
  text: string;
  speaker?: string;
}

function parseTTMLTime(timeStr: string): number {
  // Handle formats: "6.400", "1:06.887", "22:05.700"
  const parts = timeStr.split(':');
  if (parts.length === 1) {
    return parseFloat(parts[0]);
  } else if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
  } else if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
  }
  return 0;
}

function parseTTMLToSubtitles(ttmlContent: string): TTMLSubtitle[] {
  const subtitles: TTMLSubtitle[] = [];

  // Parse <p> elements with begin/end/speaker
  const pRegex = /<p\s+begin="([^"]+)"\s+end="([^"]+)"\s+ttm:agent="([^"]+)">([\s\S]*?)<\/p>/g;
  let match;

  while ((match = pRegex.exec(ttmlContent)) !== null) {
    const beginStr = match[1];
    const endStr = match[2];
    const speaker = match[3];
    const innerContent = match[4];

    const begin = parseTTMLTime(beginStr);
    const end = parseTTMLTime(endStr);
    const dur = end - begin;

    // Extract words from inner spans
    const words: TTMLWord[] = [];
    const wordRegex = /podcasts:unit="word">([^<]+)<\/span>/g;
    let wordMatch;
    while ((wordMatch = wordRegex.exec(innerContent)) !== null) {
      let text = wordMatch[1];
      // Decode HTML entities
      text = text
        .replace(/&#252;/g, 'ü')
        .replace(/&#228;/g, 'ä')
        .replace(/&#246;/g, 'ö')
        .replace(/&#223;/g, 'ß')
        .replace(/&#196;/g, 'Ä')
        .replace(/&#214;/g, 'Ö')
        .replace(/&#220;/g, 'Ü')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)));
      words.push({ begin: '', end: '', text });
    }

    const text = words.map(w => w.text).join(' ');
    if (text.trim()) {
      subtitles.push({ start: begin, dur, text, speaker });
    }
  }

  return subtitles;
}

// GET: fetch transcript for a podcast episode
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const episodeId = searchParams.get('episodeId');

    if (!episodeId) {
      return NextResponse.json({ error: 'episodeId parameter required' }, { status: 400 });
    }

    // Path to the FetchTranscript binary
    const toolDir = path.join(process.env.HOME || '', '.gemini/antigravity/scratch/apple-podcast-transcript-downloader');
    const fetchBin = path.join(toolDir, 'FetchTranscript');
    const outputFile = path.join(toolDir, `transcript_${episodeId}.ttml`);

    // Check if transcript already cached
    let ttmlContent: string;
    try {
      ttmlContent = await readFile(outputFile, 'utf-8');
    } catch {
      // Not cached, fetch it
      try {
        await new Promise<void>((resolve, reject) => {
          execFile(fetchBin, [episodeId, '--cache-bearer-token'], { cwd: toolDir, timeout: 30000 }, (error, _stdout, stderr) => {
            if (error) {
              // Check if it's a "no transcript available" error
              const msg = stderr || error.message || '';
              if (msg.includes('No related resources') || msg.includes('404')) {
                reject(new Error('NO_TRANSCRIPT'));
              } else {
                reject(error);
              }
            } else {
              resolve();
            }
          });
        });
        ttmlContent = await readFile(outputFile, 'utf-8');
      } catch (fetchError) {
        if (fetchError instanceof Error && fetchError.message === 'NO_TRANSCRIPT') {
          return NextResponse.json({
            error: 'Kein Transkript verfügbar — Apple hat für diese Folge noch kein automatisches Transkript erstellt.',
            noTranscript: true,
          }, { status: 404 });
        }
        // Try reading file anyway (FetchTranscript may exit with error but still write file)
        try {
          ttmlContent = await readFile(outputFile, 'utf-8');
        } catch {
          return NextResponse.json({
            error: 'Kein Transkript verfügbar — Apple hat für diese Folge noch kein automatisches Transkript erstellt.',
            noTranscript: true,
          }, { status: 404 });
        }
      }
    }

    // Parse TTML to subtitle format
    const subtitles = parseTTMLToSubtitles(ttmlContent);

    // Get episode info from query params (passed from client) or fallback
    const title = searchParams.get('title') || `Episode ${episodeId}`;
    const audioUrl = searchParams.get('audioUrl') || '';
    const artwork = searchParams.get('artwork') || '';
    const durationMs = parseInt(searchParams.get('durationMs') || '0');

    return NextResponse.json({
      episodeId,
      title,
      audioUrl,
      artwork,
      duration: durationMs > 0 ? durationMs / 1000 : 0,
      subtitles,
    });
  } catch (error) {
    console.error('Transcript API error:', error);
    return NextResponse.json({ error: 'Fehler beim Laden der Transkription' }, { status: 500 });
  }
}
