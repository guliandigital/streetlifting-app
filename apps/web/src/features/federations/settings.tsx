import { Link, useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
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

function auditLabel(action: string): string {
  const labels: Record<string, string> = {
    'auth.login.succeeded': 'Вход выполнен',
    'auth.login.failed': 'Неудачный вход',
    'federation.updated': 'Настройки изменены',
    'federation.test_email.requested': 'Тест письма',
    'federation.feedback.created': 'Обращение',
    'federation.attachment.uploaded': 'Файл загружен',
    'federation.attachment.deleted': 'Файл удален',
    'federation.plate_set.created': 'Комплект создан',
    'federation.plate_set.updated': 'Комплект обновлен',
    'federation.plate_set.deleted': 'Комплект удален',
    'federation.receipt.created': 'Поступление',
    'federation.writeoff.created': 'Списание',
  };
  return labels[action] ?? action;
}

function payloadField(entry: FederationAuditEntryDto, key: string): string | null {
  if (!entry.after || typeof entry.after !== 'object') return null;
  const value = (entry.after as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

function actorName(entry: FederationAuditEntryDto): string {
  return entry.actorUser?.displayName ?? entry.targetUser?.displayName ?? 'Система';
}

function isFederationManager(
  user: ReturnType<typeof useAuthStore.getState>['user'],
  federationId: string,
): boolean {
  return (
    user?.roles.some(
      (role) =>
        role.role === 'platform_admin' ||
        (role.role === 'federation_admin' && role.federationId === federationId),
    ) ?? false
  );
}

function AuditTable({ rows, emptyText }: { rows: FederationAuditEntryDto[]; emptyText: string }) {
  return (
    <table className="pt-grid">
      <thead>
        <tr><th>Дата</th><th>Пользователь</th><th>Действие</th><th>IP</th><th>Комментарий</th></tr>
      </thead>
      <tbody>
        {rows.map((entry, index) => (
          <tr key={entry.id} className={index === 0 ? 'is-selected' : index % 2 ? 'is-green' : undefined}>
            <td>{new Date(entry.occurredAt).toLocaleString('ru-RU')}</td>
            <td>{actorName(entry)}</td>
            <td>{auditLabel(entry.action)}</td>
            <td>{entry.actorIp ?? '-'}</td>
            <td>{payloadField(entry, 'message') ?? payloadField(entry, 'recipient') ?? entry.notes ?? '-'}</td>
          </tr>
        ))}
        {rows.length === 0 ? <tr><td colSpan={5} className="italic">{emptyText}</td></tr> : null}
      </tbody>
    </table>
  );
}

export default function FederationSettingsFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id: string };
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { data, isLoading, error } = useFederationDashboard(id);
  const { data: auditData, isLoading: auditLoading } = useFederationAudit(id);
  const update = useUpdateFederation(id);
  const testEmail = useTestFederationEmail(id);
  const createFeedback = useCreateFederationFeedback(id);

  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [telegramHandle, setTelegramHandle] = useState('');
  const [vkUrl, setVkUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [chiefAccountantName, setChiefAccountantName] = useState('');
  const [cashierName, setCashierName] = useState('');
  const [notificationsDisabled, setNotificationsDisabled] = useState(false);
  const [isPublicResultsClosed, setIsPublicResultsClosed] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState('');

  useEffect(() => {
    if (!data) return;
    setContactPhone(data.federation.contactPhone ?? '');
    setContactEmail(data.federation.contactEmail ?? '');
    setTelegramHandle(data.federation.telegramHandle ?? '');
    setVkUrl(data.federation.vkUrl ?? '');
    setWebsiteUrl(data.federation.websiteUrl ?? '');
    setChiefAccountantName(data.federation.chiefAccountantName ?? '');
    setCashierName(data.federation.cashierName ?? '');
    setNotificationsDisabled(data.federation.notificationsDisabled);
    setIsPublicResultsClosed(data.federation.isPublicResultsClosed);
  }, [data]);

  const auditRows = useMemo(() => auditData?.audit ?? [], [auditData?.audit]);
  const loginRows = useMemo(
    () => auditRows.filter((entry) => entry.action.startsWith('auth.login.')),
    [auditRows],
  );
  const supportRows = useMemo(
    () =>
      auditRows.filter((entry) =>
        ['federation.feedback.created', 'federation.updated', 'federation.test_email.requested'].includes(
          entry.action,
        ),
      ),
    [auditRows],
  );

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

  const f = data.federation;
  const canManage = isFederationManager(user, id);
  const showLogins = location.pathname.endsWith('/logins');

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const closeAfterSave =
      ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.dataset.intent === 'save-close';
    try {
      await update.mutateAsync({
        contactPhone: nullableText(contactPhone),
        contactEmail: nullableText(contactEmail),
        telegramHandle: nullableText(telegramHandle),
        vkUrl: nullableText(vkUrl),
        websiteUrl: nullableText(websiteUrl),
        chiefAccountantName: nullableText(chiefAccountantName),
        cashierName: nullableText(cashierName),
        notificationsDisabled,
        isPublicResultsClosed,
      });
      toast.success('Настройки федерации сохранены');
      if (closeAfterSave) await navigate({ to: '/federations/$id', params: { id } });
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'validation_error') {
        toast.error('Проверьте email и ссылки: URL должен начинаться с https://');
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
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
      title={showLogins ? 'Входы в программу' : 'Обращения, настройки / Feedback, settings'}
      subtitle={f.nameRu}
      actions={(
        <>
          {!showLogins ? (
            <>
              <PowerTableButton tone="danger" form="federationSettingsForm" type="submit" data-intent="save-close" disabled={!canManage || update.isPending}>
                Записать и закрыть
              </PowerTableButton>
              <PowerTableButton form="federationSettingsForm" type="submit" disabled={!canManage || update.isPending}>
                {update.isPending ? t('common.saving') : 'Записать'}
              </PowerTableButton>
            </>
          ) : null}
          <Link to="/federations/$id" params={{ id }} className="pt-link-button">К федерации</Link>
          <Link to="/federations/$id/files" params={{ id }} className="pt-link-button">Файлы</Link>
        </>
      )}
      federationBar={<><span>{f.code}</span><span>{f.nameRu}</span></>}
      tabs={[
        {
          label: <Link to="/federations/$id/settings" params={{ id }}>Обращения, настройки</Link>,
          icon: 'settings',
          active: !showLogins,
        },
        {
          label: <Link to="/federations/$id/logins" params={{ id }}>Входы в программу</Link>,
          icon: 'history',
          active: showLogins,
        },
        { label: <Link to="/federations/$id/notifications" params={{ id }}>Уведомления</Link>, icon: 'notifications' },
        { label: <Link to="/federations/$id/files" params={{ id }}>Файлы</Link>, icon: 'files' },
      ]}
    >
      {showLogins ? (
        <PowerTablePanel className="p-3">
          <PowerTableSectionTitle>История входов</PowerTableSectionTitle>
          {auditLoading ? <p className="pt-muted">Загружаем...</p> : <AuditTable rows={loginRows} emptyText="Входов пока нет." />}
        </PowerTablePanel>
      ) : (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
          <PowerTablePanel className="p-3">
            <form id="federationSettingsForm" onSubmit={(event) => void submit(event)} className="space-y-3">
              <PowerTableSectionTitle>Ваши контактные данные. Будут публиковаться на персональной странице федерации</PowerTableSectionTitle>
              <div className="pt-form-grid max-w-5xl">
                <label htmlFor="contactPhone">Телефон:</label>
                <input id="contactPhone" className="pt-field" value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} disabled={!canManage} />
                <label htmlFor="contactEmail">Email:</label>
                <input id="contactEmail" className="pt-field" type="email" value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} disabled={!canManage} />
                <label htmlFor="telegramHandle">Telegram:</label>
                <input id="telegramHandle" className="pt-field" value={telegramHandle} onChange={(event) => setTelegramHandle(event.target.value)} disabled={!canManage} />
                <label htmlFor="vkUrl">VK:</label>
                <input id="vkUrl" className="pt-field" value={vkUrl} onChange={(event) => setVkUrl(event.target.value)} disabled={!canManage} />
                <label htmlFor="websiteUrl">Сайт:</label>
                <input id="websiteUrl" className="pt-field" value={websiteUrl} onChange={(event) => setWebsiteUrl(event.target.value)} disabled={!canManage} />
                <label htmlFor="chiefAccountantName">Главный бухгалтер:</label>
                <input id="chiefAccountantName" className="pt-field" value={chiefAccountantName} onChange={(event) => setChiefAccountantName(event.target.value)} disabled={!canManage} />
                <label htmlFor="cashierName">Кассир:</label>
                <input id="cashierName" className="pt-field" value={cashierName} onChange={(event) => setCashierName(event.target.value)} disabled={!canManage} />
                <label>Ключ защиты:</label>
                <input className="pt-field font-mono" value={f.securityKey} readOnly />
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
                <PowerTableButton type="submit" tone="green" icon="save" disabled={!canManage || update.isPending}>Сохранить настройки</PowerTableButton>
                <PowerTableButton type="button" icon="mail" onClick={() => void sendTestEmail()} disabled={!canManage || testEmail.isPending}>Тест письмо</PowerTableButton>
              </PowerTableToolbar>
            </form>

            <div className="mt-4">
              <PowerTableSectionTitle>Обращение в поддержку</PowerTableSectionTitle>
              <textarea
                className="pt-textarea mb-2 w-full"
                value={feedbackMessage}
                onChange={(event) => setFeedbackMessage(event.target.value)}
                rows={4}
                placeholder="Опишите вопрос или доработку"
              />
              <PowerTableButton type="button" icon="add" onClick={() => void submitFeedback()} disabled={createFeedback.isPending}>
                Добавить обращение
              </PowerTableButton>
            </div>
          </PowerTablePanel>

          <PowerTablePanel className="p-3">
            <PowerTableSectionTitle>История обращений и настроек</PowerTableSectionTitle>
            {auditLoading ? <p className="pt-muted">Загружаем...</p> : <AuditTable rows={supportRows} emptyText="История пока пуста." />}
          </PowerTablePanel>
        </div>
      )}
    </PowerTablePage>
  );
}
