import { useTranslation } from 'react-i18next';
import { useParams } from '@tanstack/react-router';
import { Card, CardContent } from '@streetlifting/ui';
import { WorkspacePage, WorkspaceState } from '../../components/workspace.js';
import { useAthlete } from './api.js';
import { calculateAge, formatDateOfBirth } from './format.js';
import { useCountries, useRegions } from '../../lib/references-api.js';

export default function AthleteDetailFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/athletes/$id' });
  const { data, isLoading, error } = useAthlete(id);
  const { data: countriesData } = useCountries();
  const countryRow = countriesData?.countries.find((c) => c.codeIso2 === data?.athlete.countryCode);
  const { data: regionsData } = useRegions(countryRow?.id);

  if (isLoading) {
    return <WorkspaceState>{t('common.loading')}</WorkspaceState>;
  }
  if (error || !data) {
    return (
      <WorkspaceState tone="danger">
        {t('common.error')}: {error instanceof Error ? error.message : 'not found'}
      </WorkspaceState>
    );
  }
  const a = data.athlete;
  const fullName = [a.lastName, a.firstName, a.middleName].filter(Boolean).join(' ');
  const age = calculateAge(a.dateOfBirth);
  const regionRow = a.regionCode
    ? regionsData?.regions.find((r) => r.codeIso === a.regionCode)
    : undefined;
  const countryLabel = countryRow ? `${countryRow.nameRu} (${countryRow.codeIso2})` : a.countryCode;
  const regionLabel = regionRow ? regionRow.nameRu : a.regionCode;

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || <span className="italic text-muted-foreground">—</span>}</dd>
    </>
  );

  return (
    <WorkspacePage
      title={fullName}
      subtitle={`${t('athletes.gender.' + a.gender)} · ${age} ${t('athletes.yearsShort')} · ${countryLabel}`}
    >
      <Card>
        <CardContent>
          <dl className="grid grid-cols-[200px_1fr] gap-y-3 gap-x-6 text-sm">
            <Field label={t('athletes.fields.dob')} value={formatDateOfBirth(a.dateOfBirth)} />
            <Field label={t('athletes.fields.gender')} value={t('athletes.gender.' + a.gender)} />
            <Field label={t('athletes.fields.country')} value={countryLabel} />
            <Field label={t('athletes.fields.region')} value={regionLabel} />
            <Field label={t('athletes.fields.city')} value={a.city} />
            <Field label={t('athletes.fields.club')} value={a.clubName} />
            <Field label={t('athletes.fields.coach')} value={a.coachName} />
            <Field label={t('athletes.fields.cardNumber')} value={a.federationCardNumber} />
            <Field label="ID" value={<span className="font-mono text-xs">{a.id}</span>} />
          </dl>
        </CardContent>
      </Card>
    </WorkspacePage>
  );
}
