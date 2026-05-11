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
import { useCompetitionOps } from './operations-api.js';
import { attemptSummary, fullName } from './tournament-utils.js';

export default function CompetitionProtocolPrintFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/protocol-print' });
  const { data, isLoading, error } = useCompetitionOps(id);

  if (isLoading) {
    return <div className="max-w-7xl mx-auto px-6 py-10 text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10 text-sm text-destructive">
        {t('common.error')}: {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }

  const rows = [...data.nominations].sort(
    (a, b) =>
      ((a.placeInClass ?? Number.POSITIVE_INFINITY) - (b.placeInClass ?? Number.POSITIVE_INFINITY)) ||
      (Number(b.finalScore ?? 0) - Number(a.finalScore ?? 0)) ||
      (Number(b.bestSuccessfulAttemptKg ?? 0) - Number(a.bestSuccessfulAttemptKg ?? 0)) ||
      fullName(a.athlete).localeCompare(fullName(b.athlete)),
  );

  return (
    <div data-testid="protocol-print" className="max-w-7xl mx-auto px-6 py-8 space-y-5 print:max-w-none print:px-0 print:py-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between print:block">
        <div>
          <h1 className="text-2xl font-semibold print:text-xl">{t('protocolPrint.title')}</h1>
          <p className="text-sm text-muted-foreground print:text-black">
            {data.competition.nameRu} · {data.competition.federation.nameRu}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button type="button" onClick={() => window.print()}>
            {t('protocolPrint.printPdf')}
          </Button>
          <Button asChild variant="outline">
            <Link to="/competitions/$id/operations" params={{ id }}>
              {t('scoreboard.operations')}
            </Link>
          </Button>
        </div>
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
                  <TableCell className="tabular-nums">{nomination.bodyWeightAtWeighIn ?? '—'}</TableCell>
                  <TableCell className="tabular-nums">{nomination.bestSuccessfulAttemptKg ?? '—'}</TableCell>
                  <TableCell className="tabular-nums">{nomination.finalScore ?? '—'}</TableCell>
                  <TableCell className="text-xs">{attemptSummary(nomination)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
