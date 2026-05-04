'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';

interface Subtitle { start: number; dur: number; text: string; }
interface Lesson {
  _id: string; title: string; description: string; level: string;
  videoType: string; youtubeId?: string; videoUrl?: string;
  subtitles: Subtitle[]; isPublished: boolean; createdAt: string;
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
  const [subtitles, setSubtitles] = useState<Subtitle[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [subError, setSubError] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState('');
  const [saving, setSaving] = useState(false);

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
    const match = url.match(/(?:v=|\/)([\w-]{11})(?:\?|&|$)/);
    return match ? match[1] : url;
  };

  const fetchYoutubeSubs = async () => {
    const videoId = extractYoutubeId(youtubeUrl);
    if (!videoId) return;
    setSubLoading(true); setSubError('');
    try {
      const res = await fetch('/api/youtube-subs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, lang: 'de' }),
      });
      const data = await res.json();
      if (data.error) { setSubError(data.error); }
      else { setSubtitles(data.subtitles); }
    } catch { setSubError('Fehler beim Laden der Untertitel'); }
    setSubLoading(false);
  };

  const handleUpload = async () => {
    if (!uploadFile) return;
    setSubLoading(true); setSubError('');
    try {
      // Upload video
      const uploadForm = new FormData();
      uploadForm.append('file', uploadFile);
      const uploadRes = await fetch('/api/upload', { method: 'POST', body: uploadForm });
      const uploadData = await uploadRes.json();
      if (uploadData.error) { setSubError(uploadData.error); setSubLoading(false); return; }
      setVideoUrl(uploadData.url);

      // Transcribe
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
  };

  const openNew = () => { resetForm(); setShowModal(true); };

  const openEdit = (lesson: Lesson) => {
    setEditId(lesson._id); setTitle(lesson.title); setDescription(lesson.description);
    setLevel(lesson.level); setVideoType(lesson.videoType as 'youtube' | 'local');
    setYoutubeUrl(lesson.youtubeId || ''); setVideoUrl(lesson.videoUrl || '');
    setIsPublished(lesson.isPublished); setSubtitles(lesson.subtitles);
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    const body = {
      title, description, level, videoType, isPublished, subtitles,
      youtubeId: videoType === 'youtube' ? extractYoutubeId(youtubeUrl) : undefined,
      videoUrl: videoType === 'local' ? videoUrl : undefined,
    };

    const url = editId ? `/api/lessons/${editId}` : '/api/lessons';
    const method = editId ? 'PUT' : 'POST';
    await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

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

  if (status === 'loading' || loading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  return (
    <div className="container">
      <div className="admin-header" style={{ paddingTop: 40 }}>
        <div>
          <h1 className="admin-title">Verwaltung</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Lektionen erstellen und verwalten</p>
        </div>
        <button className="btn btn-primary" onClick={openNew}>+ Neue Lektion</button>
      </div>

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
                    {subLoading ? '...' : 'Subs laden'}
                  </button>
                </div>
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

            {subError && <div className="auth-error">{subError}</div>}

            {subtitles.length > 0 && (
              <div className="form-group">
                <label>{subtitles.length} Untertitel geladen</label>
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
