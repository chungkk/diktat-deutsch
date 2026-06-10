'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
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

interface LessonGroup {
  lessonId: string;
  lessonTitle: string;
  lessonSlug: string;
  lessonLevel: string;
  youtubeId?: string;
  sentences: SavedSentence[];
  completedCount: number;
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

export default function SavedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sentences, setSentences] = useState<SavedSentence[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string>('all');

  const fetchSaved = useCallback(async () => {
    try {
      const res = await fetch('/api/saved-sentences', { cache: 'no-store' });
      console.log('[Saved] API status:', res.status);
      if (res.ok) {
        const data = await res.json();
        console.log('[Saved] API data:', data);
        if (Array.isArray(data)) {
          setSentences(data);
        }
      } else {
        const errText = await res.text();
        console.error('[Saved] API error:', res.status, errText);
      }
    } catch (err) {
      console.error('[Saved] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status === 'authenticated') {
      fetchSaved();
    }
  }, [status, router, fetchSaved]);

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
          <span className="loading-text">Gespeicherte Sätze werden geladen…</span>
        </div>
      </div>
    );
  }

  // Group by lesson
  const grouped: LessonGroup[] = [];
  const groupMap = new Map<string, LessonGroup>();

  for (const s of sentences) {
    let group = groupMap.get(s.lessonId);
    if (!group) {
      group = {
        lessonId: s.lessonId,
        lessonTitle: s.lessonTitle,
        lessonSlug: s.lessonSlug,
        lessonLevel: s.lessonLevel,
        youtubeId: s.youtubeId,
        sentences: [],
        completedCount: 0,
      };
      groupMap.set(s.lessonId, group);
      grouped.push(group);
    }
    group.sentences.push(s);
    if (s.isCompleted) group.completedCount++;
  }

  // Filter by level
  const filteredGroups = filterLevel === 'all'
    ? grouped
    : grouped.filter(g => g.lessonLevel === filterLevel);

  const totalSaved = sentences.length;
  const availableLevels = [...new Set(sentences.map(s => s.lessonLevel))].sort();

  return (
    <div className="home-page">
      <div className="container">
        {/* Header */}
        <div className="home-section-header">
          <h2 className="home-section-title">
            <span>★</span> Gespeicherte Sätze
          </h2>
          <span className="home-section-count">
            🔖 {totalSaved} Sätze in {grouped.length} Lektionen
          </span>
        </div>

        {/* Filters */}
        {availableLevels.length > 1 && (
          <div className="saved-filters">
            <button
              className={`saved-filter-btn ${filterLevel === 'all' ? 'saved-filter-active' : ''}`}
              onClick={() => setFilterLevel('all')}
            >
              Alle
            </button>
            {availableLevels.map(level => (
              <button
                key={level}
                className={`saved-filter-btn ${filterLevel === level ? 'saved-filter-active' : ''}`}
                onClick={() => setFilterLevel(level)}
                style={{
                  '--filter-color': LEVEL_COLORS[level] || '#22c55e',
                  '--filter-shadow': LEVEL_SHADOWS[level] || '#15803d',
                } as React.CSSProperties}
              >
                {LEVEL_EMOJI[level] || '📝'} {level}
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {totalSaved === 0 && (
          <div className="empty-state">
            <span className="empty-state-icon">🔖</span>
            <p className="empty-state-text">Noch keine Sätze gespeichert</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: 8, fontWeight: 700 }}>
              Klicke auf ☆ neben einem Satz in einer Lektion, um ihn zu speichern ✨
            </p>
            <Link href="/" className="btn btn-primary" style={{ marginTop: '1rem' }}>
              📖 Zu den Lektionen
            </Link>
          </div>
        )}

        {/* No results after filter */}
        {totalSaved > 0 && filteredGroups.length === 0 && (
          <div className="empty-state">
            <span className="empty-state-icon">🔍</span>
            <p className="empty-state-text">Keine Sätze für dieses Level</p>
            <button className="btn btn-secondary" onClick={() => setFilterLevel('all')}>
              Alle anzeigen
            </button>
          </div>
        )}

        {/* Lesson cards grid */}
        <div className="saved-cards-grid">
          {filteredGroups.map(group => {
            const levelColor = LEVEL_COLORS[group.lessonLevel] || '#22c55e';
            const levelShadow = LEVEL_SHADOWS[group.lessonLevel] || '#15803d';
            const levelEmoji = LEVEL_EMOJI[group.lessonLevel] || '📝';
            const thumb = group.youtubeId
              ? `https://img.youtube.com/vi/${group.youtubeId}/mqdefault.jpg`
              : null;
            const completedPct = group.sentences.length > 0
              ? Math.round((group.completedCount / group.sentences.length) * 100)
              : 0;

            return (
              <Link
                key={group.lessonId}
                href={`/saved/${group.lessonId}`}
                className="saved-card-link"
              >
                <article
                  className="saved-card"
                  style={{
                    '--card-glow-color': levelColor,
                    '--card-shadow-color': levelShadow,
                  } as React.CSSProperties}
                >
                  {/* Thumbnail */}
                  <div className="saved-card-thumb">
                    {thumb ? (
                      <img src={thumb} alt={group.lessonTitle} loading="lazy" />
                    ) : (
                      <div className="saved-card-thumb-placeholder">
                        <span>★</span>
                      </div>
                    )}
                    <div className="saved-card-thumb-overlay" />

                    {/* Level badge */}
                    <span
                      className="saved-card-level"
                      style={{
                        background: levelColor,
                        borderColor: levelShadow,
                        boxShadow: `2px 2px 0 ${levelShadow}`,
                      }}
                    >
                      {levelEmoji} {group.lessonLevel}
                    </span>

                    {/* Saved count badge */}
                    <span className="saved-card-count-badge">
                      ★ {group.sentences.length}
                    </span>
                  </div>

                  {/* Body */}
                  <div className="saved-card-body">
                    <h3 className="saved-card-title">{group.lessonTitle}</h3>

                    <div className="saved-card-meta">
                      <span className="saved-card-meta-item">
                        🔖 {group.sentences.length} Sätze
                      </span>
                      {group.completedCount > 0 && (
                        <span className="saved-card-meta-item saved-card-meta-completed">
                          ✓ {group.completedCount} erledigt
                        </span>
                      )}
                    </div>

                    {/* Progress bar */}
                    <div className="saved-card-footer">
                      <div className="saved-card-progress-info">
                        <div className="saved-card-progress-bar">
                          <div
                            className="saved-card-progress-fill"
                            style={{
                              width: `${completedPct}%`,
                              background: completedPct >= 90
                                ? `linear-gradient(90deg, ${levelColor} 0%, #a3e635 100%)`
                                : `linear-gradient(90deg, ${levelColor} 0%, ${levelShadow} 100%)`,
                              boxShadow: `0 0 6px ${levelColor}66`,
                            }}
                          />
                        </div>
                        <span className="saved-card-progress-text">
                          {group.completedCount}/{group.sentences.length} ✍️
                        </span>
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
