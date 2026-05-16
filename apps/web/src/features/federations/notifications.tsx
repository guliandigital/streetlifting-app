import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  WorkspaceButton,
  WorkspaceCheckbox,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceSectionTitle,
  WorkspaceToolbar,
} from '../../components/workspace.js';
import { ApiClientError } from '../../lib/api-client.js';
import { useAuthStore } from '../../lib/auth/store.js';
import { setLocale } from '../../lib/i18n/index.js';
import {
  type FederationAuditEntryDto,
  useCreateTelegramBindToken,
  useFederationAudit,
  useFederationDashboard,
  useTestFederationEmail,
  useUpdateFederation,
} from './api.js';
import { SupportTicketsPanel } from './support-tickets-panel.js';

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function auditComment(entry: FederationAuditEntryDto): string {
  if (!entry.after || typeof entry.after !== 'object') return entry.notes ?? '-';
  const payload = entry.after as Record<string, unknown>;
  const message = typeof payload.message === 'string' ? payload.message : null;
  const subject = typeof payload.subject === 'string' ? payload.subject : null;
  const recipient = typeof payload.recipient === 'string' ? payload.recipient : null;
  const status = typeof payload.status === 'string' ? payload.status : null;
  const code = typeof payload.code === 'string' ? payload.code : null;
  const username = typeof payload.username === 'string' ? payload.username : null;
  return message ?? subject ?? recipient ?? status ?? code ?? username ?? entry.notes ?? '-';
}

export default function FederationNotificationsFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/federations/$id/notifications' });
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, error } = useFederationDashboard(id);
  const { data: auditData, isLoading: auditLoading } = useFederationAudit(id);
  const update = useUpdateFederation(id);
  const testEmail = useTestFederationEmail(id);
  const createTelegramBindToken = useCreateTelegramBindToken(id);
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [telegramHandle, setTelegramHandle] = useState('');
  const [notificationsDisabled, setNotificationsDisabled] = useState(false);
  const [isPublicResultsClosed, setIsPublicResultsClosed] = useState(false);

  useEffect(() => {
    if (!data) return;
    setContactPhone(data.federation.contactPhone ?? '');
    setContactEmail(data.federation.contactEmail ?? '');
    setTelegramHandle(data.federation.telegramHandle ?? '');
    setNotificationsDisabled(data.federation.notificationsDisabled);
    setIsPublicResultsClosed(data.federation.isPublicResultsClosed);
  }, [data]);

  if (isLoading) {
    return <div className="pt-page p-6 text-sm text-gray-600">{t('common.loading')}</div>;
  }
  if (error || !data) {
    return (
      <div className="pt-page p-6 text-sm text-red-700">
        {t('common.error')}: {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }

  const canManage =
    user?.roles.some(
      (r) =>
        r.role === 'platform_admin' || (r.role === 'federation_admin' && r.federationId === id),
    ) ?? false;
  const notificationHistory =
    auditData?.audit.filter((entry) =>
      [
        'federation.feedback.created',
        'federation.updated',
        'federation.test_email.sent',
        'federation.test_email.failed',
        'federation.telegram_bind_token.created',
        'federation.telegram.bound',
        'federation.support_ticket.created',
        'federation.support_ticket.message_created',
        'federation.support_ticket.status_updated',
      ].includes(entry.action),
    ) ?? [];

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const closeAfterSave =
      ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.dataset.intent ===
      'save-close';
    try {
      await update.mutateAsync({
        contactPhone: nullableText(contactPhone),
        contactEmail: nullableText(contactEmail),
        telegramHandle: nullableText(telegramHandle),
        notificationsDisabled,
        isPublicResultsClosed,
      });
      toast.success('Настройки уведомлений сохранены');
      if (closeAfterSave) await navigate({ to: '/federations/$id', params: { id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function sendTestEmail() {
    try {
      const result = await testEmail.mutateAsync();
      toast.success(`Тестовое письмо отправлено: ${result.recipient}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'contact_email_missing') {
        toast.error('Заполните email федерации');
      } else if (err instanceof ApiClientError && err.code === 'mailer_not_configured') {
        toast.error('Почтовая доставка не настроена на сервере');
      } else if (err instanceof ApiClientError && err.code === 'mailer_delivery_failed') {
        toast.error('Почтовый сервер отклонил тестовое письмо');
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  async function createTelegramCode() {
    try {
      const result = await createTelegramBindToken.mutateAsync();
      toast.success(
        `Код Telegram выпущен до ${new Date(result.token.expiresAt).toLocaleTimeString('ru-RU')}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  function switchToEnglish() {
    setLocale('en');
    toast.success('Language switched to English');
  }

  return (
    <WorkspacePage
      title="Уведомления"
      subtitle={data.federation.nameRu}
      actions={
        <>
          <WorkspaceButton
            tone="danger"
            form="federationNotificationsForm"
            type="submit"
            data-intent="save-close"
            disabled={!canManage || update.isPending}
          >
            Записать и закрыть
          </WorkspaceButton>
          <WorkspaceButton
            form="federationNotificationsForm"
            type="submit"
            disabled={!canManage || update.isPending}
          >
            {update.isPending ? t('common.saving') : 'Записать'}
          </WorkspaceButton>
          <Link to="/federations/$id" params={{ id }} className="pt-link-button">
            К федерации
          </Link>
        </>
      }
      federationBar={
        <>
          <span>{data.federation.code}</span>
          <span>{data.federation.nameRu}</span>
        </>
      }
      tabs={[
        { label: 'Фильтры', icon: 'filter' },
        { label: 'Каналы связи', icon: 'notifications', active: true },
        { label: 'Почта', icon: 'mail' },
        { label: 'Telegram', icon: 'telegram' },
        {
          label: (
            <Link to="/federations/$id/logins" params={{ id }}>
              История
            </Link>
          ),
          icon: 'history',
        },
        {
          label: (
            <Link to="/federations/$id/files" params={{ id }}>
              Файлы
            </Link>
          ),
          icon: 'files',
        },
      ]}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <WorkspacePanel className="p-3">
          <form
            id="federationNotificationsForm"
            onSubmit={(e) => void submit(e)}
            className="space-y-3"
          >
            <WorkspaceSectionTitle>
              Ваши контактные данные. Будут публиковаться на персональной странице федерации
            </WorkspaceSectionTitle>
            <div className="grid grid-cols-[42px_205px_42px_minmax(160px,1fr)] gap-6 max-lg:grid-cols-1">
              <div className="pt-lang-badge">RU</div>
              <WorkspaceButton type="button" onClick={switchToEnglish}>
                Switch the language to English
              </WorkspaceButton>
              <div className="pt-lang-badge">EN</div>
              <input
                className="pt-field"
                value={contactPhone}
                onChange={(event) => setContactPhone(event.target.value)}
                disabled={!canManage}
              />
            </div>

            <div className="pt-form-grid max-w-4xl">
              <label htmlFor="telegramHandle">Telegram:</label>
              <input
                id="telegramHandle"
                className="pt-field"
                value={telegramHandle}
                onChange={(e) => setTelegramHandle(e.target.value)}
                disabled={!canManage}
              />
              <label htmlFor="contactEmail">Email:</label>
              <input
                id="contactEmail"
                className="pt-field"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                disabled={!canManage}
              />
              <label>Код подключения:</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  className="pt-field font-mono"
                  value={data.telegramSubscriptionCode ?? 'Код не выпущен'}
                  readOnly
                />
                <WorkspaceButton
                  type="button"
                  icon="telegram"
                  onClick={() => void createTelegramCode()}
                  disabled={!canManage || createTelegramBindToken.isPending}
                >
                  Выпустить на 1 час
                </WorkspaceButton>
              </div>
            </div>

            <div className="pt-info-green space-y-2">
              <WorkspaceCheckbox
                checked={notificationsDisabled}
                disabled={!canManage}
                onChange={setNotificationsDisabled}
                label="Не отправлять уведомления о новых регистрациях заявок на участие"
              />
              <WorkspaceCheckbox
                checked={isPublicResultsClosed}
                disabled={!canManage}
                onChange={setIsPublicResultsClosed}
                label="Закрыть свободный онлайн доступ к результатам соревнований"
              />
            </div>

            <WorkspaceToolbar>
              <WorkspaceButton
                type="submit"
                tone="green"
                icon="refresh"
                disabled={!canManage || update.isPending}
              >
                Обновить
              </WorkspaceButton>
              <WorkspaceButton
                type="button"
                icon="mail"
                onClick={() => void sendTestEmail()}
                disabled={!canManage || testEmail.isPending}
              >
                Тест письмо
              </WorkspaceButton>
            </WorkspaceToolbar>
          </form>

          <table className="pt-grid mt-2">
            <thead>
              <tr>
                <th>Автор</th>
                <th>Дата</th>
                <th>Содержание</th>
                <th>Ответ</th>
              </tr>
            </thead>
            <tbody>
              {auditLoading ? (
                <tr>
                  <td colSpan={4}>Загружаем...</td>
                </tr>
              ) : null}
              {!auditLoading &&
                notificationHistory.map((entry, index) => (
                  <tr key={entry.id} className={index === 0 ? 'is-green' : undefined}>
                    <td>{entry.actorUser?.displayName ?? data.federation.nameRu}</td>
                    <td>{new Date(entry.occurredAt).toLocaleDateString('ru-RU')}</td>
                    <td>{auditComment(entry)}</td>
                    <td>{entry.result === 'success' ? 'Принято' : 'Ошибка'}</td>
                  </tr>
                ))}
              {!auditLoading && notificationHistory.length === 0 ? (
                <tr>
                  <td colSpan={4} className="italic">
                    История уведомлений пока пуста.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </WorkspacePanel>

        <WorkspacePanel className="p-3">
          <WorkspaceSectionTitle>Справка по каналам</WorkspaceSectionTitle>
          <div className="pt-info-yellow mb-3">
            Для Telegram: выпустите одноразовый код и отправьте его в боте Streetlifting в течение
            часа.
          </div>
          {data.telegramSubscriptionCode ? (
            <div className="pt-info-green mb-3">
              Активный код: <b>{data.telegramSubscriptionCode}</b>. Действует до{' '}
              {data.telegramSubscriptionCodeExpiresAt
                ? new Date(data.telegramSubscriptionCodeExpiresAt).toLocaleString('ru-RU')
                : '—'}
            </div>
          ) : null}
          <table className="pt-grid">
            <thead>
              <tr>
                <th>Канал</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              <tr className="is-selected">
                <td>Email</td>
                <td>{contactEmail ? 'Заполнен' : 'Не заполнен'}</td>
              </tr>
              <tr className="is-green">
                <td>Telegram</td>
                <td>
                  {data.telegramSubscriptions.length > 0
                    ? `Подключено чатов: ${data.telegramSubscriptions.length}`
                    : telegramHandle
                      ? 'Указан username, чат не подключен'
                      : 'Ожидает подключения'}
                </td>
              </tr>
              <tr className="is-yellow">
                <td>Публичные результаты</td>
                <td>{isPublicResultsClosed ? 'Закрыты' : 'Открыты'}</td>
              </tr>
            </tbody>
          </table>
        </WorkspacePanel>
      </div>

      <div className="mt-3">
        <SupportTicketsPanel federationId={id} />
      </div>
    </WorkspacePage>
  );
}
