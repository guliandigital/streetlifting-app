import { useState, type FormEvent } from 'react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  toast,
} from '@streetlifting/ui';
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
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      log.info('login succeeded');
      await navigate({ to: search.redirect ?? '/me' });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'invalid_credentials') {
        toast.error('Неверный email или пароль');
      } else if (err instanceof ApiClientError) {
        toast.error(err.message);
      } else {
        toast.error('Что-то пошло не так. Попробуйте ещё раз.');
        log.error('login failed', { name: err instanceof Error ? err.name : 'unknown' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-sm mx-auto mt-16 px-6">
      <Card>
        <CardHeader>
          <CardTitle>Вход</CardTitle>
          <CardDescription>Streetlifting App — войдите, чтобы продолжить.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={busy || email.length === 0 || password.length === 0}
            >
              {busy ? 'Входим…' : 'Войти'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
