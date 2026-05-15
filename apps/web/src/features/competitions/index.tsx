import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../lib/auth/store.js';
import { WorkspaceButton, WorkspacePage } from '../../components/workspace.js';
import { formatRub } from '../../lib/money.js';
import { useCompetitions } from './api.js';
import { formatDate } from './format.js';

function isUpcoming(startDate: string): boolean {
  const start = new Date(startDate);
  if (Number.isNaN(start.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  start.setHours(0, 0, 0, 0);
  return start >= today;
}

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function CompetitionsListFeature() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const canCreate =
    user?.roles.some((r) => r.role === 'platform_admin' || r.role === 'federation_admin') ?? false;
  const { data, isLoading, error, refetch, isFetching } = useCompetitions();
  const [showFromDate, setShowFromDate] = useState(todayInputValue());
  const [search, setSearch] = useState('');

  const visible = useMemo(() => {
    const list = data?.competitions ?? [];
    const fromTs = new Date(showFromDate).getTime();
    const term = search.trim().toLowerCase();
    return list.filter((c) => {
      const endTs = new Date(c.endDate).getTime();
      if (Number.isFinite(fromTs) && Number.isFinite(endTs) && endTs < fromTs) return false;
      if (!term) return true;
      return [c.code, c.nameRu, c.nameEn, c.city ?? '', c.federation.nameRu, c.federation.code]
        .join(' ')
        .toLowerCase()
        .includes(term);
    });
  }, [data?.competitions, showFromDate, search]);

  const subtitle = data
    ? `${t('competitions.subtitle')} · ${t('competitions.count', { count: data.total })}`
    : t('competitions.subtitle');

  return (
    <WorkspacePage
      title={t('competitions.title')}
      subtitle={subtitle}
      actions={
        canCreate ? (
          <Link to="/competitions/new" className="pt-link-button">
            {t('competitions.create')}
          </Link>
        ) : null
      }
    >
      <div className="pt-toolbar mb-2 flex flex-wrap items-center gap-2">
        {canCreate ? (
          <Link to="/competitions/new" className="pt-link-button">
            Создать
          </Link>
        ) : null}
        <WorkspaceButton
          type="button"
          icon="refresh"
          tone="green"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          {isFetching ? t('common.loading') : 'Пересчёт соревнований'}
        </WorkspaceButton>
        <label htmlFor="competitions-from" className="pt-label">
          Отображать с даты:
        </label>
        <input
          id="competitions-from"
          type="date"
          className="pt-field w-40"
          value={showFromDate}
          onChange={(e) => setShowFromDate(e.target.value)}
        />
        <input
          type="search"
          className="pt-field ml-auto max-w-xs"
          placeholder="Поиск (Ctrl+F)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <p className="pt-muted text-sm">{t('common.loading')}</p>}
      {error && (
        <p className="text-sm" style={{ color: 'var(--pt-red)' }}>
          {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
        </p>
      )}
      {data && visible.length === 0 && !isLoading && (
        <p className="pt-muted italic text-sm">{t('competitions.empty')}</p>
      )}
      {visible.length > 0 && (
        <table className="pt-grid">
          <thead>
            <tr>
              <th className="w-16">Код</th>
              <th className="w-10" title="Онлайн-регистрация">
                🌐
              </th>
              <th className="w-10" title="Российский ранг">
                R
              </th>
              <th className="w-10" title="Призовое">
                🏆
              </th>
              <th className="w-24">Начало</th>
              <th className="w-24">Окончание</th>
              <th className="text-left">Наименование</th>
              <th className="text-left">Город</th>
              <th className="text-left">Федерация</th>
              <th>Статус</th>
              <th className="text-right">Взнос</th>
              <th className="text-right">Ном.</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} className={isUpcoming(c.startDate) ? 'is-yellow' : undefined}>
                <td className="text-right tabular-nums font-mono text-xs">{c.code}</td>
                <td className="text-center">{c.isOnlineRegistrationOpen ? '✓' : ''}</td>
                <td className="text-center pt-muted">—</td>
                <td className="text-center pt-muted">—</td>
                <td className="text-center tabular-nums">{formatDate(c.startDate)}</td>
                <td className="text-center tabular-nums">{formatDate(c.endDate)}</td>
                <td>
                  <Link to="/competitions/$id" params={{ id: c.id }} className="pt-link">
                    {c.nameRu}
                  </Link>
                  <div className="text-xs pt-muted">{c.nameEn}</div>
                </td>
                <td>{c.city ?? <span className="pt-muted italic">—</span>}</td>
                <td>
                  {c.federation.nameRu}
                  <div className="text-xs pt-muted">{c.federation.code}</div>
                </td>
                <td className="text-center">{t(`competitions.status.${c.status}`)}</td>
                <td className="text-right tabular-nums">{formatRub(c.entryFeeKopecks)}</td>
                <td className="text-right tabular-nums">{c._count?.nominations ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </WorkspacePage>
  );
}
