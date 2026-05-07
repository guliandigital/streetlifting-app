import { useTranslation } from 'react-i18next';
import { useParams } from '@tanstack/react-router';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@streetlifting/ui';
import { useFederation } from './api.js';
import { formatRub } from './format.js';
import { ChaptersCard } from './chapters-card.js';
import { useCountries, useRegions } from '../../lib/references-api.js';

export default function FederationDetailFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/federations/$id' });
  const { data, isLoading, error } = useFederation(id);
  const { data: countriesData } = useCountries();
  const countryRow = countriesData?.countries.find((c) => c.codeIso2 === data?.federation.countryCode);
  const { data: regionsData } = useRegions(countryRow?.id);

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
  const f = data.federation;
  const regionRow = f.regionCode
    ? regionsData?.regions.find((r) => r.codeIso === f.regionCode)
    : undefined;
  const countryLabel = countryRow ? `${countryRow.nameRu} (${countryRow.codeIso2})` : f.countryCode;
  const regionLabel = regionRow ? regionRow.nameRu : f.regionCode;

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || <span className="italic text-muted-foreground">—</span>}</dd>
    </>
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{f.nameRu}</CardTitle>
          <CardDescription>
            {f.nameEn} · <code className="text-primary">{f.code}</code> · {countryLabel}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[200px_1fr] gap-y-3 gap-x-6 text-sm">
            <Field label={t('federations.fields.country')} value={countryLabel} />
            <Field label={t('federations.fields.region')} value={regionLabel} />
            <Field label={t('federations.fields.tariffRub')} value={formatRub(f.billingTariffKopecksPerNomination)} />
            <Field label={t('federations.fields.contactPhone')} value={f.contactPhone} />
            <Field label={t('federations.fields.contactEmail')} value={f.contactEmail} />
            <Field label={t('federations.fields.telegram')} value={f.telegramHandle} />
            <Field label={t('federations.fields.website')} value={f.websiteUrl} />
            <Field label={t('federations.fields.accountant')} value={f.chiefAccountantName} />
            <Field label={t('federations.fields.cashier')} value={f.cashierName} />
            <Field label="ID" value={<span className="font-mono text-xs">{f.id}</span>} />
            <Field label={t('federations.fields.createdAt')} value={new Date(f.createdAt).toLocaleString()} />
          </dl>
        </CardContent>
      </Card>

      <ChaptersCard federationId={f.id} />
    </div>
  );
}
