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
import { WorkspacePage, WorkspaceState } from '../../components/workspace.js';
import type { LiveNominationDto } from './operations-api.js';
import { useCompetitionLiveOps, useSubmitJudgeDecision } from './operations-api.js';
import {
  attemptSummary,
  componentOptions,
  fullName,
  nextAttemptNumber,
  sortForPlatform,
} from './tournament-utils.js';

const controlClass =
  'flex h-12 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function judgeQueue(nominations: LiveNominationDto[]): LiveNominationDto[] {
  const active = nominations
    .filter((nomination) => nomination.status === 'on_platform')
    .sort(sortForPlatform);
  if (active.length > 0) return active;
  return nominations
    .filter((nomination) => !['finished', 'disqualified', 'withdrawn'].includes(nomination.status))
    .sort(sortForPlatform);
}

export default function CompetitionJudgeFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/judge' });
  const { data, isLoading, error } = useCompetitionLiveOps(id);
  const submitJudgeDecision = useSubmitJudgeDecision(id);
  const [selectedNominationId, setSelectedNominationId] = useState('');
  const [componentId, setComponentId] = useState<string | null>(null);
  const [attemptNumber, setAttemptNumber] = useState('1');

  const nominations = useMemo(() => judgeQueue(data?.nominations ?? []), [data?.nominations]);
  const selected =
    nominations.find((nomination) => nomination.id === selectedNominationId) ?? nominations[0];
  const components = useMemo(() => (selected ? componentOptions(selected) : []), [selected]);
  const selectedComponent =
    components.find((component) => component.id === componentId) ?? components[0];
  const currentAttempt = selected?.attempts.find(
    (attempt) =>
      attempt.attemptNumber === Number(attemptNumber) &&
      (selectedComponent?.id
        ? attempt.componentId === selectedComponent.id
        : attempt.componentId === null),
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

  async function decide(call: 'white' | 'red') {
    if (!selected || !selectedComponent) return;
    const parsedAttempt = Number(attemptNumber);
    if (
      !Number.isInteger(parsedAttempt) ||
      parsedAttempt < 1 ||
      parsedAttempt > selectedComponent.attemptCount
    ) {
      toast.error(t('competitionOps.errors.invalidAttempt'));
      return;
    }

    if (!currentAttempt || currentAttempt.result !== 'pending') {
      toast.error(t('competitionJudge.waitForCall'));
      return;
    }

    await submitJudgeDecision.mutateAsync({
      nominationId: selected.id,
      attemptNumber: parsedAttempt,
      data: {
        componentId: selectedComponent.id,
        call,
      },
    });
    toast.success(t('competitionJudge.decisionSaved'));
  }

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

  return (
    <WorkspacePage
      title={t('competitionJudge.title')}
      subtitle={data.competition.nameRu}
      actions={
        <Button asChild variant="outline">
          <Link to="/competitions/$id/operator" params={{ id }}>
            {t('competitionOperator.title')}
          </Link>
        </Button>
      }
    >
      <div data-testid="competition-judge" className="space-y-4">
        {!selected ? (
          <Card>
            <CardContent className="p-6 text-sm italic text-muted-foreground">
              {t('competitionJudge.empty')}
            </CardContent>
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
                    {Array.from(
                      { length: selectedComponent?.attemptCount ?? 1 },
                      (_, index) => index + 1,
                    ).map((attempt) => (
                      <option key={attempt} value={attempt}>
                        {attempt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Button
                  data-testid="judge-good"
                  type="button"
                  className="h-24 text-xl"
                  disabled={submitJudgeDecision.isPending}
                  onClick={() => void decide('white')}
                >
                  {t('competitionJudge.good')}
                </Button>
                <Button
                  data-testid="judge-no"
                  type="button"
                  variant="destructive"
                  className="h-24 text-xl"
                  disabled={submitJudgeDecision.isPending}
                  onClick={() => void decide('red')}
                >
                  {t('competitionJudge.no')}
                </Button>
              </div>

              {!currentAttempt || currentAttempt.result !== 'pending' ? (
                <p className="text-sm text-muted-foreground">{t('competitionJudge.waitForCall')}</p>
              ) : null}

              <div className="rounded-md border border-border p-3 text-sm">
                <div className="font-medium">{t('scoreboard.attempts')}</div>
                <div className="mt-1 text-muted-foreground">{attemptSummary(selected)}</div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </WorkspacePage>
  );
}
