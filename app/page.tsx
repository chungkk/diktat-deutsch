'use client';
import { useEffect, useState } from 'react';
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

export default function HomePage() {
  const { data: session, status } = useSession();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status === 'authenticated') {
      Promise.all([
        fetch('/api/lessons').then(r => r.json()),
        fetch('/api/progress').then(r => r.json()),
      ]).then(([lessonsData, progressData]) => {
        setLessons(lessonsData);
        setProgress(Array.isArray(progressData) ? progressData : []);
        setLoading(false);
      });
    }
  }, [status, router]);

  const getProgress = (lessonId: string) => {
    return progress.find(p => {
      if (!p.lessonId) return false;
      const id = typeof p.lessonId === 'object' ? p.lessonId._id : p.lessonId;
      return id === lessonId;
    });
  };

  if (status === 'loading' || loading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  const totalLessons = lessons.length;

  const getThumbnail = (lesson: Lesson) => {
    if (lesson.thumbnail) return lesson.thumbnail;
    if (lesson.youtubeId) return `https://img.youtube.com/vi/${lesson.youtubeId}/mqdefault.jpg`;
    return null;
  };

  return (
    <div className="home-page">

      {/* Lesson Grid */}
      <div className="container">
        {lessons.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">🎧</div>
            <p className="empty-state-text">Noch keine Lektionen verfügbar</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: 8 }}>
              Erstelle deine erste Lektion im Admin-Bereich
            </p>
          </div>
        ) : (
          <>
            <div className="home-section-header">
              <h2 className="home-section-title">Alle Lektionen</h2>
              <span className="home-section-count">{totalLessons} verfügbar</span>
            </div>
            <div className="home-grid">
              {lessons.map(lesson => {
                const prog = getProgress(lesson._id);
                const totalSubs = lesson.subtitles?.length || 0;
                const completed = prog?.completedIndices?.length || 0;
                const pct = totalSubs > 0 ? Math.round((completed / totalSubs) * 100) : 0;
                const thumb = getThumbnail(lesson);
                const levelColor = LEVEL_COLORS[lesson.level] || 'var(--accent)';

                return (
                  <Link
                    key={lesson._id}
                    href={`/lesson/${lesson.slug || lesson._id}`}
                    className="home-card-link"
                  >
                    <article className="home-card">
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
                        {lesson.duration && lesson.duration > 0 && (
                          <span className="home-card-duration">
                            {formatDuration(lesson.duration)}
                          </span>
                        )}

                        {/* Level badge */}
                        <span
                          className="home-card-level"
                          style={{
                            background: levelColor,
                            boxShadow: `0 2px 12px ${levelColor}44`,
                          }}
                        >
                          {lesson.level}
                        </span>

                        {/* Completed overlay */}
                        {prog?.isCompleted && (
                          <div className="home-card-completed-badge">
                            <span>✓</span>
                          </div>
                        )}
                      </div>

                      {/* Content */}
                      <div className="home-card-body">
                        <h3 className="home-card-title">{lesson.title}</h3>

                        <div className="home-card-meta">
                          <span className="home-card-meta-item">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                            {totalSubs} Sätze
                          </span>
                          <span className="home-card-meta-item">
                            {lesson.videoType === 'youtube' ? (
                              <><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.615 3.184c-3.604-.246-11.631-.245-15.23 0-3.897.266-4.356 2.62-4.385 8.816.029 6.185.484 8.549 4.385 8.816 3.6.245 11.626.246 15.23 0 3.897-.266 4.356-2.62 4.385-8.816-.029-6.185-.484-8.549-4.385-8.816zM9 16V8l8 4-8 4z"/></svg> YouTube</>
                            ) : (
                              <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg> Lokal</>
                            )}
                          </span>
                        </div>

                        {/* Progress section */}
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
                              {completed}/{totalSubs}
                            </span>
                          </div>
                          <ProgressRing pct={pct} />
                        </div>
                      </div>
                    </article>
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
