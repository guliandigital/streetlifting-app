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
  Label,
  toast,
} from '@streetlifting/ui';
import type { NominationDto } from './operations-api.js';
import { useCompetitionOps, useUpsertAttempt } from './operations-api.js';
import {
  attemptSummary,
  componentOptions,
  fullName,
  nextAttemptNumber,
  sortForPlatform,
} from './tournament-utils.js';

const controlClass =
  'flex h-12 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function judgeQueue(nominations: NominationDto[]): NominationDto[] {
  const active = nominations.filter((nomination) => nomination.status === 'on_platform').sort(sortForPlatform);
  if (active.length > 0) return active;
  return nominations
    .filter((nomination) => !['finished', 'disqualified', 'withdrawn'].includes(nomination.status))
    .sort(sortForPlatform);
}

export default function CompetitionJudgeFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/judge' });
  const { data, isLoading, error } = useCompetitionOps(id);
  const upsertAttempt = useUpsertAttempt(id);
  const [selectedNominationId, setSelectedNominationId] = useState('');
  const [componentId, setComponentId] = useState<string | null>(null);
  const [attemptNumber, setAttemptNumber] = useState('1');

  const nominations = useMemo(() => judgeQueue(data?.nominations ?? []), [data?.nominations]);
  const selected = nominations.find((nomination) => nomination.id === selectedNominationId) ?? nominations[0];
  const components = useMemo(() => (selected ? componentOptions(selected) : []), [selected]);
  const selectedComponent = components.find((component) => component.id === componentId) ?? components[0];
  const currentAttempt = selected?.attempts.find(
    (attempt) =>
      attempt.attemptNumber === Number(attemptNumber) &&
      (selectedComponent?.id ? attempt.componentId === selectedComponent.id : attempt.componentId === null),
  );

  useEffect(() => {
    if (!selectedNominationId && nominations[0]) setSelectedNominationId(nominations[0].id);
  }, [nominations, selectedNominationId]);

  useEffect(() => {
    setComponentId(components[0]?.id ?? null);
  }, [components]);

  useEffect(() => {
    if (!selected) return;
    setAttemptNumber(String(nextAttemptNumber(selected, selectedComponent?.id ?? null)));
  }, [selected, selectedComponent?.id]);

  async function decide(result: 'good_lift' | 'no_lift' | 'withdrawn') {
    if (!selected || !selectedComponent) return;
    const parsedAttempt = Number(attemptNumber);
    if (!Number.isInteger(parsedAttempt) || parsedAttempt < 1 || parsedAttempt > selectedComponent.attemptCount) {
      toast.error(t('competitionOps.errors.invalidAttempt'));
      return;
    }

    await upsertAttempt.mutateAsync({
      nominationId: selected.id,
      componentId: selectedComponent.id,
      attemptNumber: parsedAttempt,
      data: {
        componentId: selectedComponent.id,
        weightKg: Number(currentAttempt?.weightKg ?? selectedComponent.fixedWeightKg ?? 0),
        repsCount: currentAttempt?.repsCount ?? null,
        result,
        judgeDecisions: [
          ...(Array.isArray(currentAttempt?.judgeDecisions) ? currentAttempt.judgeDecisions : []),
          { result, source: 'judge_tablet', decidedAt: new Date().toISOString() },
        ],
        decidedAt: new Date().toISOString(),
      },
    });
    toast.success(t('competitionJudge.decisionSaved'));
  }

  if (isLoading) {
    return <div className="max-w-5xl mx-auto px-6 py-10 text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  if (error || !data) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-10 text-sm text-destructive">
        {t('common.error')}: {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }

  return (
    <div data-testid="competition-judge" className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('competitionJudge.title')}</h1>
          <p className="text-sm text-muted-foreground">{data.competition.nameRu}</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/competitions/$id/operator" params={{ id }}>
            {t('competitionOperator.title')}
          </Link>
        </Button>
      </div>

      {!selected ? (
        <Card>
          <CardContent className="p-6 text-sm italic text-muted-foreground">{t('competitionJudge.empty')}</CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl">
              {selected.entryNumber ? `#${selected.entryNumber} · ` : ''}
              {fullName(selected.athlete)}
            </CardTitle>
            <CardDescription>
              {selected.discipline.nameRu} · {selected.weightClass.nameRu} · {selected.status}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="space-y-2 sm:col-span-3">
                <Label htmlFor="judgeNomination">{t('competitionOps.fields.athlete')}</Label>
                <select
                  id="judgeNomination"
                  data-testid="judge-nomination"
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
              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="judgeComponent">{t('competitionOps.fields.component')}</Label>
                <select
                  id="judgeComponent"
                  data-testid="judge-component"
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
                <Label htmlFor="judgeAttempt">{t('competitionOps.fields.attempt')}</Label>
                <select
                  id="judgeAttempt"
                  data-testid="judge-attempt"
                  value={attemptNumber}
                  onChange={(e) => setAttemptNumber(e.target.value)}
                  className={controlClass}
                >
                  {Array.from({ length: selectedComponent?.attemptCount ?? 1 }, (_, index) => index + 1).map((attempt) => (
                    <option key={attempt} value={attempt}>
                      {attempt}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Button data-testid="judge-good" type="button" className="h-24 text-xl" onClick={() => void decide('good_lift')}>
                {t('competitionJudge.good')}
              </Button>
              <Button data-testid="judge-no" type="button" variant="destructive" className="h-24 text-xl" onClick={() => void decide('no_lift')}>
                {t('competitionJudge.no')}
              </Button>
              <Button data-testid="judge-withdraw" type="button" variant="outline" className="h-24 text-xl" onClick={() => void decide('withdrawn')}>
                {t('competitionJudge.withdraw')}
              </Button>
            </div>

            <div className="rounded-md border border-border p-3 text-sm">
              <div className="font-medium">{t('scoreboard.attempts')}</div>
              <div className="mt-1 text-muted-foreground">{attemptSummary(selected)}</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
