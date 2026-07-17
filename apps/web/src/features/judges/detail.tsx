import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from '@tanstack/react-router';
import { Button, Card, CardContent, Input, Label, toast } from '@streetlifting/ui';
import { WorkspacePage, WorkspaceState } from '../../components/workspace.js';
import { useAuthStore } from '../../lib/auth/store.js';
import { ApiClientError } from '../../lib/api-client.js';
import { useJudge, useUpdateJudge } from './api.js';

export default function JudgeDetailFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/judges/$id' });
  const { data, isLoading, error } = useJudge(id);
  const user = useAuthStore((state) => state.user);
  const isPlatformAdmin = user?.roles.some((role) => role.role === 'platform_admin') ?? false;
  const updateJudge = useUpdateJudge(id);
  const [userId, setUserId] = useState('');

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
            {isPlatformAdmin ? (
              <Field
                label={t('judges.fields.userId')}
                value={j.userId ? <span className="font-mono text-xs">{j.userId}</span> : null}
              />
            ) : null}
          </dl>
          {isPlatformAdmin ? (
            <form
              className="mt-6 space-y-3 border-t pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                void updateJudge
                  .mutateAsync({ userId: userId.trim() || null })
                  .then(() => toast.success(t('judges.userLinked')))
                  .catch((cause) =>
                    toast.error(
                      cause instanceof ApiClientError ? cause.message : t('common.error'),
                    ),
                  );
              }}
            >
              <Label htmlFor="linkedUserId">{t('judges.fields.userId')}</Label>
              <div className="flex gap-2">
                <Input
                  id="linkedUserId"
                  value={userId}
                  placeholder={j.userId ?? ''}
                  onChange={(event) => setUserId(event.target.value)}
                />
                <Button type="submit" disabled={updateJudge.isPending}>
                  {t('common.save')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('judges.fields.userIdHint')}</p>
            </form>
          ) : null}
        </CardContent>
      </Card>
    </WorkspacePage>
  );
}
