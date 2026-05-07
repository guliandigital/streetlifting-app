import { useTranslation } from 'react-i18next';
import { useParams } from '@tanstack/react-router';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@streetlifting/ui';
import { useDiscipline } from './api.js';

export default function DisciplineDetailFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/disciplines/$id' });
  const { data, isLoading, error } = useDiscipline(id);

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
  const d = data.discipline;

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
          <CardTitle>{d.nameRu}</CardTitle>
          <CardDescription>
            {d.nameEn} · <code className="text-primary">{d.code}</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[200px_1fr] gap-y-3 gap-x-6 text-sm">
            <Field label={t('disciplines.fields.family')} value={d.family} />
            <Field label={t('disciplines.fields.format')} value={d.format} />
            <Field label={t('disciplines.fields.equipment')} value={d.equipment} />
            <Field label={t('disciplines.cols.attemptCount')} value={d.attemptCount} />
            <Field
              label={t('disciplines.cols.fixedWeight')}
              value={d.fixedWeightKg !== null ? `${d.fixedWeightKg} ${t('common.kg')}` : null}
            />
            <Field
              label={t('disciplines.fields.veteranCoefficient')}
              value={d.applyVeteranCoefficient ? t('common.yes') : t('common.no')}
            />
            <Field label="ID" value={<span className="font-mono text-xs">{d.id}</span>} />
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
