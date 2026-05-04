'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
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

export default function LessonPage() {
  const { id } = useParams();
  const { data: session, status } = useSession();
  const router = useRouter();

  const [lesson, setLesson] = useState<LessonData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<'correct' | 'incorrect' | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [completedIndices, setCompletedIndices] = useState<number[]>([]);
  const [score, setScore] = useState(0);
  const [totalAttempts, setTotalAttempts] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(true);

  const playerRef = useRef<YT.Player | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const ytReady = useRef(false);

  // Load lesson + progress
  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status !== 'authenticated') return;

    Promise.all([
      fetch(`/api/lessons/${id}`).then(r => r.json()),
      fetch(`/api/progress?lessonId=${id}`).then(r => r.json()),
    ]).then(([lessonData, progressData]) => {
      setLesson(lessonData);
      if (progressData?.currentIndex) setCurrentIndex(progressData.currentIndex);
      if (progressData?.completedIndices) setCompletedIndices(progressData.completedIndices);
      if (progressData?.score) setScore(progressData.score);
      if (progressData?.totalAttempts) setTotalAttempts(progressData.totalAttempts);
      setLoading(false);
    });
  }, [id, status, router]);

  // YouTube IFrame API
  useEffect(() => {
    if (!lesson || lesson.videoType !== 'youtube') return;

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);

    (window as unknown as Record<string, unknown>).onYouTubeIframeAPIReady = () => {
      ytReady.current = true;
      playerRef.current = new YT.Player('yt-player', {
        videoId: lesson.youtubeId,
        playerVars: { controls: 1, modestbranding: 1, rel: 0 },
        events: {
          onStateChange: (e: YT.OnStateChangeEvent) => {
            setIsPlaying(e.data === YT.PlayerState.PLAYING);
          },
        },
      });
    };

    return () => { delete (window as unknown as Record<string, unknown>).onYouTubeIframeAPIReady; };
  }, [lesson]);

  // Save progress
  const saveProgress = useCallback(async (idx: number, completed: number[], sc: number, attempts: number) => {
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lessonId: id,
        currentIndex: idx,
        completedIndices: completed,
        score: sc,
        totalAttempts: attempts,
        isCompleted: lesson ? completed.length >= lesson.subtitles.length : false,
      }),
    });
  }, [id, lesson]);

  // Seek to subtitle
  const seekToSubtitle = useCallback((index: number) => {
    if (!lesson) return;
    const sub = lesson.subtitles[index];
    if (!sub) return;

    if (lesson.videoType === 'youtube' && playerRef.current) {
      playerRef.current.seekTo(sub.start, true);
      playerRef.current.playVideo();
    } else if (lesson.videoType === 'local' && videoRef.current) {
      videoRef.current.currentTime = sub.start;
      videoRef.current.play();
    }
  }, [lesson]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';

      if (e.code === 'Space' && !isInput) {
        e.preventDefault();
        togglePlay();
      }

      if (e.code === 'ArrowLeft') {
        e.preventDefault();
        seekBy(-3);
      }
      if (e.code === 'ArrowRight') {
        e.preventDefault();
        seekBy(3);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const togglePlay = () => {
    if (lesson?.videoType === 'youtube' && playerRef.current) {
      const state = playerRef.current.getPlayerState();
      if (state === YT.PlayerState.PLAYING) {
        playerRef.current.pauseVideo();
      } else {
        playerRef.current.playVideo();
      }
    } else if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
      } else {
        videoRef.current.pause();
      }
    }
  };

  const seekBy = (seconds: number) => {
    if (lesson?.videoType === 'youtube' && playerRef.current) {
      const current = playerRef.current.getCurrentTime();
      playerRef.current.seekTo(current + seconds, true);
    } else if (videoRef.current) {
      videoRef.current.currentTime += seconds;
    }
  };

  // Check answer
  const checkAnswer = () => {
    if (!lesson) return;
    const sub = lesson.subtitles[currentIndex];
    if (!sub) return;

    const normalize = (s: string) => s.toLowerCase().trim().replace(/[.,!?;:'"]/g, '').replace(/\s+/g, ' ');
    const isCorrect = normalize(input) === normalize(sub.text);

    setResult(isCorrect ? 'correct' : 'incorrect');
    const newAttempts = totalAttempts + 1;
    setTotalAttempts(newAttempts);

    let newScore = score;
    let newCompleted = completedIndices;

    if (isCorrect && !completedIndices.includes(currentIndex)) {
      newScore = score + 1;
      newCompleted = [...completedIndices, currentIndex];
      setScore(newScore);
      setCompletedIndices(newCompleted);
    }

    saveProgress(currentIndex, newCompleted, newScore, newAttempts);
  };

  const nextSubtitle = () => {
    if (!lesson) return;
    const nextIdx = Math.min(currentIndex + 1, lesson.subtitles.length - 1);
    setCurrentIndex(nextIdx);
    setInput('');
    setResult(null);
    setShowHint(false);
    seekToSubtitle(nextIdx);
    inputRef.current?.focus();
  };

  const prevSubtitle = () => {
    const prevIdx = Math.max(currentIndex - 1, 0);
    setCurrentIndex(prevIdx);
    setInput('');
    setResult(null);
    setShowHint(false);
    seekToSubtitle(prevIdx);
    inputRef.current?.focus();
  };

  if (status === 'loading' || loading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  if (!lesson) {
    return <div className="diktat-container"><div className="empty-state"><p>Lektion nicht gefunden</p></div></div>;
  }

  const sub = lesson.subtitles[currentIndex];
  const totalSubs = lesson.subtitles.length;
  const pct = totalSubs > 0 ? Math.round((completedIndices.length / totalSubs) * 100) : 0;

  return (
    <div className="diktat-container">
      <h1 style={{ fontSize: '1.4rem', fontWeight: 600, marginBottom: 8 }}>{lesson.title}</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: 24 }}>
        Level {lesson.level} • {totalSubs} Sätze
      </p>

      {/* Video */}
      <div className="video-wrapper">
        {lesson.videoType === 'youtube' ? (
          <div id="yt-player" />
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

      {/* Shortcuts */}
      <div className="shortcuts-info">
        <h4>Tastenkürzel</h4>
        <div className="shortcuts-list">
          <div className="shortcut"><kbd>Space</kbd> Play/Pause</div>
          <div className="shortcut"><kbd>←</kbd> -3 Sek.</div>
          <div className="shortcut"><kbd>→</kbd> +3 Sek.</div>
          <div className="shortcut"><kbd>Enter</kbd> Prüfen</div>
        </div>
      </div>

      {/* Progress */}
      <div className="progress-info">
        <div className="progress-stat">
          <div className="progress-stat-value">{currentIndex + 1}/{totalSubs}</div>
          <div className="progress-stat-label">Aktuell</div>
        </div>
        <div className="progress-stat">
          <div className="progress-stat-value">{completedIndices.length}</div>
          <div className="progress-stat-label">Richtig</div>
        </div>
        <div className="progress-stat">
          <div className="progress-stat-value">{pct}%</div>
          <div className="progress-stat-label">Fortschritt</div>
        </div>
        <div className="progress-stat">
          <div className="progress-stat-value" style={{ color: isPlaying ? 'var(--success)' : 'var(--error)' }}>
            {isPlaying ? '▶' : '⏸'}
          </div>
          <div className="progress-stat-label">Status</div>
        </div>
      </div>

      {/* Diktat Input */}
      <div className="diktat-input-area">
        <input
          ref={inputRef}
          type="text"
          className={`diktat-input ${result === 'correct' ? 'correct' : result === 'incorrect' ? 'incorrect' : ''}`}
          value={input}
          onChange={e => { setInput(e.target.value); setResult(null); }}
          onKeyDown={e => { if (e.key === 'Enter') checkAnswer(); }}
          placeholder="Schreibe, was du hörst..."
          autoFocus
        />
      </div>

      {/* Result */}
      {result === 'correct' && (
        <div className="diktat-result correct">✓ Richtig! &quot;{sub?.text}&quot;</div>
      )}
      {result === 'incorrect' && (
        <div className="diktat-result incorrect">✗ Falsch. Versuche es nochmal oder zeige den Hinweis.</div>
      )}

      {/* Hint */}
      {showHint && sub && (
        <div className="diktat-hint">💡 Antwort: {sub.text}</div>
      )}

      {/* Controls */}
      <div className="diktat-controls">
        <button className="btn btn-secondary" onClick={prevSubtitle} disabled={currentIndex === 0}>
          ← Zurück
        </button>
        <button className="btn btn-primary" onClick={() => { seekToSubtitle(currentIndex); }}>
          🔊 Wiederholen
        </button>
        <button className="btn btn-primary" onClick={checkAnswer} disabled={!input.trim()}>
          Prüfen
        </button>
        <button className="btn btn-secondary" onClick={() => setShowHint(true)}>
          Hinweis
        </button>
        <button className="btn btn-secondary" onClick={nextSubtitle} disabled={currentIndex >= totalSubs - 1}>
          Weiter →
        </button>
      </div>
    </div>
  );
}
