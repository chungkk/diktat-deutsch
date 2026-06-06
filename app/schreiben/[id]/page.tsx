'use client';
import { useEffect, useState, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';

interface WritingError {
  original: string;
  corrected: string;
  type: string;
  explanation: string;
}

interface Correction {
  correctedText: string;
  errors: WritingError[];
  overallFeedback: string;
  score: number;
  createdAt: string;
}

interface Project {
  _id: string;
  title: string;
  content: string;
  level: string;
  status: 'draft' | 'corrected';
  corrections: Correction[];
  createdAt: string;
  updatedAt: string;
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

const ERROR_TYPE_CONFIG: Record<string, { color: string; bg: string; border: string; emoji: string }> = {
  Grammatik: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.3)', emoji: '📐' },
  Rechtschreibung: { color: '#fb923c', bg: 'rgba(251,146,60,0.1)', border: 'rgba(251,146,60,0.3)', emoji: '🔤' },
  Wortschatz: { color: '#a855f7', bg: 'rgba(168,85,247,0.1)', border: 'rgba(168,85,247,0.3)', emoji: '📖' },
  Satzbau: { color: '#38bdf8', bg: 'rgba(56,189,248,0.1)', border: 'rgba(56,189,248,0.3)', emoji: '🏗️' },
  Zeichensetzung: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)', border: 'rgba(251,191,36,0.3)', emoji: '✏️' },
};

function ScoreRing({ score, size = 80, stroke = 5 }: { score: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (score / 100) * circ;
  const color = score >= 90 ? '#4ade80' : score >= 70 ? '#fbbf24' : score >= 50 ? '#fb923c' : '#f87171';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth={stroke + 1}
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 1s ease', filter: `drop-shadow(0 0 6px ${color}88)` }}
      />
      <text
        x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        fill="#ffffff" fontSize={size * 0.3} fontWeight="900"
        fontFamily="Nunito, sans-serif"
      >
        {score}
      </text>
    </svg>
  );
}

export default function SchreibenEditorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Editor fields
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [level, setLevel] = useState('A1');

  // Currently viewed correction index
  const [viewingCorrection, setViewingCorrection] = useState<number>(-1);

  const fetchProject = useCallback(async () => {
    try {
      const r = await fetch(`/api/schreiben/${id}`);
      if (r.ok) {
        const data = await r.json();
        setProject(data);
        setTitle(data.title);
        setContent(data.content);
        setLevel(data.level);
        if (data.corrections && data.corrections.length > 0) {
          setViewingCorrection(data.corrections.length - 1);
        }
      } else {
        router.push('/schreiben');
      }
    } catch {
      router.push('/schreiben');
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status === 'authenticated') {
      fetchProject();
    }
  }, [status, router, fetchProject]);

  const saveProject = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const r = await fetch(`/api/schreiben/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, level }),
      });
      if (r.ok) {
        const data = await r.json();
        setProject(data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const requestCorrection = async () => {
    // Save first
    setSaving(true);
    try {
      await fetch(`/api/schreiben/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, level }),
      });
    } catch {
      // continue anyway
    }
    setSaving(false);

    setCorrecting(true);
    try {
      const r = await fetch(`/api/schreiben/${id}/correct`, {
        method: 'POST',
      });
      if (r.ok) {
        const data = await r.json();
        setProject(data.project);
        setViewingCorrection(data.project.corrections.length - 1);
      }
    } catch {
      // ignore
    } finally {
      setCorrecting(false);
    }
  };

  const deleteProject = async () => {
    setDeleting(true);
    try {
      const r = await fetch(`/api/schreiben/${id}`, { method: 'DELETE' });
      if (r.ok) {
        router.push('/schreiben');
      }
    } catch {
      // ignore
    } finally {
      setDeleting(false);
    }
  };

  const wordCount = content.trim() ? content.trim().split(/\s+/).length : 0;
  const charCount = content.length;
  const currentCorrection: Correction | null =
    project && viewingCorrection >= 0 && project.corrections[viewingCorrection]
      ? project.corrections[viewingCorrection]
      : null;

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
          <span className="loading-text">Projekt wird geladen…</span>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const levelColor = LEVEL_COLORS[level] || '#22c55e';
  const levelShadow = LEVEL_SHADOWS[level] || '#15803d';

  return (
    <div className="writing-page">
      {/* Header */}
      <div className="writing-header">
        <Link href="/schreiben" className="writing-back-btn">
          ← Zurück
        </Link>
        <span
          className="writing-header-level"
          style={{
            background: levelColor,
            borderColor: levelShadow,
            boxShadow: `2px 2px 0 ${levelShadow}`,
          }}
        >
          {LEVEL_EMOJI[level]} {level}
        </span>
        <span className="writing-header-stat">
          📊 {wordCount} Wörter · {charCount} Zeichen
        </span>
        {project.corrections.length > 0 && (
          <span className="writing-header-stat">
            🔄 {project.corrections.length}x korrigiert
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          {saved && (
            <span className="writing-saved-badge">✅ Gespeichert</span>
          )}
          <button
            className="btn btn-secondary btn-sm"
            onClick={saveProject}
            disabled={saving}
          >
            {saving ? '⏳' : '💾'} Speichern
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={requestCorrection}
            disabled={correcting || content.trim().length < 10}
            title={content.trim().length < 10 ? 'Mindestens 10 Zeichen erforderlich' : ''}
          >
            {correcting ? '🤖 KI analysiert...' : '🔍 Korrektur'}
          </button>
          <button
            className="writing-delete-btn"
            onClick={() => setShowDeleteConfirm(true)}
            title="Projekt löschen"
          >
            🗑️
          </button>
        </div>
      </div>

      {/* Delete confirmation */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <h3 className="modal-title">🗑️ Projekt löschen?</h3>
            <p style={{ color: 'var(--color-text-secondary)', marginBottom: '1.5rem', fontWeight: 700 }}>
              Das Projekt &quot;{project.title}&quot; wird unwiderruflich gelöscht.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowDeleteConfirm(false)}>
                Abbrechen
              </button>
              <button className="btn btn-danger" onClick={deleteProject} disabled={deleting}>
                {deleting ? '⏳ Lösche...' : '🗑️ Löschen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="writing-split">
        {/* LEFT — Editor */}
        <div className="writing-left">
          <div className="writing-editor-section">
            <div className="writing-title-row">
              <input
                className="writing-title-input"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Titel des Projekts..."
                maxLength={200}
              />
              <div className="writing-level-mini">
                {['A1', 'A2', 'B1', 'B2', 'C1', 'C2'].map((l) => (
                  <button
                    key={l}
                    className={`writing-level-mini-btn ${level === l ? 'writing-level-mini-btn-active' : ''}`}
                    style={{
                      '--level-color': LEVEL_COLORS[l],
                      '--level-shadow': LEVEL_SHADOWS[l],
                    } as React.CSSProperties}
                    onClick={() => setLevel(l)}
                  >
                    {l}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              className="writing-textarea"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Schreibe hier deinen Text auf Deutsch... ✍️&#10;&#10;Tipps:&#10;• Schreibe über dein Hobby, deinen Tag, oder eine Geschichte&#10;• Versuche mindestens 3-5 Sätze zu schreiben&#10;• Klicke auf 'Korrektur', wenn du fertig bist"
            />

            <div className="writing-editor-footer">
              <span className="writing-word-count">
                📊 {wordCount} Wörter · {charCount} Zeichen
              </span>
              {content.trim().length > 0 && content.trim().length < 10 && (
                <span className="writing-min-hint">
                  ⚠️ Mindestens 10 Zeichen für Korrektur
                </span>
              )}
            </div>
          </div>

          {/* Correcting animation */}
          {correcting && (
            <div className="writing-correcting">
              <div className="writing-correcting-inner">
                <span className="writing-correcting-icon">🤖</span>
                <span className="writing-correcting-text">
                  KI analysiert deinen Text...
                </span>
                <div className="loading-dots">
                  <div className="loading-dot" />
                  <div className="loading-dot" />
                  <div className="loading-dot" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Corrections */}
        <div className="writing-right">
          {!currentCorrection ? (
            <div className="writing-no-correction">
              <span className="writing-no-correction-icon">📝</span>
              <p className="writing-no-correction-title">Noch keine Korrektur</p>
              <p className="writing-no-correction-hint">
                Schreibe deinen Text und klicke auf &quot;🔍 Korrektur&quot;, um eine KI-Analyse zu erhalten.
              </p>
            </div>
          ) : (
            <div className="correction-content">
              {/* Correction tabs if multiple */}
              {project.corrections.length > 1 && (
                <div className="correction-tabs">
                  {project.corrections.map((c, i) => (
                    <button
                      key={i}
                      className={`correction-tab ${viewingCorrection === i ? 'correction-tab-active' : ''}`}
                      onClick={() => setViewingCorrection(i)}
                    >
                      #{i + 1} — {new Date(c.createdAt).toLocaleDateString('de-DE', {
                        day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
                      })}
                    </button>
                  ))}
                </div>
              )}

              {/* Score */}
              <div className="correction-score-section">
                <ScoreRing score={currentCorrection.score} size={80} stroke={5} />
                <div className="correction-score-info">
                  <span className="correction-score-label">Bewertung</span>
                  <span className="correction-score-value" style={{
                    color: currentCorrection.score >= 90 ? '#4ade80' :
                      currentCorrection.score >= 70 ? '#fbbf24' :
                        currentCorrection.score >= 50 ? '#fb923c' : '#f87171'
                  }}>
                    {currentCorrection.score >= 90 ? 'Ausgezeichnet! 🌟' :
                      currentCorrection.score >= 70 ? 'Gut! 👍' :
                        currentCorrection.score >= 50 ? 'Weiter üben! 💪' : 'Nicht aufgeben! 🌱'}
                  </span>
                  <span className="correction-error-count">
                    {currentCorrection.errors.length === 0
                      ? '✨ Keine Fehler gefunden!'
                      : `${currentCorrection.errors.length} Fehler gefunden`}
                  </span>
                </div>
              </div>

              {/* Error type summary */}
              {currentCorrection.errors.length > 0 && (
                <div className="correction-type-summary">
                  {Object.entries(
                    currentCorrection.errors.reduce((acc, e) => {
                      acc[e.type] = (acc[e.type] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([type, count]) => {
                    const config = ERROR_TYPE_CONFIG[type] || ERROR_TYPE_CONFIG.Grammatik;
                    return (
                      <span
                        key={type}
                        className="correction-type-badge"
                        style={{
                          background: config.bg,
                          borderColor: config.border,
                          color: config.color,
                        }}
                      >
                        {config.emoji} {type}: {count}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Corrected text */}
              <div className="correction-section">
                <h3 className="correction-section-title">📝 Korrigierter Text</h3>
                <div className="correction-text-box">
                  {currentCorrection.correctedText}
                </div>
              </div>

              {/* Error list */}
              {currentCorrection.errors.length > 0 && (
                <div className="correction-section">
                  <h3 className="correction-section-title">🔍 Fehler im Detail</h3>
                  <div className="correction-errors-list">
                    {currentCorrection.errors.map((error, i) => {
                      const config = ERROR_TYPE_CONFIG[error.type] || ERROR_TYPE_CONFIG.Grammatik;
                      return (
                        <div key={i} className="correction-error-card">
                          <div className="correction-error-header">
                            <span
                              className="correction-error-type"
                              style={{
                                background: config.bg,
                                borderColor: config.border,
                                color: config.color,
                              }}
                            >
                              {config.emoji} {error.type}
                            </span>
                            <span className="correction-error-num">#{i + 1}</span>
                          </div>
                          <div className="correction-error-diff">
                            <div className="correction-error-original">
                              <span className="correction-diff-label">❌</span>
                              <span className="correction-diff-text correction-diff-wrong">{error.original}</span>
                            </div>
                            <span className="correction-diff-arrow">→</span>
                            <div className="correction-error-corrected">
                              <span className="correction-diff-label">✅</span>
                              <span className="correction-diff-text correction-diff-right">{error.corrected}</span>
                            </div>
                          </div>
                          <div className="correction-error-explanation">
                            💡 {error.explanation}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Overall feedback */}
              <div className="correction-section">
                <h3 className="correction-section-title">💬 Nhận xét tổng thể</h3>
                <div className="correction-feedback-box">
                  {currentCorrection.overallFeedback}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
