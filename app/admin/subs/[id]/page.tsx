'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useParams } from 'next/navigation';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

interface Subtitle { start: number; dur: number; text: string; }
interface Lesson {
  _id: string; title: string; youtubeId?: string; videoType: string;
  subtitles: Subtitle[];
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
}

function parseTime(val: string): number {
  const parts = val.split(':');
  if (parts.length === 2) {
    return parseInt(parts[0] || '0') * 60 + parseFloat(parts[1] || '0');
  }
  return parseFloat(val || '0');
}

export default function SubtitleEditorPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const lessonId = params.id as string;

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [selectedSubs, setSelectedSubs] = useState<Set<number>>(new Set());
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  // Track subtitles that have been merged or had their timing adjusted
  const [editedSubs, setEditedSubs] = useState<Set<number>>(new Set());

  // YouTube Player
  const playerRef = useRef<any>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  // Text input refs for cursor-based split
  const textInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // Undo / Redo history
  const [history, setHistory] = useState<Subtitle[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedo = useRef(false);

  // Push to history whenever subtitles change (but not during undo/redo)
  useEffect(() => {
    if (isUndoRedo.current) {
      isUndoRedo.current = false;
      return;
    }
    if (subtitles.length === 0 && history.length === 0) return;
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(subtitles)));
      // Limit history to 50 entries
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => {
      const newIdx = Math.min(prev + 1, 49);
      return newIdx;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitles]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const undo = useCallback(() => {
    if (!canUndo) return;
    isUndoRedo.current = true;
    const newIdx = historyIndex - 1;
    setHistoryIndex(newIdx);
    setSubtitles(JSON.parse(JSON.stringify(history[newIdx])));
    setSelectedSubs(new Set());
  }, [canUndo, historyIndex, history]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    isUndoRedo.current = true;
    const newIdx = historyIndex + 1;
    setHistoryIndex(newIdx);
    setSubtitles(JSON.parse(JSON.stringify(history[newIdx])));
    setSelectedSubs(new Set());
  }, [canRedo, historyIndex, history]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  // ── YouTube IFrame API ──
  const initYTPlayer = useCallback((videoId: string) => {
    if (!ytContainerRef.current) return;
    const createPlayer = () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
      playerRef.current = new window.YT.Player(ytContainerRef.current!, {
        videoId,
        playerVars: { controls: 1, modestbranding: 1, rel: 0 },
      });
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
      // Load API script
      const existing = document.getElementById('yt-iframe-api');
      if (!existing) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
      window.onYouTubeIframeAPIReady = createPlayer;
    }
  }, []);

  // Play a subtitle: seek to start, auto-stop at end
  const playSubtitle = useCallback((sub: Subtitle, index: number) => {
    const player = playerRef.current;
    if (!player || !player.seekTo) return;

    // Clear any existing stop timer
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }

    setPlayingIdx(index);
    player.seekTo(sub.start, true);
    player.playVideo();

    // Auto-pause after duration
    const durationMs = sub.dur * 1000 + 300; // +300ms buffer
    stopTimerRef.current = setTimeout(() => {
      player.pauseVideo();
      setPlayingIdx(null);
      stopTimerRef.current = null;
    }, durationMs);
  }, []);

  const stopPlayback = useCallback(() => {
    if (stopTimerRef.current) {
      clearTimeout(stopTimerRef.current);
      stopTimerRef.current = null;
    }
    if (playerRef.current?.pauseVideo) {
      playerRef.current.pauseVideo();
    }
    setPlayingIdx(null);
  }, []);

  // Auth + fetch lesson
  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') {
      const role = (session?.user as { role?: string })?.role;
      if (role !== 'admin') { router.push('/'); return; }
      fetchLesson();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, session]);

  const fetchLesson = async () => {
    try {
      const res = await fetch(`/api/lessons/${lessonId}`);
      const data = await res.json();
      if (data.error) { router.push('/admin'); return; }
      setLesson(data);
      setSubtitles(data.subtitles || []);
    } catch { router.push('/admin'); }
    setLoading(false);
  };

  // Init YT player when lesson loads
  useEffect(() => {
    if (lesson?.youtubeId) {
      // Small delay to ensure container is mounted
      const timer = setTimeout(() => initYTPlayer(lesson.youtubeId!), 300);
      return () => clearTimeout(timer);
    }
  }, [lesson?.youtubeId, initYTPlayer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtitles }),
      });
      if (res.ok) {
        setSaveMsg('✅ Gespeichert!');
        setTimeout(() => setSaveMsg(''), 3000);
      } else {
        setSaveMsg('❌ Fehler beim Speichern');
      }
    } catch {
      setSaveMsg('❌ Fehler beim Speichern');
    }
    setSaving(false);
  };

  // ── Subtitle operations ──

  const updateSub = (index: number, field: keyof Subtitle, value: string | number) => {
    const updated = [...subtitles];
    updated[index] = { ...updated[index], [field]: value };
    setSubtitles(updated);
  };

  const deleteSub = (index: number) => {
    setSubtitles(subtitles.filter((_, i) => i !== index));
    setSelectedSubs(prev => {
      const next = new Set<number>();
      prev.forEach(idx => {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      });
      return next;
    });
    setEditedSubs(prev => {
      const next = new Set<number>();
      prev.forEach(idx => {
        if (idx < index) next.add(idx);
        else if (idx > index) next.add(idx - 1);
      });
      return next;
    });
  };

  const addSub = () => {
    const last = subtitles[subtitles.length - 1];
    const newStart = last ? parseFloat((last.start + last.dur).toFixed(2)) : 0;
    setSubtitles([...subtitles, { start: newStart, dur: 3, text: '' }]);
  };

  const insertSubAfter = (index: number) => {
    const current = subtitles[index];
    const nextSub = subtitles[index + 1];
    const newStart = parseFloat((current.start + current.dur).toFixed(2));
    const newDur = nextSub ? parseFloat(Math.max(0.5, nextSub.start - newStart).toFixed(2)) : 3;
    const updated = [...subtitles];
    updated.splice(index + 1, 0, { start: newStart, dur: Math.min(newDur, 5), text: '' });
    setSubtitles(updated);
    // Shift selections after index
    setSelectedSubs(prev => {
      const next = new Set<number>();
      prev.forEach(idx => {
        if (idx <= index) next.add(idx);
        else next.add(idx + 1);
      });
      return next;
    });
    setEditedSubs(prev => {
      const next = new Set<number>();
      prev.forEach(idx => {
        if (idx <= index) next.add(idx);
        else next.add(idx + 1);
      });
      return next;
    });
  };

  const splitSub = (index: number) => {
    const sub = subtitles[index];
    const text = sub.text;
    if (!text || text.length < 2) return;

    // Get cursor position from the text input
    const inputEl = textInputRefs.current.get(index);
    let splitPos = inputEl?.selectionStart ?? -1;

    // If cursor is at start/end or not found, fall back to auto-detect
    if (splitPos <= 0 || splitPos >= text.length) {
      splitPos = -1;
      // Try sentence boundaries
      const sentenceBreaks = ['. ', '! ', '? '];
      for (const brk of sentenceBreaks) {
        const idx = text.indexOf(brk);
        if (idx > 0 && idx < text.length - brk.length) {
          splitPos = idx + brk.length - 1;
          break;
        }
      }
      // Fallback: middle word
      if (splitPos === -1) {
        const mid = Math.floor(text.length / 2);
        let bestSpace = -1;
        let bestDist = Infinity;
        for (let j = 0; j < text.length; j++) {
          if (text[j] === ' ' && Math.abs(j - mid) < bestDist) {
            bestDist = Math.abs(j - mid);
            bestSpace = j;
          }
        }
        if (bestSpace > 0) splitPos = bestSpace;
        else return;
      }
    }

    const text1 = text.substring(0, splitPos).trim();
    const text2 = text.substring(splitPos).trim();
    if (!text1 || !text2) return;

    // Split duration proportionally by character count
    const ratio = text1.length / (text1.length + text2.length);
    const dur1 = parseFloat((sub.dur * ratio).toFixed(2));
    const dur2 = parseFloat((sub.dur - dur1).toFixed(2));
    const start2 = parseFloat((sub.start + dur1).toFixed(2));

    const updated = [...subtitles];
    updated.splice(index, 1,
      { start: sub.start, dur: dur1, text: text1 },
      { start: start2, dur: dur2, text: text2 },
    );
    setSubtitles(updated);
    setSelectedSubs(new Set());
    // Remap editedSubs: the split row becomes 2 rows, shift everything after
    setEditedSubs(prev => {
      const next = new Set<number>();
      prev.forEach(idx => {
        if (idx < index) next.add(idx);
        else if (idx === index) {
          // Original edited row splits into two — keep both marked
          next.add(idx);
          next.add(idx + 1);
        } else {
          next.add(idx + 1);
        }
      });
      return next;
    });
  };

  const toggleSubSelect = (index: number) => {
    setSelectedSubs(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const mergeSelectedSubs = () => {
    if (selectedSubs.size < 2) return;
    const indices = Array.from(selectedSubs).sort((a, b) => a - b);
    const firstIdx = indices[0];
    const lastIdx = indices[indices.length - 1];
    const first = subtitles[firstIdx];
    const last = subtitles[lastIdx];

    // Merge text from ALL selected (even non-contiguous)
    const mergedText = indices.map(i => subtitles[i].text).join(' ');

    // Duration: from start of first to end of last
    const endTime = last.start + last.dur;
    const mergedDur = parseFloat((endTime - first.start).toFixed(2));

    const merged: Subtitle = {
      start: first.start,
      dur: mergedDur,
      text: mergedText,
    };

    // Remove all selected, insert merged at first position
    const updated = subtitles.filter((_, i) => !indices.includes(i));
    updated.splice(firstIdx, 0, merged);
    setSubtitles(updated);
    setSelectedSubs(new Set());

    // Mark merged subtitle as edited (recalculate indices after removal)
    setEditedSubs(prev => {
      const next = new Set<number>();
      // Remap existing edited indices after merge removal
      prev.forEach(idx => {
        if (!indices.includes(idx)) {
          const offset = indices.filter(ri => ri < idx).length;
          next.add(idx - offset);
        }
      });
      // Mark the merged result
      next.add(firstIdx);
      return next;
    });

    // Auto-play the merged subtitle to preview
    setTimeout(() => {
      playSubtitle(merged, firstIdx);
    }, 200);
  };

  const selectRange = (from: number, to: number) => {
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const next = new Set<number>();
    for (let i = start; i <= end; i++) next.add(i);
    setSelectedSubs(next);
  };

  if (status === 'loading' || loading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  if (!lesson) {
    return <div className="container" style={{ paddingTop: 60, textAlign: 'center', color: 'var(--color-text-muted)' }}>Lektion nicht gefunden</div>;
  }

  const sortedSelection = Array.from(selectedSubs).sort((a, b) => a - b);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* ── Top Bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '1rem',
        padding: '0.6rem 1.25rem',
        background: 'var(--color-bg-card)',
        borderBottom: '2.5px solid var(--color-accent)',
        flexShrink: 0,
        boxShadow: '0 3px 0 rgba(34,197,94,0.15)',
      }}>
        <button className="lesson-back-btn" onClick={() => router.push('/admin')}>← Zurück</button>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <h1 style={{
            fontSize: '0.95rem', fontWeight: 900, margin: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            ✏️ Sub-Editor: {lesson.title}
          </h1>
          <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>
            {subtitles.length} Zeilen · {history.length > 0 ? `${historyIndex}/${history.length - 1} Verlauf` : ''}
          </span>
        </div>

        {/* Undo / Redo */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={undo}
            disabled={!canUndo}
            title="Rückgängig (⌘Z)"
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.9rem', minWidth: 0 }}
          >
            ↩️
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={redo}
            disabled={!canRedo}
            title="Wiederholen (⌘⇧Z)"
            style={{ padding: '0.3rem 0.6rem', fontSize: '0.9rem', minWidth: 0 }}
          >
            ↪️
          </button>
        </div>

        {/* Save */}
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
          style={{ whiteSpace: 'nowrap' }}
        >
          {saving ? '⏳ Speichern...' : '💾 Speichern'}
        </button>
        {saveMsg && (
          <span style={{
            fontSize: '0.78rem', fontWeight: 800,
            color: saveMsg.startsWith('✅') ? 'var(--color-success)' : 'var(--color-error)',
            animation: 'fadeInUp 0.3s ease',
          }}>
            {saveMsg}
          </span>
        )}
      </div>

      {/* ── Main Content ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: Video Preview */}
        {lesson.youtubeId && (
          <div style={{
            width: 380, flexShrink: 0,
            borderRight: '2.5px solid var(--color-border)',
            display: 'flex', flexDirection: 'column',
            background: 'var(--color-bg-secondary)',
          }}>
            <div style={{
              position: 'relative', width: '100%', paddingTop: '56.25%',
              background: '#000', flexShrink: 0,
            }}>
              <div
                ref={ytContainerRef}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
              />
            </div>

            {/* Now Playing indicator */}
            {playingIdx !== null && subtitles[playingIdx] && (
              <div style={{
                padding: '0.5rem 0.75rem',
                background: 'rgba(34,197,94,0.1)',
                borderBottom: '2px solid rgba(34,197,94,0.3)',
                display: 'flex', alignItems: 'center', gap: 8,
                animation: 'fadeInUp 0.2s ease',
              }}>
                <span style={{ fontSize: '1rem', animation: 'pulse 1s ease-in-out infinite' }}>🔊</span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.68rem', color: 'var(--color-accent)', fontWeight: 900, textTransform: 'uppercase' }}>
                    Spielt Zeile {playingIdx + 1}
                  </div>
                  <div style={{
                    fontSize: '0.75rem', color: 'var(--color-text-primary)', fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {subtitles[playingIdx].text}
                  </div>
                </div>
                <button
                  onClick={stopPlayback}
                  style={{
                    background: 'rgba(248,113,113,0.15)', border: '1.5px solid rgba(248,113,113,0.4)',
                    borderRadius: 6, padding: '2px 8px', cursor: 'pointer',
                    fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-error)',
                  }}
                >
                  ⏹ Stop
                </button>
              </div>
            )}
            <div style={{ padding: '0.75rem', overflowY: 'auto', flex: 1 }}>
              <div style={{
                fontSize: '0.72rem', fontWeight: 800, color: 'var(--color-text-muted)',
                textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem',
              }}>
                ⌨️ Tastenkürzel
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  ['⌘ Z', 'Rückgängig (Undo)'],
                  ['⌘ ⇧ Z', 'Wiederholen (Redo)'],
                  ['▶', 'Nghe thử từng câu sub'],
                  ['Checkbox', 'Zeilen zum Gộp auswählen'],
                ].map(([key, desc]) => (
                  <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.75rem' }}>
                    <kbd style={{
                      padding: '0.15rem 0.4rem', borderRadius: 4,
                      background: 'var(--color-bg-input)', border: '1.5px solid var(--color-border)',
                      fontWeight: 800, fontSize: '0.68rem', color: 'var(--color-text-secondary)',
                      boxShadow: '2px 2px 0 rgba(0,0,0,0.3)',
                      fontFamily: 'var(--font-family-sans)',
                    }}>{key}</kbd>
                    <span style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>{desc}</span>
                  </div>
                ))}
              </div>

              {/* Selection info */}
              {selectedSubs.size > 0 && (
                <div style={{
                  marginTop: '1rem', padding: '0.75rem',
                  background: 'rgba(245,158,11,0.08)',
                  border: '2px solid rgba(245,158,11,0.3)',
                  borderRadius: '1rem',
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: 900, color: '#f59e0b', marginBottom: 6 }}>
                    🔗 {selectedSubs.size} Zeilen ausgewählt
                  </div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: 8 }}>
                    Zeilen: {sortedSelection.map(i => i + 1).join(', ')}
                  </div>
                  {selectedSubs.size >= 2 && (
                    <>
                      {/* Preview merged text */}
                      <div style={{
                        fontSize: '0.72rem', color: 'var(--color-text-primary)', fontWeight: 600,
                        padding: '0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: 8,
                        marginBottom: 8, maxHeight: 80, overflowY: 'auto',
                        border: '1px solid var(--color-border)',
                      }}>
                        {sortedSelection.map(i => subtitles[i]?.text).join(' ')}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--color-text-muted)', fontWeight: 700, marginBottom: 8 }}>
                        Start: {formatTime(subtitles[sortedSelection[0]]?.start || 0)} →
                        End: {formatTime((subtitles[sortedSelection[sortedSelection.length - 1]]?.start || 0) + (subtitles[sortedSelection[sortedSelection.length - 1]]?.dur || 0))} =
                        Dauer: {(((subtitles[sortedSelection[sortedSelection.length - 1]]?.start || 0) + (subtitles[sortedSelection[sortedSelection.length - 1]]?.dur || 0)) - (subtitles[sortedSelection[0]]?.start || 0)).toFixed(1)}s
                      </div>
                      {/* Preview play button */}
                      <button
                        className="btn btn-secondary btn-sm btn-block"
                        style={{ marginBottom: 6, fontSize: '0.72rem' }}
                        onClick={() => {
                          const firstSub = subtitles[sortedSelection[0]];
                          const lastSub = subtitles[sortedSelection[sortedSelection.length - 1]];
                          if (firstSub && lastSub) {
                            const previewSub: Subtitle = {
                              start: firstSub.start,
                              dur: parseFloat(((lastSub.start + lastSub.dur) - firstSub.start).toFixed(2)),
                              text: '(preview)',
                            };
                            playSubtitle(previewSub, sortedSelection[0]);
                          }
                        }}
                      >
                        ▶ Nghe thử trước khi gộp
                      </button>
                      <button
                        className="btn btn-primary btn-sm btn-block"
                        style={{
                          background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                          border: '2px solid #b45309',
                          boxShadow: '3px 3px 0 #b45309',
                          fontWeight: 900,
                        }}
                        onClick={mergeSelectedSubs}
                      >
                        🔗 Gộp {selectedSubs.size} dòng
                      </button>
                    </>
                  )}
                  <button
                    className="btn btn-secondary btn-sm btn-block"
                    style={{ marginTop: 6, fontSize: '0.7rem', opacity: 0.7 }}
                    onClick={() => setSelectedSubs(new Set())}
                  >
                    ✕ Bỏ chọn
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Right: Subtitle Editor Table */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '0.5rem 1rem',
            background: 'var(--color-bg-secondary)',
            borderBottom: '2px solid var(--color-border)',
            flexShrink: 0,
            flexWrap: 'wrap',
          }}>
            <button className="btn btn-secondary btn-sm" onClick={addSub} style={{ fontSize: '0.72rem' }}>
              + Zeile hinzufügen
            </button>
            {selectedSubs.size >= 2 && (
              <>
                <button
                  className="btn btn-primary btn-sm"
                  style={{
                    fontSize: '0.72rem',
                    background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                    border: '2px solid #b45309',
                    boxShadow: '3px 3px 0 #b45309',
                    fontWeight: 900,
                  }}
                  onClick={mergeSelectedSubs}
                >
                  🔗 Gộp {selectedSubs.size} dòng
                </button>
                {/* Quick range select */}
                {sortedSelection.length >= 2 && (
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.68rem' }}
                    onClick={() => selectRange(sortedSelection[0], sortedSelection[sortedSelection.length - 1])}
                    title="Chọn tất cả dòng từ đầu đến cuối selection"
                  >
                    ◻ Chọn dải {sortedSelection[0] + 1}→{sortedSelection[sortedSelection.length - 1] + 1}
                  </button>
                )}
              </>
            )}
            {selectedSubs.size > 0 && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.68rem', opacity: 0.7 }}
                onClick={() => setSelectedSubs(new Set())}
              >
                ✕ Bỏ chọn ({selectedSubs.size})
              </button>
            )}
            <div style={{ flex: 1 }} />
            <span style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>
              {subtitles.length} Zeilen
              {editedSubs.size > 0 && (
                <span style={{
                  marginLeft: 8,
                  padding: '0.15rem 0.5rem',
                  borderRadius: '999px',
                  background: 'rgba(34,197,94,0.12)',
                  border: '1.5px solid rgba(34,197,94,0.4)',
                  color: 'var(--color-accent)',
                  fontWeight: 900,
                  fontSize: '0.68rem',
                }}>
                  ✅ {editedSubs.size} đã chỉnh
                </span>
              )}
            </span>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
            {/* Header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '32px 40px 24px 32px 90px 70px 1fr 80px',
              gap: 6,
              padding: '6px 8px',
              borderBottom: '2.5px solid var(--color-border)',
              fontWeight: 900,
              fontSize: '0.68rem',
              color: 'var(--color-accent)',
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
              position: 'sticky',
              top: 0,
              background: 'var(--color-bg-primary)',
              zIndex: 2,
            }}>
              <span style={{ textAlign: 'center' }}>☐</span>
              <span>#</span>
              <span style={{ textAlign: 'center', fontSize: '0.72rem' }} title="Đã chỉnh xong">✅</span>
              <span style={{ textAlign: 'center' }}>▶</span>
              <span>Start</span>
              <span>Dauer (s)</span>
              <span>Text</span>
              <span style={{ textAlign: 'center' }}>Aktionen</span>
            </div>

            {subtitles.map((s, i) => {
              const isSelected = selectedSubs.has(i);
              const isPlaying = playingIdx === i;
              const endTime = s.start + s.dur;
              return (
                <div
                  key={i}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '32px 40px 24px 32px 90px 70px 1fr 80px',
                    gap: 6,
                    padding: '6px 8px',
                    borderBottom: '1px solid var(--color-border)',
                    alignItems: 'center',
                    background: isPlaying
                      ? 'rgba(34,197,94,0.12)'
                      : isSelected
                        ? 'rgba(245,158,11,0.1)'
                        : (i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'),
                    borderLeft: isPlaying
                      ? '3px solid var(--color-accent)'
                      : isSelected
                        ? '3px solid #f59e0b'
                        : '3px solid transparent',
                    transition: 'all 0.12s ease',
                  }}
                >
                  {/* Checkbox */}
                  <div style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSubSelect(i)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#f59e0b' }}
                    />
                  </div>

                  {/* Row number */}
                  <span style={{
                    fontSize: '0.72rem', fontWeight: 900,
                    color: isPlaying ? 'var(--color-accent)' : isSelected ? '#f59e0b' : 'var(--color-text-muted)',
                    textAlign: 'center',
                  }}>
                    {i + 1}
                  </span>

                  {/* Edited checkmark */}
                  <div style={{ textAlign: 'center' }}>
                    {editedSubs.has(i) ? (
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 18, height: 18, borderRadius: '50%',
                          background: 'rgba(34,197,94,0.15)',
                          border: '1.5px solid rgba(34,197,94,0.5)',
                          fontSize: '0.6rem',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                        title="Đã gộp / chỉnh thời gian — bấm để bỏ dấu"
                        onClick={() => {
                          setEditedSubs(prev => {
                            const next = new Set(prev);
                            next.delete(i);
                            return next;
                          });
                        }}
                      >
                        ✓
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          width: 18, height: 18, borderRadius: '50%',
                          border: '1.5px dashed rgba(255,255,255,0.1)',
                          fontSize: '0.6rem',
                          cursor: 'pointer',
                          opacity: 0.2,
                          transition: 'all 0.15s',
                        }}
                        title="Bấm để đánh dấu đã chỉnh xong"
                        onClick={() => {
                          setEditedSubs(prev => {
                            const next = new Set(prev);
                            next.add(i);
                            return next;
                          });
                        }}
                      >
                        ○
                      </span>
                    )}
                  </div>

                  {/* Play button */}
                  <div style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => isPlaying ? stopPlayback() : playSubtitle(s, i)}
                      style={{
                        background: isPlaying ? 'var(--color-accent)' : 'rgba(34,197,94,0.12)',
                        border: `1.5px solid ${isPlaying ? '#15803d' : 'rgba(34,197,94,0.3)'}`,
                        borderRadius: '50%',
                        width: 24, height: 24,
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.65rem',
                        color: isPlaying ? '#0a1a0e' : 'var(--color-accent)',
                        transition: 'all 0.15s',
                        boxShadow: isPlaying ? '2px 2px 0 #15803d' : 'none',
                      }}
                      title={isPlaying ? 'Stop' : `Abspielen ${formatTime(s.start)} – ${formatTime(endTime)}`}
                    >
                      {isPlaying ? '⏹' : '▶'}
                    </button>
                  </div>

                  {/* Start time */}
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={parseFloat(s.start.toFixed(1))}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val >= 0) {
                        updateSub(i, 'start', parseFloat(val.toFixed(2)));
                        // Mark as edited (timing adjusted)
                        setEditedSubs(prev => new Set(prev).add(i));
                        // Auto-play with new start time
                        playSubtitle({ start: parseFloat(val.toFixed(2)), dur: s.dur, text: s.text }, i);
                      }
                    }}
                    style={{
                      background: 'var(--color-bg-input)',
                      border: '1.5px solid var(--color-border)',
                      borderRadius: 6,
                      padding: '4px 6px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: 'var(--color-accent)',
                      fontFamily: 'monospace',
                      width: '100%',
                      textAlign: 'center',
                    }}
                    title={`Start: ${s.start.toFixed(2)}s → End: ${endTime.toFixed(2)}s`}
                  />

                  {/* Duration */}
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={parseFloat(s.dur.toFixed(1))}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) {
                        updateSub(i, 'dur', parseFloat(val.toFixed(2)));
                        // Mark as edited (timing adjusted)
                        setEditedSubs(prev => new Set(prev).add(i));
                        // Auto-play with new duration
                        playSubtitle({ start: s.start, dur: parseFloat(val.toFixed(2)), text: s.text }, i);
                      }
                    }}
                    style={{
                      background: 'var(--color-bg-input)',
                      border: '1.5px solid var(--color-border)',
                      borderRadius: 6,
                      padding: '4px 6px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      color: 'var(--color-text-primary)',
                      fontFamily: 'monospace',
                      width: '100%',
                      textAlign: 'center',
                    }}
                  />

                  {/* Text */}
                  <input
                    type="text"
                    ref={el => { if (el) textInputRefs.current.set(i, el); else textInputRefs.current.delete(i); }}
                    value={s.text}
                    onChange={e => updateSub(i, 'text', e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        splitSub(i);
                      }
                    }}
                    style={{
                      background: 'var(--color-bg-input)',
                      border: '1.5px solid var(--color-border)',
                      borderRadius: 6,
                      padding: '4px 8px',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                      width: '100%',
                    }}
                    placeholder="Untertiteltext..."
                  />

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <button
                      onClick={() => splitSub(i)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '0.85rem', padding: '2px', opacity: 0.45,
                        transition: 'opacity 0.15s', lineHeight: 1,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0.45')}
                      title="Zeile tách (split) tại dấu câu hoặc giữa"
                    >
                      ✂️
                    </button>
                    <button
                      onClick={() => insertSubAfter(i)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '0.85rem', padding: '2px', opacity: 0.45,
                        transition: 'opacity 0.15s', lineHeight: 1,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0.45')}
                      title="Zeile darunter einfügen"
                    >
                      ➕
                    </button>
                    <button
                      onClick={() => deleteSub(i)}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '0.85rem', padding: '2px', opacity: 0.45,
                        transition: 'opacity 0.15s', lineHeight: 1,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={e => (e.currentTarget.style.opacity = '0.45')}
                      title="Zeile löschen"
                    >
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}

            {subtitles.length === 0 && (
              <div style={{
                textAlign: 'center', padding: '3rem',
                color: 'var(--color-text-muted)', fontWeight: 700,
              }}>
                Keine Untertitel vorhanden. Klicke &quot;+ Zeile hinzufügen&quot;.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
