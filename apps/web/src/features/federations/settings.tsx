import { Link, useLocation, useNavigate, useParams } from '@tanstack/react-router';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
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
import {
  type FederationAuditEntryDto,
  useConfirmFederationSecurityKeyRotation,
  useFederationAudit,
  useFederationDashboard,
  useRequestFederationSecurityKeyRotation,
  useTestFederationEmail,
  useUpdateFederation,
} from './api.js';
import { SupportTicketsPanel } from './support-tickets-panel.js';

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function auditLabel(action: string): string {
  const labels: Record<string, string> = {
    'auth.login.succeeded': 'Вход выполнен',
    'auth.login.failed': 'Неудачный вход',
    'federation.updated': 'Настройки изменены',
    'federation.test_email.sent': 'Тест письма отправлен',
    'federation.test_email.failed': 'Тест письма: ошибка',
    'federation.support_ticket.created': 'Обращение создано',
    'federation.support_ticket.message_created': 'Сообщение в обращении',
    'federation.support_ticket.status_updated': 'Статус обращения',
    'federation.attachment.uploaded': 'Файл загружен',
    'federation.attachment.deleted': 'Файл удален',
    'federation.plate_set.created': 'Комплект создан',
    'federation.plate_set.updated': 'Комплект обновлен',
    'federation.plate_set.deleted': 'Комплект удален',
    'federation.receipt.created': 'Поступление',
    'federation.writeoff.created': 'Списание',
    'federation.security_key_rotation.requested': 'Запрошена смена ключа',
    'federation.security_key_rotation.request_failed': 'Смена ключа: ошибка письма',
    'federation.security_key_rotation.request_denied': 'Смена ключа: отказ',
    'federation.security_key_rotation.confirm_denied': 'Смена ключа: неверный код',
    'federation.security_key.rotated': 'Ключ защиты сменен',
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
        <tr>
          <th>Дата</th>
          <th>Пользователь</th>
          <th>Действие</th>
          <th>IP</th>
          <th>Комментарий</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((entry, index) => (
          <tr
            key={entry.id}
            className={index === 0 ? 'is-selected' : index % 2 ? 'is-green' : undefined}
          >
            <td>{new Date(entry.occurredAt).toLocaleString('ru-RU')}</td>
            <td>{actorName(entry)}</td>
            <td>{auditLabel(entry.action)}</td>
            <td>{entry.actorIp ?? '-'}</td>
            <td>
              {payloadField(entry, 'message') ??
                payloadField(entry, 'recipient') ??
                entry.notes ??
                '-'}
            </td>
          </tr>
        ))}
        {rows.length === 0 ? (
          <tr>
            <td colSpan={5} className="italic">
              {emptyText}
            </td>
          </tr>
        ) : null}
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
  const requestSecurityKeyRotation = useRequestFederationSecurityKeyRotation(id);
  const confirmSecurityKeyRotation = useConfirmFederationSecurityKeyRotation(id);

  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [telegramHandle, setTelegramHandle] = useState('');
  const [vkUrl, setVkUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [chiefAccountantName, setChiefAccountantName] = useState('');
  const [cashierName, setCashierName] = useState('');
  const [notificationsDisabled, setNotificationsDisabled] = useState(false);
  const [isPublicResultsClosed, setIsPublicResultsClosed] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [securityKeyCode, setSecurityKeyCode] = useState('');
  const [securityKeyRotationRequested, setSecurityKeyRotationRequested] = useState(false);

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
        [
          'federation.updated',
          'federation.test_email.sent',
          'federation.test_email.failed',
          'federation.support_ticket.created',
          'federation.support_ticket.message_created',
          'federation.support_ticket.status_updated',
          'federation.security_key_rotation.requested',
          'federation.security_key_rotation.request_failed',
          'federation.security_key_rotation.request_denied',
          'federation.security_key_rotation.confirm_denied',
          'federation.security_key.rotated',
        ].includes(entry.action),
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
      ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.dataset.intent ===
      'save-close';
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

  async function requestSecurityKeyChange() {
    if (currentPassword.trim().length === 0) {
      toast.error('Введите текущий пароль');
      return;
    }
    try {
      const result = await requestSecurityKeyRotation.mutateAsync({ currentPassword });
      setSecurityKeyRotationRequested(true);
      setCurrentPassword('');
      toast.success(`Код подтверждения отправлен: ${result.recipient}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'invalid_current_password') {
        toast.error('Текущий пароль указан неверно');
      } else if (err instanceof ApiClientError && err.code === 'contact_email_missing') {
        toast.error('Заполните email федерации перед сменой ключа');
      } else if (err instanceof ApiClientError && err.code === 'mailer_not_configured') {
        toast.error('Почтовая доставка не настроена на сервере');
      } else if (err instanceof ApiClientError && err.code === 'mailer_delivery_failed') {
        toast.error('Почтовый сервер отклонил письмо с кодом');
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  async function confirmSecurityKeyChange() {
    if (!/^\d{6}$/.test(securityKeyCode.trim())) {
      toast.error('Введите 6 цифр из письма');
      return;
    }
    try {
      await confirmSecurityKeyRotation.mutateAsync({ code: securityKeyCode.trim() });
      setSecurityKeyCode('');
      setSecurityKeyRotationRequested(false);
      toast.success('Ключ защиты федерации сменен');
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'security_key_rotation_code_invalid') {
        toast.error('Код неверный, истек или уже использован');
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  return (
    <WorkspacePage
      title={showLogins ? 'Входы в программу' : 'Обращения, настройки / Feedback, settings'}
      subtitle={f.nameRu}
      actions={
        <>
          {!showLogins ? (
            <>
              <WorkspaceButton
                tone="danger"
                form="federationSettingsForm"
                type="submit"
                data-intent="save-close"
                disabled={!canManage || update.isPending}
              >
                Записать и закрыть
              </WorkspaceButton>
              <WorkspaceButton
                form="federationSettingsForm"
                type="submit"
                disabled={!canManage || update.isPending}
              >
                {update.isPending ? t('common.saving') : 'Записать'}
              </WorkspaceButton>
            </>
          ) : null}
          <Link to="/federations/$id" params={{ id }} className="pt-link-button">
            К федерации
          </Link>
          <Link to="/federations/$id/files" params={{ id }} className="pt-link-button">
            Файлы
          </Link>
        </>
      }
      federationBar={
        <>
          <span>{f.code}</span>
          <span>{f.nameRu}</span>
        </>
      }
      tabs={[
        {
          label: (
            <Link to="/federations/$id/settings" params={{ id }}>
              Обращения, настройки
            </Link>
          ),
          icon: 'settings',
          active: !showLogins,
        },
        {
          label: (
            <Link to="/federations/$id/logins" params={{ id }}>
              Входы в программу
            </Link>
          ),
          icon: 'history',
          active: showLogins,
        },
        {
          label: (
            <Link to="/federations/$id/notifications" params={{ id }}>
              Уведомления
            </Link>
          ),
          icon: 'notifications',
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
      {showLogins ? (
        <WorkspacePanel className="p-3">
          <WorkspaceSectionTitle>История входов</WorkspaceSectionTitle>
          {auditLoading ? (
            <p className="pt-muted">Загружаем...</p>
          ) : (
            <AuditTable rows={loginRows} emptyText="Входов пока нет." />
          )}
        </WorkspacePanel>
      ) : (
        <div className="space-y-3">
          <SupportTicketsPanel federationId={id} />
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
            <WorkspacePanel className="p-3">
              <form
                id="federationSettingsForm"
                onSubmit={(event) => void submit(event)}
                className="space-y-3"
              >
                <WorkspaceSectionTitle>
                  Ваши контактные данные. Будут публиковаться на персональной странице федерации
                </WorkspaceSectionTitle>
                <div className="pt-form-grid max-w-5xl">
                  <label htmlFor="contactPhone">Телефон:</label>
                  <input
                    id="contactPhone"
                    className="pt-field"
                    value={contactPhone}
                    onChange={(event) => setContactPhone(event.target.value)}
                    disabled={!canManage}
                  />
                  <label htmlFor="contactEmail">Email:</label>
                  <input
                    id="contactEmail"
                    className="pt-field"
                    type="email"
                    value={contactEmail}
                    onChange={(event) => setContactEmail(event.target.value)}
                    disabled={!canManage}
                  />
                  <label htmlFor="telegramHandle">Telegram:</label>
                  <input
                    id="telegramHandle"
                    className="pt-field"
                    value={telegramHandle}
                    onChange={(event) => setTelegramHandle(event.target.value)}
                    disabled={!canManage}
                  />
                  <label htmlFor="vkUrl">VK:</label>
                  <input
                    id="vkUrl"
                    className="pt-field"
                    value={vkUrl}
                    onChange={(event) => setVkUrl(event.target.value)}
                    disabled={!canManage}
                  />
                  <label htmlFor="websiteUrl">Сайт:</label>
                  <input
                    id="websiteUrl"
                    className="pt-field"
                    value={websiteUrl}
                    onChange={(event) => setWebsiteUrl(event.target.value)}
                    disabled={!canManage}
                  />
                  <label htmlFor="chiefAccountantName">Главный бухгалтер:</label>
                  <input
                    id="chiefAccountantName"
                    className="pt-field"
                    value={chiefAccountantName}
                    onChange={(event) => setChiefAccountantName(event.target.value)}
                    disabled={!canManage}
                  />
                  <label htmlFor="cashierName">Кассир:</label>
                  <input
                    id="cashierName"
                    className="pt-field"
                    value={cashierName}
                    onChange={(event) => setCashierName(event.target.value)}
                    disabled={!canManage}
                  />
                  <label>Ключ защиты:</label>
                  <input className="pt-field font-mono" value={f.securityKey} readOnly />
                </div>

                <div className="pt-info-pink space-y-3">
                  <WorkspaceSectionTitle>Смена ключа защиты</WorkspaceSectionTitle>
                  <p className="text-sm">
                    Ключ используется как секрет федерации. Для смены нужен текущий пароль и код,
                    отправленный на email федерации.
                  </p>
                  <div className="pt-form-grid max-w-5xl">
                    <label htmlFor="securityKeyPassword">Текущий пароль:</label>
                    <input
                      id="securityKeyPassword"
                      className="pt-field"
                      type="password"
                      autoComplete="current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      disabled={!canManage || requestSecurityKeyRotation.isPending}
                    />
                    <label htmlFor="securityKeyCode">Код из письма:</label>
                    <input
                      id="securityKeyCode"
                      className="pt-field font-mono"
                      inputMode="numeric"
                      maxLength={6}
                      placeholder={
                        securityKeyRotationRequested ? '123456' : 'Сначала запросите код'
                      }
                      value={securityKeyCode}
                      onChange={(event) =>
                        setSecurityKeyCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      disabled={!canManage || confirmSecurityKeyRotation.isPending}
                    />
                  </div>
                  <WorkspaceToolbar>
                    <WorkspaceButton
                      type="button"
                      tone="danger"
                      onClick={() => void requestSecurityKeyChange()}
                      disabled={!canManage || requestSecurityKeyRotation.isPending}
                    >
                      {requestSecurityKeyRotation.isPending ? 'Отправляем...' : 'Отправить код'}
                    </WorkspaceButton>
                    <WorkspaceButton
                      type="button"
                      tone="green"
                      onClick={() => void confirmSecurityKeyChange()}
                      disabled={
                        !canManage ||
                        confirmSecurityKeyRotation.isPending ||
                        securityKeyCode.length !== 6
                      }
                    >
                      {confirmSecurityKeyRotation.isPending ? 'Проверяем...' : 'Сменить ключ'}
                    </WorkspaceButton>
                  </WorkspaceToolbar>
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
                    icon="save"
                    disabled={!canManage || update.isPending}
                  >
                    Сохранить настройки
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
            </WorkspacePanel>

            <WorkspacePanel className="p-3">
              <WorkspaceSectionTitle>История настроек, писем и обращений</WorkspaceSectionTitle>
              {auditLoading ? (
                <p className="pt-muted">Загружаем...</p>
              ) : (
                <AuditTable rows={supportRows} emptyText="История пока пуста." />
              )}
            </WorkspacePanel>
          </div>
        </div>
      )}
    </WorkspacePage>
  );
}
