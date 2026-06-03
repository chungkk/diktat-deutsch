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

// Format seconds to m:ss
function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
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
function pickBlanks(words: string[], seed: number): Set<number> {
  const blanks = new Set<number>();

  // Count real words in this subtitle
  const realWordIndices = words
    .map((w, i) => ({ w, i }))
    .filter(({ w }) => isRealWord(w))
    .map(({ i }) => i);

  // Sentences with 0 or 1 real word → show as-is, no blanks
  if (realWordIndices.length <= 1) return blanks;

  // 60% mode: blank roughly 60% of real words using seed-based selection
  for (const i of realWordIndices) {
    // Use a simple hash to decide: 3 out of every 5 words are blanked
    if ((seed + i * 3 + 1) % 5 < 3) blanks.add(i);
  }

  // Ensure at least one blank exists
  if (blanks.size === 0 && realWordIndices.length > 0) {
    blanks.add(realWordIndices[0]);
  }

  return blanks;
}


export default function LessonPage() {
  const { slug } = useParams();
  const { data: session, status } = useSession();
  const router = useRouter();
  const isAdmin = (session?.user as { role?: string })?.role === 'admin';
  const [editMode, setEditMode] = useState(false);

  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [hasCustomSubs, setHasCustomSubs] = useState(false);
  const originalSubtitlesRef = useRef<Subtitle[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [blankInputs, setBlankInputs] = useState<Record<number, Record<number, string>>>({});
  const [blankResults, setBlankResults] = useState<Record<number, Record<number, 'correct' | 'incorrect'>>>({});
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const blankMode = 60 as const;
  const [revealedWords, setRevealedWords] = useState<Set<string>>(new Set());
  const [videoBlurLevel, setVideoBlurLevel] = useState<0 | 1 | 2>(0);
  const [bookmarkedIndices, setBookmarkedIndices] = useState<Set<number>>(new Set());
  const [shadowingMode, setShadowingMode] = useState(false);
  const [autoStop, setAutoStop] = useState(true);

  // ── Edit mode state ──
  const [editSubtitles, setEditSubtitles] = useState<Subtitle[]>([]);
  const [editSelectedSubs, setEditSelectedSubs] = useState<Set<number>>(new Set());
  const [editSaving, setEditSaving] = useState(false);
  const [editSaveMsg, setEditSaveMsg] = useState('');
  const [editEditedSubs, setEditEditedSubs] = useState<Set<number>>(new Set());
  const editTextRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const blankRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const hiddenWordRefs = useRef<Record<string, HTMLSpanElement | null>>({});
  const subtitleListRef = useRef<HTMLDivElement | null>(null);
  const autoPauseTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoPauseFallback = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Always-fresh ref for completedIndices to prevent HTTP race conditions
  const completedIndicesRef = useRef<number[]>([]);
  // Track correct word inputs for persistence
  const correctInputsRef = useRef<Record<string, Record<string, string>>>({});

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
      const blanks = pickBlanks(words, i * 7 + 3);
      return { words, blanks };
    });
  }, [lesson]);



  // Load lesson + progress + custom subs
  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status !== 'authenticated') return;

    fetch(`/api/lessons/${slug}`).then(r => r.json()).then(async (lessonData) => {
      if (lessonData.error) { setLoading(false); return; }
      // Store original subtitles for reset
      originalSubtitlesRef.current = JSON.parse(JSON.stringify(lessonData.subtitles));

      // Check for user custom subtitles
      try {
        const customRes = await fetch(`/api/user-subtitles?lessonId=${lessonData._id}`);
        const customData = await customRes.json();
        if (customData.exists && Array.isArray(customData.subtitles)) {
          lessonData.subtitles = customData.subtitles;
          setHasCustomSubs(true);
        }
      } catch (err) {
        console.error('[LOAD] Error loading custom subs:', err);
      }

      setLesson(lessonData);
      fetch(`/api/progress?lessonId=${lessonData._id}`).then(r => r.json()).then(progressData => {
        console.log('[LOAD] progressData:', progressData);
        console.log('[LOAD] completedIndices:', progressData?.completedIndices);
        if (progressData?.currentIndex) setCurrentIndex(progressData.currentIndex);
        if (Array.isArray(progressData?.completedIndices)) {
          completedIndicesRef.current = progressData.completedIndices;
          setCompletedIndices(progressData.completedIndices);
        }
        if (Array.isArray(progressData?.bookmarkedIndices)) {
          setBookmarkedIndices(new Set(progressData.bookmarkedIndices));
        }
        // Restore per-word correct inputs
        if (progressData?.correctInputs && typeof progressData.correctInputs === 'object') {
          correctInputsRef.current = progressData.correctInputs;
          const restoredInputs: Record<number, Record<number, string>> = {};
          const restoredResults: Record<number, Record<number, 'correct' | 'incorrect'>> = {};
          for (const [subIdxStr, wordMap] of Object.entries(progressData.correctInputs)) {
            const subIdx = Number(subIdxStr);
            if (isNaN(subIdx)) continue;
            restoredInputs[subIdx] = {};
            restoredResults[subIdx] = {};
            for (const [wordIdxStr, val] of Object.entries(wordMap as Record<string, string>)) {
              const wordIdx = Number(wordIdxStr);
              if (isNaN(wordIdx)) continue;
              restoredInputs[subIdx][wordIdx] = val;
              restoredResults[subIdx][wordIdx] = 'correct';
            }
          }
          setBlankInputs(restoredInputs);
          setBlankResults(restoredResults);
        }
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

  // Save progress — always uses latest completedIndices via ref to avoid race conditions
  const saveProgress = useCallback(async (completed: number[], sc: number, attempts: number, bookmarks?: Set<number>) => {
    if (!lesson) return;
    const body: Record<string, unknown> = {
      lessonId: lesson._id,
      currentIndex: completedIndicesRef.current.length > 0
        ? Math.max(...completedIndicesRef.current)
        : 0,
      completedIndices: completed,
      correctInputs: correctInputsRef.current,
      score: sc,
      totalAttempts: attempts,
      isCompleted: completed.length >= lesson.subtitles.length,
    };
    if (bookmarks) {
      body.bookmarkedIndices = Array.from(bookmarks);
    }
    console.log('[SAVE] completedIndices:', completed, 'score:', sc, 'attempts:', attempts);
    try {
      const res = await fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      console.log('[SAVE] Response:', res.status, 'saved completedIndices:', data?.completedIndices);
    } catch (err) {
      console.error('[SAVE] Error:', err);
    }
  }, [lesson]);

  // Seek and auto-pause for a specific subtitle object
  const seekToSub = useCallback((sub: Subtitle, autoStop = true) => {
    if (!lesson) return;

    if (autoPauseTimer.current) { clearInterval(autoPauseTimer.current); autoPauseTimer.current = null; }
    if (autoPauseFallback.current) { clearTimeout(autoPauseFallback.current); autoPauseFallback.current = null; }

    if (lesson.videoType === 'youtube') {
      ytCommand('seekTo', [sub.start, true]);
      ytCommand('playVideo');
      if (autoStop) {
        const endTime = sub.start + sub.dur + 0.3;
        const durationMs = (sub.dur + 0.5) * 1000;
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
      }
    } else if (lesson.videoType === 'local' && videoRef.current) {
      videoRef.current.currentTime = sub.start;
      videoRef.current.play();
      if (autoStop) {
        const endTime = sub.start + sub.dur + 0.3;
        autoPauseTimer.current = setInterval(() => {
          if (videoRef.current && videoRef.current.currentTime >= endTime) {
            videoRef.current.pause();
            if (autoPauseTimer.current) { clearInterval(autoPauseTimer.current); autoPauseTimer.current = null; }
          }
        }, 80);
      }
    }
  }, [lesson, ytCommand]);

  // Seek to subtitle by index (uses lesson.subtitles)
  const seekToSubtitle = useCallback((index: number) => {
    if (!lesson) return;
    const sub = lesson.subtitles[index];
    if (!sub) return;
    seekToSub(sub, autoStop);
  }, [lesson, seekToSub, autoStop]);

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

  const toggleBookmark = useCallback((index: number) => {
    setBookmarkedIndices(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      // Persist bookmarks via dedicated endpoint (outside updater logic)
      if (lesson) {
        fetch('/api/progress/bookmarks', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lessonId: lesson._id,
            bookmarkedIndices: Array.from(next),
          }),
        }).catch(err => console.error('Failed to save bookmarks:', err));
      }
      return next;
    });
  }, [lesson]);

  const toggleShadowingMode = useCallback(() => {
    setShadowingMode(prev => {
      const next = !prev;
      if (next) {
        // Auto-select the first bookmarked sentence
        const firstBookmarked = Array.from(bookmarkedIndices).sort((a, b) => a - b)[0];
        if (firstBookmarked !== undefined) {
          setCurrentIndex(firstBookmarked);
          setTimeout(() => seekToSubtitle(firstBookmarked), 50);
        }
      }
      return next;
    });
  }, [bookmarkedIndices, seekToSubtitle]);

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

      // In free typing mode: space is normal char in textarea, arrows with Ctrl seek
      if (e.code === 'Space') { e.preventDefault(); seekToSubtitle(currentIndex); }
      if (e.code === 'ArrowLeft' && !isInput) { e.preventDefault(); seekBy(-2); }
      if (e.code === 'ArrowRight' && !isInput) { e.preventDefault(); seekBy(2); }

      if (e.code === 'ArrowUp' && !isInput) {
        e.preventDefault();
        if (shadowingMode) {
          const visibleIndices = lesson?.subtitles
            .map((_, i) => i)
            .filter(i => bookmarkedIndices.has(i)) || [];
          const pos = visibleIndices.indexOf(currentIndex);
          if (pos > 0) selectSubtitle(visibleIndices[pos - 1]);
        } else {
          if (currentIndex > 0) selectSubtitle(currentIndex - 1);
        }
      }
      if (e.code === 'ArrowDown' && !isInput) {
        e.preventDefault();
        if (shadowingMode) {
          const visibleIndices = lesson?.subtitles
            .map((_, i) => i)
            .filter(i => bookmarkedIndices.has(i)) || [];
          const pos = visibleIndices.indexOf(currentIndex);
          if (pos < visibleIndices.length - 1) selectSubtitle(visibleIndices[pos + 1]);
        } else {
          const total = lesson?.subtitles?.length || 0;
          if (currentIndex < total - 1) selectSubtitle(currentIndex + 1);
        }
      }
      if (e.code === 'KeyB' && !isInput) { e.preventDefault(); cycleVideoBlur(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePlay, seekBy, seekToSubtitle, currentIndex, lesson, selectSubtitle, cycleVideoBlur, shadowingMode, bookmarkedIndices]);

  // Scroll a subtitle element to center of its scroll container
  const scrollSubIntoView = useCallback((el: HTMLElement) => {
    const container = subtitleListRef.current;
    if (!el || !container) return;
    const elRect = el.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const offset = elRect.top - containerRect.top - (container.clientHeight / 2) + (el.offsetHeight / 2);
    container.scrollBy({ top: offset, behavior: 'smooth' });
  }, []);

  // Scroll active subtitle into view
  useEffect(() => {
    const el = document.getElementById(`sub-${currentIndex}`);
    if (el) scrollSubIntoView(el);
  }, [currentIndex, scrollSubIntoView]);

  // Sync currentIndex with video playback time + auto-stop at subtitle end
  useEffect(() => {
    if (!lesson || !isPlaying) return;
    const subs = lesson.subtitles;
    const interval = setInterval(() => {
      // If an autoPauseTimer is already running (from seekToSub), don't interfere
      if (autoPauseTimer.current || autoPauseFallback.current) return;

      const t = lesson.videoType === 'youtube'
        ? ytTimeRef.current
        : videoRef.current?.currentTime ?? 0;
      // Find the subtitle that contains the current time
      for (let i = subs.length - 1; i >= 0; i--) {
        if (t >= subs[i].start - 0.15) {
          if (i !== currentIndex) {
            // Auto-stop: pause when leaving the current subtitle's time range
            if (autoStop && currentIndex >= 0 && currentIndex < subs.length) {
              const prevSub = subs[currentIndex];
              const prevEnd = prevSub.start + prevSub.dur + 0.15;
              if (t >= prevEnd) {
                if (lesson.videoType === 'youtube') {
                  ytCommand('pauseVideo');
                } else if (videoRef.current) {
                  videoRef.current.pause();
                }
                // Don't update currentIndex — stay on current subtitle
                return;
              }
            }
            setCurrentIndex(i);
            // Auto-scroll to it
            const el = document.getElementById(`sub-${i}`);
            if (el) scrollSubIntoView(el);
          }
          break;
        }
      }
    }, 150);
    return () => clearInterval(interval);
  }, [lesson, isPlaying, currentIndex, autoStop, ytCommand, scrollSubIntoView]);

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
      // Persist this correct word immediately
      if (!correctInputsRef.current[subIdx]) correctInputsRef.current[subIdx] = {};
      correctInputsRef.current[subIdx][wordIdx] = value;

      const sortedBlanks = Array.from(blanks).sort((a, b) => a - b);
      const currentPos = sortedBlanks.indexOf(wordIdx);
      const allInputs = { ...(blankInputs[subIdx] || {}), [wordIdx]: value };
      const allCorrect = sortedBlanks.every(wi => norm(allInputs[wi] || '') === norm(words[wi]));

      if (allCorrect) {
        // Sentence fully completed — clean up correctInputs for this sub
        delete correctInputsRef.current[subIdx];
        const newAttempts = totalAttempts + 1;
        setTotalAttempts(newAttempts);
        let newScore = score;
        let newCompleted = completedIndicesRef.current;
        if (!completedIndicesRef.current.includes(subIdx)) {
          newScore = score + 1;
          newCompleted = [...completedIndicesRef.current, subIdx];
          completedIndicesRef.current = newCompleted;
          setScore(newScore);
          setCompletedIndices(newCompleted);
        }
        const allResults: Record<number, 'correct' | 'incorrect'> = {};
        sortedBlanks.forEach(wi => { allResults[wi] = 'correct'; });
        setBlankResults(prev => ({ ...prev, [subIdx]: allResults }));
        saveProgress(newCompleted, newScore, newAttempts);

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
      // Save partial correct input (debounced via setTimeout to batch rapid typing)
      if (!allCorrect) {
        saveProgress(completedIndicesRef.current, score, totalAttempts);
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
    
    const nextRevealed = new Set(revealedWords);
    nextRevealed.add(key);
    setRevealedWords(nextRevealed);

    if (lesson && subTokens[subIdx]) {
      const { words, blanks } = subTokens[subIdx];

      // Track this revealed word in correctInputs
      if (!correctInputsRef.current[subIdx]) correctInputsRef.current[subIdx] = {};
      correctInputsRef.current[subIdx][wordIdx] = words[wordIdx];

      const subResults = blankResults[subIdx] || {};
      const allRevealed = words.every((_, wi) => {
        if (!blanks.has(wi)) return true;                          // visible word (not a blank) — always ok
        if (nextRevealed.has(`${subIdx}-${wi}`)) return true;             // blank was revealed
        if (subResults[wi] === 'correct') return true;            // blank was typed correctly
        return false;
      });

      if (allRevealed && !completedIndicesRef.current.includes(subIdx)) {
        // Sentence fully completed — clean up correctInputs for this sub
        delete correctInputsRef.current[subIdx];
        const newCompleted = [...completedIndicesRef.current, subIdx];
        completedIndicesRef.current = newCompleted;
        setCompletedIndices(newCompleted);

        // Increment attempts to reflect completion without score increase
        const newAttempts = totalAttempts + 1;
        setTotalAttempts(newAttempts);

        // Mark all as correct internally for consistency
        const sortedBlanks = Array.from(blanks).sort((a, b) => a - b);
        const allResults: Record<number, 'correct' | 'incorrect'> = {};
        sortedBlanks.forEach(wi => { allResults[wi] = 'correct'; });
        setBlankResults(prev => ({ ...prev, [subIdx]: allResults }));

        saveProgress(newCompleted, score, newAttempts);

        // Auto advance to next subtitle
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
      } else {
        // Partial reveal — save the partial correct inputs
        saveProgress(completedIndicesRef.current, score, totalAttempts);
      }
    }
  };

  // ── Edit mode functions ──
  const enterEditMode = useCallback(() => {
    if (!lesson) return;
    setEditSubtitles(JSON.parse(JSON.stringify(lesson.subtitles)));
    setEditSelectedSubs(new Set());
    setEditEditedSubs(new Set());
    setEditSaveMsg('');
    setEditMode(true);
  }, [lesson]);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    setEditSelectedSubs(new Set());
    setEditSaveMsg('');
  }, []);

  const updateEditSub = useCallback((index: number, field: keyof Subtitle, value: string | number) => {
    setEditSubtitles(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }, []);

  const deleteEditSub = useCallback((index: number) => {
    setEditSubtitles(prev => prev.filter((_, i) => i !== index));
    setEditSelectedSubs(prev => {
      const next = new Set<number>();
      prev.forEach(idx => {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      });
      return next;
    });
    setEditEditedSubs(prev => {
      const next = new Set<number>();
      prev.forEach(idx => {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      });
      return next;
    });
  }, []);

  const insertEditSubAfter = useCallback((index: number) => {
    setEditSubtitles(prev => {
      const current = prev[index];
      const nextSub = prev[index + 1];
      const newStart = parseFloat((current.start + current.dur).toFixed(2));
      const newDur = nextSub ? parseFloat(Math.max(0.5, nextSub.start - newStart).toFixed(2)) : 3;
      const updated = [...prev];
      updated.splice(index + 1, 0, { start: newStart, dur: Math.min(newDur, 5), text: '' });
      return updated;
    });
    setEditEditedSubs(prev => {
      const next = new Set<number>();
      prev.forEach(idx => {
        if (idx <= index) next.add(idx);
        else next.add(idx + 1);
      });
      return next;
    });
  }, []);

  const splitEditSub = useCallback((index: number) => {
    setEditSubtitles(prev => {
      const sub = prev[index];
      const text = sub.text;
      if (!text || text.length < 2) return prev;

      const inputEl = editTextRefs.current.get(index);
      let splitPos = inputEl?.selectionStart ?? -1;

      if (splitPos <= 0 || splitPos >= text.length) {
        splitPos = -1;
        for (const brk of ['. ', '! ', '? ']) {
          const idx = text.indexOf(brk);
          if (idx > 0 && idx < text.length - brk.length) { splitPos = idx + brk.length - 1; break; }
        }
        if (splitPos === -1) {
          const mid = Math.floor(text.length / 2);
          let bestSpace = -1, bestDist = Infinity;
          for (let j = 0; j < text.length; j++) {
            if (text[j] === ' ' && Math.abs(j - mid) < bestDist) { bestDist = Math.abs(j - mid); bestSpace = j; }
          }
          if (bestSpace > 0) splitPos = bestSpace;
          else return prev;
        }
      }

      const text1 = text.substring(0, splitPos).trim();
      const text2 = text.substring(splitPos).trim();
      if (!text1 || !text2) return prev;

      const ratio = text1.length / (text1.length + text2.length);
      const dur1 = parseFloat((sub.dur * ratio).toFixed(2));
      const dur2 = parseFloat((sub.dur - dur1).toFixed(2));
      const start2 = parseFloat((sub.start + dur1).toFixed(2));

      const updated = [...prev];
      updated.splice(index, 1, { start: sub.start, dur: dur1, text: text1 }, { start: start2, dur: dur2, text: text2 });
      return updated;
    });
    setEditSelectedSubs(new Set());
    setEditEditedSubs(prev => {
      const next = new Set<number>();
      prev.forEach(idx => {
        if (idx < index) next.add(idx);
        else if (idx === index) { next.add(idx); next.add(idx + 1); }
        else next.add(idx + 1);
      });
      return next;
    });
  }, []);

  const toggleEditSelect = useCallback((index: number) => {
    setEditSelectedSubs(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }, []);

  const mergeEditSubs = useCallback(() => {
    if (editSelectedSubs.size < 2) return;
    const indices = Array.from(editSelectedSubs).sort((a, b) => a - b);
    const firstIdx = indices[0];
    setEditSubtitles(prev => {
      const first = prev[indices[0]];
      const last = prev[indices[indices.length - 1]];
      const mergedText = indices.map(i => prev[i].text).join(' ');
      const endTime = last.start + last.dur;
      const merged: Subtitle = { start: first.start, dur: parseFloat((endTime - first.start).toFixed(2)), text: mergedText };
      const updated = prev.filter((_, i) => !indices.includes(i));
      updated.splice(firstIdx, 0, merged);
      return updated;
    });
    setEditSelectedSubs(new Set());
    setEditEditedSubs(prev => {
      const next = new Set<number>();
      prev.forEach(idx => {
        if (!indices.includes(idx)) {
          const offset = indices.filter(ri => ri < idx).length;
          next.add(idx - offset);
        }
      });
      next.add(firstIdx);
      return next;
    });
  }, [editSelectedSubs]);

  const handleEditSave = useCallback(async () => {
    if (!lesson) return;
    setEditSaving(true);
    setEditSaveMsg('');
    try {
      // Lesson page always saves to personal custom subtitles (for ALL users including admin)
      // Only the admin page (/admin) saves directly to base lesson subtitles
      const res = await fetch('/api/user-subtitles', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lessonId: lesson._id, subtitles: editSubtitles }),
      });
      if (res.ok) {
        setEditSaveMsg('✅ Gespeichert!');
        setLesson(prev => prev ? { ...prev, subtitles: JSON.parse(JSON.stringify(editSubtitles)) } : prev);
        setHasCustomSubs(true);
        setTimeout(() => setEditSaveMsg(''), 3000);
      } else {
        setEditSaveMsg('❌ Fehler');
      }
    } catch {
      setEditSaveMsg('❌ Fehler');
    }
    setEditSaving(false);
  }, [lesson, editSubtitles]);

  // Reset custom subtitles back to original
  const handleResetSubs = useCallback(async () => {
    if (!lesson) return;
    if (!window.confirm('Eigene Untertitel wirklich zurücksetzen? Alle Änderungen gehen verloren.')) return;
    try {
      const res = await fetch(`/api/user-subtitles?lessonId=${lesson._id}`, { method: 'DELETE' });
      if (res.ok) {
        setLesson(prev => prev ? { ...prev, subtitles: JSON.parse(JSON.stringify(originalSubtitlesRef.current)) } : prev);
        setHasCustomSubs(false);
        setEditMode(false);
        setEditSaveMsg('');
      }
    } catch (err) {
      console.error('Error resetting subs:', err);
    }
  }, [lesson]);

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
        <button className="lesson-back-btn" onClick={() => router.push('/')}>←</button>
        <button
          className={`lesson-edit-btn ${editMode ? 'lesson-edit-btn-active' : ''}`}
          onClick={() => editMode ? exitEditMode() : enterEditMode()}
          title={editMode ? 'Editor schließen' : 'Untertitel bearbeiten'}
        >
          ✏️ {editMode ? 'Schließen' : 'Edit'}
        </button>
        {hasCustomSubs && !editMode && (
          <span className="lesson-custom-sub-badge" title="Du verwendest eigene Untertitel">📝 Meine Sub</span>
        )}
        {hasCustomSubs && (
          <button
            className="lesson-reset-btn"
            onClick={handleResetSubs}
            title="Eigene Untertitel löschen und zurück zum Original"
          >
            🔄 Reset
          </button>
        )}
        <span className="lesson-level">{lesson.level}</span>
        <span className="lesson-header-stat">{totalSubs} Sätze</span>
        <span className="lesson-header-stat">{isPlaying ? '▶' : '⏸'} {isPlaying ? 'Spielt' : 'Pausiert'}</span>
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
              videoBlurLevel={videoBlurLevel}
              shadowingMode={shadowingMode}
              bookmarkCount={bookmarkedIndices.size}
              onCycleBlur={cycleVideoBlur}
              onToggleShadowing={toggleShadowingMode}
              autoStop={autoStop}
              onToggleAutoStop={() => setAutoStop(prev => !prev)}
            />
          </div>
        </div>

        {/* RIGHT: Subtitle list OR Free typing panel */}
        <div className={`lesson-right ${shadowingMode ? 'lesson-right-shadowing' : ''}`} ref={subtitleListRef}>
          {editMode ? (
            <>
              {/* Edit toolbar */}
              <div className="sub-edit-toolbar">
                {isAdmin && editSelectedSubs.size >= 2 && (
                  <button className="btn btn-sm" style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)', border: '2px solid #b45309', boxShadow: '2px 2px 0 #b45309', color: '#fff', fontWeight: 900, fontSize: '0.72rem' }} onClick={mergeEditSubs}>
                    🔗 Gộp {editSelectedSubs.size} dòng
                  </button>
                )}
                {isAdmin && editSelectedSubs.size > 0 && (
                  <button className="btn btn-secondary btn-sm" style={{ fontSize: '0.68rem', opacity: 0.7 }} onClick={() => setEditSelectedSubs(new Set())}>✕ Bỏ chọn</button>
                )}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                  {editSubtitles.length} Zeilen
                  {editEditedSubs.size > 0 && (
                    <span style={{
                      marginLeft: 6,
                      padding: '0.1rem 0.4rem',
                      borderRadius: '999px',
                      background: 'rgba(34,197,94,0.12)',
                      border: '1.5px solid rgba(34,197,94,0.4)',
                      color: 'var(--color-accent)',
                      fontWeight: 900,
                      fontSize: '0.65rem',
                    }}>
                      ✅ {editEditedSubs.size} đã chỉnh
                    </span>
                  )}
                </span>
                <button className="btn btn-primary btn-sm" onClick={handleEditSave} disabled={editSaving} style={{ fontSize: '0.72rem' }}>
                  {editSaving ? '⏳...' : '💾 Speichern'}
                </button>
                {editSaveMsg && <span style={{ fontSize: '0.72rem', fontWeight: 800, color: editSaveMsg.startsWith('✅') ? 'var(--color-success)' : 'var(--color-error)' }}>{editSaveMsg}</span>}
              </div>
              {/* Edit rows — same card style */}
              {editSubtitles.map((sub, i) => (
                <div
                  key={i}
                  className={`sub-row sub-edit-row ${editSelectedSubs.has(i) ? 'sub-edit-selected' : ''}`}
                >
                  <div className="sub-row-header">
                    {isAdmin && (
                      <input
                        type="checkbox"
                        checked={editSelectedSubs.has(i)}
                        onChange={() => toggleEditSelect(i)}
                        style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#f59e0b', flexShrink: 0 }}
                      />
                    )}
                    <span className="sub-number">{i + 1}</span>
                    {editEditedSubs.has(i) && (
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20, borderRadius: '50%',
                          background: 'rgba(34,197,94,0.2)',
                          border: '2px solid rgba(34,197,94,0.6)',
                          fontSize: '0.7rem',
                          color: '#4ade80',
                          fontWeight: 900,
                          flexShrink: 0,
                        }}
                        title="Đã gộp / chỉnh thời gian ✓"
                      >
                        ✓
                      </span>
                    )}
                    <button className="sub-play-btn" onClick={(e) => { e.stopPropagation(); seekToSub(sub, autoStop); }} title="Abspielen">🔊</button>
                    {isAdmin && (
                      <div className="sub-edit-time-group">
                        <input
                          type="number" step="0.1" min="0"
                          value={parseFloat(sub.start.toFixed(1))}
                          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 0) { updateEditSub(i, 'start', parseFloat(v.toFixed(2))); setEditEditedSubs(prev => new Set(prev).add(i)); seekToSub({ ...sub, start: parseFloat(v.toFixed(2)) }, autoStop); } }}
                          className="sub-edit-time-input"
                          title="Start (s)"
                        />
                        <input
                          type="number" step="0.1" min="0.1"
                          value={parseFloat(sub.dur.toFixed(1))}
                          onChange={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v > 0) { updateEditSub(i, 'dur', parseFloat(v.toFixed(2))); setEditEditedSubs(prev => new Set(prev).add(i)); seekToSub({ ...sub, dur: parseFloat(v.toFixed(2)) }, autoStop); } }}
                          className="sub-edit-time-input"
                          title="Dauer (s)"
                        />
                      </div>
                    )}
                    <span className="sub-time">{formatTime(sub.start)}</span>
                    <div className="sub-edit-actions">
                      {isAdmin && <button onClick={() => splitEditSub(i)} className="sub-edit-action-btn" title="Split (✂️)">✂️</button>}
                      {isAdmin && <button onClick={() => insertEditSubAfter(i)} className="sub-edit-action-btn" title="Einfügen (➕)">➕</button>}
                      <button onClick={() => deleteEditSub(i)} className="sub-edit-action-btn" title="Löschen (🗑)">🗑</button>
                    </div>
                  </div>
                  <div className="sub-cloze" style={{ paddingLeft: '2.8rem' }}>
                    <input
                      type="text"
                      ref={el => { if (el) editTextRefs.current.set(i, el); else editTextRefs.current.delete(i); }}
                      value={sub.text}
                      onChange={e => updateEditSub(i, 'text', e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (isAdmin) splitEditSub(i); } }}
                      className="sub-edit-text-input"
                      placeholder="Untertiteltext..."
                    />
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {shadowingMode && bookmarkedIndices.size === 0 && (
                <div className="shadowing-empty">
                  <span className="shadowing-empty-icon">🔖</span>
                  <p className="shadowing-empty-text">Keine Sätze markiert</p>
                  <p className="shadowing-empty-hint">Klicke auf ☆ neben einem Satz, um ihn zu markieren.</p>
                </div>
              )}
              {lesson.subtitles.map((sub, i) => {
                const tokens = subTokens[i];
                if (!tokens) return null;
                if (shadowingMode && !bookmarkedIndices.has(i)) return null;

                return (
                  <ClozeRow
                    key={i}
                    sub={sub}
                    index={i}
                    isActive={i === currentIndex}
                    isCompleted={completedIndices.includes(i)}
                    isBookmarked={bookmarkedIndices.has(i)}
                    tokens={tokens}
                    subResults={blankResults[i] || {}}
                    subInputs={blankInputs[i] || {}}
                    revealedWords={revealedWords}
                    blankMode={blankMode}
                    blankRefs={blankRefs}
                    hiddenWordRefs={hiddenWordRefs}
                    onSelect={selectSubtitle}
                    onChange={handleBlankChange}
                    onKeyDown={handleBlankKeyDown}
                    onRevealWord={revealWord}
                    onToggleBookmark={toggleBookmark}
                  />
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
