import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../lib/auth/store.js';
import { WorkspaceButton, WorkspacePage } from '../../components/workspace.js';
import { useCountries } from '../../lib/references-api.js';
import { useAthletes, type AthleteListFilters } from './api.js';
import { formatDateOfBirth } from './format.js';

export default function AthletesListFeature() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const isPlatformAdmin = user?.roles.some((r) => r.role === 'platform_admin') ?? false;
  const { data: countriesData } = useCountries();

  const [search, setSearch] = useState('');
  const [gender, setGender] = useState<'' | 'M' | 'F'>('');
  const [countryCode, setCountryCode] = useState('');
  const [cardNumberContains, setCardNumberContains] = useState('');
  const [bornFrom, setBornFrom] = useState('');
  const [bornTo, setBornTo] = useState('');

  const filters = useMemo<AthleteListFilters>(
    () => ({
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(gender ? { gender } : {}),
      ...(countryCode ? { countryCode } : {}),
      ...(cardNumberContains.trim() ? { cardNumberContains: cardNumberContains.trim() } : {}),
      ...(bornFrom ? { bornFrom } : {}),
      ...(bornTo ? { bornTo } : {}),
    }),
    [search, gender, countryCode, cardNumberContains, bornFrom, bornTo],
  );

  const { data, isLoading, error } = useAthletes(filters);
  const hasAnyFilter = Object.keys(filters).length > 0;

  const subtitle = data
    ? `${t('athletes.subtitle')} · ${t('athletes.count', { count: data.total })}`
    : t('athletes.subtitle');

  function resetFilters() {
    setSearch('');
    setGender('');
    setCountryCode('');
    setCardNumberContains('');
    setBornFrom('');
    setBornTo('');
  }

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
      <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_140px_200px_180px_140px_140px_auto]">
        <input
          type="search"
          className="pt-field"
          placeholder={t('athletes.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={t('athletes.searchPlaceholder')}
        />
        <select
          className="pt-field"
          value={gender}
          onChange={(e) => setGender(e.target.value as '' | 'M' | 'F')}
          aria-label="Пол"
        >
          <option value="">Пол: все</option>
          <option value="M">М</option>
          <option value="F">Ж</option>
        </select>
        <select
          className="pt-field"
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          aria-label="Страна"
        >
          <option value="">Страна: все</option>
          {countriesData?.countries.map((c) => (
            <option key={c.id} value={c.codeIso2}>
              {c.nameRu} ({c.codeIso2})
            </option>
          ))}
        </select>
        <input
          type="text"
          className="pt-field"
          placeholder="№ карты содержит…"
          value={cardNumberContains}
          onChange={(e) => setCardNumberContains(e.target.value)}
          aria-label="Номер карты федерации содержит"
        />
        <input
          type="date"
          className="pt-field"
          value={bornFrom}
          onChange={(e) => setBornFrom(e.target.value)}
          aria-label="Год рождения от"
          title="Год рождения от"
        />
        <input
          type="date"
          className="pt-field"
          value={bornTo}
          onChange={(e) => setBornTo(e.target.value)}
          aria-label="Год рождения до"
          title="Год рождения до"
        />
        <WorkspaceButton type="button" icon="close" onClick={resetFilters} disabled={!hasAnyFilter}>
          Сбросить
        </WorkspaceButton>
      </div>

      {isLoading && <p className="pt-muted text-sm">{t('common.loading')}</p>}
      {error && (
        <p className="text-sm" style={{ color: 'var(--pt-red)' }}>
          {t('common.error')}: {error instanceof Error ? error.message : 'unknown'}
        </p>
      )}
      {data && data.athletes.length === 0 && !isLoading && (
        <p className="pt-muted italic text-sm">
          {hasAnyFilter ? 'Под фильтры ничего не подошло.' : t('athletes.empty')}
        </p>
      )}
      {data && data.athletes.length > 0 && (
        <table className="pt-grid">
          <thead>
            <tr>
              <th className="text-left">{t('athletes.cols.name')}</th>
              <th>{t('athletes.cols.dob')}</th>
              <th>{t('athletes.cols.gender')}</th>
              <th>{t('athletes.cols.country')}</th>
              <th className="text-left">№ карты</th>
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
                <td className="font-mono text-xs">
                  {a.federationCardNumber ?? <span className="italic pt-muted">—</span>}
                </td>
                <td className="pt-muted">{a.clubName ?? <span className="italic">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </WorkspacePage>
  );
}
