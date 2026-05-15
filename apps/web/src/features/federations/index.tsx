import { useEffect } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../lib/auth/store.js';
import { WorkspacePage } from '../../components/workspace.js';
import { useFederations } from './api.js';
import { formatRub } from './format.js';

export default function FederationsListFeature() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isPlatformAdmin = user?.roles.some((r) => r.role === 'platform_admin') ?? false;
  const { data, isLoading, error } = useFederations();

  useEffect(() => {
    if (isPlatformAdmin || !data || data.federations.length !== 1) return;
    void navigate({
      to: '/federations/$id',
      params: { id: data.federations[0]!.id },
      replace: true,
    });
  }, [data, isPlatformAdmin, navigate]);

  const subtitle = data
    ? `${t('federations.subtitle')} · ${t('federations.count', { count: data.federations.length })}`
    : t('federations.subtitle');

  return (
    <WorkspacePage
      title={t('federations.title')}
      subtitle={subtitle}
      actions={
        isPlatformAdmin ? (
          <Link to="/federations/new" className="pt-link-button">
            {t('federations.create')}
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
      {data && data.federations.length === 0 && !isLoading && (
        <p className="pt-muted italic text-sm">{t('federations.empty')}</p>
      )}
      {data && data.federations.length > 0 && (
        <table className="pt-grid">
          <thead>
            <tr>
              <th>{t('federations.cols.code')}</th>
              <th className="text-left">{t('federations.cols.name')}</th>
              <th>{t('federations.cols.country')}</th>
              <th className="text-right">{t('federations.cols.tariff')}</th>
              {isPlatformAdmin ? (
                <th className="text-right">{t('federations.cols.workspace')}</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {data.federations.map((f) => (
              <tr key={f.id}>
                <td className="font-mono text-xs">{f.code}</td>
                <td>
                  <Link to="/federations/$id" params={{ id: f.id }} className="pt-link">
                    {f.nameRu}
                  </Link>
                  <div className="text-xs pt-muted">{f.nameEn}</div>
                </td>
                <td className="font-mono text-xs text-center">{f.countryCode}</td>
                <td className="text-right tabular-nums">
                  {formatRub(f.billingTariffKopecksPerNomination)}
                </td>
                {isPlatformAdmin ? (
                  <td className="text-right">
                    <Link to="/federations/$id" params={{ id: f.id }} className="pt-link">
                      {t('federations.openWorkspace')}
                    </Link>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </WorkspacePage>
  );
}
