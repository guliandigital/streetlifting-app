import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  toast,
} from '@streetlifting/ui';
import type { NominationDto } from './operations-api.js';
import { useCompetitionOps, useUpdateNomination, useUpsertAttempt } from './operations-api.js';
import {
  attemptSummary,
  componentOptions,
  fullName,
  nextAttemptNumber,
  sortForPlatform,
} from './tournament-utils.js';

const controlClass =
  'flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function selectableNominations(nominations: NominationDto[]): NominationDto[] {
  return nominations
    .filter((nomination) => !['finished', 'disqualified', 'withdrawn'].includes(nomination.status))
    .sort(sortForPlatform);
}

export default function CompetitionOperatorFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/operator' });
  const { data, isLoading, error } = useCompetitionOps(id);
  const updateNomination = useUpdateNomination(id);
  const upsertAttempt = useUpsertAttempt(id);
  const [selectedNominationId, setSelectedNominationId] = useState('');
  const [componentId, setComponentId] = useState<string | null>(null);
  const [attemptNumber, setAttemptNumber] = useState('1');
  const [weightKg, setWeightKg] = useState('');
  const [repsCount, setRepsCount] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);

  const nominations = useMemo(
    () => selectableNominations(data?.nominations ?? []),
    [data?.nominations],
  );
  const selected = nominations.find((nomination) => nomination.id === selectedNominationId) ?? nominations[0];
  const components = useMemo(() => (selected ? componentOptions(selected) : []), [selected]);
  const selectedComponent = components.find((component) => component.id === componentId) ?? components[0];
  const upcoming = nominations.filter((nomination) => nomination.id !== selected?.id).slice(0, 8);

  useEffect(() => {
    if (!selectedNominationId && nominations[0]) setSelectedNominationId(nominations[0].id);
  }, [nominations, selectedNominationId]);

  useEffect(() => {
    setComponentId(components[0]?.id ?? null);
  }, [components]);

  useEffect(() => {
    if (!selected) return;
    const nextAttempt = nextAttemptNumber(selected, selectedComponent?.id ?? null);
    setAttemptNumber(String(nextAttempt));
    setWeightKg(selectedComponent?.fixedWeightKg?.toString() ?? '');
    setRepsCount('');
  }, [selected, selectedComponent?.id, selectedComponent?.fixedWeightKg]);

  useEffect(() => {
    if (!timerRunning) return undefined;
    const interval = window.setInterval(() => {
      setTimerSeconds((value) => {
        if (value <= 1) {
          setTimerRunning(false);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);

  async function setStatus(status: NominationDto['status']) {
    if (!selected) return;
    await updateNomination.mutateAsync({ nominationId: selected.id, data: { status } });
    toast.success(t('competitionOperator.statusUpdated'));
  }

  async function saveAttempt(result: 'pending' | 'good_lift' | 'no_lift' | 'withdrawn') {
    if (!selected || !selectedComponent) return;
    const parsedAttempt = Number(attemptNumber);
    const parsedWeight = Number(weightKg);
    if (!Number.isInteger(parsedAttempt) || parsedAttempt < 1 || parsedAttempt > selectedComponent.attemptCount) {
      toast.error(t('competitionOps.errors.invalidAttempt'));
      return;
    }
    if (!Number.isFinite(parsedWeight) || parsedWeight < 0) {
      toast.error(t('competitionOps.errors.invalidWeight'));
      return;
    }

    await upsertAttempt.mutateAsync({
      nominationId: selected.id,
      componentId: selectedComponent.id,
      attemptNumber: parsedAttempt,
      data: {
        componentId: selectedComponent.id,
        weightKg: parsedWeight,
        repsCount: repsCount.trim() === '' ? null : Number(repsCount),
        result,
        judgeDecisions: [],
        startedAt: result === 'pending' ? new Date().toISOString() : null,
        decidedAt: result === 'pending' ? null : new Date().toISOString(),
      },
    });
    toast.success(t('competitionOperator.attemptSaved'));
  }

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

  return (
    <div data-testid="competition-operator" className="max-w-7xl mx-auto px-6 py-8 space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('competitionOperator.title')}</h1>
          <p className="text-sm text-muted-foreground">{data.competition.nameRu}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/competitions/$id/operations" params={{ id }}>
              {t('scoreboard.operations')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/competitions/$id/scoreboard" params={{ id }}>
              {t('competitionOps.hallScreen')}
            </Link>
          </Button>
        </div>
      </div>

      {!selected ? (
        <Card>
          <CardContent className="p-6 text-sm italic text-muted-foreground">{t('competitionOperator.empty')}</CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
          <Card>
            <CardHeader>
              <CardTitle>{t('competitionOperator.currentAthlete')}</CardTitle>
              <CardDescription>
                {selected.flight?.name ?? t('competitionOps.fields.noFlight')} · {selected.group?.name ?? t('competitionOps.fields.noGroup')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="operatorNomination">{t('competitionOps.fields.athlete')}</Label>
                  <select
                    id="operatorNomination"
                    data-testid="operator-nomination"
                    value={selected.id}
                    onChange={(e) => setSelectedNominationId(e.target.value)}
                    className={controlClass}
                  >
                    {nominations.map((nomination) => (
                      <option key={nomination.id} value={nomination.id}>
                        {nomination.entryNumber ? `#${nomination.entryNumber} · ` : ''}
                        {fullName(nomination.athlete)} · {nomination.discipline.nameRu}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operatorComponent">{t('competitionOps.fields.component')}</Label>
                  <select
                    id="operatorComponent"
                    data-testid="operator-component"
                    value={selectedComponent?.id ?? ''}
                    onChange={(e) => setComponentId(e.target.value || null)}
                    className={controlClass}
                  >
                    {components.map((component) => (
                      <option key={component.id ?? 'default'} value={component.id ?? ''}>
                        {component.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operatorAttempt">{t('competitionOps.fields.attempt')}</Label>
                  <Input
                    id="operatorAttempt"
                    data-testid="operator-attempt"
                    value={attemptNumber}
                    onChange={(e) => setAttemptNumber(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <div className="space-y-2">
                  <Label htmlFor="operatorWeight">{t('competitionOps.fields.weightKg')}</Label>
                  <Input
                    id="operatorWeight"
                    data-testid="operator-weight"
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="operatorReps">{t('competitionOps.fields.reps')}</Label>
                  <Input
                    id="operatorReps"
                    data-testid="operator-reps"
                    value={repsCount}
                    onChange={(e) => setRepsCount(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label>{t('competitionOperator.timer')}</Label>
                  <div className="flex items-center gap-2">
                    <div data-testid="operator-timer" className="w-28 rounded-md border border-border px-3 py-2 text-center text-xl font-semibold tabular-nums">
                      {timerSeconds}
                    </div>
                    <Button type="button" variant="outline" onClick={() => setTimerRunning((value) => !value)}>
                      {timerRunning ? t('competitionOperator.pauseTimer') : t('competitionOperator.startTimer')}
                    </Button>
                    <Button type="button" variant="ghost" onClick={() => { setTimerSeconds(60); setTimerRunning(false); }}>
                      {t('competitionOperator.resetTimer')}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button data-testid="operator-status-on-platform" type="button" variant="outline" onClick={() => void setStatus('on_platform')}>
                  {t('competitionOperator.markOnPlatform')}
                </Button>
                <Button data-testid="operator-attempt-pending" type="button" variant="outline" onClick={() => void saveAttempt('pending')}>
                  {t('competitionOperator.saveCall')}
                </Button>
                <Button data-testid="operator-attempt-good" type="button" onClick={() => void saveAttempt('good_lift')}>
                  {t('competitionOps.attemptResult.good_lift')}
                </Button>
                <Button data-testid="operator-attempt-no" type="button" variant="destructive" onClick={() => void saveAttempt('no_lift')}>
                  {t('competitionOps.attemptResult.no_lift')}
                </Button>
                <Button data-testid="operator-status-finished" type="button" variant="outline" onClick={() => void setStatus('finished')}>
                  {t('competitionOperator.markFinished')}
                </Button>
              </div>

              <div className="rounded-md border border-border p-3 text-sm">
                <div className="font-medium">{t('scoreboard.attempts')}</div>
                <div className="mt-1 text-muted-foreground">{attemptSummary(selected)}</div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('competitionOperator.nextAthletes')}</CardTitle>
              <CardDescription>{t('competitionOperator.nextAthletesDesc')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('competitionOps.fields.entryNumber')}</TableHead>
                    <TableHead>{t('competitionOps.fields.athlete')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {upcoming.map((nomination) => (
                    <TableRow key={nomination.id}>
                      <TableCell className="tabular-nums">{nomination.entryNumber ?? '—'}</TableCell>
                      <TableCell>
                        <div className="font-medium">{fullName(nomination.athlete)}</div>
                        <div className="text-xs text-muted-foreground">{nomination.discipline.nameRu}</div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
