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
  A1: '#22c55e',
  A2: '#14b8a6',
  B1: '#38bdf8',
  B2: '#a855f7',
  C1: '#f472b6',
  C2: '#fb923c',
};

// Cartoon shadow color for each level (darker shade)
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}



// Circular progress ring component
function ProgressRing({ pct, size = 44, stroke = 3.5, levelColor }: { pct: number; size?: number; stroke?: number; levelColor?: string }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (pct / 100) * circ;
  const color = pct >= 90 ? '#4ade80' : (levelColor || '#22c55e');

  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke}
      />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={stroke + 0.5}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease', filter: `drop-shadow(0 0 4px ${color}99)` }}
      />
      <text
        x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill="#ffffff" fontSize={size * 0.28} fontWeight="900"
        fontFamily="Nunito, sans-serif"
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
  if (h < 17) return { text: 'Guten Tag', emoji: '🍄️' };
  if (h < 21) return { text: 'Guten Abend', emoji: '🌅' };
  return { text: 'Gute Nacht', emoji: '🌙' };
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const userName = (session?.user?.name || 'Lerner').split(' ')[0];
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [lessonsReady, setLessonsReady] = useState(false);
  const [progressReady, setProgressReady] = useState(false);
  const router = useRouter();

  const fetchData = useCallback(() => {
    if (status !== 'authenticated') return;

    const fetchLessons = async () => {
      try {
        const r = await fetch('/api/lessons', { cache: 'no-store' });
        if (!r.ok) return null;
        const data = await r.json();
        return Array.isArray(data) ? (data as Lesson[]) : null;
      } catch {
        return null;
      }
    };

    const fetchProgress = async (retries = 2): Promise<Progress[] | null> => {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const r = await fetch('/api/progress', { cache: 'no-store' });
          if (r.ok) {
            const data = await r.json();
            if (Array.isArray(data)) return data as Progress[];
          }
        } catch {
          // ignore and retry
        }
        if (attempt < retries) {
          await new Promise(res => setTimeout(res, 400 * (attempt + 1)));
        }
      }
      return null;
    };

    Promise.all([fetchLessons(), fetchProgress()]).then(([lessonsData, progressData]) => {
      if (lessonsData) {
        setLessons(lessonsData);
        setLessonsReady(true);
      }
      if (progressData) {
        setProgress(progressData);
        setProgressReady(true);
      }
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

  // Only block on auth + lesson loading — progress loads in background
  if (status === 'loading' || !lessonsReady) {
    return (
      <div className="loading">
        <div className="loading-cute">
          <span className="loading-mascot">🇩🇪</span>
          <div className="loading-dots">
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
          <span className="loading-text">Lektionen werden geladen…</span>
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
    let count = Math.min(2, lessons.length); // show 2 next lessons
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

  const newestLessonId = lessons.length > 0 ? lessons[lessons.length - 1]._id : null;

  return (
    <div className="home-page">

      {/* Lesson Grid */}

      <div className="container">
        {lessons.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">🌱</span>
            <p className="empty-state-text">Noch keine Lektionen verfügbar</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: 8, fontWeight: 700 }}>
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
              {lessons
                .map((lesson, idx) => ({
                  lesson,
                  idx,
                  // Compute isLocked based on original index BEFORE sorting
                  isLocked: idx >= unlockedCount,
                }))
                .sort((a, b) => {
                  const aPct = getLessonPct(a.lesson._id, a.lesson.subtitles?.length || 0);
                  const bPct = getLessonPct(b.lesson._id, b.lesson.subtitles?.length || 0);
                  const aDone = aPct >= 90;
                  const bDone = bPct >= 90;
                  if (aDone !== bDone) return aDone ? 1 : -1;
                  return a.idx - b.idx;
                })
                .map(({ lesson, idx, isLocked }) => {
                const prog = getProgress(lesson._id);
                const totalSubs = lesson.subtitles?.length || 0;
                const completed = prog?.completedIndices?.length || 0;
                const pct = totalSubs > 0 ? Math.round((completed / totalSubs) * 100) : 0;
                const thumb = getThumbnail(lesson);
                const levelColor = LEVEL_COLORS[lesson.level] || '#22c55e';
                const levelShadow = LEVEL_SHADOWS[lesson.level] || '#15803d';
                const levelEmoji = LEVEL_EMOJI[lesson.level] || '📝';
                const isNewest = lesson._id === newestLessonId && !isLocked;

                const cardContent = (
                  <article
                    className={`home-card ${isLocked ? 'home-card-locked' : ''}`}
                    style={isLocked ? {} : {
                      '--card-glow-color': levelColor,
                      '--card-shadow-color': levelShadow,
                    } as React.CSSProperties}
                  >
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
                          background: isLocked ? 'rgba(255,255,255,0.12)' : levelColor,
                          borderColor: isLocked ? 'rgba(255,255,255,0.15)' : levelShadow,
                          boxShadow: isLocked ? 'none' : `2px 2px 0 ${levelShadow}`,
                          left: isNewest ? '2.5rem' : '0.625rem',
                        }}
                      >
                        {levelEmoji} {lesson.level}
                      </span>

                      {/* NEW badge */}
                      {isNewest && (
                        <span className="home-card-new-badge">✨ NEU</span>
                      )}

                      {/* Lock overlay */}
                      {isLocked && (
                        <div className="home-card-lock-overlay">
                          <div className="home-card-lock-overlay-inner">
                            <span className="lock-icon-cute">🔒</span>
                            <span>Lektion {idx} abschließen</span>
                            {idx > 0 && (
                              <div className="home-card-lock-prev-progress">
                                <div
                                  className="home-card-lock-prev-fill"
                                  style={{ width: `${getLessonPct(lessons[idx - 1]?._id, lessons[idx - 1]?.subtitles?.length || 0)}%` }}
                                />
                              </div>
                            )}
                          </div>
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
                                    background: pct >= 90
                                      ? `linear-gradient(90deg, ${levelColor} 0%, #a3e635 100%)`
                                      : `linear-gradient(90deg, ${levelColor} 0%, ${levelShadow} 100%)`,
                                    boxShadow: `0 0 6px ${levelColor}66`,
                                  }}
                                />
                              </div>
                              <span className="home-card-progress-text">
                                {completed}/{totalSubs} ✍️
                              </span>
                            </div>
                            <ProgressRing pct={pct} size={42} stroke={3} levelColor={levelColor} />
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
