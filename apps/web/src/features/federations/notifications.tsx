import { Link, useParams } from '@tanstack/react-router';
import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  PowerTableButton,
  PowerTableCheckbox,
  PowerTablePage,
  PowerTablePanel,
  PowerTableSectionTitle,
  PowerTableToolbar,
} from '../../components/powertable.js';
import { ApiClientError } from '../../lib/api-client.js';
import { useAuthStore } from '../../lib/auth/store.js';
import {
  type FederationAuditEntryDto,
  useCreateFederationFeedback,
  useFederationAudit,
  useFederationDashboard,
  useTestFederationEmail,
  useUpdateFederation,
} from './api.js';

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function auditComment(entry: FederationAuditEntryDto): string {
  if (!entry.after || typeof entry.after !== 'object') return entry.notes ?? '-';
  const payload = entry.after as Record<string, unknown>;
  const message = typeof payload.message === 'string' ? payload.message : null;
  const recipient = typeof payload.recipient === 'string' ? payload.recipient : null;
  return message ?? recipient ?? entry.notes ?? '-';
}

export default function FederationNotificationsFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/federations/$id/notifications' });
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, error } = useFederationDashboard(id);
  const { data: auditData, isLoading: auditLoading } = useFederationAudit(id);
  const update = useUpdateFederation(id);
  const testEmail = useTestFederationEmail(id);
  const createFeedback = useCreateFederationFeedback(id);
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [telegramHandle, setTelegramHandle] = useState('');
  const [notificationsDisabled, setNotificationsDisabled] = useState(false);
  const [isPublicResultsClosed, setIsPublicResultsClosed] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');

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
        r.role === 'platform_admin' ||
        (r.role === 'federation_admin' && r.federationId === id),
    ) ?? false;
  const notificationHistory =
    auditData?.audit.filter((entry) =>
      ['federation.feedback.created', 'federation.updated', 'federation.test_email.requested'].includes(
        entry.action,
      ),
    ) ?? [];

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        contactPhone: nullableText(contactPhone),
        contactEmail: nullableText(contactEmail),
        telegramHandle: nullableText(telegramHandle),
        notificationsDisabled,
        isPublicResultsClosed,
      });
      toast.success('Настройки уведомлений сохранены');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function sendTestEmail() {
    try {
      const result = await testEmail.mutateAsync();
      toast.success(
        result.smtpConfigured
          ? `Тестовое письмо поставлено в очередь: ${result.recipient}`
          : `Email заполнен: ${result.recipient}. SMTP-доставка пока не настроена.`,
      );
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'contact_email_missing') {
        toast.error('Заполните email федерации');
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  async function submitFeedback() {
    const message = feedbackMessage.trim();
    if (message.length < 3) {
      toast.error('Напишите текст обращения');
      return;
    }
    try {
      await createFeedback.mutateAsync({ message });
      setFeedbackMessage('');
      toast.success('Обращение сохранено в истории');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <PowerTablePage
      title="Уведомления"
      subtitle={data.federation.nameRu}
      actions={(
        <>
          <PowerTableButton tone="danger" form="federationNotificationsForm" type="submit" disabled={!canManage || update.isPending}>
            Записать и закрыть
          </PowerTableButton>
          <PowerTableButton form="federationNotificationsForm" type="submit" disabled={!canManage || update.isPending}>
            {update.isPending ? t('common.saving') : 'Записать'}
          </PowerTableButton>
          <Link to="/federations/$id" params={{ id }} className="pt-link-button">К федерации</Link>
        </>
      )}
      federationBar={<><span>{data.federation.code}</span><span>{data.federation.nameRu}</span></>}
      tabs={[
        { label: 'Фильтры', icon: 'filter' },
        { label: 'Каналы связи', icon: 'notifications', active: true },
        { label: 'Почта', icon: 'mail' },
        { label: 'Telegram', icon: 'telegram' },
        { label: <Link to="/federations/$id/logins" params={{ id }}>История</Link>, icon: 'history' },
        { label: <Link to="/federations/$id/files" params={{ id }}>Файлы</Link>, icon: 'files' },
      ]}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
        <PowerTablePanel className="p-3">
          <form id="federationNotificationsForm" onSubmit={(e) => void submit(e)} className="space-y-3">
            <PowerTableSectionTitle>Ваши контактные данные. Будут публиковаться на персональной странице федерации</PowerTableSectionTitle>
            <div className="grid grid-cols-[42px_205px_42px_minmax(160px,1fr)] gap-6 max-lg:grid-cols-1">
              <div className="pt-lang-badge">RU</div>
              <PowerTableButton type="button">Switch the language to English</PowerTableButton>
              <div className="pt-lang-badge">EN</div>
              <input className="pt-field" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} disabled={!canManage} />
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
              <input className="pt-field font-mono" value={data.telegramSubscriptionCode} readOnly />
            </div>

            <div className="pt-info-green space-y-2">
              <PowerTableCheckbox
                checked={notificationsDisabled}
                disabled={!canManage}
                onChange={setNotificationsDisabled}
                label="Не отправлять уведомления о новых регистрациях заявок на участие"
              />
              <PowerTableCheckbox
                checked={isPublicResultsClosed}
                disabled={!canManage}
                onChange={setIsPublicResultsClosed}
                label="Закрыть свободный онлайн доступ к результатам соревнований"
              />
            </div>

            <PowerTableToolbar>
              <PowerTableButton type="submit" tone="green" icon="refresh" disabled={!canManage || update.isPending}>Обновить</PowerTableButton>
              <PowerTableButton type="button" icon="add" onClick={() => void submitFeedback()} disabled={createFeedback.isPending}>Добавить обращение</PowerTableButton>
              <PowerTableButton type="button" icon="mail" onClick={() => void sendTestEmail()} disabled={!canManage || testEmail.isPending}>Тест письмо</PowerTableButton>
            </PowerTableToolbar>
            <textarea
              className="pt-textarea w-full"
              value={feedbackMessage}
              onChange={(event) => setFeedbackMessage(event.target.value)}
              rows={3}
              placeholder="Текст обращения"
            />
          </form>

          <table className="pt-grid mt-2">
            <thead><tr><th>Автор</th><th>Дата</th><th>Содержание</th><th>Ответ</th></tr></thead>
            <tbody>
              {auditLoading ? <tr><td colSpan={4}>Загружаем...</td></tr> : null}
              {!auditLoading && notificationHistory.map((entry, index) => (
                <tr key={entry.id} className={index === 0 ? 'is-green' : undefined}>
                  <td>{entry.actorUser?.displayName ?? data.federation.nameRu}</td>
                  <td>{new Date(entry.occurredAt).toLocaleDateString('ru-RU')}</td>
                  <td>{auditComment(entry)}</td>
                  <td>{entry.result === 'success' ? 'Принято' : 'Ошибка'}</td>
                </tr>
              ))}
              {!auditLoading && notificationHistory.length === 0 ? (
                <tr><td colSpan={4} className="italic">История уведомлений пока пуста.</td></tr>
              ) : null}
            </tbody>
          </table>
        </PowerTablePanel>

        <PowerTablePanel className="p-3">
          <PowerTableSectionTitle>Справка по каналам</PowerTableSectionTitle>
          <div className="pt-info-yellow mb-3">
            Для Telegram: @PowerTable_bot, код подключения {data.telegramSubscriptionCode}.
          </div>
          <table className="pt-grid">
            <thead><tr><th>Канал</th><th>Статус</th></tr></thead>
            <tbody>
              <tr className="is-selected"><td>Email</td><td>{contactEmail ? 'Заполнен' : 'Не заполнен'}</td></tr>
              <tr className="is-green"><td>Telegram</td><td>{telegramHandle ? 'Заполнен' : 'Ожидает подключения'}</td></tr>
              <tr className="is-yellow"><td>Публичные результаты</td><td>{isPublicResultsClosed ? 'Закрыты' : 'Открыты'}</td></tr>
            </tbody>
          </table>
        </PowerTablePanel>
      </div>
    </PowerTablePage>
  );
}
