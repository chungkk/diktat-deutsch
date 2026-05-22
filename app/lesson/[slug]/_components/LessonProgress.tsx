'use client';

interface LessonProgressProps {
  completedCount: number;
  totalSubs: number;
  pct: number;
  blankMode: 50 | 100;
  videoBlurLevel: 0 | 1 | 2;
  onModeChange: (mode: 50 | 100) => void;
  onCycleBlur: () => void;
}

export default function LessonProgress({
  completedCount,
  totalSubs,
  pct,
  blankMode,
  videoBlurLevel,
  onModeChange,
  onCycleBlur,
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

      {/* Video blur toggle */}
      <div className="video-blur-toggle">
        <button
          className={`video-blur-btn ${videoBlurLevel > 0 ? 'video-blur-btn-active' : ''}`}
          onClick={onCycleBlur}
          title="Video verschwommen machen (B)"
        >
          <span className="video-blur-btn-icon">
            {videoBlurLevel === 0 ? '👁️' : videoBlurLevel === 1 ? '🌫️' : '🔇'}
          </span>
          <span className="video-blur-btn-text">
            {videoBlurLevel === 0 ? 'Video klar' : videoBlurLevel === 1 ? 'Leicht unscharf' : 'Stark unscharf'}
          </span>
          <span className="video-blur-btn-level">
            {(['AUS', 'LEICHT', 'STARK'] as const)[videoBlurLevel]}
          </span>
        </button>
      </div>
    </>
  );
}
