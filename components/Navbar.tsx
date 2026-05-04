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
              {role === 'admin' && <Link href="/admin">Verwaltung</Link>}
              <span className="navbar-user">{session.user?.name}</span>
              <button onClick={() => signOut()}>Abmelden</button>
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
