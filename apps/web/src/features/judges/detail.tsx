import { useTranslation } from 'react-i18next';
import { useParams } from '@tanstack/react-router';
import { Card, CardContent } from '@streetlifting/ui';
import { WorkspacePage, WorkspaceState } from '../../components/workspace.js';
import { useJudge } from './api.js';

export default function JudgeDetailFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/judges/$id' });
  const { data, isLoading, error } = useJudge(id);

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
  const j = data.judge;
  const fullName = [j.lastName, j.firstName, j.middleName].filter(Boolean).join(' ');

  const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || <span className="italic text-muted-foreground">—</span>}</dd>
    </>
  );

  return (
    <WorkspacePage
      title={fullName}
      subtitle={
        <>
          {j.categoryRu ?? j.categoryEn ?? t('judges.noCategory')}
          {j.cityRegion && <span> · {j.cityRegion}</span>}
        </>
      }
    >
      <Card>
        <CardContent>
          <dl className="grid grid-cols-[200px_1fr] gap-y-3 gap-x-6 text-sm">
            <Field label={t('judges.fields.categoryRu')} value={j.categoryRu} />
            <Field label={t('judges.fields.categoryEn')} value={j.categoryEn} />
            <Field label={t('judges.fields.cardNumber')} value={j.cardNumber} />
            <Field label={t('judges.fields.cityRegion')} value={j.cityRegion} />
            <Field label="ID" value={<span className="font-mono text-xs">{j.id}</span>} />
          </dl>
        </CardContent>
      </Card>
    </WorkspacePage>
  );
}
