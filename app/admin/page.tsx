'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface Subtitle { start: number; dur: number; text: string; }
interface Lesson {
  _id: string; title: string; description: string; level: string;
  videoType: string; youtubeId?: string; videoUrl?: string;
  thumbnail?: string; duration?: number;
  subtitles: Subtitle[]; isPublished: boolean; createdAt: string;
}

interface ChannelVideo {
  id: string;
  title: string;
  duration: number;
  thumbnail: string;
  url: string;
}

function formatDuration(seconds: number): string {
  if (!seconds) return '–';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState('A1');
  const [videoType, setVideoType] = useState<'youtube' | 'local'>('youtube');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [useWhisper, setUseWhisper] = useState(false);
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [thumbnail, setThumbnail] = useState('');
  const [duration, setDuration] = useState(0);
  const [saving, setSaving] = useState(false);
  const [fixFile, setFixFile] = useState<File | null>(null);
  const [fixLoading, setFixLoading] = useState(false);
  const [selectedSubs, setSelectedSubs] = useState<Set<number>>(new Set());

  // Channel import state
  const [channelUrl, setChannelUrl] = useState('');
  const [channelVideos, setChannelVideos] = useState<ChannelVideo[]>([]);
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelError, setChannelError] = useState('');
  const [maxResults, setMaxResults] = useState(30);
  // Track which video is currently being fetched (its ID) for loading state on buttons
  const [fetchingVideoId, setFetchingVideoId] = useState<string | null>(null);

  // Saved channels (persisted in localStorage)
  interface SavedChannel { name: string; url: string; }
  const [savedChannels, setSavedChannels] = useState<SavedChannel[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('diktat-saved-channels');
      if (stored) setSavedChannels(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const saveChannel = () => {
    const url = channelUrl.trim();
    if (!url) return;
    if (savedChannels.some(c => c.url === url)) return; // already saved
    // Extract a short name from the URL
    let name = url;
    const atMatch = url.match(/@([^/\s?]+)/);
    if (atMatch) name = `@${atMatch[1]}`;
    else {
      const channelMatch = url.match(/\/channel\/([^/\s?]+)/);
      if (channelMatch) name = channelMatch[1].substring(0, 12);
      else {
        try { name = new URL(url).pathname.replace(/\//g, ' ').trim() || url; } catch { /* keep url */ }
      }
    }
    const updated = [...savedChannels, { name, url }];
    setSavedChannels(updated);
    localStorage.setItem('diktat-saved-channels', JSON.stringify(updated));
  };

  const removeChannel = (url: string) => {
    const updated = savedChannels.filter(c => c.url !== url);
    setSavedChannels(updated);
    localStorage.setItem('diktat-saved-channels', JSON.stringify(updated));
  };

  useEffect(() => {
    if (status === 'unauthenticated') { router.push('/login'); return; }
    if (status === 'authenticated') {
      const role = (session?.user as { role?: string })?.role;
      if (role !== 'admin') { router.push('/'); return; }
      fetchLessons();
    }
  }, [status, session, router]);

  const fetchLessons = async () => {
    const res = await fetch('/api/lessons');
    const data = await res.json();
    setLessons(data);
    setLoading(false);
  };

  const extractYoutubeId = (url: string): string => {
    const patterns = [
      /(?:youtube\.com\/watch\?.*v=)([\w-]{11})/,
      /(?:youtu\.be\/)([\w-]{11})/,
      /(?:youtube\.com\/embed\/)([\w-]{11})/,
      /(?:youtube\.com\/shorts\/)([\w-]{11})/,
      /^([\w-]{11})$/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return url;
  };

  const fetchYoutubeSubs = async () => {
    const videoId = extractYoutubeId(youtubeUrl);
    if (!videoId) return;
    setSubLoading(true); setSubError('');
    try {
      const endpoint = useWhisper ? '/api/youtube-whisper' : '/api/youtube-subs';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, lang: 'de' }),
      });
      const data = await res.json();
      if (data.error) { setSubError(data.error); }
      else {
        setSubtitles(data.subtitles);
        if (data.videoTitle) {
          if (!title) setTitle(data.videoTitle);
          if (!description) setDescription(data.videoTitle);
        }
        if (data.videoThumbnail) setThumbnail(data.videoThumbnail);
        if (data.videoDuration) setDuration(data.videoDuration);
      }
    } catch { setSubError('Fehler beim Laden der Untertitel'); }
    setSubLoading(false);
  };

  const handleFixSubs = async () => {
    if (!fixFile || subtitles.length === 0) return;
    setFixLoading(true); setSubError('');
    try {
      const formData = new FormData();
      formData.append('file', fixFile);
      formData.append('subtitles', JSON.stringify(subtitles));
      const res = await fetch('/api/fix-subs', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.error) { setSubError(data.error); }
      else {
        setSubtitles(data.subtitles);
        setFixFile(null);
        setSubError('');
      }
    } catch { setSubError('Fehler beim Korrigieren der Untertitel'); }
    setFixLoading(false);
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setSubLoading(true); setSubError('');
    try {
      const uploadForm = new FormData();
      uploadForm.append('file', uploadFile);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: uploadForm });
      const uploadData = await uploadRes.json();
      if (uploadData.error) { setSubError(uploadData.error); setSubLoading(false); return; }
      setVideoUrl(uploadData.url);

      const transcribeForm = new FormData();
      transcribeForm.append('file', uploadFile);
      const transRes = await fetch('/api/transcribe', { method: 'POST', body: transcribeForm });
      const transData = await transRes.json();
      if (transData.error) { setSubError(transData.error); }
      else { setSubtitles(transData.subtitles); }
    } catch { setSubError('Upload/Transkription fehlgeschlagen'); }
    setSubLoading(false);
  };

  const mergeSelectedSubs = () => {
    if (selectedSubs.size < 2) return;
    const indices = Array.from(selectedSubs).sort((a, b) => a - b);
    const firstIdx = indices[0];
    const lastIdx = indices[indices.length - 1];
    const first = subtitles[firstIdx];
    const last = subtitles[lastIdx];
    const mergedText = indices.map(i => subtitles[i].text).join(' ');
    const mergedDur = parseFloat(((last.start + last.dur) - first.start).toFixed(2));
    const merged: Subtitle = { start: first.start, dur: mergedDur, text: mergedText };
    const updated = subtitles.filter((_, i) => !indices.includes(i));
    updated.splice(firstIdx, 0, merged);
    setSubtitles(updated);
    setSelectedSubs(new Set());
  };

  const toggleSubSelect = (index: number) => {
    setSelectedSubs(prev => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const resetForm = () => {
    setTitle(''); setDescription(''); setLevel('A1'); setVideoType('youtube');
    setYoutubeUrl(''); setIsPublished(false); setSubtitles([]);
    setSubError(''); setUploadFile(null); setVideoUrl(''); setEditId(null);
    setThumbnail(''); setDuration(0); setUseWhisper(false);
    setFixFile(null); setFixLoading(false); setSelectedSubs(new Set());
  };

  const openNew = () => { resetForm(); setShowModal(true); };

  const openEdit = (lesson: Lesson) => {
    setEditId(lesson._id); setTitle(lesson.title); setDescription(lesson.description);
    setLevel(lesson.level); setVideoType(lesson.videoType as 'youtube' | 'local');
    setYoutubeUrl(lesson.youtubeId || ''); setVideoUrl(lesson.videoUrl || '');
    setIsPublished(lesson.isPublished); setSubtitles(lesson.subtitles);
    setThumbnail(lesson.thumbnail || ''); setDuration(lesson.duration || 0);
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const body = {
      title, description, level, videoType, isPublished, subtitles, thumbnail, duration,
      youtubeId: videoType === 'youtube' ? extractYoutubeId(youtubeUrl) : undefined,
      videoUrl: videoType === 'local' ? videoUrl : undefined,
    };

    const url = editId ? `/api/lessons/${editId}` : '/api/lessons';
    const method = editId ? 'PUT' : 'POST';
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Unbekannter Fehler' }));
      setSubError(data.error || 'Speichern fehlgeschlagen');
      setSaving(false);
      return;
    }

    setShowModal(false);
    resetForm();
    fetchLessons();
    setSaving(false);
  };

  const handleDelete = async (lessonId: string) => {
    if (!confirm('Lektion wirklich löschen?')) return;
    await fetch(`/api/lessons/${lessonId}`, { method: 'DELETE' });
    fetchLessons();
  };

  const handleBulkDelete = async () => {
    if (selectedLessons.size === 0) return;
    if (!confirm(`${selectedLessons.size} Lektion(en) wirklich löschen?`)) return;
    setBulkDeleting(true);
    await Promise.all(
      Array.from(selectedLessons).map(id =>
        fetch(`/api/lessons/${id}`, { method: 'DELETE' })
      )
    );
    setSelectedLessons(new Set());
    await fetchLessons();
    setBulkDeleting(false);
  };

  const toggleLessonSelect = (id: string) => {
    setSelectedLessons(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllLessons = () => {
    if (selectedLessons.size === lessons.length) {
      setSelectedLessons(new Set());
    } else {
      setSelectedLessons(new Set(lessons.map(l => l._id)));
    }
  };

  const togglePublish = async (lesson: Lesson) => {
    await fetch(`/api/lessons/${lesson._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: !lesson.isPublished }),
    });
    fetchLessons();
  };

  const swapLessons = async (indexA: number, indexB: number) => {
    if (indexB < 0 || indexB >= lessons.length) return;
    const a = lessons[indexA];
    const b = lessons[indexB];
    await fetch('/api/lessons/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonIdA: a._id, lessonIdB: b._id }),
    });
    fetchLessons();
  };

  // ── Channel Import ──

  const fetchChannelVideos = async () => {
    if (!channelUrl.trim()) return;
    setChannelLoading(true);
    setChannelError('');
    setChannelVideos([]);
    try {
      const res = await fetch('/api/youtube-channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelUrl: channelUrl.trim(), maxResults }),
      });
      const data = await res.json();
      if (data.error) {
        setChannelError(data.error);
      } else {
        setChannelVideos(data.videos || []);
      }
    } catch {
      setChannelError('Fehler beim Laden der Videos');
    }
    setChannelLoading(false);
  };

  const isVideoImported = (videoId: string) => {
    return lessons.some(l => l.youtubeId === videoId);
  };

  // Open single-lesson modal with a channel video pre-filled, and auto-fetch subs
  const openChannelVideo = async (video: ChannelVideo, withWhisper: boolean) => {
    resetForm();
    setYoutubeUrl(video.id);
    setTitle(video.title);
    setDescription(video.title);
    setThumbnail(video.thumbnail);
    setDuration(video.duration);
    setUseWhisper(withWhisper);
    setShowModal(true);

    // Auto-fetch subtitles
    setSubLoading(true);
    setSubError('');
    setFetchingVideoId(video.id);
    try {
      const endpoint = withWhisper ? '/api/youtube-whisper' : '/api/youtube-subs';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: video.id, lang: 'de' }),
      });
      const data = await res.json();
      if (data.error) { setSubError(data.error); }
      else {
        setSubtitles(data.subtitles);
        if (data.videoTitle) {
          setTitle(data.videoTitle);
          setDescription(data.videoTitle);
        }
        if (data.videoThumbnail) setThumbnail(data.videoThumbnail);
        if (data.videoDuration) setDuration(data.videoDuration);
      }
    } catch { setSubError('Fehler beim Laden der Untertitel'); }
    setSubLoading(false);
    setFetchingVideoId(null);
  };

  if (status === 'loading' || loading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  const importedCount = channelVideos.filter(v => isVideoImported(v.id)).length;

  return (
    <div className="container">
      <div className="admin-header" style={{ paddingTop: 40 }}>
        <div>
          <h1 className="admin-title">Verwaltung</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Lektionen erstellen und verwalten</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Neue Lektion</button>
      </div>

      {/* ── Channel Import Section ── */}
      <div className="card" style={{ marginBottom: '2rem', padding: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
          <span style={{ fontSize: '1.5rem' }}>📺</span>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--color-accent)', margin: 0 }}>
              Channel Import
            </h2>
            <p style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', fontWeight: 700, margin: 0 }}>
              YouTube-Kanal-Link einfügen → Videos laden → einzeln hinzufügen
            </p>
          </div>
        </div>

        {/* Saved channels chips */}
        {savedChannels.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: '0.75rem' }}>
            {savedChannels.map(ch => (
              <button
                key={ch.url}
                onClick={() => setChannelUrl(ch.url)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '0.25rem 0.6rem', borderRadius: '999px',
                  fontSize: '0.76rem', fontWeight: 800, cursor: 'pointer',
                  border: channelUrl === ch.url ? '2px solid var(--color-accent)' : '2px solid var(--color-border)',
                  background: channelUrl === ch.url ? 'rgba(34,197,94,0.12)' : 'var(--color-bg-input)',
                  color: channelUrl === ch.url ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  transition: 'all 0.15s',
                }}
              >
                <span>📺 {ch.name}</span>
                <span
                  onClick={e => { e.stopPropagation(); removeChannel(ch.url); }}
                  style={{
                    marginLeft: 2, cursor: 'pointer', opacity: 0.5,
                    fontSize: '0.7rem', lineHeight: 1,
                  }}
                  title="Entfernen"
                >
                  ✕
                </span>
              </button>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
          <input
            className="form-input"
            value={channelUrl}
            onChange={e => setChannelUrl(e.target.value)}
            placeholder="https://www.youtube.com/@37Grad/shorts"
            style={{ flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') fetchChannelVideos(); }}
          />
          <button
            className="btn btn-secondary"
            onClick={saveChannel}
            disabled={!channelUrl.trim() || savedChannels.some(c => c.url === channelUrl.trim())}
            title="Kanal speichern"
            style={{ padding: '0.4rem 0.6rem', fontSize: '1rem', minWidth: 0 }}
          >
            ⭐
          </button>
          <select
            className="form-select"
            value={maxResults}
            onChange={e => setMaxResults(Number(e.target.value))}
            style={{ width: 80 }}
            title="Max Videos"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={30}>30</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <button
            className="btn btn-primary"
            onClick={fetchChannelVideos}
            disabled={channelLoading || !channelUrl.trim()}
          >
            {channelLoading ? '⏳ ...' : '🔍 Get'}
          </button>
        </div>

        {channelError && <div className="auth-error">{channelError}</div>}

        {channelLoading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-text-muted)' }}>
            <div className="spinner" style={{ margin: '0 auto 1rem' }} />
            <p style={{ fontWeight: 800, fontSize: '0.85rem' }}>Videos werden geladen...</p>
          </div>
        )}

        {channelVideos.length > 0 && (
          <>
            <div style={{
              fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-text-secondary)',
              marginBottom: '0.75rem', padding: '0.5rem 0.75rem',
              background: 'var(--color-bg-input)', borderRadius: '0.75rem',
              border: '2px solid var(--color-border)',
            }}>
              📊 {channelVideos.length} Videos · {importedCount} bereits importiert · {channelVideos.length - importedCount} neu
            </div>

            {/* Video grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
              gap: '0.75rem',
              maxHeight: '65vh',
              overflowY: 'auto',
              padding: '0.25rem',
            }}>
              {channelVideos.map(video => {
                const imported = isVideoImported(video.id);
                const isFetching = fetchingVideoId === video.id;
                return (
                  <div
                    key={video.id}
                    style={{
                      background: imported ? 'var(--color-bg-card)' : 'var(--color-bg-card)',
                      border: `2.5px solid ${imported ? 'rgba(74,222,128,0.2)' : 'var(--color-border)'}`,
                      borderRadius: '1.25rem',
                      overflow: 'hidden',
                      transition: 'all 0.18s',
                      opacity: imported ? 0.4 : 1,
                      filter: imported ? 'blur(1.5px) grayscale(0.5)' : 'none',
                      boxShadow: '3px 3px 0 rgba(0,0,0,0.3)',
                      pointerEvents: imported ? 'none' : 'auto',
                    }}
                  >
                    {/* Thumbnail */}
                    <div style={{ position: 'relative', paddingTop: '56.25%', background: '#000' }}>
                      <img
                        src={video.thumbnail}
                        alt={video.title}
                        loading="lazy"
                        style={{
                          position: 'absolute', top: 0, left: 0,
                          width: '100%', height: '100%', objectFit: 'cover',
                        }}
                      />
                      {video.duration > 0 && (
                        <span style={{
                          position: 'absolute', bottom: 6, right: 6,
                          padding: '0.15rem 0.5rem', borderRadius: '0.5rem',
                          background: 'rgba(0,0,0,0.8)', color: 'white',
                          fontSize: '0.72rem', fontWeight: 900,
                        }}>
                          {formatDuration(video.duration)}
                        </span>
                      )}
                      {imported && (
                        <div style={{
                          position: 'absolute', inset: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: 'rgba(0,0,0,0.4)',
                        }}>
                          <span style={{
                            padding: '0.3rem 0.8rem', borderRadius: '999px',
                            background: 'rgba(74,222,128,0.9)', color: '#0a1a0e',
                            fontSize: '0.75rem', fontWeight: 900,
                          }}>
                            ✓ Bereits importiert
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Info + action buttons */}
                    <div style={{ padding: '0.6rem 0.75rem' }}>
                      <p style={{
                        fontSize: '0.8rem', fontWeight: 800,
                        color: 'var(--color-text-primary)',
                        display: '-webkit-box', WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical', overflow: 'hidden',
                        lineHeight: 1.35, margin: '0 0 0.5rem 0',
                      }}>
                        {video.title}
                      </p>

                      {!imported && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-primary btn-sm"
                            style={{ flex: 1, fontSize: '0.7rem', padding: '0.3rem 0.5rem' }}
                            onClick={() => openChannelVideo(video, false)}
                            disabled={isFetching}
                          >
                            {isFetching && !useWhisper ? '⏳...' : '📝 YT Subs'}
                          </button>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ flex: 1, fontSize: '0.7rem', padding: '0.3rem 0.5rem' }}
                            onClick={() => openChannelVideo(video, true)}
                            disabled={isFetching}
                          >
                            {isFetching && useWhisper ? '⏳...' : '🎙 Whisper'}
                          </button>
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

      {/* ── Lesson Table ── */}
      {lessons.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📚</div>
          <p className="empty-state-text">Noch keine Lektionen erstellt</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden', position: 'relative' }}>
          {/* Bulk action bar */}
          {selectedLessons.size > 0 && (
            <div style={{
              position: 'sticky', top: 0, zIndex: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.6rem 1rem',
              background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.08))',
              borderBottom: '2px solid rgba(239,68,68,0.3)',
              backdropFilter: 'blur(12px)',
              animation: 'slideDown 0.2s ease-out',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(239,68,68,0.2)', border: '2px solid rgba(239,68,68,0.5)',
                  fontSize: '0.8rem', fontWeight: 900, color: '#ef4444',
                }}>
                  {selectedLessons.size}
                </span>
                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
                  {selectedLessons.size === lessons.length ? 'Alle' : selectedLessons.size} ausgewählt
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem' }}
                  onClick={() => setSelectedLessons(new Set())}
                >
                  ✕ Abwählen
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  style={{
                    fontSize: '0.75rem', padding: '0.3rem 0.8rem',
                    fontWeight: 900,
                    animation: 'pulse 1.5s ease-in-out infinite',
                  }}
                  onClick={handleBulkDelete}
                  disabled={bulkDeleting}
                >
                  {bulkDeleting ? '⏳ Lösche...' : `🗑 ${selectedLessons.size} Löschen`}
                </button>
              </div>
            </div>
          )}
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 40, textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={lessons.length > 0 && selectedLessons.size === lessons.length}
                    onChange={toggleAllLessons}
                    style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#ef4444' }}
                    title="Alle auswählen"
                  />
                </th>
                <th style={{ width: 50 }}>#</th><th>Titel</th><th>Level</th><th>Typ</th><th>Sätze</th><th>Status</th><th>Sortieren</th><th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {(() => {
                const totalPages = Math.ceil(lessons.length / perPage);
                const startIdx = (currentPage - 1) * perPage;
                const paginated = lessons.slice(startIdx, startIdx + perPage);
                return paginated.map((lesson, pageIdx) => {
                  const idx = startIdx + pageIdx;
                  return (
                <tr
                  key={lesson._id}
                  style={{
                    background: selectedLessons.has(lesson._id) ? 'rgba(239,68,68,0.08)' : undefined,
                    transition: 'background 0.15s ease',
                  }}
                >
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={selectedLessons.has(lesson._id)}
                      onChange={() => toggleLessonSelect(lesson._id)}
                      style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#ef4444' }}
                    />
                  </td>
                  <td style={{ fontWeight: 900, color: 'var(--color-text-muted)', fontSize: '0.78rem' }}>{idx + 1}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <div style={{
                        width: 80, height: 45, borderRadius: '0.5rem', overflow: 'hidden',
                        flexShrink: 0, background: '#111', border: '2px solid var(--color-border)',
                        boxShadow: '2px 2px 0 rgba(0,0,0,0.3)',
                      }}>
                        {(lesson.thumbnail || lesson.youtubeId) ? (
                          <img
                            src={lesson.thumbnail || `https://img.youtube.com/vi/${lesson.youtubeId}/mqdefault.jpg`}
                            alt={lesson.title}
                            loading="lazy"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                        ) : (
                          <div style={{
                            width: '100%', height: '100%',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '1.2rem', background: 'rgba(34,197,94,0.08)',
                          }}>🎬</div>
                        )}
                      </div>
                      <span style={{ fontWeight: 500 }}>{lesson.title}</span>
                    </div>
                  </td>
                  <td><span className="lesson-level">{lesson.level}</span></td>
                  <td>{lesson.videoType === 'youtube' ? '▶ YT' : '📁'}</td>
                  <td>{lesson.subtitles?.length || 0}</td>
                  <td>
                    <span className={`status-badge ${lesson.isPublished ? 'status-published' : 'status-draft'}`}>
                      {lesson.isPublished ? 'Veröffentlicht' : 'Entwurf'}
                    </span>
                  </td>
                  <td>
                    <div className="action-btns">
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', minWidth: 0 }}
                        onClick={() => swapLessons(idx, idx - 1)}
                        disabled={idx === 0}
                        title="Nach oben"
                      >↑</button>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.25rem 0.5rem', fontSize: '0.85rem', minWidth: 0 }}
                        onClick={() => swapLessons(idx, idx + 1)}
                        disabled={idx === lessons.length - 1}
                        title="Nach unten"
                      >↓</button>
                    </div>
                  </td>
                  <td>
                    <div className="action-btns">
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(lesson)}>Bearbeiten</button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => router.push(`/admin/subs/${lesson._id}`)}
                        style={{ fontSize: '0.72rem' }}
                      >
                        ✏️ Subs
                      </button>
                      <button className="btn btn-secondary btn-sm" onClick={() => togglePublish(lesson)}>
                        {lesson.isPublished ? 'Verbergen' : 'Veröffentlichen'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(lesson._id)}>Löschen</button>
                    </div>
                  </td>
                </tr>
                  );
                });
              })()}
            </tbody>
          </table>

          {/* Pagination */}
          {lessons.length > perPage && (() => {
            const totalPages = Math.ceil(lessons.length / perPage);
            const maxVisible = 5;
            let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
            let endPage = Math.min(totalPages, startPage + maxVisible - 1);
            if (endPage - startPage + 1 < maxVisible) {
              startPage = Math.max(1, endPage - maxVisible + 1);
            }
            const pages = [];
            for (let p = startPage; p <= endPage; p++) pages.push(p);

            return (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '0.75rem 1rem',
                borderTop: '2px solid var(--color-border)',
                background: 'rgba(0,0,0,0.15)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.78rem', fontWeight: 800, color: 'var(--color-text-muted)' }}>
                  <span>Zeige</span>
                  <select
                    className="form-select"
                    value={perPage}
                    onChange={e => { setPerPage(Number(e.target.value)); setCurrentPage(1); }}
                    style={{ width: 60, padding: '0.2rem 0.3rem', fontSize: '0.78rem', fontWeight: 900 }}
                  >
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                    <option value={50}>50</option>
                  </select>
                  <span>von {lessons.length}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', minWidth: 0 }}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >←</button>

                  {startPage > 1 && (
                    <>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', minWidth: 0 }}
                        onClick={() => setCurrentPage(1)}
                      >1</button>
                      {startPage > 2 && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>…</span>}
                    </>
                  )}

                  {pages.map(p => (
                    <button
                      key={p}
                      className="btn btn-sm"
                      style={{
                        padding: '0.2rem 0.45rem', fontSize: '0.75rem', minWidth: 0,
                        background: p === currentPage ? 'var(--color-accent)' : 'transparent',
                        color: p === currentPage ? '#0a1a0e' : 'var(--color-text-primary)',
                        border: p === currentPage ? '2px solid #15803d' : '2px solid var(--color-border)',
                        fontWeight: 900,
                        boxShadow: p === currentPage ? '2px 2px 0 #15803d' : 'none',
                      }}
                      onClick={() => setCurrentPage(p)}
                    >{p}</button>
                  ))}

                  {endPage < totalPages && (
                    <>
                      {endPage < totalPages - 1 && <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>…</span>}
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.2rem 0.45rem', fontSize: '0.75rem', minWidth: 0 }}
                        onClick={() => setCurrentPage(totalPages)}
                      >{totalPages}</button>
                    </>
                  )}

                  <button
                    className="btn btn-secondary btn-sm"
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', minWidth: 0 }}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >→</button>
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">{editId ? 'Lektion bearbeiten' : 'Neue Lektion'}</h2>

            <div className="form-group">
              <label>Titel</label>
              <input className="form-input" value={title} onChange={e => setTitle(e.target.value)} placeholder="z.B. Easy German #1" />
            </div>

            <div className="form-group">
              <label>Beschreibung</label>
              <textarea className="form-textarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="Worum geht es?" />
            </div>

            <div style={{ display: 'flex', gap: 16 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Level</label>
                <select className="form-select" value={level} onChange={e => setLevel(e.target.value)}>
                  {['A1','A2','B1','B2','C1','C2'].map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Videoquelle</label>
                <select className="form-select" value={videoType} onChange={e => setVideoType(e.target.value as 'youtube' | 'local')}>
                  <option value="youtube">YouTube</option>
                  <option value="local">Lokale Datei</option>
                </select>
              </div>
            </div>

            {videoType === 'youtube' ? (
              <div className="form-group">
                <label>YouTube URL oder Video-ID</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="form-input" value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)} placeholder="https://youtube.com/watch?v=..." />
                  <button className="btn btn-primary" onClick={fetchYoutubeSubs} disabled={subLoading || !youtubeUrl}>
                    {subLoading ? '⏳ ...' : useWhisper ? '🎙 Whisper' : 'Subs laden'}
                  </button>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', marginTop: 8, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <input type="checkbox" checked={useWhisper} onChange={e => setUseWhisper(e.target.checked)} />
                  🎙 Whisper verwenden (OpenAI — bessere Qualität, dauert länger)
                </label>
              </div>
            ) : (
              <div className="form-group">
                <label>Video hochladen (wird mit OpenAI transkribiert)</label>
                <input type="file" accept="video/*,audio/*" className="form-input" onChange={e => setUploadFile(e.target.files?.[0] || null)} />
                {uploadFile && (
                  <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={handleUpload} disabled={subLoading}>
                    {subLoading ? 'Wird verarbeitet...' : 'Hochladen & Transkribieren'}
                  </button>
                )}
              </div>
            )}

            {/* Video thumbnail & duration preview */}
            {thumbnail && (
              <div className="form-group">
                <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
                  <img
                    src={thumbnail}
                    alt="Video Thumbnail"
                    style={{ width: 200, borderRadius: 8, border: '1px solid var(--border)' }}
                  />
                  {duration > 0 && (
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Dauer</div>
                      {Math.floor(duration / 60)}:{String(Math.floor(duration % 60)).padStart(2, '0')} Min.
                    </div>
                  )}
                </div>
              </div>
            )}

            {subError && <div className="auth-error">{subError}</div>}

            {subLoading && (
              <div style={{
                textAlign: 'center', padding: '1.5rem',
                background: 'rgba(34,197,94,0.06)', borderRadius: '1rem',
                border: '2px solid rgba(34,197,94,0.2)', marginBottom: '1rem',
              }}>
                <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
                <p style={{ fontWeight: 800, fontSize: '0.82rem', color: 'var(--color-accent)', margin: 0 }}>
                  {useWhisper ? '🎙 Whisper transkribiert...' : '📝 Untertitel werden geladen...'}
                </p>
                <p style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--color-text-muted)', margin: '0.3rem 0 0' }}>
                  {useWhisper ? 'Das kann 1-2 Minuten dauern' : 'Einen Moment bitte'}
                </p>
              </div>
            )}

            {subtitles.length > 0 && (
              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <label style={{ margin: 0 }}>✏️ {subtitles.length} Untertitel — Manuell bearbeiten</label>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {selectedSubs.size >= 2 && (
                      <button
                        className="btn btn-primary btn-sm"
                        style={{
                          fontSize: '0.72rem', padding: '0.25rem 0.75rem',
                          background: 'linear-gradient(135deg, #f59e0b, #ef4444)',
                          border: 'none', fontWeight: 900,
                          animation: 'pulse 1.5s ease-in-out infinite',
                        }}
                        onClick={mergeSelectedSubs}
                      >
                        🔗 Gộp {selectedSubs.size} dòng
                      </button>
                    )}
                    {selectedSubs.size > 0 && (
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.68rem', padding: '0.2rem 0.5rem', opacity: 0.7 }}
                        onClick={() => setSelectedSubs(new Set())}
                      >
                        ✕ Bỏ chọn
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.72rem', padding: '0.2rem 0.6rem' }}
                      onClick={() => {
                        const lastSub = subtitles[subtitles.length - 1];
                        const newStart = lastSub ? lastSub.start + lastSub.dur : 0;
                        setSubtitles([...subtitles, { start: parseFloat(newStart.toFixed(2)), dur: 3, text: '' }]);
                      }}
                    >
                      + Zeile hinzufügen
                    </button>
                  </div>
                </div>

                {/* Fix subtitles with original text file */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 8, padding: 12, background: 'var(--bg-secondary)', borderRadius: 8, border: '1px dashed var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: '0.8rem', color: 'var(--accent)', display: 'block', marginBottom: 4 }}>📝 Sub korrigieren mit Originaltext</label>
                    <input
                      type="file"
                      accept=".txt,.srt,.vtt"
                      className="form-input"
                      style={{ fontSize: '0.8rem', padding: '6px 8px' }}
                      onChange={e => setFixFile(e.target.files?.[0] || null)}
                    />
                  </div>
                  {fixFile && (
                    <button
                      className="btn btn-primary btn-sm"
                      style={{ alignSelf: 'flex-end', whiteSpace: 'nowrap' }}
                      onClick={handleFixSubs}
                      disabled={fixLoading}
                    >
                      {fixLoading ? '⏳ Korrigiere...' : '✅ Korrigieren'}
                    </button>
                  )}
                </div>

                <div style={{ maxHeight: 400, overflowY: 'auto', background: 'var(--bg-primary)', borderRadius: 8, padding: '8px', fontSize: '0.82rem' }}>
                  {/* Header row */}
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '28px 36px 80px 60px 1fr 32px',
                    gap: 6,
                    padding: '4px 4px 6px',
                    borderBottom: '2px solid var(--border)',
                    fontWeight: 900,
                    fontSize: '0.7rem',
                    color: 'var(--color-accent, var(--accent))',
                    textTransform: 'uppercase',
                    letterSpacing: '0.5px',
                    position: 'sticky',
                    top: 0,
                    background: 'var(--bg-primary)',
                    zIndex: 1,
                  }}>
                    <span title="Auswählen zum Zusammenführen">☐</span>
                    <span>#</span>
                    <span>Start</span>
                    <span>Dauer</span>
                    <span>Text</span>
                    <span></span>
                  </div>

                  {subtitles.map((s, i) => (
                    <div
                      key={i}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '28px 36px 80px 60px 1fr 32px',
                        gap: 6,
                        padding: '5px 4px',
                        borderBottom: '1px solid var(--border)',
                        alignItems: 'center',
                        background: selectedSubs.has(i) ? 'rgba(245,158,11,0.12)' : 'transparent',
                        borderLeft: selectedSubs.has(i) ? '3px solid #f59e0b' : '3px solid transparent',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* Checkbox for merge selection */}
                      <div style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={selectedSubs.has(i)}
                          onChange={() => toggleSubSelect(i)}
                          style={{
                            width: 16, height: 16, cursor: 'pointer',
                            accentColor: '#f59e0b',
                          }}
                          title={`Zeile ${i + 1} zum Gộp auswählen`}
                        />
                      </div>

                      {/* Row number */}
                      <span style={{ fontSize: '0.7rem', fontWeight: 800, color: selectedSubs.has(i) ? '#f59e0b' : 'var(--color-text-muted, var(--text-secondary))', textAlign: 'center' }}>
                        {i + 1}
                      </span>

                      {/* Start time input (MM:SS.ms) */}
                      <input
                        type="text"
                        value={(() => {
                          const m = Math.floor(s.start / 60);
                          const sec = (s.start % 60).toFixed(1);
                          return `${m}:${sec.padStart(4, '0')}`;
                        })()}
                        onChange={e => {
                          const val = e.target.value;
                          const parts = val.split(':');
                          let seconds = 0;
                          if (parts.length === 2) {
                            seconds = parseInt(parts[0] || '0') * 60 + parseFloat(parts[1] || '0');
                          } else {
                            seconds = parseFloat(val || '0');
                          }
                          if (!isNaN(seconds)) {
                            const updated = [...subtitles];
                            updated[i] = { ...updated[i], start: parseFloat(seconds.toFixed(2)) };
                            setSubtitles(updated);
                          }
                        }}
                        style={{
                          background: 'var(--color-bg-input, var(--bg-secondary))',
                          border: '1.5px solid var(--color-border, var(--border))',
                          borderRadius: 6,
                          padding: '3px 6px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: 'var(--color-accent, var(--accent))',
                          fontFamily: 'monospace',
                          width: '100%',
                          textAlign: 'center',
                        }}
                        title="Format: M:SS.s (z.B. 1:23.5)"
                      />

                      {/* Duration input */}
                      <input
                        type="number"
                        step="0.1"
                        min="0.1"
                        value={parseFloat(s.dur.toFixed(1))}
                        onChange={e => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val) && val > 0) {
                            const updated = [...subtitles];
                            updated[i] = { ...updated[i], dur: parseFloat(val.toFixed(2)) };
                            setSubtitles(updated);
                          }
                        }}
                        style={{
                          background: 'var(--color-bg-input, var(--bg-secondary))',
                          border: '1.5px solid var(--color-border, var(--border))',
                          borderRadius: 6,
                          padding: '3px 6px',
                          fontSize: '0.78rem',
                          fontWeight: 700,
                          color: 'var(--color-text-primary, var(--text-primary))',
                          fontFamily: 'monospace',
                          width: '100%',
                          textAlign: 'center',
                        }}
                        title="Dauer in Sekunden"
                      />

                      {/* Text input */}
                      <input
                        type="text"
                        value={s.text}
                        onChange={e => {
                          const updated = [...subtitles];
                          updated[i] = { ...updated[i], text: e.target.value };
                          setSubtitles(updated);
                        }}
                        style={{
                          background: 'var(--color-bg-input, var(--bg-secondary))',
                          border: '1.5px solid var(--color-border, var(--border))',
                          borderRadius: 6,
                          padding: '3px 8px',
                          fontSize: '0.82rem',
                          fontWeight: 500,
                          color: 'var(--color-text-primary, var(--text-primary))',
                          width: '100%',
                        }}
                        placeholder="Untertiteltext..."
                      />

                      {/* Delete button */}
                      <button
                        onClick={() => {
                          const updated = subtitles.filter((_, idx) => idx !== i);
                          setSubtitles(updated);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.9rem',
                          padding: '2px',
                          opacity: 0.5,
                          transition: 'opacity 0.15s',
                          lineHeight: 1,
                        }}
                        onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                        onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                        title="Zeile löschen"
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="form-group">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={isPublished} onChange={e => setIsPublished(e.target.checked)} />
                Sofort veröffentlichen
              </label>
            </div>

            <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Abbrechen</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving || !title || subtitles.length === 0}>
                {saving ? 'Speichern...' : editId ? 'Aktualisieren' : 'Erstellen'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
