'use client';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';

export default function Navbar() {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string })?.role;

  return (
    <nav className="navbar">
      <div className="container">
        <Link href="/" className="navbar-brand">🇩🇪 Diktat Deutsch</Link>
        <div className="navbar-links">
          {session ? (
            <>
              <Link href="/">Lektionen</Link>
              <Link href="/podcast">🎙️ Podcasts</Link>
              <div className="navbar-dropdown">
                <span className="navbar-user">{session.user?.name}</span>
                <div className="navbar-dropdown-menu">
                  {role === 'admin' && (
                    <Link href="/admin" className="navbar-dropdown-item">
                      ⚙️ Verwaltung
                    </Link>
                  )}
                  <button
                    className="navbar-dropdown-item"
                    onClick={() => signOut()}
                  >
                    🚪 Abmelden
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <Link href="/login">Anmelden</Link>
              <Link href="/register">Registrieren</Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
