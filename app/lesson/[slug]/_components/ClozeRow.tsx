'use client';
import { RefObject, useCallback } from 'react';

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
  blankMode: 50 | 100;
  blankRefs: RefObject<Record<string, HTMLInputElement | null>>;
  hiddenWordRefs: RefObject<Record<string, HTMLSpanElement | null>>;
  onSelect: (index: number) => void;
  onChange: (subIdx: number, wordIdx: number, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent, subIdx: number, wordIdx: number) => void;
  onRevealWord: (subIdx: number, wordIdx: number) => void;
  onToggleBookmark: (index: number) => void;
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
}: ClozeRowProps) {
  const { words, blanks } = tokens;
  const allBlanksCorrect =
    blanks.size > 0 && Array.from(blanks).every((wi) => subResults[wi] === 'correct');

  const renderWords = () => {
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
      const hasAnyRevealed = words.some((_, wi) => revealedWords.has(`${index}-${wi}`));
      if (hasAnyRevealed) {
        return (
          <>
            {words.map((word, wi) => {
              const isWordRevealed = revealedWords.has(`${index}-${wi}`);
              const isWordCorrect = blanks.has(wi) && subResults[wi] === 'correct';
              if (isWordRevealed || isWordCorrect) {
                return (
                  <span key={wi} className="cloze-word cloze-revealed">
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

          if (!isBlank) {
            if (blankMode === 50 || isRevealed) {
              return (
                <span key={wi} className="cloze-word cloze-revealed">
                  {word}{' '}
                </span>
              );
            }
            return (
              <span
                key={wi}
                ref={(el) => {
                  if (hiddenWordRefs.current) hiddenWordRefs.current[`${index}-${wi}`] = el;
                }}
                className="cloze-word cloze-square-box"
                tabIndex={0}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onRevealWord(index, wi);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.stopPropagation();
                    onRevealWord(index, wi);
                  }
                  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                    e.preventDefault();
                    e.stopPropagation();
                    // Collect all hidden word indices in this row
                    const hiddenIndices = words
                      .map((_, i) => i)
                      .filter(i => !blanks.has(i) && !revealedWords.has(`${index}-${i}`) && blankMode === 100);
                    const pos = hiddenIndices.indexOf(wi);
                    const nextPos = e.key === 'ArrowLeft' ? pos - 1 : pos + 1;
                    if (nextPos >= 0 && nextPos < hiddenIndices.length) {
                      hiddenWordRefs.current?.[`${index}-${hiddenIndices[nextPos]}`]?.focus();
                    }
                  }
                }}
                title="Enter zum Anzeigen / ← → zum Navigieren"
              >
                {cleanWord.replace(/./g, '■')}
                {punct}{' '}
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
    </div>
  );
}
