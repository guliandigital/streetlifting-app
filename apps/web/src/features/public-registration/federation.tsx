import { Link, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@streetlifting/ui';
import { formatRub } from '../../lib/money.js';
import { publicRegistrationApi } from './api.js';

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString();
}

export default function PublicFederationRegistrationFeature() {
  const { t } = useTranslation();
  const { code } = useParams({ from: '/federations/$code/register' });
  const { data, isLoading, error } = useQuery({
    queryKey: ['public-federation-registration', code],
    queryFn: () => publicRegistrationApi.federation(code),
  });

  if (isLoading) {
    return <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10 text-sm text-destructive">
        {t('common.error')}: {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }

  return (
    <div data-testid="public-federation-registration" className="mx-auto max-w-5xl px-6 py-8 space-y-5">
      <div>
        <div className="text-sm text-muted-foreground">{data.federation.code}</div>
        <h1 className="text-2xl font-semibold">{data.federation.nameRu}</h1>
      </div>

      {data.competitions.length === 0 ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            {t('publicRegistration.noOpenCompetitions')}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {data.competitions.map((competition) => (
            <Link
              key={competition.id}
              data-testid="public-registration-competition"
              to="/register/$competitionId"
              params={{ competitionId: competition.id }}
              className="block rounded-md border border-border transition-colors hover:border-primary"
            >
              <Card className="border-0 shadow-none">
                <CardHeader>
                  <CardTitle>{competition.nameRu}</CardTitle>
                  <CardDescription>
                    {formatDate(competition.startDate)} · {competition.city ?? '—'} · {competition.venue ?? '—'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  <span>{t('publicRegistration.entryFee')}: {formatRub(competition.entryFeeKopecks)}</span>
                  <span>{t('publicRegistration.currentNominations')}: {competition._count.nominations}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
