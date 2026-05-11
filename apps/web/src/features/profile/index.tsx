import { useState, type FormEvent } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
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
import { api, ApiClientError } from '../../lib/api-client.js';
import { useAuth } from '../../lib/auth/hooks.js';
import { useAuthStore } from '../../lib/auth/store.js';

const PASSWORD_MIN_LENGTH = 12;

export default function ProfileFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const clearSession = useAuthStore((s) => s.clear);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  async function onPasswordSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (newPassword.length < PASSWORD_MIN_LENGTH) {
      toast.error(t('profile.password.errors.tooShort', { min: PASSWORD_MIN_LENGTH }));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('profile.password.errors.mismatch'));
      return;
    }

    setBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      toast.success(t('profile.password.changed'));
      clearSession();
      await navigate({ to: '/login' });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'invalid_current_password') {
        toast.error(t('profile.password.errors.invalidCurrent'));
      } else if (err instanceof ApiClientError && err.code === 'password_reused') {
        toast.error(t('profile.password.errors.reused'));
      } else {
        toast.error(err instanceof Error ? err.message : t('common.error'));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-5xl gap-6 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
          <CardDescription>{t('profile.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
            <dt className="text-muted-foreground">{t('profile.displayName')}</dt>
            <dd className="min-w-0 break-words">{user.displayName}</dd>

            <dt className="text-muted-foreground">{t('profile.email')}</dt>
            <dd className="min-w-0 break-words">{user.email}</dd>

            <dt className="text-muted-foreground">{t('profile.userId')}</dt>
            <dd className="min-w-0 break-all font-mono text-xs text-muted-foreground">{user.id}</dd>

            <dt className="text-muted-foreground">{t('profile.roles')}</dt>
            <dd>
              {user.roles.length === 0 ? (
                <span className="text-muted-foreground italic">{t('profile.noRoles')}</span>
              ) : (
                <ul className="space-y-1">
                  {user.roles.map((r, i) => (
                    <li key={i}>
                      <span className="text-primary">{t(`profile.role.${r.role}`, { defaultValue: r.role })}</span>
                      {r.federationId && (
                        <span className="text-muted-foreground">
                          {' · '}
                          {t('profile.scope.federation', { id: r.federationId.slice(0, 8) })}
                        </span>
                      )}
                      {r.competitionId && (
                        <span className="text-muted-foreground">
                          {' · '}
                          {t('profile.scope.competition', { id: r.competitionId.slice(0, 8) })}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.password.title')}</CardTitle>
          <CardDescription>{t('profile.password.subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => void onPasswordSubmit(e)}>
            <div className="space-y-2">
              <Label htmlFor="currentPassword">{t('profile.password.current')}</Label>
              <Input
                id="currentPassword"
                data-testid="profile-current-password"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">{t('profile.password.next')}</Label>
              <Input
                id="newPassword"
                data-testid="profile-new-password"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('profile.password.confirm')}</Label>
              <Input
                id="confirmPassword"
                data-testid="profile-confirm-password"
                type="password"
                autoComplete="new-password"
                minLength={PASSWORD_MIN_LENGTH}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>

            <Button
              data-testid="profile-change-password"
              type="submit"
              className="w-full"
              disabled={busy || currentPassword.length === 0 || newPassword.length === 0 || confirmPassword.length === 0}
            >
              {busy ? t('common.saving') : t('profile.password.submit')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
