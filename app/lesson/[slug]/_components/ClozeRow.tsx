'use client';
import { RefObject, useCallback, useEffect, useRef, useState } from 'react';

interface Subtitle {
  start: number;
  dur: number;
  text: string;
}

interface TokenInfo {
  words: string[];
  blanks: Set<number>;
}

interface ClozeRowProps {
  sub: Subtitle;
  index: number;
  isActive: boolean;
  isCompleted: boolean;
  isBookmarked: boolean;
  tokens: TokenInfo;
  subResults: Record<number, 'correct' | 'incorrect'>;
  subInputs: Record<number, string>;
  revealedWords: Set<string>;
  blankMode: number;
  blankRefs: RefObject<Record<string, HTMLInputElement | null>>;
  hiddenWordRefs: RefObject<Record<string, HTMLSpanElement | null>>;
  onSelect: (index: number) => void;
  onChange: (subIdx: number, wordIdx: number, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent, subIdx: number, wordIdx: number) => void;
  onRevealWord: (subIdx: number, wordIdx: number) => void;
  onToggleBookmark: (index: number) => void;
  showAll?: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ClozeRow({
  sub,
  index,
  isActive,
  isCompleted,
  isBookmarked,
  tokens,
  subResults,
  subInputs,
  revealedWords,
  blankMode,
  hiddenWordRefs,
  blankRefs,
  onSelect,
  onChange,
  onKeyDown,
  onRevealWord,
  onToggleBookmark,
  showAll,
}: ClozeRowProps) {
  const { words, blanks } = tokens;
  const allBlanksCorrect =
    blanks.size > 0 && Array.from(blanks).every((wi) => subResults[wi] === 'correct');

  // Explain state
  const [showExplain, setShowExplain] = useState(false);
  const [explaining, setExplaining] = useState(false);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);

  // Toast warning state
  const [showToast, setShowToast] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const handleExplain = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();

    // If sentence not completed, show warning toast
    if (!isCompleted && !allBlanksCorrect) {
      setShowToast(true);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setShowToast(false), 2000);
      return;
    }

    // Toggle off if already showing
    if (showExplain && explanation) {
      setShowExplain(false);
      return;
    }

    // If we already have an explanation, just show it
    if (explanation) {
      setShowExplain(true);
      return;
    }

    setShowExplain(true);
    setExplaining(true);
    setExplainError(null);

    try {
      const res = await fetch('/api/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence: sub.text }),
      });

      if (!res.ok) {
        throw new Error('API error');
      }

      const data = await res.json();
      setExplanation(data.explanation);
    } catch {
      setExplainError('Không thể giải thích. Thử lại sau.');
    } finally {
      setExplaining(false);
    }
  }, [showExplain, explanation, sub.text, isCompleted, allBlanksCorrect]);

  // Simple markdown-like rendering for the explanation
  const renderExplanation = (text: string) => {
    const lines = text.split('\n');
    return lines.map((line, i) => {
      // Bold text
      const boldRendered = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      
      // Check if this is a section header (starts with emoji)
      const isHeader = /^[🌐📝🔍🎨]/.test(line.trim());
      
      if (line.trim() === '') {
        return <div key={i} className="explain-line-break" />;
      }
      
      return (
        <div
          key={i}
          className={`explain-line ${isHeader ? 'explain-section-header' : ''}`}
          dangerouslySetInnerHTML={{ __html: boldRendered }}
        />
      );
    });
  };

  const renderWords = () => {
    if (showAll) {
      return (
        <>
          {words.map((word, wi) => (
            <span key={wi} className="cloze-word cloze-revealed">
              {word}{' '}
            </span>
          ))}
        </>
      );
    }

    if (isCompleted) {
      return (
        <>
          {words.map((word, wi) => (
            <span key={wi} className="cloze-word cloze-correct">
              {word}{' '}
            </span>
          ))}
        </>
      );
    }

    if (!isActive) {
      // In 50% mode, non-blank words and correctly typed blanks should stay visible
      const hasAnyRevealed = words.some((_, wi) => revealedWords.has(`${index}-${wi}`));
      const hasAnyCorrect = Object.values(subResults).some(r => r === 'correct');
      const hasPartialProgress = hasAnyRevealed || hasAnyCorrect;

      if (hasPartialProgress) {
        return (
          <>
            {words.map((word, wi) => {
              const isWordRevealed = revealedWords.has(`${index}-${wi}`);
              const isWordCorrect = blanks.has(wi) && subResults[wi] === 'correct';
              const isNonBlank = !blanks.has(wi);

              if (isWordRevealed || isWordCorrect || isNonBlank) {
                return (
                  <span key={wi} className={`cloze-word ${isWordCorrect ? 'cloze-correct' : 'cloze-revealed'}`}>
                    {word}{' '}
                  </span>
                );
              }
              return (
                <span key={wi} className="cloze-word sub-cloze-blurred">
                  {word}{' '}
                </span>
              );
            })}
          </>
        );
      }
      return (
        <span className="sub-cloze-blurred">
          {words.map((word, wi) => (
            <span key={wi} className="cloze-word cloze-shadow-text">
              {word}{' '}
            </span>
          ))}
        </span>
      );
    }

    // Active row — cloze inputs
    return (
      <>
        {words.map((word, wi) => {
          const isBlank = blanks.has(wi);
          const result = subResults[wi];
          const userVal = subInputs[wi] || '';
          const cleanWord = word.replace(/[.,!?;:'"„"»«]/g, '');
          const punct = word.slice(cleanWord.length);
          const isRevealed = revealedWords.has(`${index}-${wi}`);

          if (allBlanksCorrect) {
            return (
              <span key={wi} className="cloze-word cloze-correct">
                {word}{' '}
              </span>
            );
          }

          // Non-blank words are always visible in 60% mode
          if (!isBlank) {
            return (
              <span key={wi} className="cloze-word cloze-revealed">
                {word}{' '}
              </span>
            );
          }

          if (result === 'correct' || isRevealed) {
            return (
              <span
                key={wi}
                className={`cloze-word ${result === 'correct' ? 'cloze-correct' : 'cloze-revealed'}`}
              >
                {word}{' '}
              </span>
            );
          }

          return (
            <span
              key={wi}
              className={`cloze-input-wrap ${result === 'incorrect' ? 'cloze-input-error' : ''}`}
              onClick={(e) => {
                e.stopPropagation();
                blankRefs.current?.[`${index}-${wi}`]?.focus();
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onRevealWord(index, wi);
              }}
            >
              <input
                ref={(el) => {
                  if (blankRefs.current) blankRefs.current[`${index}-${wi}`] = el;
                }}
                type="text"
                className="cloze-input"
                value={userVal}
                onChange={(e) => onChange(index, wi, e.target.value)}
                onKeyDown={(e) => onKeyDown(e, index, wi)}
                autoFocus={wi === Array.from(blanks).sort((a, b) => a - b)[0]}
                maxLength={cleanWord.length}
                placeholder={'_'.repeat(cleanWord.length)}
                style={{ width: `${cleanWord.length + 0.8}ch` }}
              />
              {punct && <span className="cloze-punct">{punct}</span>}
              {' '}
            </span>
          );
        })}
      </>
    );
  };

  return (
    <div
      id={`sub-${index}`}
      className={`sub-row ${isActive ? 'sub-active' : ''} ${isCompleted ? 'sub-completed' : ''} ${isBookmarked ? 'sub-bookmarked' : ''}`}
      onClick={() => onSelect(index)}
    >
      <div className="sub-row-header">
        <span className="sub-number">{index + 1}</span>
        <button
          className="sub-play-btn"
          onClick={(e) => {
            e.stopPropagation();
            onSelect(index);
          }}
          title="Abspielen"
        >
          🔊
        </button>
        <span className="sub-time">{formatTime(sub.start)}</span>
        {isActive && !isCompleted && (
          <span className="sub-phase-badge sub-phase-diktat">✍️ Diktat</span>
        )}
        {isCompleted && <span className="sub-check">✓</span>}
        <button
          className={`sub-explain-btn ${showExplain ? 'sub-explain-btn-active' : ''}`}
          onClick={handleExplain}
          title="Giải thích câu này"
        >
          💡
        </button>
        <button
          className={`sub-bookmark-btn ${isBookmarked ? 'sub-bookmark-btn-active' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleBookmark(index);
          }}
          title={isBookmarked ? 'Lesezeichen entfernen' : 'Lesezeichen setzen'}
        >
          {isBookmarked ? '★' : '☆'}
        </button>
      </div>
      <div className="sub-cloze">{renderWords()}</div>

      {/* Explanation panel */}
      {showExplain && (
        <div className="explain-panel" onClick={(e) => e.stopPropagation()}>
          <div className="explain-panel-header">
            <span className="explain-panel-title">💡 Giải thích</span>
            <button
              className="explain-panel-close"
              onClick={(e) => {
                e.stopPropagation();
                setShowExplain(false);
              }}
            >
              ✕
            </button>
          </div>
          <div className="explain-panel-body">
            {explaining && (
              <div className="explain-loading">
                <span className="explain-loading-icon">🧠</span>
                <span className="explain-loading-text">Đang phân tích...</span>
              </div>
            )}
            {explainError && (
              <div className="explain-error">
                <span>❌</span> {explainError}
              </div>
            )}
            {explanation && !explaining && (
              <div className="explain-content">
                {renderExplanation(explanation)}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast warning */}
      {showToast && (
        <div className="explain-toast" onClick={(e) => e.stopPropagation()}>
          <span className="explain-toast-icon">⚠️</span>
          <span>Hoàn thành câu trước khi xem giải thích!</span>
        </div>
      )}
    </div>
  );
}
