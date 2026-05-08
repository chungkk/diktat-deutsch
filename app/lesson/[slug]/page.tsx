'use client';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';

interface Subtitle {
  start: number;
  dur: number;
  text: string;
}

interface LessonData {
  _id: string;
  title: string;
  videoType: 'youtube' | 'local';
  youtubeId?: string;
  videoUrl?: string;
  subtitles: Subtitle[];
  level: string;
}

// Split subtitle text into tokens (words + punctuation kept attached)
function tokenize(text: string): string[] {
  return text.replace(/\n/g, ' ').split(/\s+/).filter(Boolean);
}

// Decide which word indices should be blanks
function pickBlanks(words: string[], seed: number, mode: 50 | 100): Set<number> {
  const blanks = new Set<number>();
  if (mode === 100) {
    // All words are blanks
    words.forEach((_, i) => blanks.add(i));
    return blanks;
  }
  // 50% mode: skip short words
  for (let i = 0; i < words.length; i++) {
    if (words[i].replace(/[.,!?;:'"„"»«]/g, '').length <= 2) continue;
    if ((seed + i) % 2 === 0) blanks.add(i);
  }
  if (blanks.size === 0 && words.length > 0) blanks.add(0);
  return blanks;
}

export default function LessonPage() {
  const { slug } = useParams();
  const { data: session, status } = useSession();
  const router = useRouter();

  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  // blankInputs[subIndex][wordIndex] = user's input for that blank
  const [blankInputs, setBlankInputs] = useState<Record<number, Record<number, string>>>({});
  // blankResults[subIndex][wordIndex] = correct/incorrect
  const [blankResults, setBlankResults] = useState<Record<number, Record<number, 'correct' | 'incorrect'>>>({});
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blankMode, setBlankMode] = useState<50 | 100>(100);
  const [peekingIndex, setPeekingIndex] = useState<number | null>(null);
  // Global lesson phase: shadowing first, then diktat
  const [lessonPhase, setLessonPhase] = useState<'shadowing' | 'diktat'>('shadowing');
  // Hide text toggle during shadowing
  const [shadowTextHidden, setShadowTextHidden] = useState(false);
  // Track highest visited subtitle index during shadowing
  const [highestVisitedIndex, setHighestVisitedIndex] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const blankRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const subtitleListRef = useRef<HTMLDivElement | null>(null);
  const autoPauseTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Precompute tokenized words and blank positions for each subtitle
  const subTokens = useMemo(() => {
    if (!lesson) return [];
    return lesson.subtitles.map((sub, i) => {
      const words = tokenize(sub.text);
      const blanks = pickBlanks(words, i * 7 + 3, blankMode);
      return { words, blanks };
    });
  }, [lesson, blankMode]);

  // Reset inputs when mode changes
  useEffect(() => {
    setBlankInputs({});
    setBlankResults({});
  }, [blankMode]);

  // Load lesson + progress
  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status !== 'authenticated') return;

    fetch(`/api/lessons/${slug}`).then(r => r.json()).then(lessonData => {
      if (lessonData.error) { setLoading(false); return; }
      setLesson(lessonData);
      fetch(`/api/progress?lessonId=${lessonData._id}`).then(r => r.json()).then(progressData => {
        if (progressData?.currentIndex) setCurrentIndex(progressData.currentIndex);
        if (progressData?.completedIndices) setCompletedIndices(progressData.completedIndices);
        if (progressData?.score) setScore(progressData.score);
        if (progressData?.totalAttempts) setTotalAttempts(progressData.totalAttempts);
        setLoading(false);
      });
    });
  }, [slug, status, router]);

  // YouTube iframe postMessage API
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const ytStateRef = useRef<number>(-1); // -1 = unstarted, 1 = playing, 2 = paused
  const ytReadyRef = useRef(false);

  // Send 'listening' event to YouTube iframe so it starts sending infoDelivery (with currentTime)
  const initYtListening = useCallback(() => {
    if (!ytIframeRef.current?.contentWindow) return;
    ytIframeRef.current.contentWindow.postMessage(
      JSON.stringify({ event: 'listening', id: 'diktat' }),
      'https://www.youtube.com'
    );
    ytReadyRef.current = true;
  }, []);

  // Called when iframe finishes loading
  const handleYtIframeLoad = useCallback(() => {
    // Send listening event with a small delay to ensure player is initialized
    setTimeout(() => initYtListening(), 500);
    setTimeout(() => initYtListening(), 1500);
  }, [initYtListening]);

  useEffect(() => {
    if (!lesson || lesson.videoType !== 'youtube') return;

    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;

        // Re-send listening on any YouTube message to ensure we keep getting updates
        if (!ytReadyRef.current) initYtListening();

        if (data.event === 'onStateChange' || data.info?.playerState !== undefined) {
          const state = data.info?.playerState ?? data.info;
          ytStateRef.current = state;
          setIsPlaying(state === 1);
        }
        if (data.event === 'initialDelivery' || data.event === 'infoDelivery') {
          if (data.info?.currentTime !== undefined) {
            ytTimeRef.current = data.info.currentTime;
          }
          if (data.info?.playerState !== undefined) {
            ytStateRef.current = data.info.playerState;
            setIsPlaying(data.info.playerState === 1);
          }
        }
      } catch { /* ignore non-JSON messages */ }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [lesson, initYtListening]);

  const ytTimeRef = useRef<number>(0);

  const ytCommand = useCallback((func: string, args?: unknown[]) => {
    if (!ytIframeRef.current?.contentWindow) return;
    ytIframeRef.current.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func, args: args || [] }),
      'https://www.youtube.com'
    );
  }, []);

  // Poll for time updates — also re-init listening periodically as a safety net
  useEffect(() => {
    if (!lesson || lesson.videoType !== 'youtube') return;
    const interval = setInterval(() => {
      ytCommand('getCurrentTime');
      ytCommand('getPlayerState');
    }, 150);
    return () => clearInterval(interval);
  }, [lesson, ytCommand]);

  // Save progress
  const saveProgress = useCallback(async (idx: number, completed: number[], sc: number, attempts: number) => {
    if (!lesson) return;
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lessonId: lesson._id,
        currentIndex: idx,
        completedIndices: completed,
        score: sc,
        totalAttempts: attempts,
        isCompleted: completed.length >= lesson.subtitles.length,
      }),
    });
  }, [lesson]);

  // Fallback timeout ref for auto-pause (in case postMessage time tracking fails)
  const autoPauseFallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seek to subtitle and auto-pause when it ends
  const seekToSubtitle = useCallback((index: number) => {
    if (!lesson) return;
    const sub = lesson.subtitles[index];
    if (!sub) return;

    // Clear existing timers
    if (autoPauseTimer.current) {
      clearInterval(autoPauseTimer.current);
      autoPauseTimer.current = null;
    }
    if (autoPauseFallback.current) {
      clearTimeout(autoPauseFallback.current);
      autoPauseFallback.current = null;
    }

    const endTime = sub.start + sub.dur + 0.3;
    const durationMs = (sub.dur + 0.5) * 1000; // fallback duration in ms

    if (lesson.videoType === 'youtube') {
      ytCommand('seekTo', [sub.start, true]);
      ytCommand('playVideo');

      // Primary: poll-based auto-pause using currentTime from postMessage
      autoPauseTimer.current = setInterval(() => {
        if (ytTimeRef.current >= endTime) {
          ytCommand('pauseVideo');
          if (autoPauseTimer.current) { clearInterval(autoPauseTimer.current); autoPauseTimer.current = null; }
          if (autoPauseFallback.current) { clearTimeout(autoPauseFallback.current); autoPauseFallback.current = null; }
        }
      }, 80);

      // Fallback: if postMessage time tracking fails, pause after estimated duration
      autoPauseFallback.current = setTimeout(() => {
        ytCommand('pauseVideo');
        if (autoPauseTimer.current) { clearInterval(autoPauseTimer.current); autoPauseTimer.current = null; }
        autoPauseFallback.current = null;
      }, durationMs);

    } else if (lesson.videoType === 'local' && videoRef.current) {
      videoRef.current.currentTime = sub.start;
      videoRef.current.play();
      autoPauseTimer.current = setInterval(() => {
        if (videoRef.current && videoRef.current.currentTime >= endTime) {
          videoRef.current.pause();
          if (autoPauseTimer.current) { clearInterval(autoPauseTimer.current); autoPauseTimer.current = null; }
        }
      }, 80);
    }
  }, [lesson, ytCommand]);

  const togglePlay = useCallback(() => {
    if (autoPauseTimer.current) { clearInterval(autoPauseTimer.current); autoPauseTimer.current = null; }
    if (autoPauseFallback.current) { clearTimeout(autoPauseFallback.current); autoPauseFallback.current = null; }
    if (lesson?.videoType === 'youtube') {
      if (ytStateRef.current === 1) ytCommand('pauseVideo');
      else ytCommand('playVideo');
    } else if (videoRef.current) {
      if (videoRef.current.paused) videoRef.current.play();
      else videoRef.current.pause();
    }
  }, [lesson?.videoType, ytCommand]);

  const seekBy = useCallback((seconds: number) => {
    if (lesson?.videoType === 'youtube') {
      ytCommand('seekTo', [ytTimeRef.current + seconds, true]);
    } else if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  }, [lesson?.videoType, ytCommand]);

  // Track highest visited subtitle during shadowing
  useEffect(() => {
    if (lessonPhase === 'shadowing' && currentIndex > highestVisitedIndex) {
      setHighestVisitedIndex(currentIndex);
    }
  }, [currentIndex, lessonPhase, highestVisitedIndex]);

  // Check if user has completed one full shadowing pass
  const hasCompletedShadowing = lesson ? highestVisitedIndex >= lesson.subtitles.length - 1 : false;

  // Switch global phase to diktat
  const switchToDiktat = useCallback(() => {
    setLessonPhase('diktat');
    setCurrentIndex(0);
    setShadowTextHidden(false);
    // Focus first blank of first subtitle
    setTimeout(() => {
      if (subTokens[0]) {
        const firstBlank = Array.from(subTokens[0].blanks).sort((a, b) => a - b)[0];
        if (firstBlank !== undefined) {
          blankRefs.current[`0-${firstBlank}`]?.focus();
        }
      }
    }, 200);
  }, [subTokens]);

  // Select a subtitle row
  const selectSubtitle = useCallback((index: number) => {
    setCurrentIndex(index);
    seekToSubtitle(index);
    // In diktat phase, focus first blank
    if (lessonPhase === 'diktat') {
      setTimeout(() => {
        if (subTokens[index]) {
          const firstBlank = Array.from(subTokens[index].blanks).sort((a, b) => a - b)[0];
          if (firstBlank !== undefined) {
            blankRefs.current[`${index}-${firstBlank}`]?.focus();
          }
        }
      }, 100);
    }
  }, [seekToSubtitle, lessonPhase, subTokens]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
      // Space: always replay current subtitle from the beginning
      if (e.code === 'Space') {
        e.preventDefault();
        seekToSubtitle(currentIndex);
      }
      if (e.code === 'ArrowLeft' && !isInput) { e.preventDefault(); seekBy(-2); }
      if (e.code === 'ArrowRight' && !isInput) { e.preventDefault(); seekBy(2); }
      if (e.code === 'ArrowUp') {
        e.preventDefault();
        if (currentIndex > 0) selectSubtitle(currentIndex - 1);
      }
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        const total = lesson?.subtitles?.length || 0;
        if (currentIndex < total - 1) selectSubtitle(currentIndex + 1);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekBy, seekToSubtitle, currentIndex, lesson, selectSubtitle]);

  // Scroll active subtitle to center of right panel
  useEffect(() => {
    const el = document.getElementById(`sub-${currentIndex}`);
    const container = subtitleListRef.current;
    if (el && container) {
      const elTop = el.offsetTop;
      const elHeight = el.offsetHeight;
      const containerHeight = container.clientHeight;
      const scrollTo = elTop - (containerHeight / 2) + (elHeight / 2);
      container.scrollTo({ top: scrollTo, behavior: 'smooth' });
    }
  }, [currentIndex]);

  // Update a blank input value
  const setBlankValue = (subIdx: number, wordIdx: number, value: string) => {
    setBlankInputs(prev => ({
      ...prev,
      [subIdx]: { ...(prev[subIdx] || {}), [wordIdx]: value },
    }));
    // Clear result for this blank
    setBlankResults(prev => {
      const n = { ...prev };
      if (n[subIdx]) {
        const updated = { ...n[subIdx] };
        delete updated[wordIdx];
        n[subIdx] = updated;
      }
      return n;
    });
  };

  // Normalize for comparison
  const norm = (s: string) => s.toLowerCase().replace(/[.,!?;:'"„"»«]/g, '').trim();

  // Real-time check on every keystroke
  const handleBlankChange = (subIdx: number, wordIdx: number, value: string) => {
    // Update input value
    setBlankInputs(prev => ({
      ...prev,
      [subIdx]: { ...(prev[subIdx] || {}), [wordIdx]: value },
    }));

    if (!lesson || !subTokens[subIdx]) return;
    const { words, blanks } = subTokens[subIdx];
    const expected = norm(words[wordIdx]);
    const actual = norm(value);

    // Determine result for this blank
    let result: 'correct' | 'incorrect' | undefined;
    if (actual.length === 0) {
      result = undefined; // empty = no feedback
    } else if (actual === expected) {
      result = 'correct';
    } else if (expected.startsWith(actual)) {
      result = undefined; // partial match — still typing, no feedback
    } else {
      result = 'incorrect';
    }

    // Update result for this blank
    setBlankResults(prev => {
      const updated = { ...(prev[subIdx] || {}) };
      if (result) updated[wordIdx] = result;
      else delete updated[wordIdx];
      return { ...prev, [subIdx]: updated };
    });

    // If this word is correct, auto-advance to next blank
    if (result === 'correct') {
      const sortedBlanks = Array.from(blanks).sort((a, b) => a - b);
      const currentPos = sortedBlanks.indexOf(wordIdx);

      // Check if ALL blanks are now correct
      const allInputs = { ...(blankInputs[subIdx] || {}), [wordIdx]: value };
      const allCorrect = sortedBlanks.every(wi => norm(allInputs[wi] || '') === norm(words[wi]));

      if (allCorrect) {
        // Mark subtitle as completed
        const newAttempts = totalAttempts + 1;
        setTotalAttempts(newAttempts);
        let newScore = score;
        let newCompleted = completedIndices;
        if (!completedIndices.includes(subIdx)) {
          newScore = score + 1;
          newCompleted = [...completedIndices, subIdx];
          setScore(newScore);
          setCompletedIndices(newCompleted);
        }
        // Mark all blanks as correct
        const allResults: Record<number, 'correct' | 'incorrect'> = {};
        sortedBlanks.forEach(wi => { allResults[wi] = 'correct'; });
        setBlankResults(prev => ({ ...prev, [subIdx]: allResults }));

        saveProgress(subIdx, newCompleted, newScore, newAttempts);

        // Auto-advance to next subtitle in diktat
        setTimeout(() => {
          if (subIdx < lesson.subtitles.length - 1) {
            const next = subIdx + 1;
            setCurrentIndex(next);
            seekToSubtitle(next);
            // Focus first blank of next subtitle
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
        // Move to next blank
        setTimeout(() => {
          blankRefs.current[`${subIdx}-${sortedBlanks[currentPos + 1]}`]?.focus();
        }, 50);
      }
    }
  };

  // Handle Tab in blank inputs (Enter no longer needed for checking)
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

  // Peek: show answer while holding, hide on release
  const startPeek = (subIdx: number) => setPeekingIndex(subIdx);
  const stopPeek = () => setPeekingIndex(null);



  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  if (status === 'loading' || loading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  if (!lesson) {
    return <div className="diktat-container"><div className="empty-state"><p>Lektion nicht gefunden</p></div></div>;
  }

  const totalSubs = lesson.subtitles.length;
  const pct = totalSubs > 0 ? Math.round((completedIndices.length / totalSubs) * 100) : 0;

  return (
    <div className="lesson-split">
      {/* LEFT: Video + Controls */}
      <div className="lesson-left">
        <div className="lesson-left-sticky">
          <div className="video-wrapper">
            {lesson.videoType === 'youtube' ? (
              <iframe
                ref={ytIframeRef}
                src={`https://www.youtube.com/embed/${lesson.youtubeId}?enablejsapi=1&origin=${typeof window !== 'undefined' ? window.location.origin : ''}&controls=1&modestbranding=1&rel=0`}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title={lesson.title}
                onLoad={handleYtIframeLoad}
              />
            ) : (
              <video
                ref={videoRef}
                src={lesson.videoUrl}
                controls
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
              />
            )}
          </div>

          <h1 className="lesson-split-title">{lesson.title}</h1>
          <p className="lesson-split-meta">
            <span className="lesson-level">{lesson.level}</span>
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

          {/* Workflow phase indicator */}
          <div className="workflow-indicator">
            <div className={`workflow-step ${lessonPhase === 'shadowing' ? 'workflow-step-active' : 'workflow-step-done'}`}>
              <span className="workflow-step-number">1</span>
              <span className="workflow-step-label">👤 Shadowing</span>
              <span className="workflow-step-desc">Nghe + đọc theo</span>
            </div>
            <span className="workflow-arrow">→</span>
            <div className={`workflow-step ${lessonPhase === 'diktat' ? 'workflow-step-active' : ''}`}>
              <span className="workflow-step-number">2</span>
              <span className="workflow-step-label">✍️ Diktat</span>
              <span className="workflow-step-desc">Nghe + chép lại</span>
            </div>
          </div>

          {/* Shadowing controls */}
          {lessonPhase === 'shadowing' && (
            <>
              {/* Toggle text visibility */}
              <button
                className={`shadowing-toggle ${shadowTextHidden ? 'shadowing-toggle-active' : ''}`}
                onClick={() => setShadowTextHidden(prev => !prev)}
              >
                <span className="shadowing-toggle-icon">{shadowTextHidden ? '👁' : '🙈'}</span>
                {shadowTextHidden ? 'Text anzeigen' : 'Text ausblenden'}
              </button>

              {/* Switch to diktat after completing shadowing */}
              {hasCompletedShadowing && (
                <button
                  className="btn btn-primary btn-block switch-diktat-btn"
                  onClick={switchToDiktat}
                >
                  ✍️ Jetzt Diktat starten
                </button>
              )}

              <div className="shadowing-progress-info">
                <span className="text-text-muted text-xs">
                  Shadowing: {Math.min(highestVisitedIndex + 1, totalSubs)} / {totalSubs} gehört
                </span>
                {!hasCompletedShadowing && (
                  <span className="text-text-muted text-xs" style={{ opacity: 0.6 }}>
                    Alle Sätze anhören um Diktat freizuschalten
                  </span>
                )}
              </div>
            </>
          )}

          {/* Difficulty toggle — only in diktat phase */}
          {lessonPhase === 'diktat' && (
            <div className="mode-toggle">
              <span className="mode-label">Schwierigkeit</span>
              <div className="mode-buttons">
                <button
                  className={`mode-btn ${blankMode === 50 ? 'mode-btn-active' : ''}`}
                  onClick={() => setBlankMode(50)}
                >
                  50% Lücken
                </button>
                <button
                  className={`mode-btn ${blankMode === 100 ? 'mode-btn-active' : ''}`}
                  onClick={() => setBlankMode(100)}
                >
                  100% Diktat
                </button>
              </div>
            </div>
          )}

          <div className="lesson-shortcuts">
            <kbd>Space</kbd> Wiederholen
            <kbd>←</kbd> -2s
            <kbd>→</kbd> +2s
            <kbd>↑↓</kbd> Chuyển câu
            {lessonPhase === 'diktat' && <><kbd>Tab</kbd> Zwischen Feldern</>}
          </div>
        </div>
      </div>

      {/* RIGHT: Subtitle list with fill-in-the-blank */}
      <div className="lesson-right" ref={subtitleListRef}>
        {lesson.subtitles.map((sub, i) => {
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
              id={`sub-${i}`}
              className={`sub-row ${isActive ? 'sub-active' : ''} ${isCompleted ? 'sub-completed' : ''} ${isActive && lessonPhase === 'shadowing' ? 'sub-shadow-phase' : ''}`}
              onClick={() => selectSubtitle(i)}
            >
              <div className="sub-row-header">
                <span className="sub-number">{i + 1}</span>
                <button
                  className="sub-play-btn"
                  onClick={(e) => { e.stopPropagation(); selectSubtitle(i); }}
                  title="Abspielen"
                >
                  🔊
                </button>
                <span className="sub-time">{formatTime(sub.start)}</span>

                {/* Phase badge */}
                {isActive && lessonPhase === 'shadowing' && (
                  <span className="sub-phase-badge sub-phase-shadow">👤 Shadow</span>
                )}
                {isActive && lessonPhase === 'diktat' && !isCompleted && (
                  <span className="sub-phase-badge sub-phase-diktat">✍️ Diktat</span>
                )}
                {isCompleted && <span className="sub-check">✓</span>}

                {/* Peek button in diktat phase */}
                {isActive && lessonPhase === 'diktat' && !isCompleted && (
                  <button
                    className={`sub-action-btn sub-action-hint ${peekingIndex === i ? 'sub-action-peeking' : ''}`}
                    onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); startPeek(i); }}
                    onMouseUp={stopPeek}
                    onMouseLeave={stopPeek}
                    onTouchStart={(e) => { e.stopPropagation(); startPeek(i); }}
                    onTouchEnd={stopPeek}
                    title="Gedrückt halten für Lösung"
                  >
                    👁
                  </button>
                )}
              </div>

              {/* Subtitle content — depends on global phase */}
              <div className={`sub-cloze ${lessonPhase === 'shadowing' && shadowTextHidden ? 'sub-cloze-hidden' : ''}`}>
                {/* SHADOWING PHASE: show full text (or hidden) */}
                {lessonPhase === 'shadowing' && (
                  <>
                    {shadowTextHidden ? (
                      // Square boxes when text is hidden
                      <>{words.map((word, wi) => (
                        <span key={wi} className="cloze-word cloze-square-box">
                          {word.replace(/[.,!?;:'"„"»«]/g, '').replace(/./g, '■')}{word.slice(word.replace(/[.,!?;:'"„"»«]/g, '').length)}{' '}
                        </span>
                      ))}</>
                    ) : (
                      // Full readable text
                      <>{words.map((word, wi) => (
                        <span key={wi} className="cloze-word cloze-shadow-text">{word}{' '}</span>
                      ))}</>
                    )}
                  </>
                )}

                {/* DIKTAT PHASE: completed shows green text, others show ■ boxes + cloze inputs */}
                {lessonPhase === 'diktat' && (
                  <>
                    {isCompleted ? (
                      // Completed — show full text in green
                      <>{words.map((word, wi) => (
                        <span key={wi} className="cloze-word cloze-correct">{word}{' '}</span>
                      ))}</>
                    ) : (
                      // Not completed — show cloze
                      <>{words.map((word, wi) => {
                        const isBlank = blanks.has(wi);
                        const result = subResults[wi];
                        const userVal = subInputs[wi] || '';
                        const cleanWord = word.replace(/[.,!?;:'"„"»«]/g, '');
                        const punct = word.slice(cleanWord.length);

                        // Peeking — show all words revealed
                        if (allBlanksCorrect || isPeeking) {
                          return <span key={wi} className={`cloze-word ${isPeeking ? 'cloze-peek' : 'cloze-correct'}`}>{word}{' '}</span>;
                        }

                        // Non-blank — show as ■ squares
                        if (!isBlank) {
                          return (
                            <span key={wi} className="cloze-word cloze-square-box">
                              {cleanWord.replace(/./g, '■')}{punct}{' '}
                            </span>
                          );
                        }

                        // Blank but NOT active row — show ■ squares
                        if (!isActive) {
                          if (result === 'correct') {
                            return <span key={wi} className="cloze-word cloze-correct">{word}{' '}</span>;
                          }
                          return (
                            <span key={wi} className="cloze-word cloze-square-box">
                              {cleanWord.replace(/./g, '■')}{punct}{' '}
                            </span>
                          );
                        }

                        // Active row blank — if already correct, show as revealed text
                        if (result === 'correct') {
                          return <span key={wi} className="cloze-word cloze-correct">{word}{' '}</span>;
                        }

                        // Active row blank — full character cells with hidden input
                        const chars = cleanWord.split('');
                        return (
                          <span
                            key={wi}
                            className="cloze-chars-wrap"
                            onClick={(e) => { e.stopPropagation(); blankRefs.current[`${i}-${wi}`]?.focus(); }}
                          >
                            <input
                              ref={el => { blankRefs.current[`${i}-${wi}`] = el; }}
                              type="text"
                              className="cloze-hidden-input"
                              value={userVal}
                              onChange={e => handleBlankChange(i, wi, e.target.value)}
                              onKeyDown={e => handleBlankKeyDown(e, i, wi)}
                              autoFocus={wi === Array.from(blanks).sort((a, b) => a - b)[0]}
                              maxLength={cleanWord.length}
                            />
                            {chars.map((ch, ci) => {
                              const typed = userVal[ci];
                              let cls = 'cloze-char';
                              if (typed) {
                                cls += typed.toLowerCase() === ch.toLowerCase() ? ' cloze-char-correct' : ' cloze-char-incorrect';
                              } else {
                                cls += ' cloze-char-empty';
                              }
                              return <span key={ci} className={cls}>{typed || '■'}</span>;
                            })}
                            {punct && <span className="cloze-punct">{punct}</span>}
                            {' '}
                          </span>
                        );
                      })}</>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
