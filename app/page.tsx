'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Lesson {
  _id: string;
  title: string;
  description: string;
  level: string;
  videoType: string;
  subtitles: { start: number; dur: number; text: string }[];
  createdAt: string;
}

interface Progress {
  lessonId: { _id: string } | string;
  completedIndices: number[];
  score: number;
  totalAttempts: number;
  isCompleted: boolean;
}

export default function HomePage() {
  const { data: session, status } = useSession();
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status === 'authenticated') {
      Promise.all([
        fetch('/api/lessons').then(r => r.json()),
        fetch('/api/progress').then(r => r.json()),
      ]).then(([lessonsData, progressData]) => {
        setLessons(lessonsData);
        setProgress(Array.isArray(progressData) ? progressData : []);
        setLoading(false);
      });
    }
  }, [status, router]);

  const getProgress = (lessonId: string) => {
    return progress.find(p => {
      const id = typeof p.lessonId === 'object' ? p.lessonId._id : p.lessonId;
      return id === lessonId;
    });
  };

  if (status === 'loading' || loading) {
    return <div className="loading"><div className="spinner" /></div>;
  }

  return (
    <div className="container">
      <div className="page-header">
        <h1 className="page-title">Deine Lektionen</h1>
        <p className="page-subtitle">Wähle eine Lektion und übe dein Hörverstehen</p>
      </div>

      {lessons.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📝</div>
          <p className="empty-state-text">Noch keine Lektionen verfügbar</p>
        </div>
      ) : (
        <div className="card-grid">
          {lessons.map(lesson => {
            const prog = getProgress(lesson._id);
            const totalSubs = lesson.subtitles?.length || 0;
            const completed = prog?.completedIndices?.length || 0;
            const pct = totalSubs > 0 ? Math.round((completed / totalSubs) * 100) : 0;

            return (
              <Link key={lesson._id} href={`/lesson/${lesson._id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div className="card">
                  <div className="lesson-card-header">
                    <span className="lesson-level">{lesson.level}</span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {lesson.videoType === 'youtube' ? '▶ YouTube' : '📁 Lokal'}
                    </span>
                  </div>
                  <h3 className="lesson-title">{lesson.title}</h3>
                  <p className="lesson-desc">{lesson.description || 'Keine Beschreibung'}</p>
                  <div className="lesson-meta">
                    <span>{totalSubs} Sätze</span>
                    <span>{pct}% erledigt</span>
                    {prog?.isCompleted && <span style={{ color: 'var(--success)' }}>✓ Abgeschlossen</span>}
                  </div>
                  {totalSubs > 0 && (
                    <div className="lesson-progress-bar">
                      <div className="lesson-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
