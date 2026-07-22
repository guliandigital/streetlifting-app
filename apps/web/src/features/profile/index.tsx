import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
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
import { useFederations } from '../federations/api.js';
import {
  useCabinetOverview,
  usePassportAttachments,
  usePassportExternalLinks,
  usePassportReviewRequests,
} from './api.js';

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
  const [passportBusy, setPassportBusy] = useState(false);
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [phone, setPhone] = useState('');
  const [telegramHandle, setTelegramHandle] = useState('');
  const [requestFederationId, setRequestFederationId] = useState('');
  const [requestKind, setRequestKind] = useState<
    'official_profile' | 'official_credential' | 'sport_rank'
  >('official_profile');
  const [requestMessage, setRequestMessage] = useState('');
  const [supportingAttachmentId, setSupportingAttachmentId] = useState<string | null>(null);
  const cabinet = useCabinetOverview();
  const externalLinks = usePassportExternalLinks();
  const reviewRequests = usePassportReviewRequests();
  const attachments = usePassportAttachments();
  const federations = useFederations();

  function profileRoleLabel(role: string): string {
    return t(`profile.role.${role}`, { defaultValue: role });
  }

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName);
    setPhone(cabinet.data?.identity.phone ?? '');
    setTelegramHandle(cabinet.data?.identity.telegramHandle ?? '');
  }, [cabinet.data?.identity.phone, cabinet.data?.identity.telegramHandle, user]);

  useEffect(() => {
    if (!requestFederationId && federations.data?.federations[0]) {
      setRequestFederationId(federations.data.federations[0].id);
    }
  }, [federations.data, requestFederationId]);

  if (!user) return null;

  async function refreshPassport(): Promise<void> {
    await Promise.all([
      cabinet.refetch(),
      reviewRequests.refetch(),
      attachments.refetch(),
      externalLinks.refetch(),
    ]);
  }

  async function onContactsSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setPassportBusy(true);
    try {
      await api.passport.updateProfile({
        displayName: displayName.trim(),
        phone: phone.trim() || null,
        telegramHandle: telegramHandle.trim() || null,
      });
      await refreshPassport();
      toast.success('Контактные данные сохранены');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPassportBusy(false);
    }
  }

  async function onPrivacyChange(privacyMode: 'public_results' | 'hidden'): Promise<void> {
    setPassportBusy(true);
    try {
      await api.passport.updatePrivacy(privacyMode);
      await cabinet.refetch();
      toast.success('Настройки приватности сохранены');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPassportBusy(false);
    }
  }

  async function onUploadDocument(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Размер документа не должен превышать 5 МБ');
      return;
    }
    setPassportBusy(true);
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
        reader.onload = () => resolve(String(reader.result));
        reader.readAsDataURL(file);
      });
      const { attachment } = await api.passport.uploadAttachment({
        filename: file.name,
        mimeType: file.type || 'application/octet-stream',
        contentBase64,
        kind: file.type === 'application/pdf' ? 'certificate_pdf' : 'misc',
      });
      setSupportingAttachmentId(attachment.id);
      await attachments.refetch();
      toast.success('Документ загружен');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      e.target.value = '';
      setPassportBusy(false);
    }
  }

  async function onRequestSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!requestFederationId) return;
    setPassportBusy(true);
    try {
      await api.passport.submitRequest({
        federationId: requestFederationId,
        kind: requestKind,
        payload: { message: requestMessage.trim() },
        supportingAttachmentId,
      });
      setRequestMessage('');
      setSupportingAttachmentId(null);
      await reviewRequests.refetch();
      toast.success('Заявка отправлена в федерацию');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPassportBusy(false);
    }
  }

  async function revokeConsent(id: string): Promise<void> {
    setPassportBusy(true);
    try {
      await api.passport.revokeConsent(id);
      await cabinet.refetch();
      toast.success('Согласие отозвано');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPassportBusy(false);
    }
  }

  async function cancelRequest(id: string): Promise<void> {
    setPassportBusy(true);
    try {
      await api.passport.cancelRequest(id);
      await reviewRequests.refetch();
      toast.success('Заявка отозвана');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPassportBusy(false);
    }
  }

  async function downloadDocument(id: string): Promise<void> {
    try {
      const blob = await api.passport.downloadAttachment(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '';
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  }

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

              <dt className="text-muted-foreground">ISF person ID</dt>
              <dd className="min-w-0 break-all font-mono text-xs text-muted-foreground">
                {cabinet.data?.identity.isfPersonId ?? '—'}
              </dd>

              <dt className="text-muted-foreground">{t('profile.phone')}</dt>
              <dd>{cabinet.data?.identity.phone ?? '—'}</dd>

              <dt className="text-muted-foreground">Telegram</dt>
              <dd>{cabinet.data?.identity.telegramHandle ?? '—'}</dd>

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
            <section className="mt-4 border-t pt-3">
              <h3 className="mb-2 text-sm font-medium">Контакты и приватность</h3>
              <form
                className="grid gap-2 sm:grid-cols-3"
                onSubmit={(e) => void onContactsSubmit(e)}
              >
                <Input
                  aria-label="Отображаемое имя"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                />
                <Input
                  aria-label="Телефон"
                  placeholder="Телефон"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <Input
                  aria-label="Telegram"
                  placeholder="Telegram"
                  value={telegramHandle}
                  onChange={(e) => setTelegramHandle(e.target.value)}
                />
                <div className="sm:col-span-3 flex flex-wrap items-center gap-2">
                  <Button type="submit" size="sm" disabled={passportBusy || !displayName.trim()}>
                    Сохранить контакты
                  </Button>
                  {cabinet.data?.athlete ? (
                    <>
                      <span className="text-xs text-muted-foreground">Результаты:</span>
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          cabinet.data.athlete.privacyMode === 'public_results'
                            ? 'default'
                            : 'outline'
                        }
                        disabled={passportBusy}
                        onClick={() => void onPrivacyChange('public_results')}
                      >
                        Публичные
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={
                          cabinet.data.athlete.privacyMode === 'hidden' ? 'default' : 'outline'
                        }
                        disabled={passportBusy}
                        onClick={() => void onPrivacyChange('hidden')}
                      >
                        Скрыть
                      </Button>
                    </>
                  ) : null}
                </div>
              </form>
            </section>
            <section className="mt-4 border-t pt-3">
              <h3 className="mb-2 text-sm font-medium">Согласия</h3>
              {cabinet.data?.identity.consents.length ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {cabinet.data.identity.consents.map((consent) => (
                    <li key={consent.id} className="flex flex-wrap items-center gap-2">
                      {consent.scope} · {consent.textVersion} · {formatDate(consent.grantedAt)}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={passportBusy}
                        onClick={() => void revokeConsent(consent.id)}
                      >
                        Отозвать
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t('profile.empty')}</p>
              )}
            </section>
            <section className="mt-4 border-t pt-3">
              <h3 className="mb-2 text-sm font-medium">Внешние спортивные профили</h3>
              {externalLinks.data?.links.length ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {externalLinks.data.links.map((link) => (
                    <li key={link.id}>
                      {link.system} · {link.externalId} · подтверждено
                      {link.verifiedAt ? ` ${formatDate(link.verifiedAt)}` : ''}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t('profile.empty')}</p>
              )}
            </section>
            <section className="mt-4 border-t pt-3">
              <h3 className="mb-2 text-sm font-medium">Заявки в федерацию</h3>
              <form
                className="mb-3 grid gap-2 sm:grid-cols-2"
                onSubmit={(e) => void onRequestSubmit(e)}
              >
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={requestFederationId}
                  onChange={(e) => setRequestFederationId(e.target.value)}
                  required
                >
                  <option value="">Выберите федерацию</option>
                  {federations.data?.federations.map((federation) => (
                    <option key={federation.id} value={federation.id}>
                      {federation.nameRu}
                    </option>
                  ))}
                </select>
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={requestKind}
                  onChange={(e) =>
                    setRequestKind(
                      e.target.value as 'official_profile' | 'official_credential' | 'sport_rank',
                    )
                  }
                >
                  <option value="official_profile">Функция официального лица</option>
                  <option value="official_credential">Аттестация или категория</option>
                  <option value="sport_rank">Звание или разряд</option>
                </select>
                <textarea
                  className="min-h-20 rounded-md border bg-background p-2 text-sm sm:col-span-2"
                  placeholder="Опишите основание заявки"
                  value={requestMessage}
                  onChange={(e) => setRequestMessage(e.target.value)}
                  maxLength={1000}
                  required
                />
                <label className="text-xs text-muted-foreground">
                  Подтверждающий документ (до 5 МБ)
                  <input
                    type="file"
                    className="mt-1 block text-xs"
                    onChange={(e) => void onUploadDocument(e)}
                  />
                </label>
                <div className="flex items-end gap-2">
                  {supportingAttachmentId ? (
                    <span className="text-xs text-muted-foreground">Документ прикреплён</span>
                  ) : null}
                  <Button type="submit" size="sm" disabled={passportBusy || !requestFederationId}>
                    Отправить заявку
                  </Button>
                </div>
              </form>
              {reviewRequests.data?.requests.length ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {reviewRequests.data.requests.map((request) => (
                    <li key={request.id} className="flex flex-wrap items-center gap-2">
                      {request.kind} · {request.status} · {formatDate(request.submittedAt)}
                      {request.reviewNote ? ` · ${request.reviewNote}` : ''}
                      {request.status === 'pending' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          disabled={passportBusy}
                          onClick={() => void cancelRequest(request.id)}
                        >
                          Отозвать
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t('profile.empty')}</p>
              )}
            </section>
            <section className="mt-4 border-t pt-3">
              <h3 className="mb-2 text-sm font-medium">Документы паспорта</h3>
              {attachments.data?.attachments.length ? (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {attachments.data.attachments.map((attachment) => (
                    <li key={attachment.id} className="flex flex-wrap items-center gap-2">
                      {attachment.filename} · {formatDate(attachment.uploadedAt)}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void downloadDocument(attachment.id)}
                      >
                        Открыть
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Документов пока нет.</p>
              )}
            </section>
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
                  <dt className="text-muted-foreground">Приватность</dt>
                  <dd>{cabinet.data.athlete.privacyMode}</dd>
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
                <section>
                  <h3 className="mb-2 text-sm font-medium">Звания и разряды</h3>
                  {cabinet.data.athlete.ranks.length ? (
                    <ul className="space-y-2 text-sm">
                      {cabinet.data.athlete.ranks.map((rank) => (
                        <li key={rank.id} className="rounded-md border p-2">
                          <p className="font-medium">{rank.name}</p>
                          <p className="text-muted-foreground">
                            {rank.status} · {formatDate(rank.issuedAt)}
                            {rank.expiresAt ? ` · до ${formatDate(rank.expiresAt)}` : ''}
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
                  <dt className="text-muted-foreground">Функции</dt>
                  <dd>
                    {cabinet.data.official.functions.length
                      ? cabinet.data.official.functions.map(profileRoleLabel).join(', ')
                      : '—'}
                  </dd>
                </dl>
                <section>
                  <h3 className="mb-2 text-sm font-medium">
                    {t('profile.official.upcomingAssignments')}
                  </h3>
                  {cabinet.data.official.upcomingAssignments.length ? (
                    <ul className="space-y-2 text-sm">
                      {cabinet.data.official.upcomingAssignments.map((assignment) => (
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
                <section>
                  <h3 className="mb-2 text-sm font-medium">Аттестации и категории</h3>
                  {cabinet.data.official.credentials.length ? (
                    <ul className="space-y-2 text-sm">
                      {cabinet.data.official.credentials.map((credential) => (
                        <li key={credential.id} className="rounded-md border p-2">
                          <p className="font-medium">{credential.name}</p>
                          <p className="text-muted-foreground">
                            {credential.status} · {formatDate(credential.issuedAt)}
                            {credential.expiresAt
                              ? ` · до ${formatDate(credential.expiresAt)}`
                              : ''}
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
            <Card>
              <CardHeader>
                <CardTitle>Организатор</CardTitle>
                <CardDescription>
                  Проведено турниров: {cabinet.data.organizer.tournamentsTotal}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  {cabinet.data.organizer.tournaments.map((tournament) => (
                    <li key={tournament.id} className="rounded-md border p-2">
                      <p className="font-medium">{tournament.competition.nameRu}</p>
                      <p className="text-muted-foreground">
                        {formatDate(tournament.competition.startDate)}
                        {tournament.competition.city ? ` · ${tournament.competition.city}` : ''}
                      </p>
                      <ul className="mt-2 space-y-1 text-muted-foreground">
                        {tournament.competition.teamMembers.map((member) => (
                          <li key={member.id}>
                            {member.memberNameSnapshot} · {profileRoleLabel(member.role)} ·{' '}
                            {member.status}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}
    </WorkspacePage>
  );
}
