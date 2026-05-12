import { useTranslation } from 'react-i18next';
import { useParams } from '@tanstack/react-router';
import { Card, CardContent } from '@streetlifting/ui';
import { WorkspacePage, WorkspaceState } from '../../components/workspace.js';
import { useDiscipline } from './api.js';

export default function DisciplineDetailFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/disciplines/$id' });
  const { data, isLoading, error } = useDiscipline(id);

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
  const d = data.discipline;

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || <span className="italic text-muted-foreground">—</span>}</dd>
    </>
  );

  return (
    <WorkspacePage
      title={d.nameRu}
      subtitle={
        <>
          {d.nameEn} · <code className="text-primary">{d.code}</code>
        </>
      }
    >
      <Card>
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
    </WorkspacePage>
  );
}
