'use client';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';

interface Subtitle {
  start: number;
  dur: number;
  text: string;
  speaker?: string;
}

interface EpisodeData {
  episodeId: string;
  title: string;
  audioUrl: string;
  artwork: string;
  duration: number;
  subtitles: Subtitle[];
}

// Split subtitle text into tokens
function tokenize(text: string): string[] {
  return text.replace(/\n/g, ' ').split(/\s+/).filter(Boolean);
}

// All words are blanks in diktat mode
function pickBlanks(words: string[], mode: 50 | 100): Set<number> {
  const blanks = new Set<number>();
  if (mode === 100) {
    words.forEach((_, i) => blanks.add(i));
    return blanks;
  }
  for (let i = 0; i < words.length; i++) {
    if (words[i].replace(/[.,!?;:'"„"»«]/g, '').length <= 2) continue;
    if (i % 2 === 0) blanks.add(i);
  }
  if (blanks.size === 0 && words.length > 0) blanks.add(0);
  return blanks;
}

export default function PodcastEpisodePage() {
  const { episodeId } = useParams();
  const { status } = useSession();
  const router = useRouter();

  const [episode, setEpisode] = useState<EpisodeData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [blankInputs, setBlankInputs] = useState<Record<number, Record<number, string>>>({});
  const [blankResults, setBlankResults] = useState<Record<number, Record<number, 'correct' | 'incorrect'>>>({});
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [blankMode, setBlankMode] = useState<50 | 100>(100);
  const [peekingIndex, setPeekingIndex] = useState<number | null>(null);

  const [currentTime, setCurrentTime] = useState(0);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blankRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const subtitleListRef = useRef<HTMLDivElement | null>(null);
  const autoPauseTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Precompute tokens
  const subTokens = useMemo(() => {
    if (!episode) return [];
    return episode.subtitles.map((sub) => {
      const words = tokenize(sub.text);
      const blanks = pickBlanks(words, blankMode);
      return { words, blanks };
    });
  }, [episode, blankMode]);

  useEffect(() => {
    setBlankInputs({});
    setBlankResults({});
  }, [blankMode]);

  // Load episode
  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status !== 'authenticated') return;

    setLoading(true);
    setLoadError('');
    // All registered podcast show IDs  
    const SHOW_IDS = ['1568289553', '1489934613', '1455018378', '338219632'];

    // First try to find episode metadata from all registered shows
    const findEpisode = async () => {
      for (const showId of SHOW_IDS) {
        try {
          const res = await fetch(`/api/podcast?showId=${showId}&limit=200`);
          const listData = await res.json();
          const ep = listData.episodes?.find((e: { id: number }) => String(e.id) === String(episodeId));
          if (ep) return ep;
        } catch { /* try next show */ }
      }
      // Fallback: direct iTunes lookup for this specific episode
      try {
        const lookupRes = await fetch(`/api/podcast/lookup?episodeId=${episodeId}`);
        const lookupData = await lookupRes.json();
        if (lookupData.audioUrl) return lookupData;
      } catch { /* no fallback */ }
      return null;
    };

    findEpisode().then(ep => {
      const params = new URLSearchParams({ episodeId: String(episodeId) });
      if (ep) {
        params.set('title', ep.title || `Episode ${episodeId}`);
        params.set('audioUrl', ep.audioUrl);
        params.set('artwork', ep.artworkLarge || ep.artwork || '');
        params.set('durationMs', String(ep.durationMs || 0));
      }
      return fetch(`/api/podcast/transcript?${params.toString()}`);
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setLoadError(data.error);
          setLoading(false);
          return;
        }
        setEpisode(data);
        setLoading(false);
      })
      .catch(err => {
        setLoadError(err.message);
        setLoading(false);
      });
  }, [episodeId, status, router]);

  // Time tracking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [episode]);

  const seekToSubtitle = useCallback((index: number) => {
    if (!episode || !audioRef.current) return;
    const sub = episode.subtitles[index];
    if (!sub) return;

    if (autoPauseTimer.current) {
      clearInterval(autoPauseTimer.current);
      autoPauseTimer.current = null;
    }

    const endTime = sub.start + sub.dur + 0.3;
    audioRef.current.currentTime = sub.start;
    audioRef.current.play();

    autoPauseTimer.current = setInterval(() => {
      if (audioRef.current && audioRef.current.currentTime >= endTime) {
        audioRef.current.pause();
        if (autoPauseTimer.current) { clearInterval(autoPauseTimer.current); autoPauseTimer.current = null; }
      }
    }, 80);
  }, [episode]);

  const togglePlay = useCallback(() => {
    if (autoPauseTimer.current) { clearInterval(autoPauseTimer.current); autoPauseTimer.current = null; }
    if (audioRef.current) {
      if (audioRef.current.paused) audioRef.current.play();
      else audioRef.current.pause();
    }
  }, []);

  const seekBy = useCallback((seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime += seconds;
    }
  }, []);



  const selectSubtitle = useCallback((index: number) => {
    setCurrentIndex(index);
    seekToSubtitle(index);
    setTimeout(() => {
      if (subTokens[index]) {
        const firstBlank = Array.from(subTokens[index].blanks).sort((a, b) => a - b)[0];
        if (firstBlank !== undefined) {
          blankRefs.current[`${index}-${firstBlank}`]?.focus();
        }
      }
    }, 100);
  }, [seekToSubtitle, subTokens]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      if (e.code === 'Space') { e.preventDefault(); seekToSubtitle(currentIndex); }
      if (e.code === 'ArrowLeft' && !isInput) { e.preventDefault(); seekBy(-2); }
      if (e.code === 'ArrowRight' && !isInput) { e.preventDefault(); seekBy(2); }
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        if (currentIndex > 0) selectSubtitle(currentIndex - 1);
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        const total = episode?.subtitles?.length || 0;
        if (currentIndex < total - 1) selectSubtitle(currentIndex + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekBy, seekToSubtitle, currentIndex, episode, selectSubtitle]);

  // Auto-scroll
  useEffect(() => {
    const el = document.getElementById(`pod-sub-${currentIndex}`);
    const container = subtitleListRef.current;
    if (el && container) {
      const elTop = el.offsetTop;
      const elHeight = el.offsetHeight;
      const containerHeight = container.clientHeight;
      const scrollTo = elTop - (containerHeight / 2) + (elHeight / 2);
      container.scrollTo({ top: scrollTo, behavior: 'smooth' });
    }
  }, [currentIndex]);

  const norm = (s: string) => s.toLowerCase().replace(/[.,!?;:'"„"»«]/g, '').trim();

  const handleBlankChange = (subIdx: number, wordIdx: number, value: string) => {
    setBlankInputs(prev => ({
      ...prev,
      [subIdx]: { ...(prev[subIdx] || {}), [wordIdx]: value },
    }));

    if (!episode || !subTokens[subIdx]) return;
    const { words, blanks } = subTokens[subIdx];
    const expected = norm(words[wordIdx]);
    const actual = norm(value);

    let result: 'correct' | 'incorrect' | undefined;
    if (actual.length === 0) result = undefined;
    else if (actual === expected) result = 'correct';
    else if (expected.startsWith(actual)) result = undefined;
    else result = 'incorrect';

    setBlankResults(prev => {
      const updated = { ...(prev[subIdx] || {}) };
      if (result) updated[wordIdx] = result;
      else delete updated[wordIdx];
      return { ...prev, [subIdx]: updated };
    });

    if (result === 'correct') {
      const sortedBlanks = Array.from(blanks).sort((a, b) => a - b);
      const currentPos = sortedBlanks.indexOf(wordIdx);
      const allInputs = { ...(blankInputs[subIdx] || {}), [wordIdx]: value };
      const allCorrect = sortedBlanks.every(wi => norm(allInputs[wi] || '') === norm(words[wi]));

      if (allCorrect) {
        if (!completedIndices.includes(subIdx)) {
          setCompletedIndices(prev => [...prev, subIdx]);
        }
        const allResults: Record<number, 'correct' | 'incorrect'> = {};
        sortedBlanks.forEach(wi => { allResults[wi] = 'correct'; });
        setBlankResults(prev => ({ ...prev, [subIdx]: allResults }));

        setTimeout(() => {
          if (subIdx < episode.subtitles.length - 1) {
            const next = subIdx + 1;
            setCurrentIndex(next);
            seekToSubtitle(next);
            setTimeout(() => {
              if (subTokens[next]) {
                const firstBlank = Array.from(subTokens[next].blanks).sort((a, b) => a - b)[0];
                if (firstBlank !== undefined) {
                  blankRefs.current[`${next}-${firstBlank}`]?.focus();
                }
              }
            }, 150);
          }
        }, 600);
      } else if (currentPos < sortedBlanks.length - 1) {
        setTimeout(() => {
          blankRefs.current[`${subIdx}-${sortedBlanks[currentPos + 1]}`]?.focus();
        }, 50);
      }
    }
  };

  const handleBlankKeyDown = (e: React.KeyboardEvent, subIdx: number, wordIdx: number) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      const sortedBlanks = Array.from(subTokens[subIdx]?.blanks || []).sort((a, b) => a - b);
      const currentPos = sortedBlanks.indexOf(wordIdx);
      const nextPos = (e.key === 'Tab' && e.shiftKey) ? currentPos - 1 : currentPos + 1;
      if (nextPos >= 0 && nextPos < sortedBlanks.length) {
        blankRefs.current[`${subIdx}-${sortedBlanks[nextPos]}`]?.focus();
      }
    }
  };

  const startPeek = (subIdx: number) => setPeekingIndex(subIdx);
  const stopPeek = () => setPeekingIndex(null);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  if (status === 'loading' || loading) {
    return (
      <div className="loading" style={{ flexDirection: 'column', gap: '16px' }}>
        <div className="spinner" />
        <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
          Transkript wird geladen...
        </p>
      </div>
    );
  }

  if (loadError || !episode) {
    return (
      <div className="home-page">
        <div className="container" style={{ paddingTop: '80px', textAlign: 'center' }}>
          <div className="empty-state">
            <div className="empty-state-icon">{loadError?.includes('Transkript') ? '📝' : '⚠️'}</div>
            <p className="empty-state-text">{loadError || 'Episode nicht gefunden'}</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem', marginTop: 12, maxWidth: 400, margin: '12px auto 0' }}>
              {loadError?.includes('Transkript')
                ? 'Du kannst trotzdem andere Folgen mit verfügbaren Transkripten ausprobieren.'
                : ''}
            </p>
            <a href="/podcast" className="btn btn-primary" style={{ marginTop: 24 }}>
              ← Zurück zu Podcasts
            </a>
          </div>
        </div>
      </div>
    );
  }

  const totalSubs = episode.subtitles.length;
  const pct = totalSubs > 0 ? Math.round((completedIndices.length / totalSubs) * 100) : 0;

  return (
    <div className="lesson-split">
      {/* LEFT: Audio Player + Controls */}
      <div className="lesson-left">
        <div className="lesson-left-sticky">
          {/* Podcast artwork + audio */}
          <div className="podcast-player-card">
            <img src={episode.artwork} alt={episode.title} className="podcast-player-art" />
            <audio
              ref={audioRef}
              src={episode.audioUrl}
              preload="auto"
            />
            {/* Custom audio controls */}
            <div className="podcast-controls">
              <button className="podcast-ctrl-btn" onClick={() => seekBy(-15)} title="-15s">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/><text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="bold">15</text></svg>
              </button>
              <button className="podcast-ctrl-play" onClick={togglePlay}>
                {isPlaying ? (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                ) : (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                )}
              </button>
              <button className="podcast-ctrl-btn" onClick={() => seekBy(30)} title="+30s">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/><text x="12" y="16" textAnchor="middle" fill="currentColor" stroke="none" fontSize="8" fontWeight="bold">30</text></svg>
              </button>
            </div>
            {/* Time display */}
            <div className="podcast-time">
              <span>{formatTime(currentTime)}</span>
              <div className="podcast-time-bar">
                <div className="podcast-time-fill" style={{ width: `${episode.duration > 0 ? (currentTime / episode.duration) * 100 : 0}%` }} />
              </div>
              <span>{formatTime(episode.duration)}</span>
            </div>
          </div>

          <h1 className="lesson-split-title">{episode.title}</h1>
          <p className="lesson-split-meta">
            <span className="podcast-type-badge">🎙️ Podcast</span>
            <span>{totalSubs} Sätze</span>
            <span>{isPlaying ? '▶ Spielt' : '⏸ Pausiert'}</span>
          </p>

          <div className="lesson-progress-section">
            <div className="lesson-progress-header">
              <span>{completedIndices.length} / {totalSubs} richtig</span>
              <span className="lesson-progress-pct">{pct}%</span>
            </div>
            <div className="lesson-progress-track">
              <div className="lesson-progress-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>

          {/* Difficulty toggle */}
          <div className="mode-toggle">
            <span className="mode-label">Schwierigkeit</span>
            <div className="mode-buttons">
              <button className={`mode-btn ${blankMode === 50 ? 'mode-btn-active' : ''}`} onClick={() => setBlankMode(50)}>50% Lücken</button>
              <button className={`mode-btn ${blankMode === 100 ? 'mode-btn-active' : ''}`} onClick={() => setBlankMode(100)}>100% Diktat</button>
            </div>
          </div>

          <div className="lesson-shortcuts">
            <kbd>Space</kbd> Wiederholen
            <kbd>←</kbd> -2s
            <kbd>→</kbd> +2s
            <kbd>↑↓</kbd> Chuyển câu
            <kbd>Tab</kbd> Zwischen Feldern
          </div>
        </div>
      </div>

      {/* RIGHT: Subtitle list */}
      <div className="lesson-right" ref={subtitleListRef}>
        {episode.subtitles.map((sub, i) => {
          const isActive = i === currentIndex;
          const isCompleted = completedIndices.includes(i);
          const tokens = subTokens[i];
          if (!tokens) return null;
          const { words, blanks } = tokens;
          const subResults = blankResults[i] || {};
          const subInputs = blankInputs[i] || {};
          const allBlanksCorrect = blanks.size > 0 && Array.from(blanks).every(wi => subResults[wi] === 'correct');
          const isPeeking = peekingIndex === i;

          return (
            <div
              key={i}
              id={`pod-sub-${i}`}
              className={`sub-row ${isActive ? 'sub-active' : ''} ${isCompleted ? 'sub-completed' : ''}`}
              onClick={() => selectSubtitle(i)}
            >
              <div className="sub-row-header">
                <span className="sub-number">{i + 1}</span>
                <button className="sub-play-btn" onClick={(e) => { e.stopPropagation(); selectSubtitle(i); }} title="Abspielen">🔊</button>
                <span className="sub-time">{formatTime(sub.start)}</span>
                {sub.speaker && <span className="podcast-speaker-badge">{sub.speaker === 'SPEAKER_1' ? '🎤 Anna' : sub.speaker === 'SPEAKER_2' ? '🦦 Otti' : sub.speaker === 'SPEAKER_3' ? '🎵' : '👧'}</span>}

                {isActive && !isCompleted && <span className="sub-phase-badge sub-phase-diktat">✍️ Diktat</span>}
                {isCompleted && <span className="sub-check">✓</span>}

                {isActive && !isCompleted && (
                  <button
                    className={`sub-action-btn sub-action-hint ${peekingIndex === i ? 'sub-action-peeking' : ''}`}
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); startPeek(i); }}
                    onMouseUp={stopPeek}
                    onMouseLeave={stopPeek}
                    onTouchStart={(e) => { e.stopPropagation(); startPeek(i); }}
                    onTouchEnd={stopPeek}
                    title="Gedrückt halten für Lösung"
                  >👁</button>
                )}
              </div>

              <div className="sub-cloze">

                {
                  <>
                    {isCompleted ? (
                      <>{words.map((word, wi) => (
                        <span key={wi} className="cloze-word cloze-correct">{word}{' '}</span>
                      ))}</>
                    ) : !isActive ? (
                      // Not active, not completed — show real text blurred
                      <span className="sub-cloze-blurred">
                        {words.map((word, wi) => (
                          <span key={wi} className="cloze-word cloze-shadow-text">{word}{' '}</span>
                        ))}
                      </span>
                    ) : (
                      // Active row — show cloze inputs
                      <>{words.map((word, wi) => {
                        const isBlank = blanks.has(wi);
                        const result = subResults[wi];
                        const userVal = subInputs[wi] || '';
                        const cleanWord = word.replace(/[.,!?;:'"„"»«]/g, '');
                        const punct = word.slice(cleanWord.length);

                        if (allBlanksCorrect || isPeeking) {
                          return <span key={wi} className={`cloze-word ${isPeeking ? 'cloze-peek' : 'cloze-correct'}`}>{word}{' '}</span>;
                        }
                        // Non-blank word in active row — show as ■ squares
                        if (!isBlank) {
                          return <span key={wi} className="cloze-word cloze-square-box">{cleanWord.replace(/./g, '■')}{punct}{' '}</span>;
                        }
                        if (result === 'correct') {
                          return <span key={wi} className="cloze-word cloze-correct">{word}{' '}</span>;
                        }
                        // Active row blank — single input box per word
                        return (
                          <span
                            key={wi}
                            className={`cloze-input-wrap ${result === 'incorrect' ? 'cloze-input-error' : ''}`}
                            onClick={(e) => { e.stopPropagation(); blankRefs.current[`${i}-${wi}`]?.focus(); }}
                          >
                            <input
                              ref={el => { blankRefs.current[`${i}-${wi}`] = el; }}
                              type="text"
                              className="cloze-input"
                              value={userVal}
                              onChange={e => handleBlankChange(i, wi, e.target.value)}
                              onKeyDown={e => handleBlankKeyDown(e, i, wi)}
                              maxLength={cleanWord.length}
                              placeholder={'_'.repeat(cleanWord.length)}
                              style={{ width: `${Math.max(cleanWord.length * 0.85, 3)}em` }}
                            />
                            {punct && <span className="cloze-punct">{punct}</span>}
                            {' '}
                          </span>
                        );
                      })}</>
                    )}
                  </>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
