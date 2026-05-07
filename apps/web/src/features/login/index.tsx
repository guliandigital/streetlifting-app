import { useState, type FormEvent } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useAuth } from '../../lib/auth/hooks.js';
import { ApiClientError } from '../../lib/api-client.js';
import { moduleLogger } from '../../lib/logger.js';

const log = moduleLogger('login');

export default function LoginFeature() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const search = useSearch({ from: '/login' }) as { redirect?: string };

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      log.info('login succeeded');
      await navigate({ to: search.redirect ?? '/me' });
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.code === 'invalid_credentials' ? 'Неверный email или пароль' : err.message);
      } else {
        setError('Что-то пошло не так. Попробуйте ещё раз.');
        log.error('login failed', { name: err instanceof Error ? err.name : 'unknown' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 px-6">
      <h1 className="text-2xl font-semibold mb-1">Вход</h1>
      <p className="text-sm text-neutral-400 mb-8">
        Streetlifting App — войдите, чтобы продолжить.
      </p>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm text-neutral-300 mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm text-neutral-300 mb-1">
            Пароль
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-3 py-2 rounded bg-neutral-900 border border-neutral-800 focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>

        {error !== null && (
          <div role="alert" className="text-sm text-red-400">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={busy || email.length === 0 || password.length === 0}
          className="w-full px-4 py-2 rounded bg-[var(--color-accent)] text-neutral-950 font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90"
        >
          {busy ? 'Входим…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
