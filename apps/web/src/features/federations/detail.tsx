import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  WorkspaceButton,
  WorkspaceCheckbox,
  WorkspaceIcon,
  WorkspaceMenuIcon,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceSectionTitle,
  WorkspaceToolbar,
} from '../../components/workspace.js';
import { useAuthStore } from '../../lib/auth/store.js';
import { ApiClientError } from '../../lib/api-client.js';
import { useCountries, useRegions } from '../../lib/references-api.js';
import { setLocale } from '../../lib/i18n/index.js';
import { formatRub, rubToKopecks } from './format.js';
import {
  type FederationDashboardResponse,
  useCreateFederationReceipt,
  useCreateFederationWriteoff,
  useFederationDashboard,
  useTestFederationEmail,
  useUpdateFederation,
} from './api.js';
import { ChaptersCard } from './chapters-card.js';

function todayInput(): string {
  return new Date().toISOString().slice(0, 10);
}

function nextYearInput(): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('ru-RU');
}

function formatNumber(value: number | null | undefined, suffix = ''): string {
  if (value === null || value === undefined) return '-';
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(value)}${suffix}`;
}

function normalizeNumber(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

interface ConnectionSample {
  id: number;
  checkedAt: string;
  latencyMs: number | null;
  ok: boolean;
}

interface PowerTableReferenceRow {
  federationCode?: string;
  dsp?: string;
  disciplineCode?: string;
  disciplineLabel?: string;
  levelCode?: string;
  levelLabel?: string;
  countryCode?: string;
  countryLabel?: string;
  year?: string;
  dataDate?: string | null;
  cells: string[];
}

interface PowerTableOpenData {
  generatedAt: string;
  counts?: {
    normRows?: number;
    recordRows?: number;
    athleteRatingRows?: number;
    coachRatingRows?: number;
  };
  publicReferences?: {
    normRows?: PowerTableReferenceRow[];
    recordRows?: PowerTableReferenceRow[];
    athleteRatingRows?: PowerTableReferenceRow[];
    coachRatingRows?: PowerTableReferenceRow[];
  };
}

function connectionQuality(latencyMs: number | null, ok: boolean): string {
  if (!ok || latencyMs === null) return 'нет связи';
  if (latencyMs <= 300) return 'отлично';
  if (latencyMs <= 800) return 'нормальное';
  return 'нестабильно';
}

function formatLatency(latencyMs: number | null): string {
  return latencyMs === null ? 'нет ответа' : `[${latencyMs}мс]`;
}

function formatConnectionTime(value: string): string {
  return new Date(value).toLocaleString('ru-RU');
}

function canManageFederation(
  user: ReturnType<typeof useAuthStore.getState>['user'],
  federationId: string,
  roles: readonly string[],
): boolean {
  return (
    user?.roles.some(
      (r) =>
        r.role === 'platform_admin' || (roles.includes(r.role) && r.federationId === federationId),
    ) ?? false
  );
}

function hasGlobalRole(
  user: ReturnType<typeof useAuthStore.getState>['user'],
  role: string,
): boolean {
  return user?.roles.some((assignment) => assignment.role === role) ?? false;
}

function DisabledMenuButton({
  icon,
  children,
}: {
  icon: Parameters<typeof WorkspaceMenuIcon>[0]['name'];
  children: ReactNode;
}) {
  return (
    <button type="button" className="pt-menu-button is-disabled" disabled>
      <WorkspaceMenuIcon name={icon} />
      <span>{children}</span>
    </button>
  );
}

function ReceiptForm({ federationId }: { federationId: string }) {
  const create = useCreateFederationReceipt(federationId);
  const [number, setNumber] = useState(`R-${Date.now().toString(36).toUpperCase()}`);
  const [date, setDate] = useState(todayInput());
  const [nominationsCount, setNominationsCount] = useState('10');
  const [amountRub, setAmountRub] = useState('0');
  const [paymentMethod, setPaymentMethod] = useState<
    'bank_transfer' | 'card' | 'sbp' | 'cash' | 'other'
  >('bank_transfer');
  const [expiresAt, setExpiresAt] = useState(nextYearInput());
  const [externalReference, setExternalReference] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        number: number.trim(),
        date,
        nominationsCount: Math.max(1, Math.trunc(normalizeNumber(nominationsCount))),
        amountKopecks: rubToKopecks(amountRub),
        paymentMethod,
        expiresAt,
        externalReference: externalReference.trim() || null,
      });
      toast.success('Поступление добавлено');
      setNumber(`R-${Date.now().toString(36).toUpperCase()}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'number_taken') {
        toast.error('Такой номер уже есть');
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid grid-cols-1 gap-2 lg:grid-cols-6">
      <label className="pt-label">
        Номер
        <input
          className="pt-field mt-1 w-full"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          required
        />
      </label>
      <label className="pt-label">
        Дата
        <input
          className="pt-field mt-1 w-full"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </label>
      <label className="pt-label">
        Номинаций
        <input
          className="pt-field mt-1 w-full"
          type="number"
          min="1"
          value={nominationsCount}
          onChange={(e) => setNominationsCount(e.target.value)}
          required
        />
      </label>
      <label className="pt-label">
        Сумма, ₽
        <input
          className="pt-field mt-1 w-full"
          type="number"
          min="0"
          step="0.01"
          value={amountRub}
          onChange={(e) => setAmountRub(e.target.value)}
          required
        />
      </label>
      <label className="pt-label">
        Метод
        <select
          className="pt-select mt-1 w-full"
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
        >
          <option value="bank_transfer">Банк</option>
          <option value="card">Карта</option>
          <option value="sbp">СБП</option>
          <option value="cash">Наличные</option>
          <option value="other">Другое</option>
        </select>
      </label>
      <label className="pt-label">
        Действует до
        <input
          className="pt-field mt-1 w-full"
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          required
        />
      </label>
      <label className="pt-label lg:col-span-5">
        Внешняя ссылка / комментарий
        <input
          className="pt-field mt-1 w-full"
          value={externalReference}
          onChange={(e) => setExternalReference(e.target.value)}
        />
      </label>
      <div className="flex items-end">
        <WorkspaceButton type="submit" tone="green" disabled={create.isPending}>
          {create.isPending ? 'Сохраняем...' : 'Добавить'}
        </WorkspaceButton>
      </div>
    </form>
  );
}

function WriteoffForm({
  federationId,
  dashboard,
}: {
  federationId: string;
  dashboard: FederationDashboardResponse;
}) {
  const create = useCreateFederationWriteoff(federationId);
  const [number, setNumber] = useState(`W-${Date.now().toString(36).toUpperCase()}`);
  const [date, setDate] = useState(todayInput());
  const [nominationsCount, setNominationsCount] = useState('1');
  const [competitionId, setCompetitionId] = useState('');
  const [linkedReceiptId, setLinkedReceiptId] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        number: number.trim(),
        date,
        nominationsCount: Math.max(1, Math.trunc(normalizeNumber(nominationsCount))),
        competitionId: competitionId || null,
        linkedReceiptId: linkedReceiptId || null,
      });
      toast.success('Списание добавлено');
      setNumber(`W-${Date.now().toString(36).toUpperCase()}`);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'number_taken') {
        toast.error('Такой номер уже есть');
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="grid grid-cols-1 gap-2 lg:grid-cols-5">
      <label className="pt-label">
        Номер
        <input
          className="pt-field mt-1 w-full"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          required
        />
      </label>
      <label className="pt-label">
        Дата
        <input
          className="pt-field mt-1 w-full"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
        />
      </label>
      <label className="pt-label">
        Номинаций
        <input
          className="pt-field mt-1 w-full"
          type="number"
          min="1"
          value={nominationsCount}
          onChange={(e) => setNominationsCount(e.target.value)}
          required
        />
      </label>
      <label className="pt-label">
        Соревнование
        <select
          className="pt-select mt-1 w-full"
          value={competitionId}
          onChange={(e) => setCompetitionId(e.target.value)}
        >
          <option value="">Без привязки</option>
          {dashboard.competitions.map((competition) => (
            <option key={competition.id} value={competition.id}>
              {competition.code} · {competition.nameRu}
            </option>
          ))}
        </select>
      </label>
      <label className="pt-label">
        Поступление
        <select
          className="pt-select mt-1 w-full"
          value={linkedReceiptId}
          onChange={(e) => setLinkedReceiptId(e.target.value)}
        >
          <option value="">Без привязки</option>
          {dashboard.receipts.map((receipt) => (
            <option key={receipt.id} value={receipt.id}>
              {receipt.number}
            </option>
          ))}
        </select>
      </label>
      <div className="lg:col-span-5">
        <WorkspaceButton type="submit" tone="green" disabled={create.isPending}>
          {create.isPending ? 'Сохраняем...' : 'Добавить списание'}
        </WorkspaceButton>
      </div>
    </form>
  );
}

function MetricStrip({ dashboard }: { dashboard: FederationDashboardResponse }) {
  return (
    <div className="pt-metric-strip">
      <div className="pt-metric-cell">
        <span>Поступило номинаций</span>
        <strong>{dashboard.balance.receivedNominations}</strong>
      </div>
      <div className="pt-metric-cell">
        <span>Списано номинаций</span>
        <strong>{dashboard.balance.consumedNominations}</strong>
      </div>
      <div className="pt-metric-cell">
        <span>Остаток</span>
        <strong>{dashboard.balance.remainingNominations}</strong>
      </div>
      <div className="pt-metric-cell">
        <span>Сумма поступлений</span>
        <strong>{formatRub(dashboard.balance.receivedAmountKopecks)}</strong>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="pt-muted">{label}</dt>
      <dd>{value || <span className="italic text-gray-500">-</span>}</dd>
    </>
  );
}

function ComparisonBars({ rows }: { rows: FederationDashboardResponse['regionalComparison'] }) {
  const max = Math.max(...rows.map((row) => row.nominations), 1);
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.federationId} className="grid grid-cols-[190px_1fr_56px] items-center gap-3">
          <div className="truncate text-blue-900">{row.nameRu}</div>
          <div className="h-5 border border-gray-400 bg-white">
            <div
              className="h-full bg-[#9dff9d]"
              style={{ width: `${Math.max(4, (row.nominations / max) * 100)}%` }}
            />
          </div>
          <div className="text-right tabular-nums">{row.nominations}</div>
        </div>
      ))}
    </div>
  );
}

function competitionOptionLabel(
  competition: FederationDashboardResponse['competitions'][number],
): string {
  const startDate = formatDate(competition.startDate);
  return `${competition.code} · ${competition.nameRu} · ${startDate} · ${competition.status}`;
}

function recordScopeLabel(scope: FederationDashboardResponse['records'][number]['scope']): string {
  switch (scope) {
    case 'federation':
      return 'Федерация';
    case 'national':
      return 'Национальный';
    case 'continental':
      return 'Континентальный';
    case 'world':
      return 'Мировой';
  }
}

function federationRecordAthleteName(
  record: FederationDashboardResponse['records'][number],
): string {
  return [record.athlete.lastName, record.athlete.firstName, record.athlete.middleName]
    .filter(Boolean)
    .join(' ');
}

function referenceCellsLabel(row: PowerTableReferenceRow): string {
  return row.cells.filter(Boolean).join(' · ') || '-';
}

function PowerTableReferencePanel({ data }: { data: PowerTableOpenData }) {
  const references = data.publicReferences;
  const recordRows = references?.recordRows ?? [];
  const normRows = references?.normRows ?? [];
  const athleteRatingRows = references?.athleteRatingRows ?? [];
  const coachRatingRows = references?.coachRatingRows ?? [];

  return (
    <WorkspacePanel className="p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <WorkspaceSectionTitle>PowerTable public: рекорды и рейтинги</WorkspaceSectionTitle>
        <Link to="/open-data/powertable" className="pt-link-button">
          <WorkspaceIcon name="records" />
          Открытые данные
        </Link>
      </div>
      <div className="pt-metric-strip">
        <div className="pt-metric-cell">
          <span>Рекорды</span>
          <strong>{recordRows.length}</strong>
        </div>
        <div className="pt-metric-cell">
          <span>Нормативы</span>
          <strong>{normRows.length}</strong>
        </div>
        <div className="pt-metric-cell">
          <span>Рейтинг спортсменов</span>
          <strong>{athleteRatingRows.length}</strong>
        </div>
        <div className="pt-metric-cell">
          <span>Рейтинг тренеров</span>
          <strong>{coachRatingRows.length}</strong>
        </div>
      </div>
      <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
        <table className="pt-grid">
          <thead>
            <tr>
              <th>Уровень</th>
              <th className="text-left">Дисциплина</th>
              <th className="text-left">Строка PowerTable</th>
              <th>Дата выгрузки</th>
            </tr>
          </thead>
          <tbody>
            {recordRows.map((row, index) => (
              <tr key={`${row.dsp ?? 'record'}-${row.levelCode ?? 'level'}-${index}`}>
                <td>{row.levelLabel ?? row.levelCode ?? '-'}</td>
                <td className="text-left">{row.disciplineLabel ?? row.disciplineCode ?? '-'}</td>
                <td className="text-left">{referenceCellsLabel(row)}</td>
                <td>{row.dataDate ?? '-'}</td>
              </tr>
            ))}
            {recordRows.length === 0 ? (
              <tr>
                <td colSpan={4} className="italic">
                  Публичные рекорды PowerTable в выгрузке не найдены.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </WorkspacePanel>
  );
}

export default function FederationDetailFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/federations/$id' });
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, error } = useFederationDashboard(id);
  const { data: countriesData } = useCountries();
  const countryRow = countriesData?.countries.find(
    (c) => c.codeIso2 === data?.federation.countryCode,
  );
  const { data: regionsData } = useRegions(countryRow?.id);
  const update = useUpdateFederation(id);
  const testEmail = useTestFederationEmail(id);
  const [connectionSamples, setConnectionSamples] = useState<ConnectionSample[]>([]);
  const [selectedCompetitionId, setSelectedCompetitionId] = useState('');
  const [powerTableOpenData, setPowerTableOpenData] = useState<PowerTableOpenData | null>(null);
  const averageLatencyMs = useMemo(() => {
    const healthySamples = connectionSamples.filter(
      (sample): sample is ConnectionSample & { latencyMs: number } =>
        sample.ok && sample.latencyMs !== null,
    );
    if (healthySamples.length === 0) return null;
    return Math.round(
      healthySamples.reduce((sum, sample) => sum + sample.latencyMs, 0) / healthySamples.length,
    );
  }, [connectionSamples]);

  useEffect(() => {
    let cancelled = false;

    async function probeConnection() {
      const checkedAt = new Date().toISOString();
      const startedAt = performance.now();
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        const latencyMs = Math.round(performance.now() - startedAt);
        if (cancelled) return;
        setConnectionSamples((samples) =>
          [{ id: Date.now(), checkedAt, latencyMs, ok: response.ok }, ...samples].slice(0, 4),
        );
      } catch {
        if (cancelled) return;
        setConnectionSamples((samples) =>
          [{ id: Date.now(), checkedAt, latencyMs: null, ok: false }, ...samples].slice(0, 4),
        );
      }
    }

    void probeConnection();
    const timer = window.setInterval(() => void probeConnection(), 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (data?.federation.code !== '0010') {
      setPowerTableOpenData(null);
      return () => {
        cancelled = true;
      };
    }

    fetch('/data/powertable/open-data.json', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as PowerTableOpenData;
      })
      .then((payload) => {
        if (!cancelled) setPowerTableOpenData(payload);
      })
      .catch(() => {
        if (!cancelled) setPowerTableOpenData(null);
      });

    return () => {
      cancelled = true;
    };
  }, [data?.federation.code]);

  useEffect(() => {
    const competitions = data?.competitions ?? [];
    if (competitions.length === 0) {
      if (selectedCompetitionId) setSelectedCompetitionId('');
      return;
    }
    if (!competitions.some((competition) => competition.id === selectedCompetitionId)) {
      setSelectedCompetitionId(competitions[0]?.id ?? '');
    }
  }, [data?.competitions, selectedCompetitionId]);

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
  const regionRow = f.regionCode
    ? regionsData?.regions.find((r) => r.codeIso === f.regionCode)
    : undefined;
  const countryLabel = countryRow ? `${countryRow.nameRu} (${countryRow.codeIso2})` : f.countryCode;
  const regionLabel = regionRow ? regionRow.nameRu : f.regionCode;
  const isPlatformAdmin = hasGlobalRole(user, 'platform_admin');
  const canEditFederation = canManageFederation(user, f.id, ['federation_admin']);
  const canManageAccounting = canManageFederation(user, f.id, ['federation_admin', 'accountant']);
  const canCreateCompetition = isPlatformAdmin || canEditFederation;
  const selectedCompetition = data.competitions.find(
    (competition) => competition.id === selectedCompetitionId,
  );
  const activeCompetitionId = selectedCompetition?.id;

  async function toggleSettings(next: {
    notificationsDisabled?: boolean;
    isPublicResultsClosed?: boolean;
  }) {
    try {
      await update.mutateAsync(next);
      toast.success('Настройки обновлены');
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

  function showFederationInfo() {
    toast.success(`${f.code} · ${countryLabel}`);
  }

  function switchToEnglish() {
    setLocale('en');
    toast.success('Language switched to English');
  }

  return (
    <WorkspacePage
      title={`${f.nameRu} (Федерация)`}
      subtitle={`${f.nameEn} · ${f.code} · ${countryLabel}`}
      actions={
        <>
          <Link to="/federations" className="pt-link-button pt-button-danger">
            К списку
          </Link>
          <Link to="/federations/$id/settings" params={{ id }} className="pt-link-button">
            Настройки
          </Link>
          <Link to="/federations/$id/inventory" params={{ id }} className="pt-link-button">
            <WorkspaceIcon name="inventory" />
            Склад
          </Link>
          <Link to="/federations/$id/notifications" params={{ id }} className="pt-link-button">
            <WorkspaceIcon name="notifications" />
            Уведомления
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
        { label: 'Основные настройки', icon: 'settings', active: true },
        { label: 'Членские взносы', icon: 'billing' },
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
            <Link to="/federations/$id/inventory" params={{ id }}>
              Склад
            </Link>
          ),
          icon: 'inventory',
        },
        {
          label: (
            <Link to="/federations/$id/files" params={{ id }}>
              Файлы
            </Link>
          ),
          icon: 'files',
        },
        {
          label: (
            <Link to="/federations/$id/logins" params={{ id }}>
              История
            </Link>
          ),
          icon: 'history',
        },
      ]}
    >
      <div className="pt-split">
        <aside className="space-y-2">
          {isPlatformAdmin ? (
            <Link className="pt-link" to="/lookups">
              Справочники
            </Link>
          ) : null}
          <Link to="/competitions" className="pt-menu-button">
            <WorkspaceMenuIcon name="competition" />
            <span>Соревнования</span>
          </Link>
          <Link to="/athletes" className="pt-menu-button">
            <WorkspaceMenuIcon name="athletes" />
            <span>Спортсмены</span>
          </Link>
          {data.competitions.length > 0 ? (
            <label className="pt-label block space-y-1 rounded border border-[var(--pt-border)] bg-[var(--pt-panel)] p-2">
              Рабочее соревнование
              <select
                className="pt-select w-full"
                value={selectedCompetitionId}
                onChange={(event) => setSelectedCompetitionId(event.target.value)}
              >
                {data.competitions.map((competition) => (
                  <option key={competition.id} value={competition.id}>
                    {competitionOptionLabel(competition)}
                  </option>
                ))}
              </select>
              <span className="block text-xs text-[var(--pt-muted)]">
                Все разделы ниже откроются для выбранного соревнования.
              </span>
            </label>
          ) : (
            <div className="pt-info-yellow">
              У федерации пока нет соревнований. Создайте соревнование, чтобы открыть номинации,
              отчеты и табло.
            </div>
          )}
          {activeCompetitionId ? (
            <>
              <Link
                to="/competitions/$id/nominations"
                params={{ id: activeCompetitionId }}
                className="pt-menu-button"
              >
                <WorkspaceMenuIcon name="nomination" />
                <span>Номинации спортсменов</span>
              </Link>
              <Link
                to="/competitions/$id/judges"
                params={{ id: activeCompetitionId }}
                className="pt-menu-button"
              >
                <WorkspaceMenuIcon name="judges" />
                <span>Номинации судей</span>
              </Link>
              <Link
                to="/competitions/$id/schedule"
                params={{ id: activeCompetitionId }}
                className="pt-menu-button"
              >
                <WorkspaceMenuIcon name="flow" />
                <span>Распределение по потокам и группам</span>
              </Link>
            </>
          ) : (
            <>
              {canCreateCompetition ? (
                <>
                  <Link to="/competitions/new" className="pt-menu-button">
                    <WorkspaceMenuIcon name="nomination" />
                    <span>Номинации спортсменов</span>
                  </Link>
                  <Link to="/competitions/new" className="pt-menu-button">
                    <WorkspaceMenuIcon name="judges" />
                    <span>Номинации судей</span>
                  </Link>
                  <Link to="/competitions/new" className="pt-menu-button">
                    <WorkspaceMenuIcon name="flow" />
                    <span>Распределение по потокам и группам</span>
                  </Link>
                </>
              ) : (
                <>
                  <DisabledMenuButton icon="nomination">Номинации спортсменов</DisabledMenuButton>
                  <DisabledMenuButton icon="judges">Номинации судей</DisabledMenuButton>
                  <DisabledMenuButton icon="flow">
                    Распределение по потокам и группам
                  </DisabledMenuButton>
                </>
              )}
            </>
          )}
          {activeCompetitionId ? (
            <>
              <Link
                to="/competitions/$id/reports"
                params={{ id: activeCompetitionId }}
                className="pt-menu-button"
              >
                <WorkspaceMenuIcon name="reports" />
                <span>Отчеты, печатные формы</span>
              </Link>
              <Link
                to="/competitions/$id/certificates"
                params={{ id: activeCompetitionId }}
                className="pt-menu-button"
              >
                <WorkspaceMenuIcon name="certificate" />
                <span>Печать грамот</span>
              </Link>
              <Link
                to="/competitions/$id/awards"
                params={{ id: activeCompetitionId }}
                className="pt-menu-button"
              >
                <WorkspaceMenuIcon name="awards" />
                <span>Награждение</span>
              </Link>
              <Link
                to="/competitions/$id/operator"
                params={{ id: activeCompetitionId }}
                className="pt-menu-button"
              >
                <WorkspaceMenuIcon name="operator" />
                <span>Оператор табло</span>
              </Link>
            </>
          ) : (
            <>
              {canCreateCompetition ? (
                <>
                  <Link to="/competitions/new" className="pt-menu-button">
                    <WorkspaceMenuIcon name="reports" />
                    <span>Отчеты, печатные формы</span>
                  </Link>
                  <Link to="/competitions/new" className="pt-menu-button">
                    <WorkspaceMenuIcon name="certificate" />
                    <span>Печать грамот</span>
                  </Link>
                  <Link to="/competitions/new" className="pt-menu-button">
                    <WorkspaceMenuIcon name="awards" />
                    <span>Награждение</span>
                  </Link>
                  <Link to="/competitions/new" className="pt-menu-button">
                    <WorkspaceMenuIcon name="operator" />
                    <span>Оператор табло</span>
                  </Link>
                </>
              ) : (
                <>
                  <DisabledMenuButton icon="reports">Отчеты, печатные формы</DisabledMenuButton>
                  <DisabledMenuButton icon="certificate">Печать грамот</DisabledMenuButton>
                  <DisabledMenuButton icon="awards">Награждение</DisabledMenuButton>
                  <DisabledMenuButton icon="operator">Оператор табло</DisabledMenuButton>
                </>
              )}
            </>
          )}
          <Link to="/federations/$id/inventory" params={{ id }} className="pt-menu-button">
            <WorkspaceMenuIcon name="inventory" />
            <span>Склад</span>
          </Link>
          <Link to="/federations/$id/notifications" params={{ id }} className="pt-menu-button">
            <WorkspaceMenuIcon name="notifications" />
            <span>Уведомления</span>
          </Link>

          <table className="pt-status-table">
            <tbody>
              <tr>
                <td>Среднее значение качества связи с сервером</td>
                <td>
                  {connectionSamples.length > 0
                    ? `${formatLatency(averageLatencyMs)} - ${connectionQuality(averageLatencyMs, averageLatencyMs !== null)}`
                    : 'выполняется...'}
                </td>
              </tr>
              {connectionSamples.map((sample) => (
                <tr key={sample.id}>
                  <td>{formatConnectionTime(sample.checkedAt)}. Задержка</td>
                  <td>
                    {formatLatency(sample.latencyMs)} -{' '}
                    {connectionQuality(sample.latencyMs, sample.ok)}
                  </td>
                </tr>
              ))}
              {connectionSamples.length === 0 ? (
                <tr>
                  <td>Проверка связи</td>
                  <td>выполняется...</td>
                </tr>
              ) : null}
            </tbody>
          </table>
          {activeCompetitionId ? (
            <Link
              to="/broadcast/competitions/$id"
              params={{ id: activeCompetitionId }}
              className="pt-link pt-inline-icon"
            >
              <WorkspaceIcon name="scoreboard" />
              Информационные таблицы для трансляций
            </Link>
          ) : canCreateCompetition ? (
            <Link className="pt-link pt-inline-icon" to="/competitions/new">
              <WorkspaceIcon name="scoreboard" />
              Информационные таблицы для трансляций
            </Link>
          ) : (
            <span className="pt-muted pt-inline-icon">
              <WorkspaceIcon name="scoreboard" />
              Информационные таблицы для трансляций
            </span>
          )}
          {activeCompetitionId ? (
            <Link
              to="/results/competitions/$id"
              params={{ id: activeCompetitionId }}
              className="pt-link pt-inline-icon"
            >
              <WorkspaceIcon name="records" />
              Публичные результаты
            </Link>
          ) : (
            <span className="pt-muted pt-inline-icon">
              <WorkspaceIcon name="records" />
              Публичные результаты
            </span>
          )}
        </aside>

        <main className="space-y-3">
          <WorkspaceToolbar>
            <WorkspaceButton
              type="button"
              icon="info"
              aria-label="Информация"
              onClick={showFederationInfo}
            />
            <Link to="/federations/$id/settings" params={{ id }} className="pt-link-button">
              <WorkspaceIcon name="settings" />
              Обращения, настройки / Feedback, settings
            </Link>
            <Link to="/federations/$id/logins" params={{ id }} className="pt-link-button">
              <WorkspaceIcon name="history" />
              Входы в программу
            </Link>
          </WorkspaceToolbar>

          <div className="grid grid-cols-[42px_205px_42px_minmax(160px,1fr)_minmax(160px,1fr)_110px] gap-6 max-xl:grid-cols-1">
            <div className="pt-lang-badge">RU</div>
            <WorkspaceButton type="button" onClick={switchToEnglish}>
              Switch the language to English
            </WorkspaceButton>
            <div className="pt-lang-badge">EN</div>
            <input className="pt-field" value={f.contactPhone ?? ''} readOnly />
            <input className="pt-field" value={f.telegramHandle ?? ''} readOnly />
            <WorkspaceButton
              type="button"
              onClick={() => void sendTestEmail()}
              disabled={!canEditFederation || testEmail.isPending}
            >
              Тест письмо
            </WorkspaceButton>
          </div>

          <div className="pt-section-title">
            Ваши контактные данные. Будут публиковаться на персональной странице федерации
          </div>
          <MetricStrip dashboard={data} />

          <div className="pt-info-green space-y-2">
            <WorkspaceCheckbox
              checked={f.notificationsDisabled}
              disabled={!canEditFederation || update.isPending}
              onChange={(checked) => void toggleSettings({ notificationsDisabled: checked })}
              label="Не отправлять уведомления о новых регистрациях заявок на участие"
            />
            <WorkspaceCheckbox
              checked={f.isPublicResultsClosed}
              disabled={!canEditFederation || update.isPending}
              onChange={(checked) => void toggleSettings({ isPublicResultsClosed: checked })}
              label="Закрыть свободный онлайн доступ к результатам соревнований"
            />
          </div>

          <WorkspacePanel className="p-3">
            <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-[230px_1fr] sm:gap-x-6">
              <Field label={t('federations.fields.country')} value={countryLabel} />
              <Field label={t('federations.fields.region')} value={regionLabel} />
              <Field
                label={t('federations.fields.tariffRub')}
                value={formatRub(f.billingTariffKopecksPerNomination)}
              />
              <Field label={t('federations.fields.contactPhone')} value={f.contactPhone} />
              <Field label={t('federations.fields.contactEmail')} value={f.contactEmail} />
              <Field label={t('federations.fields.telegram')} value={f.telegramHandle} />
              <Field label={t('federations.fields.website')} value={f.websiteUrl} />
              <Field label={t('federations.fields.accountant')} value={f.chiefAccountantName} />
              <Field label={t('federations.fields.cashier')} value={f.cashierName} />
              <Field
                label="Ключ защиты"
                value={<span className="font-mono text-xs">{f.securityKey}</span>}
              />
              <Field label="ID" value={<span className="font-mono text-xs">{f.id}</span>} />
              <Field
                label={t('federations.fields.createdAt')}
                value={new Date(f.createdAt).toLocaleString()}
              />
            </dl>
          </WorkspacePanel>

          <WorkspacePanel className="p-3 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <WorkspaceSectionTitle>Соревнования федерации</WorkspaceSectionTitle>
              <Link to="/competitions" className="pt-link-button">
                <WorkspaceIcon name="competition" />
                Все соревнования
              </Link>
            </div>
            <div className="overflow-x-auto overflow-y-auto max-h-[420px]">
              <table className="pt-grid">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Код</th>
                    <th className="text-left">Название</th>
                    <th>Статус</th>
                    <th>Номинаций</th>
                    <th>Рекордов</th>
                    <th>Карточка</th>
                  </tr>
                </thead>
                <tbody>
                  {data.competitions.map((competition, index) => (
                    <tr key={competition.id} className={index === 0 ? 'is-selected' : undefined}>
                      <td>{formatDate(competition.startDate)}</td>
                      <td className="font-mono text-xs">{competition.code}</td>
                      <td className="text-left">{competition.nameRu}</td>
                      <td>{competition.status}</td>
                      <td className="text-right tabular-nums">{competition._count.nominations}</td>
                      <td className="text-right tabular-nums">{competition._count.records}</td>
                      <td>
                        <Link
                          to="/competitions/$id"
                          params={{ id: competition.id }}
                          className="pt-link"
                        >
                          открыть
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {data.competitions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="italic">
                        У федерации пока нет соревнований.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </WorkspacePanel>

          <WorkspacePanel className="p-3 space-y-3">
            <WorkspaceSectionTitle>Рекорды федерации</WorkspaceSectionTitle>
            <div className="overflow-x-auto overflow-y-auto max-h-[420px]">
              <table className="pt-grid">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Уровень</th>
                    <th className="text-left">Спортсмен</th>
                    <th className="text-left">Соревнование</th>
                    <th className="text-left">Дисциплина</th>
                    <th>Дивизион</th>
                    <th>ВК</th>
                    <th>Результат</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record, index) => (
                    <tr key={record.id} className={index === 0 ? 'is-selected' : undefined}>
                      <td>{formatDate(record.achievedOn)}</td>
                      <td>{recordScopeLabel(record.scope)}</td>
                      <td className="text-left">
                        <Link
                          to="/athletes/$id"
                          params={{ id: record.athlete.id }}
                          className="pt-link"
                        >
                          {federationRecordAthleteName(record)}
                        </Link>
                      </td>
                      <td className="text-left">
                        <Link
                          to="/competitions/$id"
                          params={{ id: record.competition.id }}
                          className="pt-link"
                        >
                          {record.competition.nameRu}
                        </Link>
                      </td>
                      <td className="text-left">{record.discipline.nameRu}</td>
                      <td>{record.division.nameRu}</td>
                      <td>{record.weightClass.nameRu}</td>
                      <td className="text-right tabular-nums">
                        {formatNumber(record.result, ' кг')}
                      </td>
                      <td>{record.ratifiedAt ? 'ратифицирован' : 'не ратифицирован'}</td>
                    </tr>
                  ))}
                  {data.records.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="italic">
                        Нормализованные рекорды в базе пока не зафиксированы.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </WorkspacePanel>

          {powerTableOpenData ? <PowerTableReferencePanel data={powerTableOpenData} /> : null}

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <WorkspacePanel className="p-3">
              <WorkspaceSectionTitle>Членские взносы / поступления</WorkspaceSectionTitle>
              {canManageAccounting ? <ReceiptForm federationId={f.id} /> : null}
              <div className="mt-3 overflow-x-auto">
                <table className="pt-grid">
                  <thead>
                    <tr>
                      <th>Номер</th>
                      <th>Дата</th>
                      <th>Номинаций</th>
                      <th>Сумма</th>
                      <th>До</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.receipts.map((receipt, index) => (
                      <tr key={receipt.id} className={index === 0 ? 'is-selected' : 'is-green'}>
                        <td>{receipt.number}</td>
                        <td>{formatDate(receipt.date)}</td>
                        <td className="text-right tabular-nums">{receipt.nominationsCount}</td>
                        <td className="text-right tabular-nums">
                          {formatRub(receipt.amountKopecks)}
                        </td>
                        <td>{formatDate(receipt.expiresAt)}</td>
                      </tr>
                    ))}
                    {data.receipts.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="italic">
                          Поступлений пока нет.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </WorkspacePanel>

            <WorkspacePanel className="p-3">
              <WorkspaceSectionTitle>Списания номинаций</WorkspaceSectionTitle>
              {canManageAccounting ? <WriteoffForm federationId={f.id} dashboard={data} /> : null}
              <div className="mt-3 overflow-x-auto">
                <table className="pt-grid">
                  <thead>
                    <tr>
                      <th>Номер</th>
                      <th>Дата</th>
                      <th>Номинаций</th>
                      <th>Соревнование</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.writeoffs.map((writeoff, index) => (
                      <tr key={writeoff.id} className={index === 0 ? 'is-selected' : 'is-yellow'}>
                        <td>{writeoff.number}</td>
                        <td>{formatDate(writeoff.date)}</td>
                        <td className="text-right tabular-nums">{writeoff.nominationsCount}</td>
                        <td>{writeoff.competition?.nameRu ?? '-'}</td>
                      </tr>
                    ))}
                    {data.writeoffs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="italic">
                          Списаний пока нет.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </WorkspacePanel>
          </div>

          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <WorkspacePanel className="p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <WorkspaceSectionTitle>Файлы федерации</WorkspaceSectionTitle>
                <Link to="/federations/$id/files" params={{ id }} className="pt-link-button">
                  <WorkspaceIcon name="files" />
                  Открыть
                </Link>
              </div>
              <table className="pt-grid">
                <thead>
                  <tr>
                    <th>Имя файла</th>
                    <th>Тип</th>
                    <th>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {f.attachments.map((file, index) => (
                    <tr key={file.id} className={index === 0 ? 'is-selected' : undefined}>
                      <td>{file.filename}</td>
                      <td>{file.mimeType}</td>
                      <td>{formatDate(file.uploadedAt)}</td>
                    </tr>
                  ))}
                  {f.attachments.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="italic">
                        Файлы пока не загружены.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </WorkspacePanel>

            <WorkspacePanel className="p-3">
              <WorkspaceSectionTitle>График</WorkspaceSectionTitle>
              <ComparisonBars rows={data.regionalComparison} />
            </WorkspacePanel>
          </div>

          <div className="pt-info-pink">
            Telegram-уведомления:{' '}
            {data.telegramSubscriptions.length > 0
              ? `подключено чатов: ${data.telegramSubscriptions.length}.`
              : 'выпустите одноразовый код на странице уведомлений и отправьте его в боте Streetlifting.'}
          </div>

          <ChaptersCard federationId={f.id} />
        </main>
      </div>
    </WorkspacePage>
  );
}
