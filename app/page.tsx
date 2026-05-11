'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Lesson {
  _id: string;
  slug?: string;
  title: string;
  description: string;
  level: string;
  videoType: string;
  youtubeId?: string;
  thumbnail?: string;
  duration?: number;
  subtitles: { start: number; dur: number; text: string }[];
  createdAt: string;
}

interface Progress {
  lessonId: { _id: string } | string;
  completedIndices: number[];
  score: number;
  totalAttempts: number;
  isCompleted: boolean;
}

const LEVEL_COLORS: Record<string, string> = {
  A1: '#00b894',
  A2: '#00cec9',
  B1: '#6c5ce7',
  B2: '#a855f7',
  C1: '#fd79a8',
  C2: '#e17055',
};

const LEVEL_EMOJI: Record<string, string> = {
  A1: '🌱',
  A2: '🌿',
  B1: '🌸',
  B2: '💜',
  C1: '🔥',
  C2: '⭐',
};

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Heute';
  if (days === 1) return 'Gestern';
  if (days < 7) return `Vor ${days} Tagen`;
  if (days < 30) return `Vor ${Math.floor(days / 7)} Wochen`;
  return `Vor ${Math.floor(days / 30)} Monaten`;
}

// Circular progress ring component
function ProgressRing({ pct, size = 44, stroke = 3.5 }: { pct: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;

  return (
    <svg width={size} height={size} className="progress-ring">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={pct >= 100 ? 'var(--success)' : 'var(--accent)'}
        strokeWidth={stroke}
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        fill="var(--text-primary)"
        fontSize={size * 0.24}
        fontWeight="700"
        fontFamily="Inter, sans-serif"
      >
        {pct}%
      </text>
    </svg>
  );
}

function getGreeting(): { text: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 6) return { text: 'Gute Nacht', emoji: '🌙' };
  if (h < 12) return { text: 'Guten Morgen', emoji: '☀️' };
  if (h < 17) return { text: 'Guten Tag', emoji: '🌤️' };
  if (h < 21) return { text: 'Guten Abend', emoji: '🌅' };
  return { text: 'Gute Nacht', emoji: '🌙' };
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const fetchData = useCallback(() => {
    if (status !== 'authenticated') return;
    Promise.all([
      fetch('/api/lessons', { cache: 'no-store' }).then(r => r.json()),
      fetch('/api/progress', { cache: 'no-store' }).then(r => r.json()),
    ]).then(([lessonsData, progressData]) => {
      const sorted = (lessonsData as Lesson[]).sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      setLessons(sorted);
      setProgress(Array.isArray(progressData) ? progressData : []);
      setLoading(false);
    });
  }, [status]);

  // Initial load + auth redirect
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    fetchData();
  }, [status, router, fetchData]);

  // Refetch when page becomes visible again (e.g. navigating back from lesson)
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    const handleFocus = () => fetchData();
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fetchData]);

  const getProgress = (lessonId: string) => {
    return progress.find(p => {
      if (!p.lessonId) return false;
      const id = typeof p.lessonId === 'object' ? p.lessonId._id : p.lessonId;
      return id === lessonId;
    });
  };

  if (status === 'loading' || loading) {
    return (
      <div className="loading">
        <div className="loading-cute">
          <div className="spinner" />
          <span className="loading-text">Lade deine Lektionen... ✨</span>
        </div>
      </div>
    );
  }

  const totalLessons = lessons.length;

  // Compute completion % for each lesson to determine unlock state
  const getLessonPct = (lessonId: string, subtitleCount: number) => {
    const prog = getProgress(lessonId);
    const completed = prog?.completedIndices?.length || 0;
    return subtitleCount > 0 ? Math.round((completed / subtitleCount) * 100) : 0;
  };

  // Progressive unlock: lesson[i] is unlocked if i===0 or lesson[i-1] >= 90%
  const unlockedCount = (() => {
    let count = 1; // first lesson always unlocked
    for (let i = 0; i < lessons.length - 1; i++) {
      const pct = getLessonPct(lessons[i]._id, lessons[i].subtitles?.length || 0);
      if (pct >= 90) count++;
      else break;
    }
    return count;
  })();

  const completedCount = lessons.filter(l => {
    const prog = getProgress(l._id);
    return prog?.isCompleted;
  }).length;

  const totalOverallPct = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const getThumbnail = (lesson: Lesson) => {
    if (lesson.thumbnail) return lesson.thumbnail;
    if (lesson.youtubeId) return `https://img.youtube.com/vi/${lesson.youtubeId}/mqdefault.jpg`;
    return null;
  };

  const greeting = getGreeting();

  return (
    <div className="home-page">
      {/* Hero Section */}
      <div className="home-hero">
        <div className="container">
          <div className="home-hero-content">
            <div className="home-hero-greeting">
              <span className="home-hero-greeting-emoji">{greeting.emoji}</span>
              <span className="home-hero-greeting-text">
                {greeting.text}, <strong>{session?.user?.name || 'Lerner'}</strong>!
              </span>
            </div>
            <h1 className="home-hero-title">
              Bereit zum <span className="home-hero-accent">Deutschlernen</span>? 🎯
            </h1>
            <p className="home-hero-subtitle">
              Höre zu, schreibe mit, und werde besser — Schritt für Schritt! 🚀
            </p>
          </div>
        </div>
      </div>

      {/* Lesson Grid */}
      <div className="container">
        {lessons.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">📭</div>
            <p className="empty-state-text">Noch keine Lektionen verfügbar</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 8 }}>
              Erstelle deine erste Lektion im Admin-Bereich ✨
            </p>
          </div>
        ) : (
          <>
            <div className="home-section-header">
              <h2 className="home-section-title">
                <span>📖</span> Alle Lektionen
              </h2>
              <span className="home-section-count">
                🔓 {unlockedCount}/{totalLessons} freigeschaltet
              </span>
            </div>
            <div className="home-grid">
              {lessons.map((lesson, idx) => {
                const prog = getProgress(lesson._id);
                const totalSubs = lesson.subtitles?.length || 0;
                const completed = prog?.completedIndices?.length || 0;
                const pct = totalSubs > 0 ? Math.round((completed / totalSubs) * 100) : 0;
                const thumb = getThumbnail(lesson);
                const levelColor = LEVEL_COLORS[lesson.level] || 'var(--accent)';
                const levelEmoji = LEVEL_EMOJI[lesson.level] || '📝';
                const isLocked = idx >= unlockedCount;

                const cardContent = (
                  <article className={`home-card ${isLocked ? 'home-card-locked' : ''}`}>
                    {/* Thumbnail */}
                    <div className="home-card-thumb">
                      {thumb ? (
                        <img src={thumb} alt={lesson.title} loading="lazy" />
                      ) : (
                        <div className="home-card-thumb-placeholder">
                          <span>🎬</span>
                        </div>
                      )}
                      <div className="home-card-thumb-overlay" />

                      {/* Duration badge */}
                      {!isLocked && lesson.duration && lesson.duration > 0 && (
                        <span className="home-card-duration">
                          ⏱️ {formatDuration(lesson.duration)}
                        </span>
                      )}

                      {/* Level badge */}
                      <span
                        className="home-card-level"
                        style={{
                          background: isLocked ? '#555' : levelColor,
                          boxShadow: isLocked ? 'none' : `0 2px 12px ${levelColor}44`,
                        }}
                      >
                        {levelEmoji} {lesson.level}
                      </span>

                      {/* Lock overlay */}
                      {isLocked && (
                        <div className="home-card-lock-overlay">
                          <span className="lock-icon-cute">🔒</span>
                          <span>Lektion {idx} abschließen</span>
                        </div>
                      )}

                      {/* Completed overlay */}
                      {!isLocked && prog?.isCompleted && (
                        <div className="home-card-completed-badge">
                          <span>🎉</span>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="home-card-body">
                      <h3 className="home-card-title">{lesson.title}</h3>

                      <div className="home-card-meta">
                        <span className="home-card-meta-item">
                          ✏️ {totalSubs} Sätze
                        </span>
                        <span className="home-card-meta-item">
                          {lesson.videoType === 'youtube' ? '▶️ YouTube' : '📁 Lokal'}
                        </span>
                      </div>

                      {/* Progress section */}
                      {!isLocked && (
                        <div className="home-card-footer">
                          <div className="home-card-progress-info">
                            <div className="home-card-progress-bar">
                              <div
                                className="home-card-progress-fill"
                                style={{
                                  width: `${pct}%`,
                                  background: pct >= 100 ? 'var(--success)' : 'var(--gradient-1)',
                                }}
                              />
                            </div>
                            <span className="home-card-progress-text">
                              {pct >= 100 ? '🎊 ' : '📝 '}{completed}/{totalSubs}
                            </span>
                          </div>
                          <ProgressRing pct={pct} size={36} stroke={3} />
                        </div>
                      )}
                    </div>
                  </article>
                );

                if (isLocked) {
                  return <div key={lesson._id} className="home-card-link home-card-link-locked">{cardContent}</div>;
                }

                return (
                  <Link
                    key={lesson._id}
                    href={`/lesson/${lesson.slug || lesson._id}`}
                    className="home-card-link"
                  >
                    {cardContent}
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
