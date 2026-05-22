'use client';
import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import VideoPlayer from './_components/VideoPlayer';
import LessonProgress from './_components/LessonProgress';
import ClozeRow from './_components/ClozeRow';

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

// Strip attached punctuation to get the bare word
function bareWord(w: string): string {
  return w.replace(/^[.,!?;:'"„"»«…–-]+|[.,!?;:'"„"»«…–-]+$/g, '');
}

// A token is "real" if it has at least 2 letters after stripping punctuation
function isRealWord(w: string): boolean {
  return bareWord(w).length >= 2;
}

// Decide which word indices should be blanks
function pickBlanks(words: string[], seed: number, mode: 50 | 100): Set<number> {
  const blanks = new Set<number>();

  // Count real words in this subtitle
  const realWordIndices = words
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => isRealWord(w))
    .map(({ i }) => i);

  // Sentences with 0 or 1 real word → show as-is, no blanks
  if (realWordIndices.length <= 1) return blanks;

  if (mode === 100) {
    // Blank every REAL word — never blank punctuation-only tokens
    realWordIndices.forEach(i => blanks.add(i));
    return blanks;
  }

  // Mode 50%: alternate real words based on seed
  for (const i of realWordIndices) {
    if ((seed + i) % 2 === 0) blanks.add(i);
  }

  // Ensure at least one blank exists
  if (blanks.size === 0 && realWordIndices.length > 0) {
    blanks.add(realWordIndices[0]);
  }

  return blanks;
}


export default function LessonPage() {
  const { slug } = useParams();
  const { status } = useSession();
  const router = useRouter();

  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [blankInputs, setBlankInputs] = useState<Record<number, Record<number, string>>>({});
  const [blankResults, setBlankResults] = useState<Record<number, Record<number, 'correct' | 'incorrect'>>>({});
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [blankMode, setBlankMode] = useState<50 | 100>(100);
  const [revealedWords, setRevealedWords] = useState<Set<string>>(new Set());
  const [videoBlurLevel, setVideoBlurLevel] = useState<0 | 1 | 2>(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const blankRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const subtitleListRef = useRef<HTMLDivElement | null>(null);
  const autoPauseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPauseFallback = useRef<ReturnType<typeof setTimeout> | null>(null);

  // YouTube iframe refs
  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const ytStateRef = useRef<number>(-1);
  const ytReadyRef = useRef(false);
  const ytTimeRef = useRef<number>(0);

  // Precompute tokenized words and blank positions for each subtitle
  const subTokens = useMemo(() => {
    if (!lesson) return [];
    return lesson.subtitles.map((sub, i) => {
      const words = tokenize(sub.text);
      const blanks = pickBlanks(words, i * 7 + 3, blankMode);
      return { words, blanks };
    });
  }, [lesson, blankMode]);

  // Reset inputs when mode changes (intentional setState in effect)
  // eslint-disable-next-line react-hooks/set-state-in-effect
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

  // YouTube postMessage setup
  const initYtListening = useCallback(() => {
    if (!ytIframeRef.current?.contentWindow) return;
    ytIframeRef.current.contentWindow.postMessage(
      JSON.stringify({ event: 'listening', id: 'diktat' }),
      'https://www.youtube.com'
    );
    ytReadyRef.current = true;
  }, []);

  const handleYtIframeLoad = useCallback(() => {
    setTimeout(() => initYtListening(), 500);
    setTimeout(() => initYtListening(), 1500);
  }, [initYtListening]);

  useEffect(() => {
    if (!lesson || lesson.videoType !== 'youtube') return;
    const handleMessage = (e: MessageEvent) => {
      if (e.origin !== 'https://www.youtube.com') return;
      try {
        const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
        if (!ytReadyRef.current) initYtListening();
        if (data.event === 'onStateChange' || data.info?.playerState !== undefined) {
          const state = data.info?.playerState ?? data.info;
          ytStateRef.current = state;
          setIsPlaying(state === 1);
        }
        if (data.event === 'initialDelivery' || data.event === 'infoDelivery') {
          if (data.info?.currentTime !== undefined) ytTimeRef.current = data.info.currentTime;
          if (data.info?.playerState !== undefined) {
            ytStateRef.current = data.info.playerState;
            setIsPlaying(data.info.playerState === 1);
          }
        }
      } catch { /* ignore non-JSON */ }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [lesson, initYtListening]);

  const ytCommand = useCallback((func: string, args?: unknown[]) => {
    if (!ytIframeRef.current?.contentWindow) return;
    ytIframeRef.current.contentWindow.postMessage(
      JSON.stringify({ event: 'command', func, args: args || [] }),
      'https://www.youtube.com'
    );
  }, []);

  // Poll for YouTube time updates
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

  // Seek to subtitle and auto-pause when it ends
  const seekToSubtitle = useCallback((index: number) => {
    if (!lesson) return;
    const sub = lesson.subtitles[index];
    if (!sub) return;

    if (autoPauseTimer.current) { clearInterval(autoPauseTimer.current); autoPauseTimer.current = null; }
    if (autoPauseFallback.current) { clearTimeout(autoPauseFallback.current); autoPauseFallback.current = null; }

    const endTime = sub.start + sub.dur + 0.3;
    const durationMs = (sub.dur + 0.5) * 1000;

    if (lesson.videoType === 'youtube') {
      ytCommand('seekTo', [sub.start, true]);
      ytCommand('playVideo');
      autoPauseTimer.current = setInterval(() => {
        if (ytTimeRef.current >= endTime) {
          ytCommand('pauseVideo');
          if (autoPauseTimer.current) { clearInterval(autoPauseTimer.current); autoPauseTimer.current = null; }
          if (autoPauseFallback.current) { clearTimeout(autoPauseFallback.current); autoPauseFallback.current = null; }
        }
      }, 80);
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

  const seekBy = useCallback((seconds: number) => {
    if (lesson?.videoType === 'youtube') {
      ytCommand('seekTo', [ytTimeRef.current + seconds, true]);
    } else if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  }, [lesson?.videoType, ytCommand]);

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

  const cycleVideoBlur = useCallback(() => {
    setVideoBlurLevel(prev => ((prev + 1) % 3) as 0 | 1 | 2);
  }, []);

  // Select a subtitle row
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
      if (e.code === 'ArrowUp') { e.preventDefault(); if (currentIndex > 0) selectSubtitle(currentIndex - 1); }
      if (e.code === 'ArrowDown') {
        e.preventDefault();
        const total = lesson?.subtitles?.length || 0;
        if (currentIndex < total - 1) selectSubtitle(currentIndex + 1);
      }
      if (e.code === 'KeyB' && !isInput) { e.preventDefault(); cycleVideoBlur(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekBy, seekToSubtitle, currentIndex, lesson, selectSubtitle, cycleVideoBlur]);

  // Scroll active subtitle into view
  useEffect(() => {
    const el = document.getElementById(`sub-${currentIndex}`);
    const container = subtitleListRef.current;
    if (el && container) {
      const scrollTo = el.offsetTop - (container.clientHeight / 2) + (el.offsetHeight / 2);
      container.scrollTo({ top: scrollTo, behavior: 'smooth' });
    }
  }, [currentIndex]);

  // Normalize for comparison
  const norm = (s: string) => s.toLowerCase().replace(/[.,!?;:'"„"»«]/g, '').trim();

  // Update a blank input value
  const handleBlankChange = (subIdx: number, wordIdx: number, value: string) => {
    setBlankInputs(prev => ({ ...prev, [subIdx]: { ...(prev[subIdx] || {}), [wordIdx]: value } }));

    if (!lesson || !subTokens[subIdx]) return;
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
        const allResults: Record<number, 'correct' | 'incorrect'> = {};
        sortedBlanks.forEach(wi => { allResults[wi] = 'correct'; });
        setBlankResults(prev => ({ ...prev, [subIdx]: allResults }));
        saveProgress(subIdx, newCompleted, newScore, newAttempts);

        setTimeout(() => {
          if (subIdx < lesson.subtitles.length - 1) {
            const next = subIdx + 1;
            setCurrentIndex(next);
            seekToSubtitle(next);
            setTimeout(() => {
              if (subTokens[next]) {
                const firstBlank = Array.from(subTokens[next].blanks).sort((a, b) => a - b)[0];
                if (firstBlank !== undefined) blankRefs.current[`${next}-${firstBlank}`]?.focus();
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

  // Handle Tab/Enter in blank inputs
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

  // Double-click to reveal individual word
  const revealWord = (subIdx: number, wordIdx: number) => {
    const key = `${subIdx}-${wordIdx}`;
    setRevealedWords(prev => {
      const next = new Set(prev);
      next.add(key);
      if (lesson && subTokens[subIdx]) {
        const { words, blanks } = subTokens[subIdx];
        const subResults = blankResults[subIdx] || {};
        const allRevealed = words.every((_, wi) => {
          if (next.has(`${subIdx}-${wi}`)) return true;
          if (blanks.has(wi) && subResults[wi] === 'correct') return true;
          return false;
        });
        if (allRevealed && !completedIndices.includes(subIdx)) {
          const newCompleted = [...completedIndices, subIdx];
          setCompletedIndices(newCompleted);
          saveProgress(subIdx, newCompleted, score, totalAttempts);
        }
      }
      return next;
    });
  };

  if (status === 'loading' || loading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  if (!lesson) {
    return (
      <div className="diktat-container">
        <div className="empty-state"><p>Lektion nicht gefunden</p></div>
      </div>
    );
  }

  const totalSubs = lesson.subtitles.length;
  const pct = totalSubs > 0 ? Math.round((completedIndices.length / totalSubs) * 100) : 0;

  return (
    <div className="lesson-page">
      <header className="lesson-header">
        <button className="lesson-back-btn" onClick={() => router.push('/')}>← Zurück</button>
        <h1 className="lesson-header-title">{lesson.title}</h1>
        <div className="lesson-header-meta">
          <span className="lesson-level">{lesson.level}</span>
          <span>{totalSubs} Sätze</span>
          <span>{isPlaying ? '▶ Spielt' : '⏸ Pausiert'}</span>
        </div>
      </header>

      <div className="lesson-split">
        {/* LEFT: Video + Controls */}
        <div className="lesson-left">
          <div className="lesson-left-sticky">
            <VideoPlayer
              videoType={lesson.videoType}
              youtubeId={lesson.youtubeId}
              videoUrl={lesson.videoUrl}
              title={lesson.title}
              videoBlurLevel={videoBlurLevel}
              onYtIframeRef={(el) => { ytIframeRef.current = el; }}
              onVideoRef={(el) => { videoRef.current = el; }}
              onYtLoad={handleYtIframeLoad}
              onLocalPlay={() => setIsPlaying(true)}
              onLocalPause={() => setIsPlaying(false)}
            />
            <LessonProgress
              completedCount={completedIndices.length}
              totalSubs={totalSubs}
              pct={pct}
              blankMode={blankMode}
              videoBlurLevel={videoBlurLevel}
              onModeChange={setBlankMode}
              onCycleBlur={cycleVideoBlur}
            />
          </div>
        </div>

        {/* RIGHT: Subtitle list */}
        <div className="lesson-right" ref={subtitleListRef}>
          {lesson.subtitles.map((sub, i) => {
            const tokens = subTokens[i];
            if (!tokens) return null;
            return (
              <ClozeRow
                key={i}
                sub={sub}
                index={i}
                isActive={i === currentIndex}
                isCompleted={completedIndices.includes(i)}
                tokens={tokens}
                subResults={blankResults[i] || {}}
                subInputs={blankInputs[i] || {}}
                revealedWords={revealedWords}
                blankMode={blankMode}
                blankRefs={blankRefs}
                onSelect={selectSubtitle}
                onChange={handleBlankChange}
                onKeyDown={handleBlankKeyDown}
                onRevealWord={revealWord}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
