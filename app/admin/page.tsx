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

  // Channel import state
  const [channelUrl, setChannelUrl] = useState('');
  const [channelVideos, setChannelVideos] = useState<ChannelVideo[]>([]);
  const [channelLoading, setChannelLoading] = useState(false);
  const [channelError, setChannelError] = useState('');
  const [maxResults, setMaxResults] = useState(30);
  // Track which video is currently being fetched (its ID) for loading state on buttons
  const [fetchingVideoId, setFetchingVideoId] = useState<string | null>(null);

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

  const resetForm = () => {
    setTitle(''); setDescription(''); setLevel('A1'); setVideoType('youtube');
    setYoutubeUrl(''); setIsPublished(false); setSubtitles([]);
    setSubError(''); setUploadFile(null); setVideoUrl(''); setEditId(null);
    setThumbnail(''); setDuration(0); setUseWhisper(false);
    setFixFile(null); setFixLoading(false);
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

  const togglePublish = async (lesson: Lesson) => {
    await fetch(`/api/lessons/${lesson._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: !lesson.isPublished }),
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

        <div style={{ display: 'flex', gap: 8, marginBottom: '1rem' }}>
          <input
            className="form-input"
            value={channelUrl}
            onChange={e => setChannelUrl(e.target.value)}
            placeholder="https://www.youtube.com/@37Grad/shorts"
            style={{ flex: 1 }}
            onKeyDown={e => { if (e.key === 'Enter') fetchChannelVideos(); }}
          />
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
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>Titel</th><th>Level</th><th>Typ</th><th>Sätze</th><th>Status</th><th>Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map(lesson => (
                <tr key={lesson._id}>
                  <td style={{ fontWeight: 500 }}>{lesson.title}</td>
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
                      <button className="btn btn-secondary btn-sm" onClick={() => openEdit(lesson)}>Bearbeiten</button>
                      <button className="btn btn-secondary btn-sm" onClick={() => togglePublish(lesson)}>
                        {lesson.isPublished ? 'Verbergen' : 'Veröffentlichen'}
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(lesson._id)}>Löschen</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ margin: 0 }}>{subtitles.length} Untertitel geladen</label>
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

                <div style={{ maxHeight: 200, overflowY: 'auto', background: 'var(--bg-primary)', borderRadius: 8, padding: 12, fontSize: '0.85rem' }}>
                  {subtitles.map((s, i) => (
                    <div key={i} style={{ padding: '4px 0', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                      <span style={{ color: 'var(--accent)', marginRight: 8 }}>{Math.floor(s.start / 60)}:{String(Math.floor(s.start % 60)).padStart(2, '0')}</span>
                      {s.text}
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
