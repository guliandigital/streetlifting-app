import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../lib/auth/store.js';
import { WorkspacePage } from '../../components/workspace.js';
import { useAthletes } from './api.js';
import { formatDateOfBirth } from './format.js';

export default function AthletesListFeature() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isPlatformAdmin = user?.roles.some((r) => r.role === 'platform_admin') ?? false;

  const [search, setSearch] = useState('');
  const { data, isLoading, error } = useAthletes(search);
  const subtitle = data
    ? `${t('athletes.subtitle')} · ${t('athletes.count', { count: data.total })}`
    : t('athletes.subtitle');

  return (
    <WorkspacePage
      title={t('athletes.title')}
      subtitle={subtitle}
      actions={
        isPlatformAdmin ? (
          <Link to="/athletes/new" className="pt-link-button">
            {t('athletes.create')}
          </Link>
        ) : null
      }
    >
      <div className="mb-2">
        <input
          type="search"
          className="pt-field w-full max-w-xl"
          placeholder={t('athletes.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('athletes.searchPlaceholder')}
        />
      </div>

      {isLoading && <p className="pt-muted text-sm">{t('common.loading')}</p>}
      {error && (
        <p className="text-sm" style={{ color: 'var(--pt-red)' }}>
          {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
        </p>
      )}
      {data && data.athletes.length === 0 && !isLoading && (
        <p className="pt-muted italic text-sm">{t('athletes.empty')}</p>
      )}
      {data && data.athletes.length > 0 && (
        <table className="pt-grid">
          <thead>
            <tr>
              <th className="text-left">{t('athletes.cols.name')}</th>
              <th>{t('athletes.cols.dob')}</th>
              <th>{t('athletes.cols.gender')}</th>
              <th>{t('athletes.cols.country')}</th>
              <th className="text-left">{t('athletes.cols.club')}</th>
            </tr>
          </thead>
          <tbody>
            {data.athletes.map((a) => (
              <tr key={a.id}>
                <td>
                  <Link to="/athletes/$id" params={{ id: a.id }} className="pt-link">
                    {a.lastName} {a.firstName}
                  </Link>
                  {a.middleName ? <span className="pt-muted"> {a.middleName}</span> : null}
                </td>
                <td className="text-center tabular-nums">{formatDateOfBirth(a.dateOfBirth)}</td>
                <td className="text-center">{a.gender}</td>
                <td className="font-mono text-xs text-center">{a.countryCode}</td>
                <td className="pt-muted">{a.clubName ?? <span className="italic">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </WorkspacePage>
  );
}
