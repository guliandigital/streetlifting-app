import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useLocation, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { JudgeRole } from '@streetlifting/domain';
import { toast } from '@streetlifting/ui';
import {
  WorkspaceButton,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceSectionTitle,
  WorkspaceState,
} from '../../components/workspace.js';
import { api, ApiClientError } from '../../lib/api-client.js';
import { formatRub } from '../../lib/money.js';
import {
  type CompetitionOpsResponse,
  type DisciplineComponentDto,
  type DivisionDto,
  type GroupDto,
  type NominationDto,
  type PlatformDto,
  type WeightClassDto,
  useApplyDefaultSetup,
  useAutoPlanFlights,
  useCreateJudgeAssignment,
  useCompetitionOps,
  useCreateNomination,
  useDeleteJudgeAssignment,
  useDrawNominations,
  useUpdateNomination,
  useUpsertAttempt,
} from './operations-api.js';

const NOMINATION_STATUSES = [
  'draft',
  'paid',
  'weighed_in',
  'on_platform',
  'finished',
  'disqualified',
  'withdrawn',
] as const;

const PAYMENT_STATUSES = ['unpaid', 'partial', 'paid', 'waived', 'refunded'] as const;
const PAYMENT_METHODS = ['bank_transfer', 'card', 'sbp', 'cash', 'other'] as const;
const ATTEMPT_RESULTS = ['pending', 'good_lift', 'no_lift', 'withdrawn'] as const;
const JUDGE_ROLES = ['head', 'side_left', 'side_right', 'technical', 'jury'] as const;
const TABS = [
  'setup',
  'nominations',
  'mandate',
  'flights',
  'judges',
  'attempts',
  'scoreboard',
  'exports',
] as const;
const ASSIGNMENT_FILTERS = ['all', 'assigned', 'unassigned'] as const;
const MANDATE_FILTERS = ['all', 'passed', 'missing'] as const;
const MINUTES_PER_ATTEMPT = 1;
const BREAK_BETWEEN_FLIGHTS_MINUTES = 5;

type TabKey = (typeof TABS)[number];
type AssignmentFilter = (typeof ASSIGNMENT_FILTERS)[number];
type MandateFilter = (typeof MANDATE_FILTERS)[number];

function fullName(person: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
}): string {
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ');
}

function nullableNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rubToKopecks(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

function kopecksToRub(value: string | number): string {
  return (Number(value) / 100).toString();
}

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function weightClassesForDivision(divisions: DivisionDto[], divisionId: string): WeightClassDto[] {
  return divisions.find((division) => division.id === divisionId)?.weightClasses ?? [];
}

function weightClassesForNomination(
  divisions: DivisionDto[],
  nomination: NominationDto,
): WeightClassDto[] {
  return weightClassesForDivision(divisions, nomination.divisionId).filter(
    (weightClass) =>
      !weightClass.disciplineId || weightClass.disciplineId === nomination.disciplineId,
  );
}

function findWeightClassForBodyWeight(
  weightClasses: WeightClassDto[],
  bodyWeightKg: number | null,
): WeightClassDto | null {
  if (bodyWeightKg === null) return null;
  return (
    weightClasses.find((weightClass) => {
      const aboveMin = weightClass.weightMin === null || bodyWeightKg > weightClass.weightMin;
      const belowMax = weightClass.weightMax === null || bodyWeightKg <= weightClass.weightMax;
      return aboveMin && belowMax;
    }) ?? null
  );
}

function groupsForFlight(platforms: PlatformDto[], flightId: string): GroupDto[] {
  for (const platform of platforms) {
    const flight = platform.flights.find((item) => item.id === flightId);
    if (flight) return flight.groups;
  }
  return [];
}

function componentLabel(component: DisciplineComponentDto): string {
  return component.fixedWeightKg === null
    ? component.nameRu
    : `${component.nameRu} · ${component.fixedWeightKg} kg`;
}

function attemptSummary(nomination: NominationDto): string {
  if (nomination.attempts.length === 0) return '—';
  return nomination.attempts
    .map((attempt) => {
      const component = attempt.component?.code ?? nomination.discipline.components[0]?.code ?? '-';
      const reps = attempt.repsCount !== null ? `/${attempt.repsCount}` : '';
      return `${component}${attempt.attemptNumber}:${attempt.weightKg}${reps}:${attempt.result}`;
    })
    .join(' | ');
}

function hasSetup(data: CompetitionOpsResponse): boolean {
  return (
    data.divisions.length > 0 &&
    data.divisions.some((division) => division.weightClasses.length > 0)
  );
}

function tabFromPath(pathname: string): TabKey {
  const lastSegment = pathname.split('/').filter(Boolean).pop();
  if (lastSegment === 'nominations') return 'nominations';
  if (lastSegment === 'judges') return 'judges';
  if (lastSegment === 'schedule') return 'flights';
  return 'setup';
}

function attemptsPerNomination(nomination: NominationDto): number {
  if (nomination.discipline.components.length > 0) {
    return nomination.discipline.components.reduce(
      (total, component) => total + component.attemptCount,
      0,
    );
  }
  return nomination.discipline.attemptCount;
}

function estimateDurationMinutes(nominations: NominationDto[]): number {
  return (
    nominations.reduce((total, nomination) => total + attemptsPerNomination(nomination), 0) *
    MINUTES_PER_ATTEMPT
  );
}

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

function formatTime(value: Date | null): string {
  return value ? value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

function nominationRowToneClass(status: NominationDto['status']): string {
  switch (status) {
    case 'draft':
      return 'is-yellow';
    case 'weighed_in':
    case 'finished':
      return 'is-green';
    case 'on_platform':
      return 'is-selected';
    case 'disqualified':
      return 'is-pink';
    case 'withdrawn':
      return 'is-gray';
    default:
      return '';
  }
}

function nominationMatchesSearch(nomination: NominationDto, search: string): boolean {
  const normalized = search.trim().toLowerCase();
  if (normalized === '') return true;
  return [
    fullName(nomination.athlete),
    nomination.discipline.nameRu,
    nomination.division.nameRu,
    nomination.weightClass.nameRu,
    nomination.declaredWeightClass?.nameRu,
    nomination.entryNumber?.toString(),
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalized));
}

function SetupRequiredCard({ pending, onApply }: { pending: boolean; onApply: () => void }) {
  const { t } = useTranslation();

  return (
    <WorkspacePanel className="p-3 space-y-3" data-testid="ops-setup-required">
      <div className="mb-2">
        <WorkspaceSectionTitle>{t('competitionOps.setupTitle')}</WorkspaceSectionTitle>
        <div className="pt-muted text-xs">{t('competitionOps.setupDesc')}</div>
      </div>
      <div>
        <WorkspaceButton
          data-testid="ops-setup-required-apply"
          type="button"
          onClick={onApply}
          disabled={pending}
        >
          {pending ? t('common.saving') : t('competitionOps.applySetup')}
        </WorkspaceButton>
      </div>
    </WorkspacePanel>
  );
}

function NominationCreateForm({
  competitionId,
  divisions,
}: {
  competitionId: string;
  divisions: DivisionDto[];
}) {
  const { t } = useTranslation();
  const create = useCreateNomination(competitionId);
  const { data: athletesData } = useQuery({
    queryKey: ['athletes', { nominationForm: true }],
    queryFn: () => api.athletes.list({ limit: 200 }),
  });
  const { data: disciplinesData } = useQuery({
    queryKey: ['disciplines'],
    queryFn: () => api.disciplines.list(),
  });

  const [athleteId, setAthleteId] = useState('');
  const [disciplineId, setDisciplineId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [declaredWeightClassId, setDeclaredWeightClassId] = useState('');
  const [entryNumber, setEntryNumber] = useState('');
  const [notes, setNotes] = useState('');

  const weightClasses = useMemo(
    () => weightClassesForDivision(divisions, divisionId),
    [divisionId, divisions],
  );

  useEffect(() => {
    if (!athleteId && athletesData?.athletes[0]) setAthleteId(athletesData.athletes[0].id);
    if (!disciplineId && disciplinesData?.disciplines[0])
      setDisciplineId(disciplinesData.disciplines[0].id);
    if (!divisionId && divisions[0]) setDivisionId(divisions[0].id);
  }, [athleteId, athletesData, disciplineId, disciplinesData, divisionId, divisions]);

  useEffect(() => {
    if (!weightClasses.some((weightClass) => weightClass.id === declaredWeightClassId)) {
      setDeclaredWeightClassId(weightClasses[0]?.id ?? '');
    }
  }, [declaredWeightClassId, weightClasses]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        athleteId,
        disciplineId,
        divisionId,
        declaredWeightClassId,
        weightClassId: declaredWeightClassId,
        entryNumber: nullableNumber(entryNumber),
        status: 'draft',
        paymentStatus: 'unpaid',
        paidAmountKopecks: 0,
        isEntryFeePaid: false,
        isMandatePassed: false,
        ...(notes.trim() !== '' && { notes: notes.trim() }),
      });
      setEntryNumber('');
      setNotes('');
      toast.success(t('competitionOps.nominationCreated'));
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'nomination_exists') {
        toast.error(t('competitionOps.errors.nominationExists'));
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  const canSubmit = Boolean(athleteId && disciplineId && divisionId && declaredWeightClassId);

  return (
    <WorkspacePanel className="p-3 space-y-3">
      <div className="mb-2">
        <WorkspaceSectionTitle>{t('competitionOps.createNomination')}</WorkspaceSectionTitle>
        <div className="pt-muted text-xs">{t('competitionOps.createNominationDesc')}</div>
      </div>
      <div>
        <form
          data-testid="nomination-create-form"
          onSubmit={(e) => void onSubmit(e)}
          className="grid grid-cols-1 gap-3 xl:grid-cols-12"
        >
          <div className="space-y-2 xl:col-span-3">
            <label className="pt-label" htmlFor="nominationAthlete">
              {t('competitionOps.fields.athlete')}
            </label>
            <select
              id="nominationAthlete"
              data-testid="nomination-athlete"
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              className="pt-select"
              required
            >
              {(athletesData?.athletes ?? []).map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {fullName(athlete)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 xl:col-span-3">
            <label className="pt-label" htmlFor="nominationDiscipline">
              {t('competitionOps.fields.discipline')}
            </label>
            <select
              id="nominationDiscipline"
              data-testid="nomination-discipline"
              value={disciplineId}
              onChange={(e) => setDisciplineId(e.target.value)}
              className="pt-select"
              required
            >
              {(disciplinesData?.disciplines ?? []).map((discipline) => (
                <option key={discipline.id} value={discipline.id}>
                  {discipline.nameRu}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 xl:col-span-2">
            <label className="pt-label" htmlFor="nominationDivision">
              {t('competitionOps.fields.division')}
            </label>
            <select
              id="nominationDivision"
              data-testid="nomination-division"
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className="pt-select"
              required
            >
              {divisions.map((division) => (
                <option key={division.id} value={division.id}>
                  {division.nameRu}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2 xl:col-span-2">
            <label className="pt-label" htmlFor="nominationWeightClass">
              {t('competitionOps.fields.declaredWeightClass')}
            </label>
            <select
              id="nominationWeightClass"
              data-testid="nomination-weight-class"
              value={declaredWeightClassId}
              onChange={(e) => setDeclaredWeightClassId(e.target.value)}
              className="pt-select"
              required
            >
              {weightClasses.map((weightClass) => (
                <option key={weightClass.id} value={weightClass.id}>
                  {weightClass.nameRu}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="pt-label" htmlFor="nominationEntry">
              {t('competitionOps.fields.entryNumber')}
            </label>
            <input
              className="pt-field"
              id="nominationEntry"
              data-testid="nomination-entry"
              type="number"
              min="1"
              value={entryNumber}
              onChange={(e) => setEntryNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="pt-label" htmlFor="nominationNotes">
              {t('competitionOps.fields.notes')}
            </label>
            <input
              className="pt-field"
              id="nominationNotes"
              data-testid="nomination-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex items-end justify-end xl:col-span-12">
            <WorkspaceButton
              data-testid="nomination-submit"
              type="submit"
              disabled={!canSubmit || create.isPending}
            >
              {create.isPending ? t('common.saving') : t('common.save')}
            </WorkspaceButton>
          </div>
        </form>
      </div>
    </WorkspacePanel>
  );
}

function NominationEditorRow({
  nomination,
  divisions,
  platforms,
  draggable,
}: {
  nomination: NominationDto;
  divisions: DivisionDto[];
  platforms: PlatformDto[];
  draggable?: boolean;
}) {
  const { t } = useTranslation();
  const updateNomination = useUpdateNomination(nomination.competitionId);
  const [entryNumber, setEntryNumber] = useState(nomination.entryNumber?.toString() ?? '');
  const [bodyWeight, setBodyWeight] = useState(nomination.bodyWeightAtWeighIn?.toString() ?? '');
  const [status, setStatus] = useState<NominationDto['status']>(nomination.status);
  const [declaredWeightClassId, setDeclaredWeightClassId] = useState(
    nomination.declaredWeightClassId ?? nomination.weightClassId,
  );
  const [weightClassId, setWeightClassId] = useState(nomination.weightClassId);
  const [weightClassTouched, setWeightClassTouched] = useState(false);
  const [flightId, setFlightId] = useState(nomination.flightId ?? '');
  const [groupId, setGroupId] = useState(nomination.groupId ?? '');
  const [paymentStatus, setPaymentStatus] = useState<NominationDto['paymentStatus']>(
    nomination.paymentStatus,
  );
  const [paidAmountRub, setPaidAmountRub] = useState(kopecksToRub(nomination.paidAmountKopecks));
  const [paymentMethod, setPaymentMethod] = useState<NominationDto['paymentMethod']>(
    nomination.paymentMethod,
  );
  const [paymentComment, setPaymentComment] = useState(nomination.paymentComment ?? '');
  const [isMandatePassed, setIsMandatePassed] = useState(nomination.isMandatePassed);
  const [notes, setNotes] = useState(nomination.notes ?? '');

  useEffect(() => {
    setEntryNumber(nomination.entryNumber?.toString() ?? '');
    setBodyWeight(nomination.bodyWeightAtWeighIn?.toString() ?? '');
    setStatus(nomination.status);
    setDeclaredWeightClassId(nomination.declaredWeightClassId ?? nomination.weightClassId);
    setWeightClassId(nomination.weightClassId);
    setWeightClassTouched(false);
    setFlightId(nomination.flightId ?? '');
    setGroupId(nomination.groupId ?? '');
    setPaymentStatus(nomination.paymentStatus);
    setPaidAmountRub(kopecksToRub(nomination.paidAmountKopecks));
    setPaymentMethod(nomination.paymentMethod);
    setPaymentComment(nomination.paymentComment ?? '');
    setIsMandatePassed(nomination.isMandatePassed);
    setNotes(nomination.notes ?? '');
  }, [nomination]);

  const weightClasses = weightClassesForNomination(divisions, nomination);
  const groups = groupsForFlight(platforms, flightId);
  const autoWeightClass = findWeightClassForBodyWeight(weightClasses, nullableNumber(bodyWeight));

  function updateBodyWeight(value: string) {
    setBodyWeight(value);
    if (!weightClassTouched) {
      const match = findWeightClassForBodyWeight(weightClasses, nullableNumber(value));
      if (match) setWeightClassId(match.id);
    }
  }

  async function save() {
    try {
      await updateNomination.mutateAsync({
        nominationId: nomination.id,
        data: {
          entryNumber: nullableNumber(entryNumber),
          bodyWeightAtWeighIn: nullableNumber(bodyWeight),
          status,
          declaredWeightClassId,
          weightClassId,
          flightId: flightId || null,
          groupId: groupId || null,
          paymentStatus,
          isEntryFeePaid: paymentStatus === 'paid' || paymentStatus === 'waived',
          paidAmountKopecks: rubToKopecks(paidAmountRub),
          paymentMethod,
          paymentComment: paymentComment.trim() || null,
          isMandatePassed,
          notes: notes.trim() || null,
        },
      });
      toast.success(t('competitionOps.nominationUpdated'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <tr
      data-testid="nomination-row"
      data-nomination-id={nomination.id}
      draggable={draggable}
      onDragStart={(event) => {
        if (!draggable) return;
        event.dataTransfer.setData('application/x-nomination-id', nomination.id);
        event.dataTransfer.setData('text/plain', nomination.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      className={
        `${nominationRowToneClass(status)}${draggable ? ' cursor-move' : ''}`.trim() || undefined
      }
    >
      <td className="min-w-32">
        {draggable && (
          <span
            data-testid="nomination-row-drag-handle"
            draggable
            onDragStart={(event) => {
              event.dataTransfer.setData('application/x-nomination-id', nomination.id);
              event.dataTransfer.setData('text/plain', nomination.id);
              event.dataTransfer.effectAllowed = 'move';
            }}
            className="mr-2 inline-flex h-6 w-6 cursor-grab select-none items-center justify-center rounded border border-border text-xs text-muted-foreground"
            title={t('competitionOps.flightDragHandle')}
          >
            ::
          </span>
        )}
        {fullName(nomination.athlete)}
      </td>
      <td className="min-w-56">
        <div>{nomination.discipline.nameRu}</div>
        <div className="text-xs text-muted-foreground">{nomination.division.nameRu}</div>
      </td>
      <td className="w-24">
        <input
          className="pt-field"
          data-testid="nomination-row-entry"
          type="number"
          min="1"
          value={entryNumber}
          onChange={(e) => setEntryNumber(e.target.value)}
        />
      </td>
      <td className="w-28">
        <input
          className="pt-field"
          data-testid="nomination-row-body-weight"
          type="number"
          min="0"
          step="0.01"
          value={bodyWeight}
          onChange={(e) => updateBodyWeight(e.target.value)}
        />
      </td>
      <td className="min-w-36">
        <select
          data-testid="nomination-row-declared-weight-class"
          value={declaredWeightClassId}
          onChange={(e) => setDeclaredWeightClassId(e.target.value)}
          className="pt-select"
        >
          {weightClasses.map((weightClass) => (
            <option key={weightClass.id} value={weightClass.id}>
              {weightClass.nameRu}
            </option>
          ))}
        </select>
      </td>
      <td className="min-w-36">
        <select
          data-testid="nomination-row-weight-class"
          value={weightClassId}
          onChange={(e) => {
            setWeightClassTouched(true);
            setWeightClassId(e.target.value);
          }}
          className="pt-select"
        >
          {weightClasses.map((weightClass) => (
            <option key={weightClass.id} value={weightClass.id}>
              {weightClass.nameRu}
            </option>
          ))}
        </select>
        {autoWeightClass && autoWeightClass.id === weightClassId && (
          <div
            data-testid="nomination-row-auto-weight-class"
            className="mt-1 text-xs text-muted-foreground"
          >
            {t('competitionOps.autoWeightClass', { value: autoWeightClass.nameRu })}
          </div>
        )}
      </td>
      <td className="min-w-32">
        <select
          data-testid="nomination-row-payment-status"
          value={paymentStatus}
          onChange={(e) => setPaymentStatus(e.target.value as NominationDto['paymentStatus'])}
          className="pt-select"
        >
          {PAYMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`competitionOps.paymentStatus.${value}`)}
            </option>
          ))}
        </select>
      </td>
      <td className="w-28">
        <input
          className="pt-field"
          data-testid="nomination-row-paid-amount"
          type="number"
          min="0"
          step="1"
          value={paidAmountRub}
          onChange={(e) => setPaidAmountRub(e.target.value)}
        />
      </td>
      <td className="min-w-32">
        <select
          data-testid="nomination-row-payment-method"
          value={paymentMethod ?? ''}
          onChange={(e) =>
            setPaymentMethod((e.target.value || null) as NominationDto['paymentMethod'])
          }
          className="pt-select"
        >
          <option value="">{t('competitionOps.paymentMethod.none')}</option>
          {PAYMENT_METHODS.map((value) => (
            <option key={value} value={value}>
              {t(`competitionOps.paymentMethod.${value}`)}
            </option>
          ))}
        </select>
      </td>
      <td className="min-w-32">
        <select
          data-testid="nomination-row-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as NominationDto['status'])}
          className="pt-select"
        >
          {NOMINATION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`competitionOps.status.${value}`)}
            </option>
          ))}
        </select>
      </td>
      <td className="min-w-40">
        <select
          data-testid="nomination-row-flight"
          value={flightId}
          onChange={(e) => {
            setFlightId(e.target.value);
            setGroupId('');
          }}
          className="pt-select"
        >
          <option value="">{t('competitionOps.fields.noFlight')}</option>
          {platforms.flatMap((platform) =>
            platform.flights.map((flight) => (
              <option key={flight.id} value={flight.id}>
                {platform.name} · {flight.name}
              </option>
            )),
          )}
        </select>
      </td>
      <td className="min-w-32">
        <select
          data-testid="nomination-row-group"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="pt-select"
        >
          <option value="">{t('competitionOps.fields.noGroup')}</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </td>
      <td className="w-24 text-center">
        <input
          data-testid="nomination-row-mandate"
          type="checkbox"
          checked={isMandatePassed}
          onChange={(e) => setIsMandatePassed(e.target.checked)}
          className="h-4 w-4"
        />
      </td>
      <td className="min-w-44">
        <input
          className="pt-field"
          data-testid="nomination-row-notes"
          value={paymentComment || notes}
          onChange={(e) => {
            setPaymentComment(e.target.value);
            setNotes(e.target.value);
          }}
        />
      </td>
      <td className="text-right">
        <WorkspaceButton
          data-testid="nomination-row-save"
          type="button"
          onClick={() => void save()}
          disabled={updateNomination.isPending}
        >
          {updateNomination.isPending ? t('common.saving') : t('common.save')}
        </WorkspaceButton>
      </td>
    </tr>
  );
}

function FlightFilters({
  data,
  search,
  disciplineId,
  divisionId,
  weightClassId,
  assignment,
  status,
  onSearchChange,
  onDisciplineChange,
  onDivisionChange,
  onWeightClassChange,
  onAssignmentChange,
  onStatusChange,
}: {
  data: CompetitionOpsResponse;
  search: string;
  disciplineId: string;
  divisionId: string;
  weightClassId: string;
  assignment: AssignmentFilter;
  status: NominationDto['status'] | 'all';
  onSearchChange: (value: string) => void;
  onDisciplineChange: (value: string) => void;
  onDivisionChange: (value: string) => void;
  onWeightClassChange: (value: string) => void;
  onAssignmentChange: (value: AssignmentFilter) => void;
  onStatusChange: (value: NominationDto['status'] | 'all') => void;
}) {
  const { t } = useTranslation();
  const disciplines = Array.from(
    new Map(
      data.nominations.map((nomination) => [nomination.discipline.id, nomination.discipline]),
    ).values(),
  );
  const weightClasses = data.divisions
    .filter((division) => divisionId === 'all' || division.id === divisionId)
    .flatMap((division) => division.weightClasses);

  return (
    <WorkspacePanel className="p-3 space-y-3">
      <div className="mb-2">
        <WorkspaceSectionTitle>{t('competitionOps.flightFilters')}</WorkspaceSectionTitle>
        <div className="pt-muted text-xs">{t('competitionOps.flightFiltersDesc')}</div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-8">
        <div className="space-y-2 md:col-span-2 xl:col-span-2">
          <label className="pt-label" htmlFor="flightSearch">
            {t('common.search')}
          </label>
          <input
            className="pt-field"
            id="flightSearch"
            data-testid="flight-filter-search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('competitionOps.flightSearchPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <label className="pt-label" htmlFor="flightDiscipline">
            {t('competitionOps.fields.discipline')}
          </label>
          <select
            id="flightDiscipline"
            data-testid="flight-filter-discipline"
            value={disciplineId}
            onChange={(e) => onDisciplineChange(e.target.value)}
            className="pt-select"
          >
            <option value="all">{t('competitionOps.allDisciplines')}</option>
            {disciplines.map((discipline) => (
              <option key={discipline.id} value={discipline.id}>
                {discipline.nameRu}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="pt-label" htmlFor="flightDivision">
            {t('competitionOps.fields.division')}
          </label>
          <select
            id="flightDivision"
            data-testid="flight-filter-division"
            value={divisionId}
            onChange={(e) => onDivisionChange(e.target.value)}
            className="pt-select"
          >
            <option value="all">{t('competitionOps.allDivisions')}</option>
            {data.divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.nameRu}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="pt-label" htmlFor="flightWeightClass">
            {t('competitionOps.fields.weightClass')}
          </label>
          <select
            id="flightWeightClass"
            data-testid="flight-filter-weight-class"
            value={weightClassId}
            onChange={(e) => onWeightClassChange(e.target.value)}
            className="pt-select"
          >
            <option value="all">{t('competitionOps.allWeightClasses')}</option>
            {weightClasses.map((weightClass) => (
              <option key={weightClass.id} value={weightClass.id}>
                {weightClass.nameRu}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="pt-label" htmlFor="flightAssignment">
            {t('competitionOps.assignment.title')}
          </label>
          <select
            id="flightAssignment"
            data-testid="flight-filter-assignment"
            value={assignment}
            onChange={(e) => onAssignmentChange(e.target.value as AssignmentFilter)}
            className="pt-select"
          >
            {ASSIGNMENT_FILTERS.map((item) => (
              <option key={item} value={item}>
                {t(`competitionOps.assignment.${item}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="pt-label" htmlFor="flightStatus">
            {t('competitionOps.fields.status')}
          </label>
          <select
            id="flightStatus"
            data-testid="flight-filter-status"
            value={status}
            onChange={(e) => onStatusChange(e.target.value as NominationDto['status'] | 'all')}
            className="pt-select"
          >
            <option value="all">{t('competitionOps.allStatuses')}</option>
            {NOMINATION_STATUSES.map((item) => (
              <option key={item} value={item}>
                {t(`competitionOps.status.${item}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </WorkspacePanel>
  );
}

function NominationGridFilters({
  data,
  search,
  disciplineId,
  divisionId,
  weightClassId,
  status,
  paymentStatus,
  mandate,
  onSearchChange,
  onDisciplineChange,
  onDivisionChange,
  onWeightClassChange,
  onStatusChange,
  onPaymentStatusChange,
  onMandateChange,
}: {
  data: CompetitionOpsResponse;
  search: string;
  disciplineId: string;
  divisionId: string;
  weightClassId: string;
  status: NominationDto['status'] | 'all';
  paymentStatus: NominationDto['paymentStatus'] | 'all';
  mandate: MandateFilter;
  onSearchChange: (value: string) => void;
  onDisciplineChange: (value: string) => void;
  onDivisionChange: (value: string) => void;
  onWeightClassChange: (value: string) => void;
  onStatusChange: (value: NominationDto['status'] | 'all') => void;
  onPaymentStatusChange: (value: NominationDto['paymentStatus'] | 'all') => void;
  onMandateChange: (value: MandateFilter) => void;
}) {
  const { t } = useTranslation();
  const disciplines = Array.from(
    new Map(
      data.nominations.map((nomination) => [nomination.discipline.id, nomination.discipline]),
    ).values(),
  );
  const weightClasses = data.divisions
    .filter((division) => divisionId === 'all' || division.id === divisionId)
    .flatMap((division) => division.weightClasses);

  return (
    <WorkspacePanel className="p-3 space-y-3">
      <div className="mb-2">
        <WorkspaceSectionTitle>{t('competitionOps.nominationFilters')}</WorkspaceSectionTitle>
        <div className="pt-muted text-xs">{t('competitionOps.nominationFiltersDesc')}</div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
        <div className="space-y-2 md:col-span-2 xl:col-span-2">
          <label className="pt-label" htmlFor="nominationSearch">
            {t('common.search')}
          </label>
          <input
            className="pt-field"
            id="nominationSearch"
            data-testid="nomination-filter-search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('competitionOps.nominationSearchPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <label className="pt-label" htmlFor="nominationDiscipline">
            {t('competitionOps.fields.discipline')}
          </label>
          <select
            id="nominationDiscipline"
            data-testid="nomination-filter-discipline"
            value={disciplineId}
            onChange={(e) => onDisciplineChange(e.target.value)}
            className="pt-select"
          >
            <option value="all">{t('competitionOps.allDisciplines')}</option>
            {disciplines.map((discipline) => (
              <option key={discipline.id} value={discipline.id}>
                {discipline.nameRu}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="pt-label" htmlFor="nominationDivision">
            {t('competitionOps.fields.division')}
          </label>
          <select
            id="nominationDivision"
            data-testid="nomination-filter-division"
            value={divisionId}
            onChange={(e) => onDivisionChange(e.target.value)}
            className="pt-select"
          >
            <option value="all">{t('competitionOps.allDivisions')}</option>
            {data.divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.nameRu}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="pt-label" htmlFor="nominationWeightClass">
            {t('competitionOps.fields.weightClass')}
          </label>
          <select
            id="nominationWeightClass"
            data-testid="nomination-filter-weight-class"
            value={weightClassId}
            onChange={(e) => onWeightClassChange(e.target.value)}
            className="pt-select"
          >
            <option value="all">{t('competitionOps.allWeightClasses')}</option>
            {weightClasses.map((weightClass) => (
              <option key={weightClass.id} value={weightClass.id}>
                {weightClass.nameRu}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="pt-label" htmlFor="nominationStatus">
            {t('competitionOps.fields.status')}
          </label>
          <select
            id="nominationStatus"
            data-testid="nomination-filter-status"
            value={status}
            onChange={(e) => onStatusChange(e.target.value as NominationDto['status'] | 'all')}
            className="pt-select"
          >
            <option value="all">{t('competitionOps.allStatuses')}</option>
            {NOMINATION_STATUSES.map((item) => (
              <option key={item} value={item}>
                {t(`competitionOps.status.${item}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="pt-label" htmlFor="nominationPaymentStatus">
            {t('competitionOps.fields.paymentStatus')}
          </label>
          <select
            id="nominationPaymentStatus"
            data-testid="nomination-filter-payment"
            value={paymentStatus}
            onChange={(e) =>
              onPaymentStatusChange(e.target.value as NominationDto['paymentStatus'] | 'all')
            }
            className="pt-select"
          >
            <option value="all">{t('competitionOps.allPayments')}</option>
            {PAYMENT_STATUSES.map((item) => (
              <option key={item} value={item}>
                {t(`competitionOps.paymentStatus.${item}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <label className="pt-label" htmlFor="nominationMandate">
            {t('competitionOps.mandateFilter')}
          </label>
          <select
            id="nominationMandate"
            data-testid="nomination-filter-mandate"
            value={mandate}
            onChange={(e) => onMandateChange(e.target.value as MandateFilter)}
            className="pt-select"
          >
            {MANDATE_FILTERS.map((item) => (
              <option key={item} value={item}>
                {t(`competitionOps.mandate.${item}`)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </WorkspacePanel>
  );
}

function FlightPlanningPanel({
  data,
  onAssignNomination,
}: {
  data: CompetitionOpsResponse;
  onAssignNomination?: (nominationId: string, flightId: string, groupId: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const flights = data.platforms.flatMap((platform) => platform.flights);
  const unassigned = data.nominations.filter(
    (nomination) => !nomination.flightId || !nomination.groupId,
  );
  const assigned = data.nominations.filter(
    (nomination) => nomination.flightId && nomination.groupId,
  );
  const nonEmptyFlights = flights.filter((flight) =>
    data.nominations.some((nomination) => nomination.flightId === flight.id),
  );
  const assignedDuration = estimateDurationMinutes(assigned);
  const breakMinutes = Math.max(nonEmptyFlights.length - 1, 0) * BREAK_BETWEEN_FLIGHTS_MINUTES;
  const totalDuration = assignedDuration + breakMinutes;

  return (
    <>
      <WorkspacePanel className="p-3 space-y-3" data-testid="flight-summary">
        <div className="mb-2">
          <WorkspaceSectionTitle>{t('competitionOps.flightPlannerTitle')}</WorkspaceSectionTitle>
          <div className="pt-muted text-xs">{t('competitionOps.flightPlannerDesc')}</div>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">
                {t('competitionOps.metrics.total')}
              </div>
              <div className="text-2xl font-semibold tabular-nums">{data.nominations.length}</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">{t('competitionOps.assigned')}</div>
              <div className="text-2xl font-semibold tabular-nums">{assigned.length}</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">{t('competitionOps.unassigned')}</div>
              <div
                data-testid="flight-unassigned-count"
                className="text-2xl font-semibold tabular-nums"
              >
                {unassigned.length}
              </div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">
                {t('competitionOps.totalEstimated')}
              </div>
              <div className="text-2xl font-semibold tabular-nums">
                {totalDuration} {t('competitionOps.minutesShort')}
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('competitionOps.manualAssignmentHint')}
          </p>
          {unassigned.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {t('competitionOps.unassignedWarning', { count: unassigned.length })}
            </div>
          )}
        </div>
      </WorkspacePanel>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data.platforms.map((platform) => (
          <WorkspacePanel className="p-3 space-y-3" key={platform.id}>
            <div className="mb-2">
              <WorkspaceSectionTitle>{platform.name}</WorkspaceSectionTitle>
              <div className="pt-muted text-xs">
                {t('competitionOps.flightCount', { count: platform.flights.length })}
              </div>
            </div>
            <div className="space-y-2 text-sm">
              {platform.flights.length === 0 ? (
                <p className="italic text-muted-foreground">{t('competitionOps.noFlights')}</p>
              ) : (
                platform.flights.map((flight) => {
                  const nominationsInFlight = data.nominations.filter(
                    (nomination) => nomination.flightId === flight.id,
                  );
                  const duration = estimateDurationMinutes(nominationsInFlight);
                  const startedAt = flight.startTime ? new Date(flight.startTime) : null;
                  const endsAt = startedAt
                    ? new Date(startedAt.getTime() + duration * 60_000)
                    : null;

                  return (
                    <div key={flight.id} className="rounded-md border border-border p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-medium">
                            {flight.code} · {flight.name}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(flight.startTime)}
                          </div>
                        </div>
                        <div className="text-xs tabular-nums text-muted-foreground">
                          {duration} {t('competitionOps.minutesShort')} · {t('competitionOps.end')}:{' '}
                          {formatTime(endsAt)}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {flight.groups.map((group) => {
                          const count = nominationsInFlight.filter(
                            (nomination) => nomination.groupId === group.id,
                          ).length;
                          return (
                            <span
                              key={group.id}
                              data-testid={`flight-group-drop-${group.id}`}
                              title={
                                onAssignNomination ? t('competitionOps.flightDropHint') : undefined
                              }
                              onDragOver={(event) => {
                                if (!onAssignNomination) return;
                                event.preventDefault();
                                event.dataTransfer.dropEffect = 'move';
                              }}
                              onDrop={(event) => {
                                if (!onAssignNomination) return;
                                event.preventDefault();
                                const nominationId =
                                  event.dataTransfer.getData('application/x-nomination-id') ||
                                  event.dataTransfer.getData('text/plain');
                                if (!nominationId) return;
                                void onAssignNomination(nominationId, flight.id, group.id);
                              }}
                              className={`rounded border border-border px-2 py-1 ${
                                onAssignNomination
                                  ? 'cursor-copy bg-muted/30 transition-colors hover:border-primary hover:bg-primary/5'
                                  : ''
                              }`}
                            >
                              {group.name}: {count}
                            </span>
                          );
                        })}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {t('competitionOps.nominationsInFlight', {
                          count: nominationsInFlight.length,
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </WorkspacePanel>
        ))}
      </div>
    </>
  );
}

function FlightBulkAssignmentPanel({
  data,
  nominations,
  onDone,
}: {
  data: CompetitionOpsResponse;
  nominations: NominationDto[];
  onDone: () => Promise<unknown>;
}) {
  const { t } = useTranslation();
  const flights = data.platforms.flatMap((platform) =>
    platform.flights.map((flight) => ({ ...flight, platformName: platform.name })),
  );
  const [flightId, setFlightId] = useState(flights[0]?.id ?? '');
  const [groupId, setGroupId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const groups = groupsForFlight(data.platforms, flightId);

  useEffect(() => {
    if (flights.length === 0) {
      if (flightId) setFlightId('');
      return;
    }
    if (!flights.some((flight) => flight.id === flightId)) setFlightId(flights[0]?.id ?? '');
  }, [flightId, flights]);

  useEffect(() => {
    if (groups.length === 0) {
      if (groupId) setGroupId('');
      return;
    }
    if (!groups.some((group) => group.id === groupId)) setGroupId(groups[0]?.id ?? '');
  }, [groupId, groups]);

  async function assignFiltered() {
    if (!flightId || !groupId || nominations.length === 0) return;
    setIsSaving(true);
    try {
      await Promise.all(
        nominations.map((nomination) =>
          api.competitions.updateNomination(nomination.id, {
            flightId,
            groupId,
          }),
        ),
      );
      await onDone();
      toast.success(t('competitionOps.flightBulkAssigned', { count: nominations.length }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <WorkspacePanel className="p-3 space-y-3" data-testid="flight-bulk-assignment">
      <div className="mb-2">
        <WorkspaceSectionTitle>{t('competitionOps.flightBulkAssignTitle')}</WorkspaceSectionTitle>
        <div className="pt-muted text-xs">{t('competitionOps.flightBulkAssignDesc')}</div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <div className="space-y-2">
          <label className="pt-label" htmlFor="flightBulkFlight">
            {t('competitionOps.fields.flight')}
          </label>
          <select
            id="flightBulkFlight"
            data-testid="flight-bulk-flight"
            value={flightId}
            onChange={(e) => {
              setFlightId(e.target.value);
              setGroupId('');
            }}
            className="pt-select"
            disabled={flights.length === 0}
          >
            {flights.length === 0 ? (
              <option value="">{t('competitionOps.noFlights')}</option>
            ) : (
              flights.map((flight) => (
                <option key={flight.id} value={flight.id}>
                  {flight.platformName} · {flight.code} · {flight.name}
                </option>
              ))
            )}
          </select>
        </div>
        <div className="space-y-2">
          <label className="pt-label" htmlFor="flightBulkGroup">
            {t('competitionOps.fields.group')}
          </label>
          <select
            id="flightBulkGroup"
            data-testid="flight-bulk-group"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className="pt-select"
            disabled={groups.length === 0}
          >
            {groups.length === 0 ? (
              <option value="">{t('competitionOps.fields.noGroup')}</option>
            ) : (
              groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))
            )}
          </select>
        </div>
        <WorkspaceButton
          data-testid="flight-bulk-assign"
          type="button"
          onClick={() => void assignFiltered()}
          disabled={isSaving || !flightId || !groupId || nominations.length === 0}
        >
          {isSaving
            ? t('common.saving')
            : t('competitionOps.flightBulkAssignAction', { count: nominations.length })}
        </WorkspaceButton>
      </div>
    </WorkspacePanel>
  );
}

function JudgeAssignmentsPanel({
  competitionId,
  data,
}: {
  competitionId: string;
  data: CompetitionOpsResponse;
}) {
  const { t } = useTranslation();
  const createAssignment = useCreateJudgeAssignment(competitionId);
  const deleteAssignment = useDeleteJudgeAssignment(competitionId);
  const [judgeSearch, setJudgeSearch] = useState('');
  const judgeSearchTerm = judgeSearch.trim();
  const { data: judgesData, isLoading } = useQuery({
    queryKey: ['judges', { assignmentPanel: true, limit: 200, search: judgeSearchTerm }],
    queryFn: () =>
      api.judges.list(judgeSearchTerm ? { limit: 200, search: judgeSearchTerm } : { limit: 200 }),
  });
  const judges = useMemo(() => judgesData?.judges ?? [], [judgesData?.judges]);
  const [judgeId, setJudgeId] = useState('');
  const [role, setRole] = useState<JudgeRole>('head');
  const [platformId, setPlatformId] = useState('global');

  useEffect(() => {
    const firstJudge = judges[0];
    if (!firstJudge) {
      if (judgeId) setJudgeId('');
      return;
    }
    if (!judges.some((judge) => judge.id === judgeId)) setJudgeId(firstJudge.id);
  }, [judgeId, judges]);

  async function assignJudge() {
    if (!judgeId) {
      toast.error(t('competitionOps.judges.chooseJudge'));
      return;
    }
    try {
      await createAssignment.mutateAsync({
        judgeId,
        role,
        platformId: platformId === 'global' ? null : platformId,
      });
      toast.success(t('competitionOps.judges.assigned'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function removeAssignment(assignmentId: string) {
    try {
      await deleteAssignment.mutateAsync(assignmentId);
      toast.success(t('competitionOps.judges.removed'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <WorkspacePanel className="p-3 space-y-3" data-testid="judge-assignment-panel">
      <div className="mb-2">
        <WorkspaceSectionTitle>{t('competitionOps.judges.title')}</WorkspaceSectionTitle>
        <div className="pt-muted text-xs">{t('competitionOps.judges.desc')}</div>
      </div>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <label className="pt-label" htmlFor="judgeAssignmentJudge">
              {t('competitionOps.fields.judge')}
            </label>
            <input
              className="pt-field"
              id="judgeAssignmentSearch"
              data-testid="judge-assignment-search"
              value={judgeSearch}
              onChange={(e) => setJudgeSearch(e.target.value)}
              placeholder={t('common.search')}
            />
            <select
              id="judgeAssignmentJudge"
              data-testid="judge-assignment-judge"
              value={judgeId}
              onChange={(e) => setJudgeId(e.target.value)}
              className="pt-select"
              disabled={isLoading || judges.length === 0}
            >
              {judges.length === 0 ? (
                <option value="">{t('competitionOps.judges.noJudges')}</option>
              ) : (
                judges.map((judge) => (
                  <option key={judge.id} value={judge.id}>
                    {fullName(judge)}
                    {judge.categoryRu ? ` · ${judge.categoryRu}` : ''}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="space-y-2">
            <label className="pt-label" htmlFor="judgeAssignmentRole">
              {t('competitionOps.fields.role')}
            </label>
            <select
              id="judgeAssignmentRole"
              data-testid="judge-assignment-role"
              value={role}
              onChange={(e) => setRole(e.target.value as JudgeRole)}
              className="pt-select"
            >
              {JUDGE_ROLES.map((item) => (
                <option key={item} value={item}>
                  {t(`competitionOps.judgeRole.${item}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <label className="pt-label" htmlFor="judgeAssignmentPlatform">
              {t('competitionOps.fields.platform')}
            </label>
            <select
              id="judgeAssignmentPlatform"
              data-testid="judge-assignment-platform"
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
              className="pt-select"
            >
              <option value="global">{t('competitionOps.judges.allPlatforms')}</option>
              {data.platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
            </select>
          </div>
          <WorkspaceButton
            data-testid="judge-assignment-create"
            type="button"
            onClick={() => void assignJudge()}
            disabled={createAssignment.isPending || judges.length === 0}
          >
            {createAssignment.isPending ? t('common.saving') : t('competitionOps.judges.assign')}
          </WorkspaceButton>
        </div>

        {judges.length === 0 && !isLoading && (
          <Link to="/judges/new" className="pt-link-button">
            {t('judges.create')}
          </Link>
        )}

        {data.judgeAssignments.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">{t('competitionOps.judges.empty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>{t('competitionOps.fields.judge')}</th>
                  <th>{t('competitionOps.fields.role')}</th>
                  <th>{t('competitionOps.fields.platform')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.judgeAssignments.map((assignment) => (
                  <tr key={assignment.id} data-testid="judge-assignment-row">
                    <td>
                      <div>{fullName(assignment.judge)}</div>
                      <div className="text-xs text-muted-foreground">
                        {assignment.judge.categoryRu ?? assignment.judge.cardNumber ?? '—'}
                      </div>
                    </td>
                    <td>{t(`competitionOps.judgeRole.${assignment.role}`)}</td>
                    <td>{assignment.platform?.name ?? t('competitionOps.judges.allPlatforms')}</td>
                    <td className="text-right">
                      <WorkspaceButton
                        type="button"
                        onClick={() => void removeAssignment(assignment.id)}
                        disabled={deleteAssignment.isPending}
                      >
                        {deleteAssignment.isPending
                          ? t('common.saving')
                          : t('competitionOps.judges.remove')}
                      </WorkspaceButton>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </WorkspacePanel>
  );
}

function NominationsTable({
  nominations,
  divisions,
  platforms,
  emptyText,
  draggableRows,
}: {
  nominations: NominationDto[];
  divisions: DivisionDto[];
  platforms: PlatformDto[];
  emptyText?: string;
  draggableRows?: boolean;
}) {
  const { t } = useTranslation();

  if (nominations.length === 0) {
    return (
      <p className="text-sm italic text-muted-foreground">
        {emptyText ?? t('competitionOps.empty')}
      </p>
    );
  }

  return (
    <div
      data-testid="nominations-table"
      className="overflow-x-auto rounded-md border border-border"
    >
      <table className="pt-grid">
        <thead>
          <tr>
            <th>{t('competitionOps.fields.athlete')}</th>
            <th>{t('competitionOps.fields.discipline')}</th>
            <th>{t('competitionOps.fields.entryNumber')}</th>
            <th>{t('competitionOps.fields.bodyWeight')}</th>
            <th>{t('competitionOps.fields.declaredWeightClass')}</th>
            <th>{t('competitionOps.fields.weightClass')}</th>
            <th>{t('competitionOps.fields.paymentStatus')}</th>
            <th>{t('competitionOps.fields.paidAmount')}</th>
            <th>{t('competitionOps.fields.paymentMethod')}</th>
            <th>{t('competitionOps.fields.status')}</th>
            <th>{t('competitionOps.fields.flight')}</th>
            <th>{t('competitionOps.fields.group')}</th>
            <th>{t('competitionOps.fields.mandate')}</th>
            <th>{t('competitionOps.fields.notes')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {nominations.map((nomination) => (
            <NominationEditorRow
              key={nomination.id}
              nomination={nomination}
              divisions={divisions}
              platforms={platforms}
              draggable={draggableRows ?? false}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NominationSecretaryGrid({
  data,
  nominations,
  bulkSaving,
  search,
  disciplineId,
  divisionId,
  weightClassId,
  status,
  paymentStatus,
  mandate,
  onSearchChange,
  onDisciplineChange,
  onDivisionChange,
  onWeightClassChange,
  onStatusChange,
  onPaymentStatusChange,
  onMandateChange,
  onBulkUpdate,
}: {
  data: CompetitionOpsResponse;
  nominations: NominationDto[];
  bulkSaving: string | null;
  search: string;
  disciplineId: string;
  divisionId: string;
  weightClassId: string;
  status: NominationDto['status'] | 'all';
  paymentStatus: NominationDto['paymentStatus'] | 'all';
  mandate: MandateFilter;
  onSearchChange: (value: string) => void;
  onDisciplineChange: (value: string) => void;
  onDivisionChange: (value: string) => void;
  onWeightClassChange: (value: string) => void;
  onStatusChange: (value: NominationDto['status'] | 'all') => void;
  onPaymentStatusChange: (value: NominationDto['paymentStatus'] | 'all') => void;
  onMandateChange: (value: MandateFilter) => void;
  onBulkUpdate: (kind: 'mandate' | 'paid', nominations: NominationDto[]) => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <NominationGridFilters
        data={data}
        search={search}
        disciplineId={disciplineId}
        divisionId={divisionId}
        weightClassId={weightClassId}
        status={status}
        paymentStatus={paymentStatus}
        mandate={mandate}
        onSearchChange={onSearchChange}
        onDisciplineChange={onDisciplineChange}
        onDivisionChange={onDivisionChange}
        onWeightClassChange={onWeightClassChange}
        onStatusChange={onStatusChange}
        onPaymentStatusChange={onPaymentStatusChange}
        onMandateChange={onMandateChange}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <WorkspaceButton
            data-testid="nomination-bulk-mandate"
            type="button"
            onClick={() => onBulkUpdate('mandate', nominations)}
            disabled={bulkSaving !== null || nominations.length === 0}
          >
            {bulkSaving === 'mandate'
              ? t('common.saving')
              : t('competitionOps.markFilteredMandate', { count: nominations.length })}
          </WorkspaceButton>
          <WorkspaceButton
            data-testid="nomination-bulk-paid"
            type="button"
            onClick={() => onBulkUpdate('paid', nominations)}
            disabled={bulkSaving !== null || nominations.length === 0}
          >
            {bulkSaving === 'paid'
              ? t('common.saving')
              : t('competitionOps.markFilteredPaid', { count: nominations.length })}
          </WorkspaceButton>
        </div>
        <div className="text-sm tabular-nums text-muted-foreground">
          {nominations.length} / {data.nominations.length}
        </div>
      </div>
      <NominationsTable
        nominations={nominations}
        divisions={data.divisions}
        platforms={data.platforms}
        emptyText={t('competitionOps.noFilteredNominations')}
      />
    </>
  );
}

function AttemptEditor({
  competitionId,
  nomination,
}: {
  competitionId: string;
  nomination: NominationDto;
}) {
  const { t } = useTranslation();
  const upsertAttempt = useUpsertAttempt(competitionId);
  const components = useMemo(
    () => (nomination.discipline.components.length > 0 ? nomination.discipline.components : []),
    [nomination.discipline.components],
  );
  const [componentId, setComponentId] = useState(components[0]?.id ?? '');
  const component = components.find((item) => item.id === componentId);
  const used = new Set(
    nomination.attempts
      .filter((attempt) => attempt.componentId === componentId)
      .map((attempt) => attempt.attemptNumber),
  );
  const nextAttempt =
    Array.from(
      { length: component?.attemptCount ?? nomination.discipline.attemptCount },
      (_, index) => index + 1,
    ).find((attempt) => !used.has(attempt)) ?? 1;
  const [attemptNumber, setAttemptNumber] = useState(String(nextAttempt));
  const [weightKg, setWeightKg] = useState(component?.fixedWeightKg?.toString() ?? '');
  const [repsCount, setRepsCount] = useState('');
  const [result, setResult] = useState<(typeof ATTEMPT_RESULTS)[number]>('pending');

  useEffect(() => {
    setComponentId(components[0]?.id ?? '');
  }, [components]);

  useEffect(() => {
    setAttemptNumber(String(nextAttempt));
    setWeightKg(component?.fixedWeightKg?.toString() ?? '');
  }, [component?.fixedWeightKg, nextAttempt]);

  async function saveAttempt() {
    const parsedAttemptNumber = Number(attemptNumber);
    const parsedWeight = Number(weightKg);
    if (
      !Number.isInteger(parsedAttemptNumber) ||
      parsedAttemptNumber < 1 ||
      parsedAttemptNumber > 5
    ) {
      toast.error(t('competitionOps.errors.invalidAttempt'));
      return;
    }
    if (!Number.isFinite(parsedWeight) || parsedWeight < 0) {
      toast.error(t('competitionOps.errors.invalidWeight'));
      return;
    }
    try {
      await upsertAttempt.mutateAsync({
        nominationId: nomination.id,
        componentId: componentId || null,
        attemptNumber: parsedAttemptNumber,
        data: {
          componentId: componentId || null,
          weightKg: parsedWeight,
          result,
          judgeDecisions: [],
          repsCount: nullableNumber(repsCount),
        },
      });
      setRepsCount('');
      toast.success(t('competitionOps.attemptSaved'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <tr data-testid="attempt-row" data-nomination-id={nomination.id}>
      <td className="min-w-44">
        <div>
          {nomination.entryNumber ? `#${nomination.entryNumber} · ` : ''}
          {fullName(nomination.athlete)}
        </div>
        <div className="text-xs text-muted-foreground">{nomination.weightClass.nameRu}</div>
      </td>
      <td className="min-w-56">{nomination.discipline.nameRu}</td>
      <td className="min-w-40">
        <select
          data-testid="attempt-component"
          value={componentId}
          onChange={(e) => setComponentId(e.target.value)}
          className="pt-select"
        >
          {components.map((item) => (
            <option key={item.id} value={item.id}>
              {componentLabel(item)}
            </option>
          ))}
        </select>
      </td>
      <td className="w-24">
        <input
          className="pt-field"
          data-testid="attempt-number"
          type="number"
          min="1"
          max="5"
          value={attemptNumber}
          onChange={(e) => setAttemptNumber(e.target.value)}
        />
      </td>
      <td className="w-28">
        <input
          className="pt-field"
          data-testid="attempt-weight"
          type="number"
          min="0"
          step="0.5"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
        />
      </td>
      <td className="w-24">
        <input
          className="pt-field"
          data-testid="attempt-reps"
          type="number"
          min="0"
          value={repsCount}
          onChange={(e) => setRepsCount(e.target.value)}
        />
      </td>
      <td className="min-w-32">
        <select
          data-testid="attempt-result"
          value={result}
          onChange={(e) => setResult(e.target.value as (typeof ATTEMPT_RESULTS)[number])}
          className="pt-select"
        >
          {ATTEMPT_RESULTS.map((value) => (
            <option key={value} value={value}>
              {t(`competitionOps.attemptResult.${value}`)}
            </option>
          ))}
        </select>
      </td>
      <td data-testid="attempt-summary" className="min-w-80 text-xs text-muted-foreground">
        {attemptSummary(nomination)}
      </td>
      <td className="text-right">
        <WorkspaceButton
          data-testid="attempt-save"
          type="button"
          onClick={() => void saveAttempt()}
          disabled={upsertAttempt.isPending}
        >
          {upsertAttempt.isPending ? t('common.saving') : t('competitionOps.saveAttempt')}
        </WorkspaceButton>
      </td>
    </tr>
  );
}

function ScoreboardTable({ data }: { data: CompetitionOpsResponse }) {
  const { t } = useTranslation();
  const rows =
    data.scoreboardRows.length > 0
      ? data.scoreboardRows
      : data.nominations.map((nomination) => ({
          nominationId: nomination.id,
          entryNumber: nomination.entryNumber,
          athleteName: fullName(nomination.athlete),
          discipline: nomination.discipline.nameRu,
          division: nomination.division.nameRu,
          weightClass: nomination.weightClass.nameRu,
          placeInClass: nomination.placeInClass,
          placeInDivision: nomination.placeInDivision,
          placeOverall: nomination.placeOverall,
          bestSuccessfulAttemptKg: nomination.bestSuccessfulAttemptKg,
          finalScore: nomination.finalScore,
          status: nomination.status,
        }));

  if (rows.length === 0)
    return <p className="text-sm italic text-muted-foreground">{t('scoreboard.empty')}</p>;

  return (
    <div data-testid="scoreboard-table" className="overflow-x-auto rounded-md border border-border">
      <table className="pt-grid">
        <thead>
          <tr>
            <th>{t('competitionOps.fields.entryNumber')}</th>
            <th>{t('competitionOps.fields.athlete')}</th>
            <th>{t('competitionOps.fields.discipline')}</th>
            <th>{t('competitionOps.fields.weightClass')}</th>
            <th>{t('competitionOps.fields.placeInClass')}</th>
            <th>{t('competitionOps.fields.placeOverall')}</th>
            <th>{t('scoreboard.best')}</th>
            <th>{t('scoreboard.score')}</th>
            <th>{t('competitionOps.fields.status')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.nominationId}>
              <td className="tabular-nums">{row.entryNumber ?? '—'}</td>
              <td>{row.athleteName}</td>
              <td>{row.discipline}</td>
              <td>{row.weightClass}</td>
              <td className="tabular-nums">{row.placeInClass ?? '—'}</td>
              <td className="tabular-nums">{row.placeOverall ?? '—'}</td>
              <td className="tabular-nums">{row.bestSuccessfulAttemptKg ?? '—'}</td>
              <td className="tabular-nums">{row.finalScore ?? '—'}</td>
              <td>{t(`competitionOps.status.${row.status}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function CompetitionOperationsFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false }) as { id: string };
  const location = useLocation();
  const initialTab = tabFromPath(location.pathname);
  const { data, isLoading, error, refetch } = useCompetitionOps(id);
  const applySetup = useApplyDefaultSetup(id);
  const drawNominations = useDrawNominations(id);
  const autoPlanFlights = useAutoPlanFlights(id);
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState<string | null>(null);
  const [flightSearch, setFlightSearch] = useState('');
  const [flightDisciplineId, setFlightDisciplineId] = useState('all');
  const [flightDivisionId, setFlightDivisionId] = useState('all');
  const [flightWeightClassId, setFlightWeightClassId] = useState('all');
  const [flightAssignment, setFlightAssignment] = useState<AssignmentFilter>('all');
  const [flightStatus, setFlightStatus] = useState<NominationDto['status'] | 'all'>('all');
  const [nominationSearch, setNominationSearch] = useState('');
  const [nominationDisciplineId, setNominationDisciplineId] = useState('all');
  const [nominationDivisionId, setNominationDivisionId] = useState('all');
  const [nominationWeightClassId, setNominationWeightClassId] = useState('all');
  const [nominationStatus, setNominationStatus] = useState<NominationDto['status'] | 'all'>('all');
  const [nominationPaymentStatus, setNominationPaymentStatus] = useState<
    NominationDto['paymentStatus'] | 'all'
  >('all');
  const [nominationMandate, setNominationMandate] = useState<MandateFilter>('all');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  async function exportFile(kind: 'protocol' | 'accounting', format: 'csv' | 'xlsx') {
    setDownloading(kind);
    try {
      const filename = `${data?.competition.code ?? 'competition'}-${kind}.${format}`;
      if (format === 'csv') {
        const text =
          kind === 'protocol'
            ? await api.competitions.protocolCsv(id)
            : await api.competitions.accountingCsv(id);
        downloadText(filename, text);
      } else {
        const blob =
          kind === 'protocol'
            ? await api.competitions.protocolXlsx(id)
            : await api.competitions.accountingXlsx(id);
        downloadBlob(filename, blob);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setDownloading(null);
    }
  }

  async function assignNominationToGroup(nominationId: string, flightId: string, groupId: string) {
    try {
      await api.competitions.updateNomination(nominationId, { flightId, groupId });
      await refetch();
      toast.success(t('competitionOps.flightDropAssigned'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function applyDefaultSetup() {
    try {
      await applySetup.mutateAsync();
      toast.success(t('competitionOps.setupApplied'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function bulkUpdate(kind: 'mandate' | 'paid', nominations: NominationDto[]) {
    if (!data || nominations.length === 0) return;
    setBulkSaving(kind);
    try {
      await Promise.all(
        nominations.map((nomination) =>
          api.competitions.updateNomination(
            nomination.id,
            kind === 'mandate'
              ? { isMandatePassed: true }
              : {
                  paymentStatus: 'paid',
                  isEntryFeePaid: true,
                  paidAmountKopecks: Number(data.competition.entryFeeKopecks),
                  paymentMethod: 'cash',
                },
          ),
        ),
      );
      await refetch();
      toast.success(t('competitionOps.bulkUpdated'));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setBulkSaving(null);
    }
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

  const setupReady = hasSetup(data);
  const filteredNominationGrid = data.nominations.filter((nomination) => {
    if (!nominationMatchesSearch(nomination, nominationSearch)) return false;
    if (nominationDisciplineId !== 'all' && nomination.disciplineId !== nominationDisciplineId)
      return false;
    if (nominationDivisionId !== 'all' && nomination.divisionId !== nominationDivisionId)
      return false;
    if (nominationWeightClassId !== 'all' && nomination.weightClassId !== nominationWeightClassId)
      return false;
    if (nominationStatus !== 'all' && nomination.status !== nominationStatus) return false;
    if (nominationPaymentStatus !== 'all' && nomination.paymentStatus !== nominationPaymentStatus)
      return false;
    if (nominationMandate === 'passed' && !nomination.isMandatePassed) return false;
    if (nominationMandate === 'missing' && nomination.isMandatePassed) return false;
    return true;
  });
  const filteredFlightNominations = data.nominations.filter((nomination) => {
    if (!nominationMatchesSearch(nomination, flightSearch)) return false;
    if (flightDisciplineId !== 'all' && nomination.disciplineId !== flightDisciplineId)
      return false;
    if (flightDivisionId !== 'all' && nomination.divisionId !== flightDivisionId) return false;
    if (flightWeightClassId !== 'all' && nomination.weightClassId !== flightWeightClassId)
      return false;
    if (flightStatus !== 'all' && nomination.status !== flightStatus) return false;
    if (flightAssignment === 'assigned' && (!nomination.flightId || !nomination.groupId))
      return false;
    if (flightAssignment === 'unassigned' && nomination.flightId && nomination.groupId)
      return false;
    return true;
  });

  return (
    <WorkspacePage
      title={t(`competitionOps.sectionTitles.${tab}`)}
      subtitle={`${data.competition.nameRu} · ${data.competition.federation.nameRu}`}
      actions={
        <>
          <Link to="/competitions/$id" params={{ id }} className="pt-link-button">
            {t('competitionOps.backToCompetition')}
          </Link>
          <Link to="/competitions/$id/scoreboard" params={{ id }} className="pt-link-button">
            {t('competitionOps.hallScreen')}
          </Link>
          <Link to="/competitions/$id/operator" params={{ id }} className="pt-link-button">
            {t('competitionOperator.title')}
          </Link>
          <Link to="/competitions/$id/judge" params={{ id }} className="pt-link-button">
            {t('competitionJudge.title')}
          </Link>
          <Link to="/competitions/$id/reports" params={{ id }} className="pt-link-button">
            {t('competitionOps.tabs.exports')}
          </Link>
          <Link to="/broadcast/competitions/$id" params={{ id }} className="pt-link-button">
            Broadcast
          </Link>
        </>
      }
    >
      <div data-testid="competition-ops" className="space-y-5">
        <div
          className="pt-metric-strip"
          style={{ gridTemplateColumns: 'repeat(5, minmax(0, 1fr))' }}
        >
          <div className="pt-metric-cell">
            <span>{t('competitionOps.metrics.total')}</span>
            <strong>{data.accounting.totalNominations}</strong>
          </div>
          <div className="pt-metric-cell">
            <span>{t('competitionOps.metrics.paid')}</span>
            <strong>{data.accounting.paidNominations}</strong>
          </div>
          <div className="pt-metric-cell">
            <span>{t('competitionOps.metrics.weighedIn')}</span>
            <strong>{data.accounting.weighedInNominations}</strong>
          </div>
          <div className="pt-metric-cell">
            <span>{t('competitionOps.metrics.entryFees')}</span>
            <strong>{formatRub(data.accounting.paidEntryFeeKopecks)}</strong>
          </div>
          <div className="pt-metric-cell">
            <span>{t('competitionOps.metrics.billing')}</span>
            <strong>{formatRub(data.accounting.federationBillingKopecks)}</strong>
          </div>
        </div>

        <div className="pt-tabs" role="tablist">
          {TABS.map((item) => (
            <button
              key={item}
              data-testid={`ops-tab-${item}`}
              type="button"
              role="tab"
              aria-selected={tab === item}
              className={`pt-tab${tab === item ? ' is-active' : ''}`}
              onClick={() => setTab(item)}
            >
              {t(`competitionOps.tabs.${item}`)}
            </button>
          ))}
        </div>

        {tab === 'setup' && (
          <WorkspacePanel className="p-3 space-y-3">
            <div className="mb-2">
              <WorkspaceSectionTitle>{t('competitionOps.tabs.setup')}</WorkspaceSectionTitle>
              <div className="pt-muted text-xs">
                {setupReady ? t('competitionOps.setupReady') : t('competitionOps.setupDesc')}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <WorkspaceButton
                data-testid="ops-apply-setup"
                type="button"
                onClick={() => void applyDefaultSetup()}
                disabled={applySetup.isPending}
              >
                {applySetup.isPending ? t('common.saving') : t('competitionOps.applySetup')}
              </WorkspaceButton>
              <WorkspaceButton
                data-testid="ops-draw-numbers"
                type="button"
                onClick={() =>
                  void drawNominations
                    .mutateAsync({ overwrite: true })
                    .then(() => toast.success(t('competitionOps.drawApplied')))
                }
                disabled={drawNominations.isPending || data.nominations.length === 0}
              >
                {drawNominations.isPending ? t('common.saving') : t('competitionOps.drawNumbers')}
              </WorkspaceButton>
              <WorkspaceButton
                data-testid="ops-auto-plan"
                type="button"
                onClick={() =>
                  void autoPlanFlights
                    .mutateAsync({})
                    .then(() => toast.success(t('competitionOps.planApplied')))
                }
                disabled={autoPlanFlights.isPending || data.nominations.length === 0}
              >
                {autoPlanFlights.isPending ? t('common.saving') : t('competitionOps.autoPlan')}
              </WorkspaceButton>
            </div>
          </WorkspacePanel>
        )}

        {tab === 'nominations' && (
          <div className="space-y-4">
            {!setupReady && (
              <SetupRequiredCard
                pending={applySetup.isPending}
                onApply={() => void applyDefaultSetup()}
              />
            )}
            {setupReady && <NominationCreateForm competitionId={id} divisions={data.divisions} />}
            <NominationSecretaryGrid
              data={data}
              nominations={filteredNominationGrid}
              bulkSaving={bulkSaving}
              search={nominationSearch}
              disciplineId={nominationDisciplineId}
              divisionId={nominationDivisionId}
              weightClassId={nominationWeightClassId}
              status={nominationStatus}
              paymentStatus={nominationPaymentStatus}
              mandate={nominationMandate}
              onSearchChange={setNominationSearch}
              onDisciplineChange={setNominationDisciplineId}
              onDivisionChange={(value) => {
                setNominationDivisionId(value);
                setNominationWeightClassId('all');
              }}
              onWeightClassChange={setNominationWeightClassId}
              onStatusChange={setNominationStatus}
              onPaymentStatusChange={setNominationPaymentStatus}
              onMandateChange={setNominationMandate}
              onBulkUpdate={(kind, nominations) => void bulkUpdate(kind, nominations)}
            />
          </div>
        )}

        {tab === 'mandate' && (
          <div className="space-y-4">
            {!setupReady && (
              <SetupRequiredCard
                pending={applySetup.isPending}
                onApply={() => void applyDefaultSetup()}
              />
            )}
            <NominationSecretaryGrid
              data={data}
              nominations={filteredNominationGrid}
              bulkSaving={bulkSaving}
              search={nominationSearch}
              disciplineId={nominationDisciplineId}
              divisionId={nominationDivisionId}
              weightClassId={nominationWeightClassId}
              status={nominationStatus}
              paymentStatus={nominationPaymentStatus}
              mandate={nominationMandate}
              onSearchChange={setNominationSearch}
              onDisciplineChange={setNominationDisciplineId}
              onDivisionChange={(value) => {
                setNominationDivisionId(value);
                setNominationWeightClassId('all');
              }}
              onWeightClassChange={setNominationWeightClassId}
              onStatusChange={setNominationStatus}
              onPaymentStatusChange={setNominationPaymentStatus}
              onMandateChange={setNominationMandate}
              onBulkUpdate={(kind, nominations) => void bulkUpdate(kind, nominations)}
            />
          </div>
        )}

        {tab === 'flights' && (
          <div className="space-y-4">
            {!setupReady && (
              <SetupRequiredCard
                pending={applySetup.isPending}
                onApply={() => void applyDefaultSetup()}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <WorkspaceButton
                data-testid="ops-auto-plan-flights"
                type="button"
                onClick={() =>
                  void autoPlanFlights
                    .mutateAsync({})
                    .then(() => toast.success(t('competitionOps.planApplied')))
                }
                disabled={autoPlanFlights.isPending || data.nominations.length === 0}
              >
                {autoPlanFlights.isPending ? t('common.saving') : t('competitionOps.autoPlan')}
              </WorkspaceButton>
            </div>
            <FlightPlanningPanel data={data} onAssignNomination={assignNominationToGroup} />
            <FlightFilters
              data={data}
              search={flightSearch}
              disciplineId={flightDisciplineId}
              divisionId={flightDivisionId}
              weightClassId={flightWeightClassId}
              assignment={flightAssignment}
              status={flightStatus}
              onSearchChange={setFlightSearch}
              onDisciplineChange={setFlightDisciplineId}
              onDivisionChange={(value) => {
                setFlightDivisionId(value);
                setFlightWeightClassId('all');
              }}
              onWeightClassChange={setFlightWeightClassId}
              onAssignmentChange={setFlightAssignment}
              onStatusChange={setFlightStatus}
            />
            <FlightBulkAssignmentPanel
              data={data}
              nominations={filteredFlightNominations}
              onDone={refetch}
            />
            <div>
              <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold">
                    {t('competitionOps.filteredNominations')}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {t('competitionOps.filteredNominationsDesc')}
                  </p>
                </div>
                <div className="text-sm tabular-nums text-muted-foreground">
                  {filteredFlightNominations.length} / {data.nominations.length}
                </div>
              </div>
              <NominationsTable
                nominations={filteredFlightNominations}
                divisions={data.divisions}
                platforms={data.platforms}
                emptyText={t('competitionOps.noFilteredNominations')}
                draggableRows
              />
            </div>
          </div>
        )}

        {tab === 'judges' && <JudgeAssignmentsPanel competitionId={id} data={data} />}

        {tab === 'attempts' && (
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>{t('competitionOps.fields.athlete')}</th>
                  <th>{t('competitionOps.fields.discipline')}</th>
                  <th>{t('competitionOps.fields.component')}</th>
                  <th>{t('competitionOps.fields.attempt')}</th>
                  <th>{t('competitionOps.fields.weightKg')}</th>
                  <th>{t('competitionOps.fields.reps')}</th>
                  <th>{t('competitionOps.fields.result')}</th>
                  <th>{t('scoreboard.attempts')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.nominations.map((nomination) => (
                  <AttemptEditor key={nomination.id} competitionId={id} nomination={nomination} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'scoreboard' && <ScoreboardTable data={data} />}

        {tab === 'exports' && (
          <WorkspacePanel className="p-3 space-y-3">
            <div className="mb-2">
              <WorkspaceSectionTitle>{t('competitionOps.tabs.exports')}</WorkspaceSectionTitle>
              <div className="pt-muted text-xs">{t('competitionOps.exportsDesc')}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <WorkspaceButton
                data-testid="ops-export-protocol"
                type="button"
                onClick={() => void exportFile('protocol', 'csv')}
                disabled={downloading !== null}
              >
                {downloading === 'protocol'
                  ? t('common.saving')
                  : t('competitionOps.exportProtocol')}
              </WorkspaceButton>
              <WorkspaceButton
                data-testid="ops-export-protocol-xlsx"
                type="button"
                onClick={() => void exportFile('protocol', 'xlsx')}
                disabled={downloading !== null}
              >
                {downloading === 'protocol'
                  ? t('common.saving')
                  : t('competitionOps.exportProtocolXlsx')}
              </WorkspaceButton>
              <WorkspaceButton
                data-testid="ops-export-accounting"
                type="button"
                onClick={() => void exportFile('accounting', 'csv')}
                disabled={downloading !== null}
              >
                {downloading === 'accounting'
                  ? t('common.saving')
                  : t('competitionOps.exportAccounting')}
              </WorkspaceButton>
              <WorkspaceButton
                data-testid="ops-export-accounting-xlsx"
                type="button"
                onClick={() => void exportFile('accounting', 'xlsx')}
                disabled={downloading !== null}
              >
                {downloading === 'accounting'
                  ? t('common.saving')
                  : t('competitionOps.exportAccountingXlsx')}
              </WorkspaceButton>
              <Link
                to="/competitions/$id/protocol-print"
                params={{ id }}
                className="pt-link-button"
              >
                {t('protocolPrint.title')}
              </Link>
            </div>
          </WorkspacePanel>
        )}
      </div>
    </WorkspacePage>
  );
}
