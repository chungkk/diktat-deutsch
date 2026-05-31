'use client';
import { useEffect, useState, useCallback, useRef } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

interface Subtitle { start: number; dur: number; text: string; }

interface InlineSubEditorProps {
  lessonId: string;
  youtubeId?: string;
  subtitles: Subtitle[];
  onClose: () => void;
  onSaved: (updatedSubtitles: Subtitle[]) => void;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return `${m}:${s.padStart(4, '0')}`;
}

export default function InlineSubEditor({ lessonId, youtubeId, subtitles: initialSubs, onClose, onSaved }: InlineSubEditorProps) {
  const [subtitles, setSubtitles] = useState<Subtitle[]>(JSON.parse(JSON.stringify(initialSubs)));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [selectedSubs, setSelectedSubs] = useState<Set<number>>(new Set());
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);

  // YouTube Player
  const playerRef = useRef<any>(null);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ytContainerRef = useRef<HTMLDivElement>(null);
  const textInputRefs = useRef<Map<number, HTMLInputElement>>(new Map());

  // Undo / Redo
  const [history, setHistory] = useState<Subtitle[][]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedo = useRef(false);

  useEffect(() => {
    if (isUndoRedo.current) {
      isUndoRedo.current = false;
      return;
    }
    if (subtitles.length === 0 && history.length === 0) return;
    setHistory(prev => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(JSON.parse(JSON.stringify(subtitles)));
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex(prev => Math.min(prev + 1, 49));
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

  // Keyboard shortcuts for undo/redo
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

  // YouTube IFrame API
  const initYTPlayer = useCallback((videoId: string) => {
    if (!ytContainerRef.current) return;
    const createPlayer = () => {
      if (playerRef.current) {
        playerRef.current.destroy();
      }
      playerRef.current = new window.YT.Player(ytContainerRef.current!, {
        videoId,
        height: '180',
        width: '320',
        playerVars: { controls: 1, modestbranding: 1, rel: 0 },
      });
    };

    if (window.YT && window.YT.Player) {
      createPlayer();
    } else {
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

  const playSubtitle = useCallback((sub: Subtitle, index: number) => {
    const player = playerRef.current;
    if (!player || !player.seekTo) return;
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    setPlayingIdx(index);
    player.seekTo(sub.start, true);
    player.playVideo();
    const durationMs = sub.dur * 1000 + 300;
    stopTimerRef.current = setTimeout(() => {
      player.pauseVideo();
      setPlayingIdx(null);
      stopTimerRef.current = null;
    }, durationMs);
  }, []);

  const stopPlayback = useCallback(() => {
    if (stopTimerRef.current) { clearTimeout(stopTimerRef.current); stopTimerRef.current = null; }
    if (playerRef.current?.pauseVideo) playerRef.current.pauseVideo();
    setPlayingIdx(null);
  }, []);

  // Init YT player
  useEffect(() => {
    if (youtubeId) {
      const timer = setTimeout(() => initYTPlayer(youtubeId), 300);
      return () => clearTimeout(timer);
    }
  }, [youtubeId, initYTPlayer]);

  useEffect(() => {
    return () => { if (stopTimerRef.current) clearTimeout(stopTimerRef.current); };
  }, []);

  // Save helper that accepts an explicit subtitles array (avoids stale closure)
  const performSave = useCallback(async (subsToSave: Subtitle[]) => {
    setSaving(true);
    setSaveMsg('');
    try {
      const res = await fetch(`/api/lessons/${lessonId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subtitles: subsToSave }),
      });
      if (res.ok) {
        setSaveMsg('✅ Gespeichert!');
        onSaved(subsToSave);
        setTimeout(() => setSaveMsg(''), 3000);
      } else {
        setSaveMsg('❌ Fehler beim Speichern');
      }
    } catch {
      setSaveMsg('❌ Fehler beim Speichern');
    }
    setSaving(false);
  }, [lessonId, onSaved]);

  // Manual save (button)
  const handleSave = async () => {
    await performSave(subtitles);
  };

  // Subtitle operations
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
    setSelectedSubs(prev => {
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

    const inputEl = textInputRefs.current.get(index);
    let splitPos = inputEl?.selectionStart ?? -1;

    if (splitPos <= 0 || splitPos >= text.length) {
      splitPos = -1;
      const sentenceBreaks = ['. ', '! ', '? '];
      for (const brk of sentenceBreaks) {
        const idx = text.indexOf(brk);
        if (idx > 0 && idx < text.length - brk.length) {
          splitPos = idx + brk.length - 1;
          break;
        }
      }
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
    // Auto-save after split
    performSave(updated);
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

    const mergedText = indices.map(i => subtitles[i].text).join(' ');
    const endTime = last.start + last.dur;
    const mergedDur = parseFloat((endTime - first.start).toFixed(2));

    const merged: Subtitle = { start: first.start, dur: mergedDur, text: mergedText };

    const updated = subtitles.filter((_, i) => !indices.includes(i));
    updated.splice(firstIdx, 0, merged);
    setSubtitles(updated);
    setSelectedSubs(new Set());
    // Auto-save after merge
    performSave(updated);

    setTimeout(() => { playSubtitle(merged, firstIdx); }, 200);
  };

  const selectRange = (from: number, to: number) => {
    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const next = new Set<number>();
    for (let i = start; i <= end; i++) next.add(i);
    setSelectedSubs(next);
  };

  const sortedSelection = Array.from(selectedSubs).sort((a, b) => a - b);

  return (
    <div className="inline-sub-editor">
      {/* Top Bar */}
      <div className="inline-sub-editor-topbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 900 }}>✏️ Sub-Editor</span>
          <span style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>
            {subtitles.length} Zeilen
          </span>
        </div>

        {/* Undo/Redo */}
        <div style={{ display: 'flex', gap: 4 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={undo}
            disabled={!canUndo}
            title="Rückgängig (⌘Z)"
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', minWidth: 0 }}
          >↩️</button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={redo}
            disabled={!canRedo}
            title="Wiederholen (⌘⇧Z)"
            style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', minWidth: 0 }}
          >↪️</button>
        </div>

        {/* Save */}
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving}
          style={{ whiteSpace: 'nowrap', fontSize: '0.75rem' }}
        >
          {saving ? '⏳...' : '💾 Speichern'}
        </button>
        {saveMsg && (
          <span style={{
            fontSize: '0.72rem', fontWeight: 800,
            color: saveMsg.startsWith('✅') ? 'var(--color-success)' : 'var(--color-error)',
          }}>
            {saveMsg}
          </span>
        )}

        {/* Close */}
        <button
          className="btn btn-secondary btn-sm"
          onClick={onClose}
          style={{ padding: '0.2rem 0.5rem', fontSize: '0.8rem', minWidth: 0 }}
          title="Editor schließen"
        >✕</button>
      </div>

      {/* Main content area */}
      <div className="inline-sub-editor-body">
        {/* Left sidebar: YT preview + merge panel */}
        {youtubeId && (
          <div className="inline-sub-editor-sidebar">
            <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#000', flexShrink: 0, borderRadius: 8, overflow: 'hidden' }}>
              <div
                ref={ytContainerRef}
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
              />
            </div>

            {/* Now Playing */}
            {playingIdx !== null && subtitles[playingIdx] && (
              <div style={{
                padding: '0.4rem 0.6rem',
                background: 'rgba(34,197,94,0.1)',
                borderRadius: 8,
                display: 'flex', alignItems: 'center', gap: 6,
                marginTop: 6,
              }}>
                <span style={{ fontSize: '0.85rem', animation: 'pulse 1s ease-in-out infinite' }}>🔊</span>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-accent)', fontWeight: 900 }}>
                    Zeile {playingIdx + 1}
                  </div>
                  <div style={{
                    fontSize: '0.7rem', fontWeight: 600,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {subtitles[playingIdx].text}
                  </div>
                </div>
                <button
                  onClick={stopPlayback}
                  style={{
                    background: 'rgba(248,113,113,0.15)', border: '1.5px solid rgba(248,113,113,0.4)',
                    borderRadius: 6, padding: '2px 6px', cursor: 'pointer',
                    fontSize: '0.65rem', fontWeight: 800, color: 'var(--color-error)',
                  }}
                >⏹</button>
              </div>
            )}

            {/* Selection/Merge panel */}
            {selectedSubs.size > 0 && (
              <div style={{
                marginTop: 8, padding: '0.6rem',
                background: 'rgba(245,158,11,0.08)',
                border: '2px solid rgba(245,158,11,0.3)',
                borderRadius: 8,
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#f59e0b', marginBottom: 4 }}>
                  🔗 {selectedSubs.size} Zeilen ausgewählt
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--color-text-secondary)', fontWeight: 600, marginBottom: 6 }}>
                  Zeilen: {sortedSelection.map(i => i + 1).join(', ')}
                </div>
                {selectedSubs.size >= 2 && (
                  <>
                    <div style={{
                      fontSize: '0.68rem', color: 'var(--color-text-primary)', fontWeight: 600,
                      padding: '0.4rem', background: 'rgba(0,0,0,0.2)', borderRadius: 6,
                      marginBottom: 6, maxHeight: 60, overflowY: 'auto',
                      border: '1px solid var(--color-border)',
                    }}>
                      {sortedSelection.map(i => subtitles[i]?.text).join(' ')}
                    </div>
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ width: '100%', marginBottom: 4, fontSize: '0.68rem' }}
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
                    >▶ Vorschau</button>
                    <button
                      className="btn btn-primary btn-sm"
                      style={{
                        width: '100%',
                        background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                        border: '2px solid #b45309',
                        boxShadow: '3px 3px 0 #b45309',
                        fontWeight: 900, fontSize: '0.68rem',
                      }}
                      onClick={mergeSelectedSubs}
                    >🔗 Gộp {selectedSubs.size} dòng</button>
                  </>
                )}
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ width: '100%', marginTop: 4, fontSize: '0.65rem', opacity: 0.7 }}
                  onClick={() => setSelectedSubs(new Set())}
                >✕ Bỏ chọn</button>
              </div>
            )}
          </div>
        )}

        {/* Right: table */}
        <div className="inline-sub-editor-table-wrap">
          {/* Toolbar */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0.4rem 0.6rem',
            background: 'var(--color-bg-secondary)',
            borderBottom: '2px solid var(--color-border)',
            flexShrink: 0, flexWrap: 'wrap',
          }}>
            <button className="btn btn-secondary btn-sm" onClick={addSub} style={{ fontSize: '0.68rem' }}>
              + Zeile
            </button>
            {selectedSubs.size >= 2 && (
              <>
                <button
                  className="btn btn-primary btn-sm"
                  style={{
                    fontSize: '0.68rem',
                    background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                    border: '2px solid #b45309', boxShadow: '2px 2px 0 #b45309', fontWeight: 900,
                  }}
                  onClick={mergeSelectedSubs}
                >🔗 Gộp {selectedSubs.size}</button>
                {sortedSelection.length >= 2 && (
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.63rem' }}
                    onClick={() => selectRange(sortedSelection[0], sortedSelection[sortedSelection.length - 1])}
                  >◻ {sortedSelection[0] + 1}→{sortedSelection[sortedSelection.length - 1] + 1}</button>
                )}
              </>
            )}
            {selectedSubs.size > 0 && (
              <button
                className="btn btn-secondary btn-sm"
                style={{ fontSize: '0.63rem', opacity: 0.7 }}
                onClick={() => setSelectedSubs(new Set())}
              >✕ ({selectedSubs.size})</button>
            )}
          </div>

          {/* Table */}
          <div className="inline-sub-editor-table">
            {/* Header */}
            <div className="inline-sub-editor-row inline-sub-editor-header">
              <span style={{ textAlign: 'center' }}>☐</span>
              <span>#</span>
              <span style={{ textAlign: 'center' }}>▶</span>
              <span>Start</span>
              <span>Dauer</span>
              <span>Text</span>
              <span style={{ textAlign: 'center' }}>Akt.</span>
            </div>

            {subtitles.map((s, i) => {
              const isSelected = selectedSubs.has(i);
              const isCurrentPlaying = playingIdx === i;
              const endTime = s.start + s.dur;
              return (
                <div
                  key={i}
                  className={`inline-sub-editor-row ${isCurrentPlaying ? 'inline-sub-row-playing' : ''} ${isSelected ? 'inline-sub-row-selected' : ''}`}
                >
                  {/* Checkbox */}
                  <div style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSubSelect(i)}
                      style={{ width: 14, height: 14, cursor: 'pointer', accentColor: '#f59e0b' }}
                    />
                  </div>

                  {/* Row # */}
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 900, textAlign: 'center',
                    color: isCurrentPlaying ? 'var(--color-accent)' : isSelected ? '#f59e0b' : 'var(--color-text-muted)',
                  }}>{i + 1}</span>

                  {/* Play */}
                  <div style={{ textAlign: 'center' }}>
                    <button
                      onClick={() => isCurrentPlaying ? stopPlayback() : playSubtitle(s, i)}
                      style={{
                        background: isCurrentPlaying ? 'var(--color-accent)' : 'rgba(34,197,94,0.12)',
                        border: `1.5px solid ${isCurrentPlaying ? '#15803d' : 'rgba(34,197,94,0.3)'}`,
                        borderRadius: '50%', width: 22, height: 22,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '0.6rem',
                        color: isCurrentPlaying ? '#0a1a0e' : 'var(--color-accent)',
                        transition: 'all 0.15s',
                      }}
                      title={isCurrentPlaying ? 'Stop' : `${formatTime(s.start)} – ${formatTime(endTime)}`}
                    >{isCurrentPlaying ? '⏹' : '▶'}</button>
                  </div>

                  {/* Start */}
                  <input
                    type="number" step="0.1" min="0"
                    value={parseFloat(s.start.toFixed(1))}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val >= 0) {
                        updateSub(i, 'start', parseFloat(val.toFixed(2)));
                        playSubtitle({ start: parseFloat(val.toFixed(2)), dur: s.dur, text: s.text }, i);
                      }
                    }}
                    className="inline-sub-input inline-sub-input-time"
                  />

                  {/* Duration */}
                  <input
                    type="number" step="0.1" min="0.1"
                    value={parseFloat(s.dur.toFixed(1))}
                    onChange={e => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val > 0) {
                        updateSub(i, 'dur', parseFloat(val.toFixed(2)));
                        playSubtitle({ start: s.start, dur: parseFloat(val.toFixed(2)), text: s.text }, i);
                      }
                    }}
                    className="inline-sub-input inline-sub-input-dur"
                  />

                  {/* Text */}
                  <input
                    type="text"
                    ref={el => { if (el) textInputRefs.current.set(i, el); else textInputRefs.current.delete(i); }}
                    value={s.text}
                    onChange={e => updateSub(i, 'text', e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') { e.preventDefault(); splitSub(i); }
                    }}
                    className="inline-sub-input inline-sub-input-text"
                    placeholder="Untertiteltext..."
                  />

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 2, justifyContent: 'center' }}>
                    <button
                      onClick={() => splitSub(i)}
                      className="inline-sub-action-btn"
                      title="Split"
                    >✂️</button>
                    <button
                      onClick={() => insertSubAfter(i)}
                      className="inline-sub-action-btn"
                      title="Einfügen"
                    >➕</button>
                    <button
                      onClick={() => deleteSub(i)}
                      className="inline-sub-action-btn"
                      title="Löschen"
                    >🗑</button>
                  </div>
                </div>
              );
            })}

            {subtitles.length === 0 && (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)', fontWeight: 700 }}>
                Keine Untertitel vorhanden.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
