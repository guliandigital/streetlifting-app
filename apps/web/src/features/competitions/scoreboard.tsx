import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@streetlifting/ui';
import { useScoreboard } from './operations-api.js';

function fullName(person: { lastName: string; firstName: string; middleName?: string | null }): string {
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ');
}

export default function CompetitionScoreboardFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/scoreboard' });
  const { data, isLoading, error } = useScoreboard(id);

  if (isLoading) {
    return <div className="max-w-6xl mx-auto px-6 py-10 text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  if (error || !data) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-10 text-sm text-destructive">
        {t('common.error')}: {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }

  const rows = data.rows.length > 0
    ? data.rows
    : data.nominations.map((n) => ({
        nominationId: n.id,
        entryNumber: n.entryNumber,
        athleteName: fullName(n.athlete),
        discipline: n.discipline.nameRu,
        division: n.division.nameRu,
        weightClass: n.weightClass.nameRu,
        placeInClass: n.placeInClass,
        placeInDivision: n.placeInDivision,
        placeOverall: n.placeOverall,
        bestSuccessfulAttemptKg: n.bestSuccessfulAttemptKg,
        finalScore: n.finalScore,
        status: n.status,
      }));

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('scoreboard.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {data.competition.nameRu} · {t('scoreboard.generatedAt', { value: new Date(data.generatedAt).toLocaleTimeString() })}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/competitions/$id/operations" params={{ id }}>
              {t('scoreboard.operations')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/competitions/$id/operator" params={{ id }}>
              {t('competitionOperator.title')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/competitions/$id/protocol-print" params={{ id }}>
              {t('protocolPrint.title')}
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('scoreboard.currentBoard')}</CardTitle>
          <CardDescription>{t('scoreboard.count', { count: rows.length })}</CardDescription>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <p className="text-sm italic text-muted-foreground">{t('scoreboard.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('competitionOps.fields.entryNumber')}</TableHead>
                  <TableHead>{t('competitionOps.fields.athlete')}</TableHead>
                  <TableHead>{t('competitionOps.fields.discipline')}</TableHead>
                  <TableHead>{t('competitionOps.fields.weightClass')}</TableHead>
                  <TableHead>{t('competitionOps.fields.placeInClass')}</TableHead>
                  <TableHead>{t('competitionOps.fields.placeOverall')}</TableHead>
                  <TableHead className="text-right">{t('scoreboard.best')}</TableHead>
                  <TableHead className="text-right">{t('scoreboard.score')}</TableHead>
                  <TableHead>{t('competitionOps.fields.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow key={row.nominationId}>
                    <TableCell className="text-lg tabular-nums">{row.entryNumber ?? '—'}</TableCell>
                    <TableCell className="text-lg font-medium">{row.athleteName}</TableCell>
                    <TableCell>{row.discipline}</TableCell>
                    <TableCell>{row.weightClass}</TableCell>
                    <TableCell className="tabular-nums">{row.placeInClass ?? '—'}</TableCell>
                    <TableCell className="tabular-nums">{row.placeOverall ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.bestSuccessfulAttemptKg ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.finalScore ?? '—'}</TableCell>
                    <TableCell>{t(`competitionOps.status.${row.status}`)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
