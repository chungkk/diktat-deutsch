'use client';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

function getGreeting(): { text: string; emoji: string } {
  const h = new Date().getHours();
  if (h < 6) return { text: 'Gute Nacht', emoji: '🌙' };
  if (h < 12) return { text: 'Guten Morgen', emoji: '☀️' };
  if (h < 17) return { text: 'Guten Tag', emoji: '🌤️' };
  if (h < 21) return { text: 'Guten Abend', emoji: '🌅' };
  return { text: 'Gute Nacht', emoji: '🌙' };
}

export default function Navbar() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;
  const greeting = session ? getGreeting() : null;

  return (
    <nav className="navbar">
      <div className="container">
        <Link href="/" className="navbar-brand">
          <span className="navbar-logo-icon">✨</span>
          Diktat Deutsch
          <span className="navbar-brand-sparkle">🇩🇪</span>
        </Link>
        <div className="navbar-links">
          {session ? (
            <>
              <Link href="/">
                <span className="nav-icon">📚</span> Lektionen
              </Link>
              <div className="navbar-dropdown">
                <span className="navbar-user">
                  <span className="navbar-greeting-emoji">{greeting?.emoji}</span>
                  {greeting?.text}, <strong>{session.user?.name || 'Lerner'}</strong>!
                </span>
                <div className="navbar-dropdown-menu">
                  {role === 'admin' && (
                    <Link href="/admin" className="navbar-dropdown-item">
                      <span className="nav-icon">⚙️</span> Verwaltung
                    </Link>
                  )}
                  <Link href="/support" className="navbar-dropdown-item">
                    <span className="nav-icon">💌</span> Support
                  </Link>
                  <button
                    className="navbar-dropdown-item"
                    onClick={() => signOut()}
                  >
                    <span className="nav-icon">👋</span> Abmelden
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <Link href="/login">
                <span className="nav-icon">🔑</span> Anmelden
              </Link>
              <Link href="/register" className="btn btn-primary btn-sm">
                <span className="nav-icon">🚀</span> Registrieren
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
