import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../../lib/api';
import { BrandMark } from '../../components/BrandMark';
import { ThemeToggle } from '../../components/ThemeToggle';
import { APP_NAME, APP_TAGLINE } from '../../config/brand';
import { useLogin } from './session';

export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);
    try {
      await login.mutateAsync({ email, password });
      navigate('/');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign in failed');
    }
  }

  return (
    <main className="auth">
      <div className="auth__toggle">
        <ThemeToggle />
      </div>
      <div className="auth__card">
        <div className="auth__brand">
          <span className="brand">
            <BrandMark showName={false} />
          </span>
          <div className="stack" style={{ gap: 'var(--space-1)' }}>
            <h1>{APP_NAME}</h1>
            <p className="muted">{APP_TAGLINE}</p>
          </div>
        </div>
        <form className="card stack" onSubmit={onSubmit}>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>
          {error && (
            <p className="alert error" role="alert">
              {error}
            </p>
          )}
          <button className="primary" type="submit" disabled={login.isPending}>
            {login.isPending ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </main>
  );
}
