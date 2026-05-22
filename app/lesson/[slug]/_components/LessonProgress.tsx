'use client';

interface LessonProgressProps {
  completedCount: number;
  totalSubs: number;
  pct: number;
  blankMode: 50 | 100;
  videoBlurLevel: 0 | 1 | 2;
  shadowingMode: boolean;
  bookmarkCount: number;
  onModeChange: (mode: 50 | 100) => void;
  onCycleBlur: () => void;
  onToggleShadowing: () => void;
}

export default function LessonProgress({
  completedCount,
  totalSubs,
  pct,
  blankMode,
  videoBlurLevel,
  shadowingMode,
  bookmarkCount,
  onModeChange,
  onCycleBlur,
  onToggleShadowing,
}: LessonProgressProps) {
  return (
    <>
      {/* Progress bar */}
      <div className="lesson-progress-section">
        <div className="lesson-progress-header">
          <span>{completedCount} / {totalSubs} richtig</span>
          <span className="lesson-progress-pct">{pct}%</span>
        </div>
        <div className="lesson-progress-track">
          <div className="lesson-progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Difficulty toggle */}
      <div className="mode-toggle">
        <span className="mode-label">Schwierigkeit</span>
        <div className="mode-buttons">
          <button
            className={`mode-btn ${blankMode === 50 ? 'mode-btn-active' : ''}`}
            onClick={() => onModeChange(50)}
          >
            50% Lücken
          </button>
          <button
            className={`mode-btn ${blankMode === 100 ? 'mode-btn-active' : ''}`}
            onClick={() => onModeChange(100)}
          >
            100% Diktat
          </button>
        </div>
      </div>

      {/* Controls group — Shadowing + Video blur, side by side */}
      <div className="lesson-ctrl-group">
        {/* Shadowing toggle */}
        <button
          className={`ctrl-btn ctrl-btn-shadow ${shadowingMode ? 'ctrl-btn-shadow-active' : ''}`}
          onClick={onToggleShadowing}
          title="Nur markierte Sätze anzeigen"
        >
          <span className="ctrl-btn-icon">
            {shadowingMode ? '🎯' : '🔖'}
          </span>
          <span className="ctrl-btn-text">
            Shadowing{bookmarkCount > 0 ? ` ${bookmarkCount}★` : ''}
          </span>
          <span className="ctrl-btn-badge">
            {shadowingMode ? 'AN' : 'AUS'}
          </span>
        </button>

        {/* Video blur toggle */}
        <button
          className={`ctrl-btn ctrl-btn-blur ${videoBlurLevel > 0 ? 'ctrl-btn-blur-active' : ''}`}
          onClick={onCycleBlur}
          title="Video verschwommen machen (B)"
        >
          <span className="ctrl-btn-icon">
            {videoBlurLevel === 0 ? '👁️' : videoBlurLevel === 1 ? '🌫️' : '🔇'}
          </span>
          <span className="ctrl-btn-text">
            {videoBlurLevel === 0 ? 'Video' : videoBlurLevel === 1 ? 'Unscharf' : 'Stark'}
          </span>
          <span className="ctrl-btn-badge">
            {(['AUS', 'LEICHT', 'STARK'] as const)[videoBlurLevel]}
          </span>
        </button>
      </div>
    </>
  );
}
