'use client';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

export default function Navbar() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;

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
                  <span className="navbar-user-avatar">
                    {session.user?.name?.charAt(0)?.toUpperCase() || '🌟'}
                  </span>
                  {session.user?.name}
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
