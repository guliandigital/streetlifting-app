import { useTranslation } from 'react-i18next';
import { useParams } from '@tanstack/react-router';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@streetlifting/ui';
import { useAthlete } from './api.js';
import { calculateAge, formatDateOfBirth } from './format.js';

export default function AthleteDetailFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/athletes/$id' });
  const { data, isLoading, error } = useAthlete(id);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 text-sm text-destructive">
        {t('common.error')}: {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }
  const a = data.athlete;
  const fullName = [a.lastName, a.firstName, a.middleName].filter(Boolean).join(' ');
  const age = calculateAge(a.dateOfBirth);

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || <span className="italic text-muted-foreground">—</span>}</dd>
    </>
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <Card>
        <CardHeader>
          <CardTitle>{fullName}</CardTitle>
          <CardDescription>
            {t('athletes.gender.' + a.gender)} · {age} {t('athletes.yearsShort')} · {a.countryCode}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[200px_1fr] gap-y-3 gap-x-6 text-sm">
            <Field label={t('athletes.fields.dob')} value={formatDateOfBirth(a.dateOfBirth)} />
            <Field label={t('athletes.fields.gender')} value={t('athletes.gender.' + a.gender)} />
            <Field label={t('athletes.fields.country')} value={a.countryCode} />
            <Field label={t('athletes.fields.region')} value={a.regionCode} />
            <Field label={t('athletes.fields.city')} value={a.city} />
            <Field label={t('athletes.fields.club')} value={a.clubName} />
            <Field label={t('athletes.fields.coach')} value={a.coachName} />
            <Field label={t('athletes.fields.cardNumber')} value={a.federationCardNumber} />
            <Field label="ID" value={<span className="font-mono text-xs">{a.id}</span>} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
