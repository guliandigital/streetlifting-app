import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@streetlifting/ui';
import { WorkspacePage, WorkspaceState } from '../../components/workspace.js';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';
import { protocolAttemptSummary } from '@streetlifting/domain';
import { fullName } from './tournament-utils.js';

export default function CompetitionProtocolPrintFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/protocol-print' });
  const { data, isLoading, error } = useQuery({
    queryKey: ['competition-protocol', id],
    queryFn: () => api.competitions.protocol(id),
    gcTime: 0,
  });

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

  const rows = data.nominations;

  return (
    <WorkspacePage
      title={t('protocolPrint.title')}
      subtitle={data.competition.nameRu}
      actions={
        <>
          <Button type="button" onClick={() => window.print()}>
            {t('protocolPrint.printPdf')}
          </Button>
          <Button asChild variant="outline">
            <Link to="/competitions/$id/operations" params={{ id }}>
              {t('scoreboard.operations')}
            </Link>
          </Button>
        </>
      }
    >
      <div
        data-testid="protocol-print"
        className="space-y-5 print:max-w-none print:px-0 print:py-0"
      >
        <h2 className="text-xl font-semibold">{data.competition.nameRu}</h2>
        <div data-testid="protocol-provenance" className="space-y-1 text-sm">
          <p>{t(`protocolPrint.source.${data.provenance.source}`)}</p>
          <p>{t('protocolPrint.approvalNotRecorded')}</p>
          {data.provenance.revision !== null && (
            <>
              <p>
                {t('protocolPrint.revision', { revision: data.provenance.revision })} ·{' '}
                {data.provenance.createdAt}
              </p>
              <p className="break-all">SHA-256: {data.provenance.payloadHash}</p>
            </>
          )}
        </div>
        <Card className="print:border-0 print:shadow-none">
          <CardHeader className="print:px-0">
            <CardTitle>{t('protocolPrint.results')}</CardTitle>
          </CardHeader>
          <CardContent className="print:px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('competitionOps.fields.placeInClass')}</TableHead>
                  <TableHead>{t('competitionOps.fields.entryNumber')}</TableHead>
                  <TableHead>{t('competitionOps.fields.athlete')}</TableHead>
                  <TableHead>{t('competitionOps.fields.discipline')}</TableHead>
                  <TableHead>{t('competitionOps.fields.division')}</TableHead>
                  <TableHead>{t('competitionOps.fields.weightClass')}</TableHead>
                  <TableHead>{t('competitionOps.fields.bodyWeight')}</TableHead>
                  <TableHead>{t('scoreboard.best')}</TableHead>
                  <TableHead>{t('scoreboard.score')}</TableHead>
                  <TableHead>{t('scoreboard.attempts')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((nomination) => (
                  <TableRow key={nomination.id}>
                    <TableCell className="tabular-nums">{nomination.placeInClass ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{nomination.entryNumber ?? '—'}</TableCell>
                    <TableCell>{fullName(nomination.athlete)}</TableCell>
                    <TableCell>{nomination.discipline.nameRu}</TableCell>
                    <TableCell>{nomination.division.nameRu}</TableCell>
                    <TableCell>{nomination.weightClass.nameRu}</TableCell>
                    <TableCell className="tabular-nums">
                      {nomination.bodyWeightAtWeighIn ?? '—'}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {nomination.bestSuccessfulAttemptKg ?? '—'}
                    </TableCell>
                    <TableCell className="tabular-nums">{nomination.finalScore ?? '—'}</TableCell>
                    <TableCell className="text-xs">{protocolAttemptSummary(nomination)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </WorkspacePage>
  );
}
