'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface SavedSentence {
  lessonId: string;
  lessonTitle: string;
  lessonSlug: string;
  lessonLevel: string;
  youtubeId?: string;
  sentenceIndex: number;
  text: string;
  start: number;
  dur: number;
  isCompleted: boolean;
}

const LEVEL_COLORS: Record<string, string> = {
  A1: '#22c55e',
  A2: '#14b8a6',
  B1: '#38bdf8',
  B2: '#a855f7',
  C1: '#f472b6',
  C2: '#fb923c',
};

const LEVEL_SHADOWS: Record<string, string> = {
  A1: '#15803d',
  A2: '#0f766e',
  B1: '#0369a1',
  B2: '#7e22ce',
  C1: '#be185d',
  C2: '#c2410c',
};

const LEVEL_EMOJI: Record<string, string> = {
  A1: '🌱',
  A2: '🌊',
  B1: '💧',
  B2: '⚡',
  C1: '🌸',
  C2: '🔥',
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function SavedLessonPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const lessonId = params.lessonId as string;

  const [sentences, setSentences] = useState<SavedSentence[]>([]);
  const [loading, setLoading] = useState(true);
  const [removingKeys, setRemovingKeys] = useState<Set<string>>(new Set());
  const [playingIndex, setPlayingIndex] = useState<number | null>(null);

  // YouTube player refs
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const ytReadyRef = useRef(false);
  const ytTimeRef = useRef<number>(0);
  const ytStateRef = useRef<number>(-1);
  const autoPauseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPauseFallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSaved = useCallback(async () => {
    try {
      const res = await fetch('/api/saved-sentences', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          const filtered = data.filter((s: SavedSentence) => s.lessonId === lessonId);
          filtered.sort((a: SavedSentence, b: SavedSentence) => a.sentenceIndex - b.sentenceIndex);
          setSentences(filtered);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [lessonId]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status === 'authenticated') {
      fetchSaved();
    }
  }, [status, router, fetchSaved]);

  // YouTube postMessage setup
  const initYtListening = useCallback(() => {
    if (!ytIframeRef.current?.contentWindow) return;
    ytIframeRef.current.contentWindow.postMessage(
      JSON.stringify({ event: 'listening', id: 'diktat-saved' }),
      'https://www.youtube.com'
    );
    ytReadyRef.current = true;
  }, []);

  const handleYtIframeLoad = useCallback(() => {
    setTimeout(() => initYtListening(), 500);
    setTimeout(() => initYtListening(), 1500);
  }, [initYtListening]);

  // Listen for YouTube messages
  useEffect(() => {
    const youtubeId = sentences[0]?.youtubeId;
    if (!youtubeId) return;

    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!ytReadyRef.current) initYtListening();
        if (data.event === 'onStateChange' || data.info?.playerState !== undefined) {
          const state = data.info?.playerState ?? data.info;
          ytStateRef.current = state;
        }
        if (data.event === 'initialDelivery' || data.event === 'infoDelivery') {
          if (data.info?.currentTime !== undefined) ytTimeRef.current = data.info.currentTime;
          if (data.info?.playerState !== undefined) {
            ytStateRef.current = data.info.playerState;
          }
        }
      } catch { /* ignore non-JSON */ }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sentences, initYtListening]);

  // Poll YouTube time
  const ytCommand = useCallback((func: string, args?: unknown[]) => {
    if (!ytIframeRef.current?.contentWindow) return;
    ytIframeRef.current.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func, args: args || [] }),
      'https://www.youtube.com'
    );
  }, []);

  useEffect(() => {
    const youtubeId = sentences[0]?.youtubeId;
    if (!youtubeId) return;
    const interval = setInterval(() => {
      ytCommand('getCurrentTime');
      ytCommand('getPlayerState');
    }, 150);
    return () => clearInterval(interval);
  }, [sentences, ytCommand]);

  // Play a specific sentence
  const playSentence = useCallback((sentence: SavedSentence) => {
    if (!sentence.youtubeId) return;

    // Clear previous timers
    if (autoPauseTimer.current) { clearInterval(autoPauseTimer.current); autoPauseTimer.current = null; }
    if (autoPauseFallback.current) { clearTimeout(autoPauseFallback.current); autoPauseFallback.current = null; }

    setPlayingIndex(sentence.sentenceIndex);

    ytCommand('seekTo', [sentence.start, true]);
    ytCommand('playVideo');

    const endTime = sentence.start + sentence.dur + 0.3;
    const durationMs = (sentence.dur + 0.5) * 1000;

    autoPauseTimer.current = setInterval(() => {
      if (ytTimeRef.current >= endTime) {
        ytCommand('pauseVideo');
        setPlayingIndex(null);
        if (autoPauseTimer.current) { clearInterval(autoPauseTimer.current); autoPauseTimer.current = null; }
        if (autoPauseFallback.current) { clearTimeout(autoPauseFallback.current); autoPauseFallback.current = null; }
      }
    }, 80);

    autoPauseFallback.current = setTimeout(() => {
      ytCommand('pauseVideo');
      setPlayingIndex(null);
      if (autoPauseTimer.current) { clearInterval(autoPauseTimer.current); autoPauseTimer.current = null; }
      autoPauseFallback.current = null;
    }, durationMs);
  }, [ytCommand]);

  const handleRemoveBookmark = useCallback(async (sentenceIndex: number) => {
    const key = `${lessonId}-${sentenceIndex}`;
    setRemovingKeys(prev => new Set(prev).add(key));

    const remainingIndices = sentences
      .filter(s => s.sentenceIndex !== sentenceIndex)
      .map(s => s.sentenceIndex);

    try {
      const res = await fetch('/api/progress/bookmarks', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lessonId,
          bookmarkedIndices: remainingIndices,
        }),
      });

      if (res.ok) {
        setSentences(prev => prev.filter(s => s.sentenceIndex !== sentenceIndex));
      }
    } catch {
      // ignore
    } finally {
      setRemovingKeys(prev => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [sentences, lessonId]);

  if (status === 'loading' || loading) {
    return (
      <div className="loading">
        <div className="loading-cute">
          <span className="loading-mascot">★</span>
          <div className="loading-dots">
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
          <span className="loading-text">Sätze werden geladen…</span>
        </div>
      </div>
    );
  }

  // If no sentences found for this lesson
  if (sentences.length === 0 && !loading) {
    return (
      <div className="home-page">
        <div className="container">
          <div className="empty-state">
            <span className="empty-state-icon">🔖</span>
            <p className="empty-state-text">Keine gespeicherten Sätze in dieser Lektion</p>
            <Link href="/saved" className="btn btn-primary" style={{ marginTop: '1rem' }}>
              ← Zurück zur Übersicht
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const first = sentences[0];
  const levelColor = LEVEL_COLORS[first.lessonLevel] || '#22c55e';
  const levelShadow = LEVEL_SHADOWS[first.lessonLevel] || '#15803d';
  const levelEmoji = LEVEL_EMOJI[first.lessonLevel] || '📝';
  const completedCount = sentences.filter(s => s.isCompleted).length;
  const completedPct = sentences.length > 0 ? Math.round((completedCount / sentences.length) * 100) : 0;
  const youtubeId = first.youtubeId;

  return (
    <div className="home-page">
      <div className="container">
        {/* Hidden YouTube player */}
        {youtubeId && (
          <div className="saved-hidden-player">
            <iframe
              ref={ytIframeRef}
              src={`https://www.youtube.com/embed/${youtubeId}?enablejsapi=1&origin=${
                typeof window !== 'undefined' ? window.location.origin : ''
              }&controls=0&modestbranding=1&rel=0`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              title="Hidden Player"
              onLoad={handleYtIframeLoad}
            />
          </div>
        )}

        {/* Back navigation */}
        <Link href="/saved" className="saved-detail-back">
          ← Alle gespeicherten Lektionen
        </Link>

        {/* Lesson header card */}
        <div
          className="saved-detail-header"
          style={{
            '--card-glow-color': levelColor,
            '--card-shadow-color': levelShadow,
          } as React.CSSProperties}
        >
          <div className="saved-detail-header-top">
            <span
              className="saved-lesson-level"
              style={{
                background: levelColor,
                borderColor: levelShadow,
                boxShadow: `2px 2px 0 ${levelShadow}`,
              }}
            >
              {levelEmoji} {first.lessonLevel}
            </span>
            <h2 className="saved-detail-title">{first.lessonTitle}</h2>
            <Link
              href={`/lesson/${first.lessonSlug}`}
              className="saved-lesson-go-btn"
              title="Zur Lektion"
            >
              →
            </Link>
          </div>

          <div className="saved-detail-stats">
            <span className="saved-detail-stat">
              🔖 {sentences.length} Sätze gespeichert
            </span>
            {completedCount > 0 && (
              <span className="saved-detail-stat saved-detail-stat-completed">
                ✓ {completedCount}/{sentences.length} erledigt ({completedPct}%)
              </span>
            )}
          </div>

          {/* Progress bar */}
          <div className="saved-detail-progress-bar">
            <div
              className="saved-detail-progress-fill"
              style={{
                width: `${completedPct}%`,
                background: completedPct >= 90
                  ? `linear-gradient(90deg, ${levelColor} 0%, #a3e635 100%)`
                  : `linear-gradient(90deg, ${levelColor} 0%, ${levelShadow} 100%)`,
                boxShadow: `0 0 8px ${levelColor}66`,
              }}
            />
          </div>
        </div>

        {/* Sentences list */}
        <div className="saved-detail-sentences">
          {sentences.map((s) => {
            const key = `${s.lessonId}-${s.sentenceIndex}`;
            const isRemoving = removingKeys.has(key);
            const isCurrentlyPlaying = playingIndex === s.sentenceIndex;

            return (
              <div
                key={key}
                className={`saved-sentence ${s.isCompleted ? 'saved-sentence-completed' : ''} ${isRemoving ? 'saved-sentence-removing' : ''} ${isCurrentlyPlaying ? 'saved-sentence-playing' : ''}`}
                onClick={() => playSentence(s)}
                style={{ cursor: youtubeId ? 'pointer' : 'default' }}
              >
                <div className="saved-sentence-header">
                  <span className="saved-sentence-number">
                    #{s.sentenceIndex + 1}
                  </span>
                  <span className="saved-sentence-time">
                    ⏱️ {formatTime(s.start)}
                  </span>
                  {isCurrentlyPlaying && (
                    <span className="saved-sentence-playing-badge">🔊</span>
                  )}
                  {s.isCompleted && (
                    <span className="saved-sentence-check">✓</span>
                  )}
                  <div className="saved-sentence-actions">
                    <button
                      className="saved-sentence-action-btn saved-sentence-play-btn"
                      onClick={(e) => { e.stopPropagation(); playSentence(s); }}
                      title="Abspielen"
                    >
                      {isCurrentlyPlaying ? '⏸' : '▶'}
                    </button>
                    <button
                      className="saved-sentence-action-btn saved-sentence-remove-btn"
                      onClick={(e) => { e.stopPropagation(); handleRemoveBookmark(s.sentenceIndex); }}
                      disabled={isRemoving}
                      title="Lesezeichen entfernen"
                    >
                      {isRemoving ? '⏳' : '✕'}
                    </button>
                  </div>
                </div>
                <p className="saved-sentence-text">{s.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
