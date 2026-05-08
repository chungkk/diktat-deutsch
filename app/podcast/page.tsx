'use client';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Episode {
  id: number;
  title: string;
  description: string;
  date: string;
  durationMs: number;
  audioUrl: string;
  artwork: string;
  artworkLarge: string;
}

interface ShowInfo {
  id: number;
  name: string;
  artist: string;
  artwork: string;
}

// Registered podcast shows
const PODCAST_SHOWS = [
  {
    id: '1568289553',
    name: 'Anna und die wilden Tiere',
    artist: 'Bayerischer Rundfunk',
    level: 'A2',
    emoji: '🐾',
    description: 'Tierreporterin Anna erklärt die Tierwelt — perfekt für Anfänger!',
  },
  {
    id: '1489934613',
    name: 'Die Maus zum Hören',
    artist: 'Westdeutscher Rundfunk',
    level: 'A1',
    emoji: '🐭',
    description: 'Die Sendung mit der Maus als Podcast — Geschichten, Musik und Wissen für Kinder.',
  },
  {
    id: '1455018378',
    name: 'Auf Deutsch gesagt!',
    artist: 'Robin Meinert',
    level: 'B1',
    emoji: '🗣️',
    description: 'Deutsch lernen durch interessante Themen — ideal für Mittelstufe!',
  },
  {
    id: '338219632',
    name: 'ZEIT WISSEN',
    artist: 'DIE ZEIT',
    level: 'B2',
    emoji: '🔬',
    description: 'Woher weißt Du das? — Wissenschaft verständlich erklärt von DIE ZEIT.',
  },

];

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}

const LEVEL_COLORS: Record<string, string> = {
  A1: '#00b894', A2: '#00cec9', B1: '#6c5ce7', B2: '#a855f7', C1: '#fd79a8', C2: '#e17055',
};

export default function PodcastPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeShowId, setActiveShowId] = useState(PODCAST_SHOWS[0].id);
  const [show, setShow] = useState<ShowInfo | null>(null);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }
    if (status === 'authenticated') {
      setLoading(true);
      fetch(`/api/podcast?showId=${activeShowId}&limit=200`)
        .then(r => r.json())
        .then(data => {
          setShow(data.show);
          setEpisodes(data.episodes || []);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [status, router, activeShowId]);

  const handleShowSwitch = (showId: string) => {
    if (showId === activeShowId) return;
    setActiveShowId(showId);
    setSearchTerm('');
    setEpisodes([]);
    setShow(null);
  };

  if (status === 'loading') {
    return <div className="loading"><div className="spinner" /></div>;
  }

  const filtered = episodes.filter(e =>
    e.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeShowMeta = PODCAST_SHOWS.find(s => s.id === activeShowId)!;

  return (
    <div className="home-page">
      <div className="container">

        {/* Show selector cards */}
        <div className="podcast-shows-header">
          <h2 className="podcast-shows-title">🎙️ Podcasts</h2>
          <p className="podcast-shows-subtitle">Wähle einen Podcast und übe dein Hörverstehen</p>
        </div>

        <div className="podcast-shows-grid">
          {PODCAST_SHOWS.map(ps => {
            const isActive = ps.id === activeShowId;
            const levelColor = LEVEL_COLORS[ps.level] || 'var(--color-accent)';
            return (
              <button
                key={ps.id}
                className={`podcast-show-card ${isActive ? 'podcast-show-card-active' : ''}`}
                onClick={() => handleShowSwitch(ps.id)}
              >
                <div className="podcast-show-card-top">
                  <span className="podcast-show-emoji">{ps.emoji}</span>
                  <span
                    className="podcast-show-level"
                    style={{ background: levelColor, boxShadow: `0 2px 10px ${levelColor}44` }}
                  >
                    {ps.level}
                  </span>
                </div>
                <h3 className="podcast-show-name">{ps.name}</h3>
                <p className="podcast-show-artist">{ps.artist}</p>
                <p className="podcast-show-desc">{ps.description}</p>
                {isActive && <div className="podcast-show-active-bar" />}
              </button>
            );
          })}
        </div>

        {/* Active show hero */}
        {show && (
          <div className="podcast-hero">
            <img src={show.artwork} alt={show.name} className="podcast-hero-art" />
            <div className="podcast-hero-info">
              <span className="podcast-hero-badge">{activeShowMeta.emoji} {activeShowMeta.level}</span>
              <h1 className="podcast-hero-title">{show.name}</h1>
              <p className="podcast-hero-artist">{show.artist}</p>
              <div className="podcast-hero-stats">
                <span className="podcast-hero-stat">
                  <strong>{episodes.length}</strong> Folgen
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="podcast-search-wrap">
          <svg className="podcast-search-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="podcast-search"
            placeholder="Folge suchen..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
          />
        </div>

        {/* Episode list */}
        {loading ? (
          <div className="loading" style={{ padding: '48px 0' }}>
            <div className="spinner" />
          </div>
        ) : (
          <div className="podcast-episodes">
            {filtered.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">🔍</div>
                <p className="empty-state-text">Keine Folgen gefunden</p>
              </div>
            ) : (
              filtered.map((ep, idx) => (
                <Link
                  key={ep.id}
                  href={`/podcast/${ep.id}`}
                  className="podcast-episode-link"
                >
                  <article className="podcast-episode">
                    <span className="podcast-episode-num">{idx + 1}</span>
                    <img
                      src={ep.artwork}
                      alt={ep.title}
                      className="podcast-episode-art"
                      loading="lazy"
                    />
                    <div className="podcast-episode-info">
                      <h3 className="podcast-episode-title">{ep.title}</h3>
                      <p className="podcast-episode-desc">{ep.description}</p>
                      <div className="podcast-episode-meta">
                        <span>{formatDate(ep.date)}</span>
                        <span className="podcast-episode-dot">·</span>
                        <span>{formatDuration(ep.durationMs)}</span>
                      </div>
                    </div>
                    <div className="podcast-episode-play">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  </article>
                </Link>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
