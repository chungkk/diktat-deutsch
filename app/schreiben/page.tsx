'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface WritingProject {
  _id: string;
  title: string;
  level: string;
  status: 'draft' | 'corrected';
  wordCount: number;
  latestScore: number | null;
  correctionCount: number;
  updatedAt: string;
  createdAt: string;
}

const LEVEL_COLORS: Record<string, string> = {
  A1: '#22c55e', A2: '#14b8a6', B1: '#38bdf8',
  B2: '#a855f7', C1: '#f472b6', C2: '#fb923c',
};
const LEVEL_SHADOWS: Record<string, string> = {
  A1: '#15803d', A2: '#0f766e', B1: '#0369a1',
  B2: '#7e22ce', C1: '#be185d', C2: '#c2410c',
};
const LEVEL_EMOJI: Record<string, string> = {
  A1: '🌱', A2: '🌊', B1: '💧', B2: '⚡', C1: '🌸', C2: '🔥',
};

function ScoreRing({ score, size = 44, stroke = 3.5 }: { score: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color = score >= 90 ? '#4ade80' : score >= 70 ? '#fbbf24' : score >= 50 ? '#fb923c' : '#f87171';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
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
        {score}
      </text>
    </svg>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export default function SchreibenPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [projects, setProjects] = useState<WritingProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newLevel, setNewLevel] = useState('A1');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status === 'authenticated') {
      fetchProjects();
    }
  }, [status, router]);

  const fetchProjects = async () => {
    try {
      const r = await fetch('/api/schreiben');
      if (r.ok) {
        const data = await r.json();
        setProjects(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const createProject = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const r = await fetch('/api/schreiben', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim(), level: newLevel }),
      });
      if (r.ok) {
        const project = await r.json();
        router.push(`/schreiben/${project._id}`);
      }
    } catch {
      // ignore
    } finally {
      setCreating(false);
    }
  };

  if (status === 'loading' || loading) {
    return (
      <div className="loading">
        <div className="loading-cute">
          <span className="loading-mascot">✍️</span>
          <div className="loading-dots">
            <div className="loading-dot" />
            <div className="loading-dot" />
            <div className="loading-dot" />
          </div>
          <span className="loading-text">Projekte werden geladen…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="schreiben-page">
      <div className="container">
        {/* Header */}
        <div className="schreiben-header">
          <div className="schreiben-header-left">
            <h1 className="schreiben-title">
              <span className="schreiben-title-icon">✍️</span>
              Schreiben
            </h1>
            <p className="schreiben-subtitle">
              Schreibe frei auf Deutsch und lass deine Texte von KI korrigieren
            </p>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => setShowNewForm(true)}
          >
            <span>📝</span> Neues Projekt
          </button>
        </div>

        {/* New project form */}
        {showNewForm && (
          <div className="schreiben-new-form">
            <div className="schreiben-new-form-inner">
              <h3 className="schreiben-new-form-title">📝 Neues Projekt erstellen</h3>
              <div className="form-group">
                <label>Titel</label>
                <input
                  className="form-input"
                  type="text"
                  placeholder="z.B. Mein erster Brief, Über mein Hobby..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && createProject()}
                  autoFocus
                  maxLength={200}
                />
              </div>
              <div className="form-group">
                <label>Niveau</label>
                <div className="schreiben-level-selector">
                  {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => (
                    <button
                      key={l}
                      className={`schreiben-level-btn ${newLevel === l ? 'schreiben-level-btn-active' : ''}`}
                      style={{
                        '--level-color': LEVEL_COLORS[l],
                        '--level-shadow': LEVEL_SHADOWS[l],
                      } as React.CSSProperties}
                      onClick={() => setNewLevel(l)}
                    >
                      {LEVEL_EMOJI[l]} {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="schreiben-new-form-actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => { setShowNewForm(false); setNewTitle(''); }}
                >
                  Abbrechen
                </button>
                <button
                  className="btn btn-primary"
                  onClick={createProject}
                  disabled={!newTitle.trim() || creating}
                >
                  {creating ? '⏳ Erstelle...' : '🚀 Erstellen'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Projects grid */}
        {projects.length === 0 ? (
          <div className="empty-state">
            <span className="empty-state-icon">📝</span>
            <p className="empty-state-text">Noch keine Projekte</p>
            <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: 8, fontWeight: 700 }}>
              Erstelle dein erstes Schreibprojekt und übe Deutsch! ✨
            </p>
          </div>
        ) : (
          <>
            <div className="schreiben-stats-row">
              <div className="schreiben-stat">
                <span className="schreiben-stat-icon">📚</span>
                <span className="schreiben-stat-value">{projects.length}</span>
                <span className="schreiben-stat-label">Projekte</span>
              </div>
              <div className="schreiben-stat-divider" />
              <div className="schreiben-stat">
                <span className="schreiben-stat-icon">✅</span>
                <span className="schreiben-stat-value">
                  {projects.filter(p => p.status === 'corrected').length}
                </span>
                <span className="schreiben-stat-label">Korrigiert</span>
              </div>
              <div className="schreiben-stat-divider" />
              <div className="schreiben-stat">
                <span className="schreiben-stat-icon">⭐</span>
                <span className="schreiben-stat-value">
                  {(() => {
                    const scored = projects.filter(p => p.latestScore !== null);
                    if (scored.length === 0) return '—';
                    const avg = Math.round(scored.reduce((s, p) => s + (p.latestScore || 0), 0) / scored.length);
                    return avg;
                  })()}
                </span>
                <span className="schreiben-stat-label">Ø Punkte</span>
              </div>
            </div>

            <div className="schreiben-grid">
              {projects.map((project) => {
                const levelColor = LEVEL_COLORS[project.level] || '#22c55e';
                const levelShadow = LEVEL_SHADOWS[project.level] || '#15803d';
                const levelEmoji = LEVEL_EMOJI[project.level] || '📝';

                return (
                  <div
                    key={project._id}
                    className="schreiben-card"
                    style={{
                      '--card-glow-color': levelColor,
                      '--card-shadow-color': levelShadow,
                    } as React.CSSProperties}
                    onClick={() => router.push(`/schreiben/${project._id}`)}
                  >
                    {/* Top accent bar */}
                    <div
                      className="schreiben-card-accent"
                      style={{ background: `linear-gradient(90deg, ${levelColor}, ${levelShadow})` }}
                    />

                    <div className="schreiben-card-body">
                      <div className="schreiben-card-top">
                        <span
                          className="schreiben-card-level"
                          style={{
                            background: levelColor,
                            borderColor: levelShadow,
                            boxShadow: `2px 2px 0 ${levelShadow}`,
                          }}
                        >
                          {levelEmoji} {project.level}
                        </span>
                        <span className={`schreiben-card-status ${project.status === 'corrected' ? 'schreiben-card-status-corrected' : ''}`}>
                          {project.status === 'corrected' ? '✅ Korrigiert' : '📝 Entwurf'}
                        </span>
                      </div>

                      <h3 className="schreiben-card-title">{project.title}</h3>

                      <div className="schreiben-card-meta">
                        <span>📊 {project.wordCount} Wörter</span>
                        {project.correctionCount > 0 && (
                          <span>🔄 {project.correctionCount}x korrigiert</span>
                        )}
                        <span>📅 {formatDate(project.updatedAt)}</span>
                      </div>

                      {project.latestScore !== null && (
                        <div className="schreiben-card-footer">
                          <div className="schreiben-card-score-info">
                            <span className="schreiben-card-score-label">Letzte Bewertung</span>
                            <div className="schreiben-card-score-bar">
                              <div
                                className="schreiben-card-score-fill"
                                style={{
                                  width: `${project.latestScore}%`,
                                  background: project.latestScore >= 90
                                    ? 'linear-gradient(90deg, #4ade80, #a3e635)'
                                    : project.latestScore >= 70
                                      ? `linear-gradient(90deg, ${levelColor}, #fbbf24)`
                                      : `linear-gradient(90deg, #fb923c, #f87171)`,
                                }}
                              />
                            </div>
                          </div>
                          <ScoreRing score={project.latestScore} size={42} stroke={3} />
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
