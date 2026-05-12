import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  WorkspaceButton,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceSectionTitle,
  WorkspaceToolbar,
} from '../../components/workspace.js';
import type { NominationDto } from './operations-api.js';
import { useCompetitionOps, useUpdateNomination, useUpsertAttempt } from './operations-api.js';
import {
  attemptSummary,
  componentOptions,
  fullName,
  nextAttemptNumber,
  sortForPlatform,
} from './tournament-utils.js';

const controlClass = 'pt-field w-full';

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
  const selected =
    nominations.find((nomination) => nomination.id === selectedNominationId) ?? nominations[0];
  const components = useMemo(() => (selected ? componentOptions(selected) : []), [selected]);
  const selectedComponent =
    components.find((component) => component.id === componentId) ?? components[0];
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
    try {
      await updateNomination.mutateAsync({ nominationId: selected.id, data: { status } });
      toast.success(t('competitionOperator.statusUpdated'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function saveAttempt(result: 'pending' | 'good_lift' | 'no_lift' | 'withdrawn') {
    if (!selected || !selectedComponent) return;
    const parsedAttempt = Number(attemptNumber);
    const parsedWeight = Number(weightKg);
    if (
      !Number.isInteger(parsedAttempt) ||
      parsedAttempt < 1 ||
      parsedAttempt > selectedComponent.attemptCount
    ) {
      toast.error(t('competitionOps.errors.invalidAttempt'));
      return;
    }
    if (!Number.isFinite(parsedWeight) || parsedWeight < 0) {
      toast.error(t('competitionOps.errors.invalidWeight'));
      return;
    }

    const parsedReps = repsCount.trim() === '' ? null : Number(repsCount);
    if (parsedReps !== null && (!Number.isFinite(parsedReps) || parsedReps < 0)) {
      toast.error(t('competitionOps.errors.invalidAttempt'));
      return;
    }

    try {
      await upsertAttempt.mutateAsync({
        nominationId: selected.id,
        componentId: selectedComponent.id,
        attemptNumber: parsedAttempt,
        data: {
          componentId: selectedComponent.id,
          weightKg: parsedWeight,
          repsCount: parsedReps,
          result,
          judgeDecisions: [],
          startedAt: result === 'pending' ? new Date().toISOString() : null,
          decidedAt: result === 'pending' ? null : new Date().toISOString(),
        },
      });
      toast.success(t('competitionOperator.attemptSaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  if (isLoading) {
    return <div className="pt-page p-6 text-sm text-gray-600">{t('common.loading')}</div>;
  }

  if (error || !data) {
    return (
      <div className="pt-page p-6 text-sm text-red-700">
        {t('common.error')}: {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }

  return (
    <WorkspacePage
      title={t('competitionOperator.title')}
      subtitle={data.competition.nameRu}
      actions={
        <>
          <Link to="/competitions/$id/operations" params={{ id }} className="pt-link-button">
            {t('scoreboard.operations')}
          </Link>
          <Link to="/competitions/$id/scoreboard" params={{ id }} className="pt-link-button">
            {t('competitionOps.hallScreen')}
          </Link>
        </>
      }
      federationBar={
        <>
          <span>{data.competition.federation.code}</span>
          <span>{data.competition.federation.nameRu}</span>
        </>
      }
      tabs={[
        {
          label: (
            <Link to="/competitions/$id/operations" params={{ id }}>
              Операции
            </Link>
          ),
          icon: 'settings',
        },
        { label: 'Оператор табло', icon: 'operator', active: true },
        {
          label: (
            <Link to="/competitions/$id/scoreboard" params={{ id }}>
              Табло
            </Link>
          ),
          icon: 'scoreboard',
        },
      ]}
      className="competition-operator"
    >
      <div data-testid="competition-operator" className="space-y-3">
        {!selected ? (
          <WorkspacePanel className="p-6 text-sm italic text-[var(--pt-muted)]">
            {t('competitionOperator.empty')}
          </WorkspacePanel>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
            <WorkspacePanel className="p-3">
              <WorkspaceSectionTitle>
                {t('competitionOperator.currentAthlete')}
              </WorkspaceSectionTitle>
              <div className="mb-3 text-sm text-[var(--pt-muted)]">
                {selected.flight?.name ?? t('competitionOps.fields.noFlight')} ·{' '}
                {selected.group?.name ?? t('competitionOps.fields.noGroup')}
              </div>
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="space-y-2 md:col-span-2">
                    <label htmlFor="operatorNomination">{t('competitionOps.fields.athlete')}</label>
                    <select
                      id="operatorNomination"
                      data-testid="operator-nomination"
                      value={selected.id}
                      onChange={(e) => setSelectedNominationId(e.target.value)}
                      className="pt-select w-full"
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
                    <label htmlFor="operatorComponent">
                      {t('competitionOps.fields.component')}
                    </label>
                    <select
                      id="operatorComponent"
                      data-testid="operator-component"
                      value={selectedComponent?.id ?? ''}
                      onChange={(e) => setComponentId(e.target.value || null)}
                      className="pt-select w-full"
                    >
                      {components.map((component) => (
                        <option key={component.id ?? 'default'} value={component.id ?? ''}>
                          {component.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="operatorAttempt">{t('competitionOps.fields.attempt')}</label>
                    <input
                      id="operatorAttempt"
                      data-testid="operator-attempt"
                      value={attemptNumber}
                      onChange={(e) => setAttemptNumber(e.target.value)}
                      inputMode="numeric"
                      className={controlClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="space-y-2">
                    <label htmlFor="operatorWeight">{t('competitionOps.fields.weightKg')}</label>
                    <input
                      id="operatorWeight"
                      data-testid="operator-weight"
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      inputMode="decimal"
                      className={controlClass}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="operatorReps">{t('competitionOps.fields.reps')}</label>
                    <input
                      id="operatorReps"
                      data-testid="operator-reps"
                      value={repsCount}
                      onChange={(e) => setRepsCount(e.target.value)}
                      inputMode="numeric"
                      className={controlClass}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <div>{t('competitionOperator.timer')}</div>
                    <div className="flex items-center gap-2">
                      <div
                        data-testid="operator-timer"
                        className="w-28 rounded border border-[var(--pt-border)] px-3 py-2 text-center text-xl font-semibold tabular-nums"
                      >
                        {timerSeconds}
                      </div>
                      <WorkspaceButton
                        type="button"
                        onClick={() => setTimerRunning((value) => !value)}
                      >
                        {timerRunning
                          ? t('competitionOperator.pauseTimer')
                          : t('competitionOperator.startTimer')}
                      </WorkspaceButton>
                      <WorkspaceButton
                        type="button"
                        onClick={() => {
                          setTimerSeconds(60);
                          setTimerRunning(false);
                        }}
                      >
                        {t('competitionOperator.resetTimer')}
                      </WorkspaceButton>
                    </div>
                  </div>
                </div>

                <WorkspaceToolbar>
                  <WorkspaceButton
                    data-testid="operator-status-on-platform"
                    type="button"
                    onClick={() => void setStatus('on_platform')}
                  >
                    {t('competitionOperator.markOnPlatform')}
                  </WorkspaceButton>
                  <WorkspaceButton
                    data-testid="operator-attempt-pending"
                    type="button"
                    onClick={() => void saveAttempt('pending')}
                  >
                    {t('competitionOperator.saveCall')}
                  </WorkspaceButton>
                  <WorkspaceButton
                    data-testid="operator-attempt-good"
                    type="button"
                    tone="green"
                    onClick={() => void saveAttempt('good_lift')}
                  >
                    {t('competitionOps.attemptResult.good_lift')}
                  </WorkspaceButton>
                  <WorkspaceButton
                    data-testid="operator-attempt-no"
                    type="button"
                    tone="danger"
                    onClick={() => void saveAttempt('no_lift')}
                  >
                    {t('competitionOps.attemptResult.no_lift')}
                  </WorkspaceButton>
                  <WorkspaceButton
                    data-testid="operator-status-finished"
                    type="button"
                    onClick={() => void setStatus('finished')}
                  >
                    {t('competitionOperator.markFinished')}
                  </WorkspaceButton>
                </WorkspaceToolbar>

                <div className="rounded border border-[var(--pt-border)] p-3 text-sm">
                  <div className="font-medium">{t('scoreboard.attempts')}</div>
                  <div className="mt-1 text-[var(--pt-muted)]">{attemptSummary(selected)}</div>
                </div>
              </div>
            </WorkspacePanel>

            <WorkspacePanel className="p-3">
              <WorkspaceSectionTitle>{t('competitionOperator.nextAthletes')}</WorkspaceSectionTitle>
              <div className="mb-2 text-sm text-[var(--pt-muted)]">
                {t('competitionOperator.nextAthletesDesc')}
              </div>
              <table className="pt-grid">
                <thead>
                  <tr>
                    <th>{t('competitionOps.fields.entryNumber')}</th>
                    <th>{t('competitionOps.fields.athlete')}</th>
                  </tr>
                </thead>
                <tbody>
                  {upcoming.map((nomination) => (
                    <tr key={nomination.id}>
                      <td className="tabular-nums">{nomination.entryNumber ?? '-'}</td>
                      <td>
                        <div className="font-medium">{fullName(nomination.athlete)}</div>
                        <div className="text-xs text-[var(--pt-muted)]">
                          {nomination.discipline.nameRu}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {upcoming.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="italic">
                        Следующих участников пока нет.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </WorkspacePanel>
          </div>
        )}
      </div>
    </WorkspacePage>
  );
}
