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

export default function SavedPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [sentences, setSentences] = useState<SavedSentence[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [expandedLessons, setExpandedLessons] = useState<Set<string>>(new Set());
  const [removingKeys, setRemovingKeys] = useState<Set<string>>(new Set());

  const fetchSaved = useCallback(async () => {
    try {
      const res = await fetch('/api/saved-sentences', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setSentences(data);
          // Expand all lessons by default
          const lessonIds = new Set<string>(data.map((s: SavedSentence) => s.lessonId));
          setExpandedLessons(lessonIds);
        }
      }
    } catch {
      // ignore
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

  const handleRemoveBookmark = useCallback(async (lessonId: string, sentenceIndex: number) => {
    const key = `${lessonId}-${sentenceIndex}`;
    setRemovingKeys(prev => new Set(prev).add(key));

    // Get all bookmarks for this lesson, remove this one
    const lessonSentences = sentences.filter(s => s.lessonId === lessonId);
    const remainingIndices = lessonSentences
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
        setSentences(prev => prev.filter(s => !(s.lessonId === lessonId && s.sentenceIndex === sentenceIndex)));
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
  }, [sentences]);

  const toggleLesson = (lessonId: string) => {
    setExpandedLessons(prev => {
      const next = new Set(prev);
      if (next.has(lessonId)) next.delete(lessonId);
      else next.add(lessonId);
      return next;
    });
  };

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
      };
      groupMap.set(s.lessonId, group);
      grouped.push(group);
    }
    group.sentences.push(s);
  }

  // Sort sentences within each group by sentenceIndex
  for (const group of grouped) {
    group.sentences.sort((a, b) => a.sentenceIndex - b.sentenceIndex);
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

        {/* Lesson groups */}
        <div className="saved-groups">
          {filteredGroups.map(group => {
            const levelColor = LEVEL_COLORS[group.lessonLevel] || '#22c55e';
            const levelShadow = LEVEL_SHADOWS[group.lessonLevel] || '#15803d';
            const levelEmoji = LEVEL_EMOJI[group.lessonLevel] || '📝';
            const isExpanded = expandedLessons.has(group.lessonId);
            const completedCount = group.sentences.filter(s => s.isCompleted).length;

            return (
              <div
                key={group.lessonId}
                className="saved-lesson-group"
                style={{
                  '--card-glow-color': levelColor,
                  '--card-shadow-color': levelShadow,
                } as React.CSSProperties}
              >
                {/* Lesson header */}
                <div
                  className="saved-lesson-header"
                  onClick={() => toggleLesson(group.lessonId)}
                >
                  <div className="saved-lesson-header-left">
                    <span className="saved-lesson-expand">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                    <span
                      className="saved-lesson-level"
                      style={{
                        background: levelColor,
                        borderColor: levelShadow,
                        boxShadow: `2px 2px 0 ${levelShadow}`,
                      }}
                    >
                      {levelEmoji} {group.lessonLevel}
                    </span>
                    <h3 className="saved-lesson-title">{group.lessonTitle}</h3>
                  </div>
                  <div className="saved-lesson-header-right">
                    <span className="saved-lesson-count">
                      ★ {group.sentences.length}
                    </span>
                    {completedCount > 0 && (
                      <span className="saved-lesson-completed">
                        ✓ {completedCount}/{group.sentences.length}
                      </span>
                    )}
                    <Link
                      href={`/lesson/${group.lessonSlug}`}
                      className="saved-lesson-go-btn"
                      onClick={(e) => e.stopPropagation()}
                      title="Zur Lektion"
                    >
                      →
                    </Link>
                  </div>
                </div>

                {/* Sentences */}
                {isExpanded && (
                  <div className="saved-sentences">
                    {group.sentences.map((s) => {
                      const key = `${s.lessonId}-${s.sentenceIndex}`;
                      const isRemoving = removingKeys.has(key);

                      return (
                        <div
                          key={key}
                          className={`saved-sentence ${s.isCompleted ? 'saved-sentence-completed' : ''} ${isRemoving ? 'saved-sentence-removing' : ''}`}
                        >
                          <div className="saved-sentence-header">
                            <span className="saved-sentence-number">
                              #{s.sentenceIndex + 1}
                            </span>
                            <span className="saved-sentence-time">
                              ⏱️ {formatTime(s.start)}
                            </span>
                            {s.isCompleted && (
                              <span className="saved-sentence-check">✓</span>
                            )}
                            <div className="saved-sentence-actions">
                              <Link
                                href={`/lesson/${s.lessonSlug}`}
                                className="saved-sentence-action-btn"
                                title="Zur Lektion gehen"
                              >
                                ▶
                              </Link>
                              <button
                                className="saved-sentence-action-btn saved-sentence-remove-btn"
                                onClick={() => handleRemoveBookmark(s.lessonId, s.sentenceIndex)}
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
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
