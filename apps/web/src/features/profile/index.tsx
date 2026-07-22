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
import { WorkspacePage } from '../../components/workspace.js';
import { api, ApiClientError } from '../../lib/api-client.js';
import { useAuth } from '../../lib/auth/hooks.js';
import { useAuthStore } from '../../lib/auth/store.js';
import { useCabinetOverview } from './api.js';

const PASSWORD_MIN_LENGTH = 12;

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

export default function ProfileFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const clearSession = useAuthStore((s) => s.clear);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const cabinet = useCabinetOverview();

  function profileRoleLabel(role: string): string {
    return t(`profile.role.${role}`, { defaultValue: role });
  }

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
    <WorkspacePage title={t('profile.title')} subtitle={t('profile.subtitle')}>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-[160px_minmax(0,1fr)]">
              <dt className="text-muted-foreground">{t('profile.displayName')}</dt>
              <dd className="min-w-0 break-words">{user.displayName}</dd>

              <dt className="text-muted-foreground">{t('profile.email')}</dt>
              <dd className="min-w-0 break-words">{user.email}</dd>

              <dt className="text-muted-foreground">{t('profile.userId')}</dt>
              <dd className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                {user.id}
              </dd>

              <dt className="text-muted-foreground">{t('profile.isfId')}</dt>
              <dd className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                {cabinet.data?.identity.isfSubjectId ?? t('profile.isfIdNotLinked')}
              </dd>

              <dt className="text-muted-foreground">{t('profile.roles')}</dt>
              <dd>
                {user.roles.length === 0 ? (
                  <span className="text-muted-foreground italic">{t('profile.noRoles')}</span>
                ) : (
                  <ul className="space-y-1">
                    {user.roles.map((r, i) => (
                      <li key={i}>
                        <span className="text-primary">
                          {t(`profile.role.${r.role}`, { defaultValue: r.role })}
                        </span>
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
                disabled={
                  busy ||
                  currentPassword.length === 0 ||
                  newPassword.length === 0 ||
                  confirmPassword.length === 0
                }
              >
                {busy ? t('common.saving') : t('profile.password.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {cabinet.isLoading ? (
        <p className="mt-5 text-sm text-muted-foreground">{t('common.loading')}</p>
      ) : null}
      {cabinet.isError ? (
        <p className="mt-5 text-sm text-destructive">{t('profile.cabinetUnavailable')}</p>
      ) : null}
      {cabinet.data ? (
        <div className="mt-5 grid gap-3 xl:grid-cols-2">
          {cabinet.data.athlete ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('profile.athlete.title')}</CardTitle>
                <CardDescription>
                  {t('profile.athlete.summary', {
                    appearances: cabinet.data.athlete.appearancesTotal,
                    records: cabinet.data.athlete.recordsTotal,
                  })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-2 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
                  <dt className="text-muted-foreground">{t('profile.athlete.card')}</dt>
                  <dd>{cabinet.data.athlete.federationCardNumber ?? '—'}</dd>
                  <dt className="text-muted-foreground">{t('profile.athlete.club')}</dt>
                  <dd>{cabinet.data.athlete.clubName ?? '—'}</dd>
                </dl>
                <section>
                  <h3 className="mb-2 text-sm font-medium">{t('profile.athlete.appearances')}</h3>
                  {cabinet.data.athlete.appearances.length ? (
                    <ul className="space-y-2 text-sm">
                      {cabinet.data.athlete.appearances.map((appearance) => (
                        <li key={appearance.id} className="rounded-md border p-2">
                          <p className="font-medium">{appearance.competition.nameRu}</p>
                          <p className="text-muted-foreground">
                            {formatDate(appearance.competition.startDate)} ·{' '}
                            {appearance.discipline.nameRu}
                            {appearance.bestSuccessfulAttemptKg !== null
                              ? ` · ${appearance.bestSuccessfulAttemptKg} ${t('common.kg')}`
                              : ''}
                            {appearance.placeOverall !== null
                              ? ` · ${t('profile.athlete.place', { value: appearance.placeOverall })}`
                              : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('profile.empty')}</p>
                  )}
                </section>
                <section>
                  <h3 className="mb-2 text-sm font-medium">{t('profile.athlete.records')}</h3>
                  {cabinet.data.athlete.records.length ? (
                    <ul className="space-y-2 text-sm">
                      {cabinet.data.athlete.records.map((record) => (
                        <li key={record.id} className="rounded-md border p-2">
                          <p className="font-medium">
                            {record.result} {t('common.kg')} · {record.discipline.nameRu}
                          </p>
                          <p className="text-muted-foreground">
                            {record.scope} · {record.competition.nameRu} ·{' '}
                            {formatDate(record.achievedOn)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('profile.empty')}</p>
                  )}
                </section>
              </CardContent>
            </Card>
          ) : null}

          {cabinet.data.official ? (
            <Card>
              <CardHeader>
                <CardTitle>{t('profile.official.title')}</CardTitle>
                <CardDescription>
                  {t('profile.official.summary', { count: cabinet.data.official.assignmentsTotal })}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <dl className="grid gap-2 text-sm sm:grid-cols-[140px_minmax(0,1fr)]">
                  <dt className="text-muted-foreground">{t('profile.official.category')}</dt>
                  <dd>
                    {cabinet.data.official.categoryRu ?? cabinet.data.official.categoryEn ?? '—'}
                  </dd>
                  <dt className="text-muted-foreground">{t('profile.official.card')}</dt>
                  <dd>{cabinet.data.official.cardNumber ?? '—'}</dd>
                  <dt className="text-muted-foreground">{t('profile.official.region')}</dt>
                  <dd>{cabinet.data.official.cityRegion ?? '—'}</dd>
                </dl>
                <section>
                  <h3 className="mb-2 text-sm font-medium">{t('profile.official.assignments')}</h3>
                  {cabinet.data.official.assignments.length ? (
                    <ul className="space-y-2 text-sm">
                      {cabinet.data.official.assignments.map((assignment) => (
                        <li key={assignment.id} className="rounded-md border p-2">
                          <p className="font-medium">{assignment.competition.nameRu}</p>
                          <p className="text-muted-foreground">
                            {profileRoleLabel(assignment.role)} ·{' '}
                            {formatDate(assignment.competition.startDate)}
                            {assignment.platform ? ` · ${assignment.platform.name}` : ''}
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('profile.empty')}</p>
                  )}
                </section>
              </CardContent>
            </Card>
          ) : null}

          {cabinet.data.organizer ? (
            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle>{t('profile.organizer.title')}</CardTitle>
                <CardDescription>{t('profile.organizer.subtitle')}</CardDescription>
              </CardHeader>
              <CardContent>
                {cabinet.data.organizer.competitions.length ? (
                  <ul className="grid gap-3 lg:grid-cols-2">
                    {cabinet.data.organizer.competitions.map((competition) => (
                      <li key={competition.id} className="rounded-md border p-3 text-sm">
                        <p className="font-medium">{competition.nameRu}</p>
                        <p className="mb-2 text-muted-foreground">
                          {competition.federation.nameRu} · {formatDate(competition.startDate)}
                        </p>
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t('profile.organizer.team')}
                        </p>
                        <ul className="space-y-1 text-muted-foreground">
                          {competition.judgeAssignments.map((assignment) => (
                            <li key={`judge-${assignment.id}`}>
                              {assignment.judge.displayName} · {profileRoleLabel(assignment.role)}
                              {assignment.platform ? ` · ${assignment.platform.name}` : ''}
                            </li>
                          ))}
                          {competition.roleAssignments.map((assignment) => (
                            <li key={`role-${assignment.id}`}>
                              {assignment.user.displayName} · {profileRoleLabel(assignment.role)}
                            </li>
                          ))}
                          {competition.judgeAssignments.length === 0 &&
                          competition.roleAssignments.length === 0 ? (
                            <li>{t('profile.empty')}</li>
                          ) : null}
                        </ul>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">{t('profile.empty')}</p>
                )}
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </WorkspacePage>
  );
}
