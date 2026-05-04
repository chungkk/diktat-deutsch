'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await signIn('credentials', {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError(result.error);
      setLoading(false);
    } else {
      router.push('/');
      router.refresh();
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">Willkommen zurück</h1>
        <p className="auth-subtitle">Melde dich an, um weiterzulernen</p>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">E-Mail</label>
            <input id="email" type="email" className="form-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="deine@email.de" required />
          </div>
          <div className="form-group">
            <label htmlFor="password">Passwort</label>
            <input id="password" type="password" className="form-input" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••" required />
          </div>
          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Anmelden...' : 'Anmelden'}
          </button>
        </form>

        <div className="auth-footer">
          Noch kein Konto? <Link href="/register">Registrieren</Link>
        </div>
      </div>
    </div>
  );
}
