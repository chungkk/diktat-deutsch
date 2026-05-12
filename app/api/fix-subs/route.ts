import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

interface Subtitle {
  start: number;
  dur: number;
  text: string;
}

/**
 * Parse the original subtitle text file.
 * Format: lines of text separated by empty lines.
 * Each non-empty line is one subtitle line.
 */
function parseOriginalText(content: string): string[] {
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
}

/**
 * Redistribute original text lines onto YouTube subtitle timing slots.
 * 
 * The core idea:
 * 1. YT subs have good timing (start/dur) but bad text
 * 2. Original file has perfect text but no timing
 * 3. We map the total character count of original text proportionally
 *    onto the YT timing slots, then assign original lines to the
 *    timing slot where they "land"
 * 
 * This avoids fragile fuzzy matching and instead uses a proportional
 * character-position approach.
 */
function fixSubtitles(ytSubs: Subtitle[], originalLines: string[]): Subtitle[] {
  if (ytSubs.length === 0 || originalLines.length === 0) {
    return ytSubs;
  }

  // Total character counts
  const ytTotalChars = ytSubs.reduce((sum, s) => sum + s.text.length, 0);
  const origTotalChars = originalLines.reduce((sum, l) => sum + l.length, 0);

  if (ytTotalChars === 0 || origTotalChars === 0) return ytSubs;

  // Build cumulative character positions for YT subs
  // Each YT sub covers a range of the total character space
  const ytRanges: { start: number; end: number; subIdx: number }[] = [];
  let ytCumChars = 0;
  for (let i = 0; i < ytSubs.length; i++) {
    const len = ytSubs[i].text.length;
    ytRanges.push({
      start: ytCumChars,
      end: ytCumChars + len,
      subIdx: i,
    });
    ytCumChars += len;
  }

  // Map each original line to a position in the YT character space
  // using proportional scaling
  const scale = ytTotalChars / origTotalChars;

  // For each YT sub slot, collect the original lines that fall into it
  const slotTexts: string[][] = ytSubs.map(() => []);

  let origCumChars = 0;
  for (const line of originalLines) {
    // Center position of this original line in original character space
    const origCenter = origCumChars + line.length / 2;
    // Map to YT character space
    const ytPosition = origCenter * scale;

    // Find which YT slot this falls into
    let bestSlot = 0;
    for (let i = 0; i < ytRanges.length; i++) {
      if (ytPosition >= ytRanges[i].start && ytPosition < ytRanges[i].end) {
        bestSlot = i;
        break;
      }
      if (ytPosition >= ytRanges[i].end) {
        bestSlot = i + 1;
      }
    }
    // Clamp to valid range
    bestSlot = Math.min(bestSlot, ytSubs.length - 1);

    slotTexts[bestSlot].push(line);
    origCumChars += line.length;
  }

  // Build result: use YT timing with original text
  const result: Subtitle[] = [];
  for (let i = 0; i < ytSubs.length; i++) {
    const texts = slotTexts[i];
    if (texts.length > 0) {
      result.push({
        start: ytSubs[i].start,
        dur: ytSubs[i].dur,
        text: texts.join(' '),
      });
    } else {
      // No original text mapped here — this might be a music/noise segment
      // or just a gap. Skip it to avoid empty entries.
      // But we should keep timing structure, so include with original YT text
      // marked as possibly noise
      const ytText = ytSubs[i].text.trim();
      // Skip if it's just noise markers
      if (ytText && !/^\[.*\]$/.test(ytText)) {
        result.push({
          start: ytSubs[i].start,
          dur: ytSubs[i].dur,
          text: ytText,
        });
      }
    }
  }

  return result;
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user as { role?: string })?.role !== 'admin') {
      return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const subtitlesJson = formData.get('subtitles') as string | null;

    if (!file || !subtitlesJson) {
      return NextResponse.json(
        { error: 'Datei und Untertitel sind erforderlich' },
        { status: 400 }
      );
    }

    const originalText = await file.text();
    const ytSubs: Subtitle[] = JSON.parse(subtitlesJson);

    if (ytSubs.length === 0) {
      return NextResponse.json(
        { error: 'Keine YouTube-Untertitel zum Korrigieren vorhanden' },
        { status: 400 }
      );
    }

    const originalLines = parseOriginalText(originalText);

    if (originalLines.length === 0) {
      return NextResponse.json(
        { error: 'Die hochgeladene Datei enthält keinen Text' },
        { status: 400 }
      );
    }

    const fixedSubs = fixSubtitles(ytSubs, originalLines);

    return NextResponse.json({
      subtitles: fixedSubs,
      stats: {
        ytSubCount: ytSubs.length,
        originalLineCount: originalLines.length,
        fixedSubCount: fixedSubs.length,
      },
    });
  } catch (error: unknown) {
    console.error('Error fixing subtitles:', error);
    return NextResponse.json(
      { error: `Fehler beim Korrigieren: ${(error as Error).message?.slice(0, 300)}` },
      { status: 500 }
    );
  }
}
