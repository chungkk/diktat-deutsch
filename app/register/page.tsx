'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error);
        setLoading(false);
        return;
      }

      router.push('/login');
    } catch {
      setError('Ein Fehler ist aufgetreten');
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-icon">🚀</div>
        <h1 className="auth-title">Konto erstellen</h1>
        <p className="auth-subtitle">Starte deine Deutsch-Lernreise ✨</p>

        {error && <div className="auth-error">⚠️ {error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">👤 Benutzername</label>
            <input id="username" type="text" className="form-input" value={username} onChange={e => setUsername(e.target.value)} placeholder="Dein Name" required />
          </div>
          <div className="form-group">
            <label htmlFor="email">📧 E-Mail</label>
            <input id="email" type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="deine@email.de" required />
          </div>
          <div className="form-group">
            <label htmlFor="password">🔑 Passwort</label>
            <input id="password" type="password" className="form-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="Min. 6 Zeichen" required />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? '⏳ Registrieren...' : '🎉 Registrieren'}
          </button>
        </form>

        <div className="auth-footer">
          Bereits ein Konto? <Link href="/login">🔑 Anmelden</Link>
        </div>
      </div>
    </div>
  );
}
