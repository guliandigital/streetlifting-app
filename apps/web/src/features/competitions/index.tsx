import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../lib/auth/store.js';
import { WorkspacePage } from '../../components/workspace.js';
import { formatRub } from '../../lib/money.js';
import { useCompetitions } from './api.js';
import { formatDate } from './format.js';

export default function CompetitionsListFeature() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const canCreate =
    user?.roles.some((r) => r.role === 'platform_admin' || r.role === 'federation_admin') ?? false;
  const { data, isLoading, error } = useCompetitions();
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
      {isLoading && <p className="pt-muted text-sm">{t('common.loading')}</p>}
      {error && (
        <p className="text-sm" style={{ color: 'var(--pt-red)' }}>
          {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
        </p>
      )}
      {data && data.competitions.length === 0 && !isLoading && (
        <p className="pt-muted italic text-sm">{t('competitions.empty')}</p>
      )}
      {data && data.competitions.length > 0 && (
        <table className="pt-grid">
          <thead>
            <tr>
              <th className="text-left">{t('competitions.cols.name')}</th>
              <th className="text-left">{t('competitions.cols.federation')}</th>
              <th>{t('competitions.cols.dates')}</th>
              <th>{t('competitions.cols.status')}</th>
              <th className="text-right">{t('competitions.cols.entryFee')}</th>
              <th className="text-right">{t('competitions.cols.nominations')}</th>
            </tr>
          </thead>
          <tbody>
            {data.competitions.map((c) => (
              <tr key={c.id}>
                <td>
                  <Link to="/competitions/$id" params={{ id: c.id }} className="pt-link">
                    {c.nameRu}
                  </Link>
                  <div className="text-xs pt-muted">
                    <code>{c.code}</code> · {c.nameEn}
                  </div>
                </td>
                <td>
                  {c.federation.nameRu}
                  <div className="text-xs pt-muted">{c.federation.code}</div>
                </td>
                <td className="text-center tabular-nums">
                  {formatDate(c.startDate)}
                  {c.endDate !== c.startDate && ` - ${formatDate(c.endDate)}`}
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
