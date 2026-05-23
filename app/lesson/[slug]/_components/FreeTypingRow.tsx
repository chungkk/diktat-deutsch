'use client';
import { useRef, useCallback, useState } from 'react';

interface Subtitle {
  start: number;
  dur: number;
  text: string;
}

interface FreeTypingPanelProps {
  subtitles: Subtitle[];
  onSeekBy: (seconds: number) => void;
  onTogglePlay: () => void;
  isPlaying: boolean;
}

// Normalize text for comparison
function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function FreeTypingPanel({
  subtitles,
  onSeekBy,
  onTogglePlay,
  isPlaying,
}: FreeTypingPanelProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [userText, setUserText] = useState('');
  const [showAnswer, setShowAnswer] = useState(false);
  const [checkResult, setCheckResult] = useState<'correct' | 'incorrect' | null>(null);

  // Full expected text = all subtitles joined
  const expectedText = subtitles
    .map((s) => s.text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim())
    .join(' ');

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      onSeekBy(-2);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      onSeekBy(2);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      onTogglePlay();
    }
  }, [onSeekBy, onTogglePlay]);

  const handleCheck = useCallback(() => {
    const userNorm = normalizeText(userText);
    const expectedNorm = normalizeText(expectedText);
    setCheckResult(userNorm === expectedNorm ? 'correct' : 'incorrect');
    setShowAnswer(true);
  }, [userText, expectedText]);

  const handleReset = useCallback(() => {
    setUserText('');
    setShowAnswer(false);
    setCheckResult(null);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, []);

  const handleToggleAnswer = useCallback(() => {
    setShowAnswer((prev) => !prev);
  }, []);

  const wordCount = userText.trim() ? userText.trim().split(/\s+/).length : 0;

  // Diff view
  const renderDiff = () => {
    if (!showAnswer) return null;
    const userWords = userText.trim().split(/\s+/).filter(Boolean);
    const expectedWords = expectedText.split(/\s+/).filter(Boolean);

    return (
      <div style={{
        background: 'rgba(56,189,248,0.05)',
        border: '2px solid rgba(56,189,248,0.2)',
        borderRadius: '1rem',
        padding: '1rem 1.25rem',
        maxHeight: '280px',
        overflowY: 'auto',
        animation: 'fadeInUp 0.3s ease',
      }}>
        <div style={{
          fontSize: '0.72rem',
          fontWeight: 900,
          color: '#38bdf8',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          marginBottom: '0.5rem',
        }}>
          Lösung ({expectedWords.length} Wörter)
        </div>
        <div style={{ fontSize: '0.9rem', fontWeight: 700, lineHeight: 2.2 }}>
          {expectedWords.map((word, i) => {
            const userWord = userWords[i] || '';
            const isMatch = normalizeText(userWord) === normalizeText(word);
            return (
              <span
                key={i}
                style={{
                  color: isMatch ? '#4ade80' : '#f87171',
                  textDecoration: isMatch ? 'none' : 'underline',
                  textUnderlineOffset: '3px',
                  textShadow: isMatch ? '0 0 6px rgba(74,222,128,0.3)' : 'none',
                }}
              >
                {word}{' '}
              </span>
            );
          })}
        </div>
        {userWords.length !== expectedWords.length && (
          <div style={{
            marginTop: '0.5rem',
            fontSize: '0.75rem',
            color: '#fbbf24',
            fontWeight: 800,
          }}>
            Deine Wörter: {userWords.length} / Erwartet: {expectedWords.length}
          </div>
        )}
      </div>
    );
  };

  const btnBase: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '0.5rem 1rem',
    borderRadius: '999px',
    fontSize: '0.8rem',
    fontWeight: 900,
    fontFamily: 'var(--font-family-sans)',
    cursor: 'pointer',
    border: '2.5px solid var(--color-border)',
    background: 'var(--color-bg-card)',
    color: 'var(--color-text-secondary)',
    transition: 'all 0.15s',
    boxShadow: '3px 3px 0 rgba(0,0,0,0.3)',
  };

  const textareaStyle: React.CSSProperties = {
    width: '100%',
    flex: 1,
    minHeight: '220px',
    padding: '1rem 1.25rem',
    background: 'var(--color-bg-input)',
    border: `2.5px solid ${checkResult === 'correct' ? '#4ade80' : checkResult === 'incorrect' ? '#f87171' : 'rgba(56,189,248,0.35)'}`,
    borderRadius: '1.25rem',
    color: 'var(--color-text-primary)',
    fontSize: '1rem',
    fontFamily: 'var(--font-family-sans)',
    fontWeight: 700,
    outline: 'none',
    resize: 'none' as const,
    lineHeight: 1.9,
    boxShadow: checkResult === 'correct'
      ? '0 0 0 3px rgba(74,222,128,0.15), 3px 3px 0 rgba(21,128,61,0.4)'
      : checkResult === 'incorrect'
        ? '0 0 0 3px rgba(248,113,113,0.12), 3px 3px 0 rgba(185,28,28,0.3)'
        : '3px 3px 0 rgba(0,0,0,0.3)',
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      flex: 1,
      padding: '1.25rem',
      gap: '0.875rem',
      minHeight: 0,
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.875rem 1.25rem',
        background: 'rgba(56,189,248,0.06)',
        border: '2.5px solid rgba(56,189,248,0.2)',
        borderRadius: '1.25rem',
        boxShadow: '4px 4px 0 rgba(14,116,144,0.2)',
      }}>
        <span style={{ fontSize: '1.5rem' }}>✏️</span>
        <div>
          <div style={{
            fontSize: '0.95rem',
            fontWeight: 900,
            color: '#38bdf8',
            textShadow: '1px 1px 0 rgba(14,116,144,0.5)',
          }}>
            Freies Diktat
          </div>
          <div style={{
            fontSize: '0.72rem',
            color: 'var(--color-text-muted)',
            fontWeight: 700,
            marginTop: '0.15rem',
          }}>
            Höre zu und schreibe alles, was du verstehst
          </div>
        </div>
      </div>

      {/* Video controls */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          style={{
            ...btnBase,
            ...(isPlaying
              ? { background: '#22c55e', color: '#0a1a0e', borderColor: '#15803d', boxShadow: '3px 3px 0 #15803d' }
              : {}),
          }}
          onClick={(e) => { e.stopPropagation(); onTogglePlay(); }}
        >
          {isPlaying ? '⏸ Pause' : '▶ Abspielen'}
        </button>
        <button style={btnBase} onClick={(e) => { e.stopPropagation(); onSeekBy(-5); }}>
          ⏪ −5s
        </button>
        <button style={btnBase} onClick={(e) => { e.stopPropagation(); onSeekBy(5); }}>
          ⏩ +5s
        </button>
      </div>

      {/* Textarea */}
      <textarea
        ref={textareaRef}
        style={textareaStyle}
        value={userText}
        onChange={(e) => {
          setUserText(e.target.value);
          if (checkResult) setCheckResult(null);
          if (showAnswer) setShowAnswer(false);
        }}
        onKeyDown={handleKeyDown}
        placeholder="Tippe alles, was du im Video hörst..."
        autoFocus
      />

      {/* Footer — actions + stats */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            style={{
              ...btnBase,
              background: '#22c55e',
              color: '#0a1a0e',
              borderColor: '#15803d',
              boxShadow: '3px 3px 0 #15803d',
              opacity: userText.trim().length === 0 ? 0.4 : 1,
              cursor: userText.trim().length === 0 ? 'not-allowed' : 'pointer',
            }}
            onClick={handleCheck}
            disabled={userText.trim().length === 0}
          >
            ✅ Prüfen
          </button>
          <button
            style={{
              ...btnBase,
              borderColor: 'rgba(56,189,248,0.35)',
              color: '#38bdf8',
            }}
            onClick={handleToggleAnswer}
          >
            {showAnswer ? '🙈 Ausblenden' : '👁️ Lösung'}
          </button>
          {(userText.length > 0 || showAnswer) && (
            <button
              style={{
                ...btnBase,
                borderColor: 'rgba(251,191,36,0.35)',
                color: '#fbbf24',
              }}
              onClick={handleReset}
            >
              🔄 Neu
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            fontSize: '0.75rem',
            fontWeight: 900,
            color: 'var(--color-text-muted)',
            padding: '0.25rem 0.7rem',
            borderRadius: '999px',
            background: 'rgba(255,255,255,0.05)',
            border: '1.5px solid var(--color-border)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {wordCount} Wörter
          </span>
          <span style={{
            fontSize: '0.65rem',
            color: 'var(--color-text-muted)',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}>
            {(() => {
              const kbdStyle: React.CSSProperties = {
                background: 'var(--color-bg-input)',
                border: '1.5px solid var(--color-border)',
                padding: '0.1rem 0.35rem',
                borderRadius: '0.3rem',
                fontSize: '0.6rem',
                fontWeight: 800,
                fontFamily: 'var(--font-family-sans)',
                color: 'var(--color-text-secondary)',
                boxShadow: '1px 1px 0 rgba(0,0,0,0.3)',
              };
              return (
                <>
                  <kbd style={kbdStyle}>←</kbd>/<kbd style={kbdStyle}>→</kbd> tua
                  <span style={{ margin: '0 0.15rem' }}>·</span>
                  <kbd style={kbdStyle}>Enter</kbd> phát/dừng
                </>
              );
            })()}
          </span>
        </div>
      </div>

      {/* Diff result */}
      {renderDiff()}
    </div>
  );
}
