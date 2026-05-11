import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { JudgeRole } from '@streetlifting/domain';
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
const TABS = ['setup', 'nominations', 'mandate', 'flights', 'judges', 'attempts', 'scoreboard', 'exports'] as const;
const ASSIGNMENT_FILTERS = ['all', 'assigned', 'unassigned'] as const;
const MINUTES_PER_ATTEMPT = 1;
const BREAK_BETWEEN_FLIGHTS_MINUTES = 5;

type TabKey = (typeof TABS)[number];
type AssignmentFilter = (typeof ASSIGNMENT_FILTERS)[number];

const controlClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function fullName(person: { lastName: string; firstName: string; middleName?: string | null }): string {
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

function weightClassesForNomination(divisions: DivisionDto[], nomination: NominationDto): WeightClassDto[] {
  return weightClassesForDivision(divisions, nomination.divisionId).filter(
    (weightClass) => !weightClass.disciplineId || weightClass.disciplineId === nomination.disciplineId,
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
  return data.divisions.length > 0 && data.divisions.some((division) => division.weightClasses.length > 0);
}

function attemptsPerNomination(nomination: NominationDto): number {
  if (nomination.discipline.components.length > 0) {
    return nomination.discipline.components.reduce((total, component) => total + component.attemptCount, 0);
  }
  return nomination.discipline.attemptCount;
}

function estimateDurationMinutes(nominations: NominationDto[]): number {
  return nominations.reduce((total, nomination) => total + attemptsPerNomination(nomination), 0) * MINUTES_PER_ATTEMPT;
}

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleString() : '—';
}

function formatTime(value: Date | null): string {
  return value ? value.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
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

function NominationCreateForm({ competitionId, divisions }: { competitionId: string; divisions: DivisionDto[] }) {
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
    if (!disciplineId && disciplinesData?.disciplines[0]) setDisciplineId(disciplinesData.disciplines[0].id);
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
    <Card>
      <CardHeader>
        <CardTitle>{t('competitionOps.createNomination')}</CardTitle>
        <CardDescription>{t('competitionOps.createNominationDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          data-testid="nomination-create-form"
          onSubmit={(e) => void onSubmit(e)}
          className="grid grid-cols-1 gap-3 xl:grid-cols-12"
        >
          <div className="space-y-2 xl:col-span-3">
            <Label htmlFor="nominationAthlete">{t('competitionOps.fields.athlete')}</Label>
            <select
              id="nominationAthlete"
              data-testid="nomination-athlete"
              value={athleteId}
              onChange={(e) => setAthleteId(e.target.value)}
              className={controlClass}
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
            <Label htmlFor="nominationDiscipline">{t('competitionOps.fields.discipline')}</Label>
            <select
              id="nominationDiscipline"
              data-testid="nomination-discipline"
              value={disciplineId}
              onChange={(e) => setDisciplineId(e.target.value)}
              className={controlClass}
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
            <Label htmlFor="nominationDivision">{t('competitionOps.fields.division')}</Label>
            <select
              id="nominationDivision"
              data-testid="nomination-division"
              value={divisionId}
              onChange={(e) => setDivisionId(e.target.value)}
              className={controlClass}
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
            <Label htmlFor="nominationWeightClass">{t('competitionOps.fields.declaredWeightClass')}</Label>
            <select
              id="nominationWeightClass"
              data-testid="nomination-weight-class"
              value={declaredWeightClassId}
              onChange={(e) => setDeclaredWeightClassId(e.target.value)}
              className={controlClass}
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
            <Label htmlFor="nominationEntry">{t('competitionOps.fields.entryNumber')}</Label>
            <Input
              id="nominationEntry"
              data-testid="nomination-entry"
              type="number"
              min="1"
              value={entryNumber}
              onChange={(e) => setEntryNumber(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nominationNotes">{t('competitionOps.fields.notes')}</Label>
            <Input id="nominationNotes" data-testid="nomination-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex items-end justify-end xl:col-span-12">
            <Button data-testid="nomination-submit" type="submit" disabled={!canSubmit || create.isPending}>
              {create.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function NominationEditorRow({
  nomination,
  divisions,
  platforms,
}: {
  nomination: NominationDto;
  divisions: DivisionDto[];
  platforms: PlatformDto[];
}) {
  const { t } = useTranslation();
  const updateNomination = useUpdateNomination(nomination.competitionId);
  const [entryNumber, setEntryNumber] = useState(nomination.entryNumber?.toString() ?? '');
  const [bodyWeight, setBodyWeight] = useState(nomination.bodyWeightAtWeighIn?.toString() ?? '');
  const [status, setStatus] = useState<NominationDto['status']>(nomination.status);
  const [declaredWeightClassId, setDeclaredWeightClassId] = useState(nomination.declaredWeightClassId ?? nomination.weightClassId);
  const [weightClassId, setWeightClassId] = useState(nomination.weightClassId);
  const [weightClassTouched, setWeightClassTouched] = useState(false);
  const [flightId, setFlightId] = useState(nomination.flightId ?? '');
  const [groupId, setGroupId] = useState(nomination.groupId ?? '');
  const [paymentStatus, setPaymentStatus] = useState<NominationDto['paymentStatus']>(nomination.paymentStatus);
  const [paidAmountRub, setPaidAmountRub] = useState(kopecksToRub(nomination.paidAmountKopecks));
  const [paymentMethod, setPaymentMethod] = useState<NominationDto['paymentMethod']>(nomination.paymentMethod);
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
    <TableRow data-testid="nomination-row" data-nomination-id={nomination.id}>
      <TableCell className="min-w-32">{fullName(nomination.athlete)}</TableCell>
      <TableCell className="min-w-56">
        <div>{nomination.discipline.nameRu}</div>
        <div className="text-xs text-muted-foreground">{nomination.division.nameRu}</div>
      </TableCell>
      <TableCell className="w-24">
        <Input
          data-testid="nomination-row-entry"
          type="number"
          min="1"
          value={entryNumber}
          onChange={(e) => setEntryNumber(e.target.value)}
        />
      </TableCell>
      <TableCell className="w-28">
        <Input
          data-testid="nomination-row-body-weight"
          type="number"
          min="0"
          step="0.01"
          value={bodyWeight}
          onChange={(e) => updateBodyWeight(e.target.value)}
        />
      </TableCell>
      <TableCell className="min-w-36">
        <select
          data-testid="nomination-row-declared-weight-class"
          value={declaredWeightClassId}
          onChange={(e) => setDeclaredWeightClassId(e.target.value)}
          className={controlClass}
        >
          {weightClasses.map((weightClass) => (
            <option key={weightClass.id} value={weightClass.id}>
              {weightClass.nameRu}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="min-w-36">
        <select
          data-testid="nomination-row-weight-class"
          value={weightClassId}
          onChange={(e) => {
            setWeightClassTouched(true);
            setWeightClassId(e.target.value);
          }}
          className={controlClass}
        >
          {weightClasses.map((weightClass) => (
            <option key={weightClass.id} value={weightClass.id}>
              {weightClass.nameRu}
            </option>
          ))}
        </select>
        {autoWeightClass && autoWeightClass.id === weightClassId && (
          <div data-testid="nomination-row-auto-weight-class" className="mt-1 text-xs text-muted-foreground">
            {t('competitionOps.autoWeightClass', { value: autoWeightClass.nameRu })}
          </div>
        )}
      </TableCell>
      <TableCell className="min-w-32">
        <select
          data-testid="nomination-row-payment-status"
          value={paymentStatus}
          onChange={(e) => setPaymentStatus(e.target.value as NominationDto['paymentStatus'])}
          className={controlClass}
        >
          {PAYMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`competitionOps.paymentStatus.${value}`)}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="w-28">
        <Input
          data-testid="nomination-row-paid-amount"
          type="number"
          min="0"
          step="1"
          value={paidAmountRub}
          onChange={(e) => setPaidAmountRub(e.target.value)}
        />
      </TableCell>
      <TableCell className="min-w-32">
        <select
          data-testid="nomination-row-payment-method"
          value={paymentMethod ?? ''}
          onChange={(e) => setPaymentMethod((e.target.value || null) as NominationDto['paymentMethod'])}
          className={controlClass}
        >
          <option value="">{t('competitionOps.paymentMethod.none')}</option>
          {PAYMENT_METHODS.map((value) => (
            <option key={value} value={value}>
              {t(`competitionOps.paymentMethod.${value}`)}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="min-w-32">
        <select
          data-testid="nomination-row-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as NominationDto['status'])}
          className={controlClass}
        >
          {NOMINATION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`competitionOps.status.${value}`)}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="min-w-40">
        <select
          data-testid="nomination-row-flight"
          value={flightId}
          onChange={(e) => { setFlightId(e.target.value); setGroupId(''); }}
          className={controlClass}
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
      </TableCell>
      <TableCell className="min-w-32">
        <select
          data-testid="nomination-row-group"
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className={controlClass}
        >
          <option value="">{t('competitionOps.fields.noGroup')}</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="w-24 text-center">
        <input
          data-testid="nomination-row-mandate"
          type="checkbox"
          checked={isMandatePassed}
          onChange={(e) => setIsMandatePassed(e.target.checked)}
          className="h-4 w-4"
        />
      </TableCell>
      <TableCell className="min-w-44">
        <Input
          data-testid="nomination-row-notes"
          value={paymentComment || notes}
          onChange={(e) => { setPaymentComment(e.target.value); setNotes(e.target.value); }}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button
          data-testid="nomination-row-save"
          type="button"
          size="sm"
          onClick={() => void save()}
          disabled={updateNomination.isPending}
        >
          {updateNomination.isPending ? t('common.saving') : t('common.save')}
        </Button>
      </TableCell>
    </TableRow>
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
    new Map(data.nominations.map((nomination) => [nomination.discipline.id, nomination.discipline])).values(),
  );
  const weightClasses = data.divisions
    .filter((division) => divisionId === 'all' || division.id === divisionId)
    .flatMap((division) => division.weightClasses);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('competitionOps.flightFilters')}</CardTitle>
        <CardDescription>{t('competitionOps.flightFiltersDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
        <div className="space-y-2 md:col-span-2 xl:col-span-2">
          <Label htmlFor="flightSearch">{t('common.search')}</Label>
          <Input
            id="flightSearch"
            data-testid="flight-filter-search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t('competitionOps.flightSearchPlaceholder')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="flightDiscipline">{t('competitionOps.fields.discipline')}</Label>
          <select
            id="flightDiscipline"
            data-testid="flight-filter-discipline"
            value={disciplineId}
            onChange={(e) => onDisciplineChange(e.target.value)}
            className={controlClass}
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
          <Label htmlFor="flightDivision">{t('competitionOps.fields.division')}</Label>
          <select
            id="flightDivision"
            data-testid="flight-filter-division"
            value={divisionId}
            onChange={(e) => onDivisionChange(e.target.value)}
            className={controlClass}
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
          <Label htmlFor="flightWeightClass">{t('competitionOps.fields.weightClass')}</Label>
          <select
            id="flightWeightClass"
            data-testid="flight-filter-weight-class"
            value={weightClassId}
            onChange={(e) => onWeightClassChange(e.target.value)}
            className={controlClass}
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
          <Label htmlFor="flightAssignment">{t('competitionOps.assignment.title')}</Label>
          <select
            id="flightAssignment"
            data-testid="flight-filter-assignment"
            value={assignment}
            onChange={(e) => onAssignmentChange(e.target.value as AssignmentFilter)}
            className={controlClass}
          >
            {ASSIGNMENT_FILTERS.map((item) => (
              <option key={item} value={item}>
                {t(`competitionOps.assignment.${item}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="flightStatus">{t('competitionOps.fields.status')}</Label>
          <select
            id="flightStatus"
            data-testid="flight-filter-status"
            value={status}
            onChange={(e) => onStatusChange(e.target.value as NominationDto['status'] | 'all')}
            className={controlClass}
          >
            <option value="all">{t('competitionOps.allStatuses')}</option>
            {NOMINATION_STATUSES.map((item) => (
              <option key={item} value={item}>
                {t(`competitionOps.status.${item}`)}
              </option>
            ))}
          </select>
        </div>
      </CardContent>
    </Card>
  );
}

function FlightPlanningPanel({ data }: { data: CompetitionOpsResponse }) {
  const { t } = useTranslation();
  const flights = data.platforms.flatMap((platform) => platform.flights);
  const unassigned = data.nominations.filter((nomination) => !nomination.flightId || !nomination.groupId);
  const assigned = data.nominations.filter((nomination) => nomination.flightId && nomination.groupId);
  const nonEmptyFlights = flights.filter((flight) =>
    data.nominations.some((nomination) => nomination.flightId === flight.id),
  );
  const assignedDuration = estimateDurationMinutes(assigned);
  const breakMinutes = Math.max(nonEmptyFlights.length - 1, 0) * BREAK_BETWEEN_FLIGHTS_MINUTES;
  const totalDuration = assignedDuration + breakMinutes;

  return (
    <>
      <Card data-testid="flight-summary">
        <CardHeader>
          <CardTitle>{t('competitionOps.flightPlannerTitle')}</CardTitle>
          <CardDescription>{t('competitionOps.flightPlannerDesc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">{t('competitionOps.metrics.total')}</div>
              <div className="text-2xl font-semibold tabular-nums">{data.nominations.length}</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">{t('competitionOps.assigned')}</div>
              <div className="text-2xl font-semibold tabular-nums">{assigned.length}</div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">{t('competitionOps.unassigned')}</div>
              <div data-testid="flight-unassigned-count" className="text-2xl font-semibold tabular-nums">
                {unassigned.length}
              </div>
            </div>
            <div className="rounded-md border border-border p-3">
              <div className="text-xs text-muted-foreground">{t('competitionOps.totalEstimated')}</div>
              <div className="text-2xl font-semibold tabular-nums">
                {totalDuration} {t('competitionOps.minutesShort')}
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">{t('competitionOps.manualAssignmentHint')}</p>
          {unassigned.length > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {t('competitionOps.unassignedWarning', { count: unassigned.length })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {data.platforms.map((platform) => (
          <Card key={platform.id}>
            <CardHeader>
              <CardTitle>{platform.name}</CardTitle>
              <CardDescription>{t('competitionOps.flightCount', { count: platform.flights.length })}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {platform.flights.length === 0 ? (
                <p className="italic text-muted-foreground">{t('competitionOps.noFlights')}</p>
              ) : (
                platform.flights.map((flight) => {
                  const nominationsInFlight = data.nominations.filter((nomination) => nomination.flightId === flight.id);
                  const duration = estimateDurationMinutes(nominationsInFlight);
                  const startedAt = flight.startTime ? new Date(flight.startTime) : null;
                  const endsAt = startedAt ? new Date(startedAt.getTime() + duration * 60_000) : null;

                  return (
                    <div key={flight.id} className="rounded-md border border-border p-3">
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <div className="font-medium">
                            {flight.code} · {flight.name}
                          </div>
                          <div className="text-xs text-muted-foreground">{formatDateTime(flight.startTime)}</div>
                        </div>
                        <div className="text-xs tabular-nums text-muted-foreground">
                          {duration} {t('competitionOps.minutesShort')} · {t('competitionOps.end')}: {formatTime(endsAt)}
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        {flight.groups.map((group) => {
                          const count = nominationsInFlight.filter((nomination) => nomination.groupId === group.id).length;
                          return (
                            <span key={group.id} className="rounded border border-border px-2 py-1">
                              {group.name}: {count}
                            </span>
                          );
                        })}
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {t('competitionOps.nominationsInFlight', { count: nominationsInFlight.length })}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
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
    <Card data-testid="flight-bulk-assignment">
      <CardHeader>
        <CardTitle>{t('competitionOps.flightBulkAssignTitle')}</CardTitle>
        <CardDescription>{t('competitionOps.flightBulkAssignDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
        <div className="space-y-2">
          <Label htmlFor="flightBulkFlight">{t('competitionOps.fields.flight')}</Label>
          <select
            id="flightBulkFlight"
            data-testid="flight-bulk-flight"
            value={flightId}
            onChange={(e) => {
              setFlightId(e.target.value);
              setGroupId('');
            }}
            className={controlClass}
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
          <Label htmlFor="flightBulkGroup">{t('competitionOps.fields.group')}</Label>
          <select
            id="flightBulkGroup"
            data-testid="flight-bulk-group"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            className={controlClass}
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
        <Button
          data-testid="flight-bulk-assign"
          type="button"
          onClick={() => void assignFiltered()}
          disabled={isSaving || !flightId || !groupId || nominations.length === 0}
        >
          {isSaving
            ? t('common.saving')
            : t('competitionOps.flightBulkAssignAction', { count: nominations.length })}
        </Button>
      </CardContent>
    </Card>
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
      api.judges.list(
        judgeSearchTerm ? { limit: 200, search: judgeSearchTerm } : { limit: 200 },
      ),
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
    <Card data-testid="judge-assignment-panel">
      <CardHeader>
        <CardTitle>{t('competitionOps.judges.title')}</CardTitle>
        <CardDescription>{t('competitionOps.judges.desc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="judgeAssignmentJudge">{t('competitionOps.fields.judge')}</Label>
            <Input
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
              className={controlClass}
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
            <Label htmlFor="judgeAssignmentRole">{t('competitionOps.fields.role')}</Label>
            <select
              id="judgeAssignmentRole"
              data-testid="judge-assignment-role"
              value={role}
              onChange={(e) => setRole(e.target.value as JudgeRole)}
              className={controlClass}
            >
              {JUDGE_ROLES.map((item) => (
                <option key={item} value={item}>
                  {t(`competitionOps.judgeRole.${item}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="judgeAssignmentPlatform">{t('competitionOps.fields.platform')}</Label>
            <select
              id="judgeAssignmentPlatform"
              data-testid="judge-assignment-platform"
              value={platformId}
              onChange={(e) => setPlatformId(e.target.value)}
              className={controlClass}
            >
              <option value="global">{t('competitionOps.judges.allPlatforms')}</option>
              {data.platforms.map((platform) => (
                <option key={platform.id} value={platform.id}>
                  {platform.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            data-testid="judge-assignment-create"
            type="button"
            onClick={() => void assignJudge()}
            disabled={createAssignment.isPending || judges.length === 0}
          >
            {createAssignment.isPending ? t('common.saving') : t('competitionOps.judges.assign')}
          </Button>
        </div>

        {judges.length === 0 && !isLoading && (
          <Button asChild variant="outline" size="sm">
            <Link to="/judges/new">{t('judges.create')}</Link>
          </Button>
        )}

        {data.judgeAssignments.length === 0 ? (
          <p className="text-sm italic text-muted-foreground">{t('competitionOps.judges.empty')}</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('competitionOps.fields.judge')}</TableHead>
                  <TableHead>{t('competitionOps.fields.role')}</TableHead>
                  <TableHead>{t('competitionOps.fields.platform')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.judgeAssignments.map((assignment) => (
                  <TableRow key={assignment.id} data-testid="judge-assignment-row">
                    <TableCell>
                      <div>{fullName(assignment.judge)}</div>
                      <div className="text-xs text-muted-foreground">
                        {assignment.judge.categoryRu ?? assignment.judge.cardNumber ?? '—'}
                      </div>
                    </TableCell>
                    <TableCell>{t(`competitionOps.judgeRole.${assignment.role}`)}</TableCell>
                    <TableCell>{assignment.platform?.name ?? t('competitionOps.judges.allPlatforms')}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void removeAssignment(assignment.id)}
                        disabled={deleteAssignment.isPending}
                      >
                        {deleteAssignment.isPending ? t('common.saving') : t('competitionOps.judges.remove')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function NominationsTable({
  nominations,
  divisions,
  platforms,
  emptyText,
}: {
  nominations: NominationDto[];
  divisions: DivisionDto[];
  platforms: PlatformDto[];
  emptyText?: string;
}) {
  const { t } = useTranslation();

  if (nominations.length === 0) {
    return <p className="text-sm italic text-muted-foreground">{emptyText ?? t('competitionOps.empty')}</p>;
  }

  return (
    <div data-testid="nominations-table" className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('competitionOps.fields.athlete')}</TableHead>
            <TableHead>{t('competitionOps.fields.discipline')}</TableHead>
            <TableHead>{t('competitionOps.fields.entryNumber')}</TableHead>
            <TableHead>{t('competitionOps.fields.bodyWeight')}</TableHead>
            <TableHead>{t('competitionOps.fields.declaredWeightClass')}</TableHead>
            <TableHead>{t('competitionOps.fields.weightClass')}</TableHead>
            <TableHead>{t('competitionOps.fields.paymentStatus')}</TableHead>
            <TableHead>{t('competitionOps.fields.paidAmount')}</TableHead>
            <TableHead>{t('competitionOps.fields.paymentMethod')}</TableHead>
            <TableHead>{t('competitionOps.fields.status')}</TableHead>
            <TableHead>{t('competitionOps.fields.flight')}</TableHead>
            <TableHead>{t('competitionOps.fields.group')}</TableHead>
            <TableHead>{t('competitionOps.fields.mandate')}</TableHead>
            <TableHead>{t('competitionOps.fields.notes')}</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {nominations.map((nomination) => (
            <NominationEditorRow
              key={nomination.id}
              nomination={nomination}
              divisions={divisions}
              platforms={platforms}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function AttemptEditor({ competitionId, nomination }: { competitionId: string; nomination: NominationDto }) {
  const { t } = useTranslation();
  const upsertAttempt = useUpsertAttempt(competitionId);
  const components = useMemo(
    () => (nomination.discipline.components.length > 0 ? nomination.discipline.components : []),
    [nomination.discipline.components],
  );
  const [componentId, setComponentId] = useState(components[0]?.id ?? '');
  const component = components.find((item) => item.id === componentId);
  const used = new Set(nomination.attempts.filter((attempt) => attempt.componentId === componentId).map((attempt) => attempt.attemptNumber));
  const nextAttempt = Array.from({ length: component?.attemptCount ?? nomination.discipline.attemptCount }, (_, index) => index + 1).find((attempt) => !used.has(attempt)) ?? 1;
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
    if (!Number.isInteger(parsedAttemptNumber) || parsedAttemptNumber < 1 || parsedAttemptNumber > 5) {
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
    <TableRow data-testid="attempt-row" data-nomination-id={nomination.id}>
      <TableCell className="min-w-44">
        <div>{nomination.entryNumber ? `#${nomination.entryNumber} · ` : ''}{fullName(nomination.athlete)}</div>
        <div className="text-xs text-muted-foreground">{nomination.weightClass.nameRu}</div>
      </TableCell>
      <TableCell className="min-w-56">{nomination.discipline.nameRu}</TableCell>
      <TableCell className="min-w-40">
        <select
          data-testid="attempt-component"
          value={componentId}
          onChange={(e) => setComponentId(e.target.value)}
          className={controlClass}
        >
          {components.map((item) => (
            <option key={item.id} value={item.id}>
              {componentLabel(item)}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="w-24">
        <Input
          data-testid="attempt-number"
          type="number"
          min="1"
          max="5"
          value={attemptNumber}
          onChange={(e) => setAttemptNumber(e.target.value)}
        />
      </TableCell>
      <TableCell className="w-28">
        <Input
          data-testid="attempt-weight"
          type="number"
          min="0"
          step="0.5"
          value={weightKg}
          onChange={(e) => setWeightKg(e.target.value)}
        />
      </TableCell>
      <TableCell className="w-24">
        <Input
          data-testid="attempt-reps"
          type="number"
          min="0"
          value={repsCount}
          onChange={(e) => setRepsCount(e.target.value)}
        />
      </TableCell>
      <TableCell className="min-w-32">
        <select
          data-testid="attempt-result"
          value={result}
          onChange={(e) => setResult(e.target.value as (typeof ATTEMPT_RESULTS)[number])}
          className={controlClass}
        >
          {ATTEMPT_RESULTS.map((value) => (
            <option key={value} value={value}>
              {t(`competitionOps.attemptResult.${value}`)}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell data-testid="attempt-summary" className="min-w-80 text-xs text-muted-foreground">{attemptSummary(nomination)}</TableCell>
      <TableCell className="text-right">
        <Button
          data-testid="attempt-save"
          type="button"
          size="sm"
          onClick={() => void saveAttempt()}
          disabled={upsertAttempt.isPending}
        >
          {upsertAttempt.isPending ? t('common.saving') : t('competitionOps.saveAttempt')}
        </Button>
      </TableCell>
    </TableRow>
  );
}

function ScoreboardTable({ data }: { data: CompetitionOpsResponse }) {
  const { t } = useTranslation();
  const rows = data.scoreboardRows.length > 0
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

  if (rows.length === 0) return <p className="text-sm italic text-muted-foreground">{t('scoreboard.empty')}</p>;

  return (
    <div data-testid="scoreboard-table" className="overflow-x-auto rounded-md border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('competitionOps.fields.entryNumber')}</TableHead>
            <TableHead>{t('competitionOps.fields.athlete')}</TableHead>
            <TableHead>{t('competitionOps.fields.discipline')}</TableHead>
            <TableHead>{t('competitionOps.fields.weightClass')}</TableHead>
            <TableHead>{t('competitionOps.fields.placeInClass')}</TableHead>
            <TableHead>{t('competitionOps.fields.placeOverall')}</TableHead>
            <TableHead>{t('scoreboard.best')}</TableHead>
            <TableHead>{t('scoreboard.score')}</TableHead>
            <TableHead>{t('competitionOps.fields.status')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.nominationId}>
              <TableCell className="tabular-nums">{row.entryNumber ?? '—'}</TableCell>
              <TableCell>{row.athleteName}</TableCell>
              <TableCell>{row.discipline}</TableCell>
              <TableCell>{row.weightClass}</TableCell>
              <TableCell className="tabular-nums">{row.placeInClass ?? '—'}</TableCell>
              <TableCell className="tabular-nums">{row.placeOverall ?? '—'}</TableCell>
              <TableCell className="tabular-nums">{row.bestSuccessfulAttemptKg ?? '—'}</TableCell>
              <TableCell className="tabular-nums">{row.finalScore ?? '—'}</TableCell>
              <TableCell>{t(`competitionOps.status.${row.status}`)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function CompetitionOperationsFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/operations' });
  const { data, isLoading, error, refetch } = useCompetitionOps(id);
  const applySetup = useApplyDefaultSetup(id);
  const drawNominations = useDrawNominations(id);
  const autoPlanFlights = useAutoPlanFlights(id);
  const [tab, setTab] = useState<TabKey>('setup');
  const [downloading, setDownloading] = useState<string | null>(null);
  const [bulkSaving, setBulkSaving] = useState<string | null>(null);
  const [flightSearch, setFlightSearch] = useState('');
  const [flightDisciplineId, setFlightDisciplineId] = useState('all');
  const [flightDivisionId, setFlightDivisionId] = useState('all');
  const [flightWeightClassId, setFlightWeightClassId] = useState('all');
  const [flightAssignment, setFlightAssignment] = useState<AssignmentFilter>('all');
  const [flightStatus, setFlightStatus] = useState<NominationDto['status'] | 'all'>('all');

  async function exportFile(kind: 'protocol' | 'accounting', format: 'csv' | 'xlsx') {
    setDownloading(kind);
    try {
      const filename = `${data?.competition.code ?? 'competition'}-${kind}.${format}`;
      if (format === 'csv') {
        const text = kind === 'protocol' ? await api.competitions.protocolCsv(id) : await api.competitions.accountingCsv(id);
        downloadText(filename, text);
      } else {
        const blob = kind === 'protocol' ? await api.competitions.protocolXlsx(id) : await api.competitions.accountingXlsx(id);
        downloadBlob(filename, blob);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    } finally {
      setDownloading(null);
    }
  }

  async function bulkUpdate(kind: 'mandate' | 'paid') {
    if (!data) return;
    setBulkSaving(kind);
    try {
      await Promise.all(
        data.nominations.map((nomination) =>
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
    return <div className="max-w-7xl mx-auto px-6 py-10 text-sm text-muted-foreground">{t('common.loading')}</div>;
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-10 text-sm text-destructive">
        {t('common.error')}: {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }

  const setupReady = hasSetup(data);
  const filteredFlightNominations = data.nominations.filter((nomination) => {
    if (!nominationMatchesSearch(nomination, flightSearch)) return false;
    if (flightDisciplineId !== 'all' && nomination.disciplineId !== flightDisciplineId) return false;
    if (flightDivisionId !== 'all' && nomination.divisionId !== flightDivisionId) return false;
    if (flightWeightClassId !== 'all' && nomination.weightClassId !== flightWeightClassId) return false;
    if (flightStatus !== 'all' && nomination.status !== flightStatus) return false;
    if (flightAssignment === 'assigned' && (!nomination.flightId || !nomination.groupId)) return false;
    if (flightAssignment === 'unassigned' && nomination.flightId && nomination.groupId) return false;
    return true;
  });

  return (
    <div data-testid="competition-ops" className="max-w-7xl mx-auto px-6 py-8 space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{t('competitionOps.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {data.competition.nameRu} · {data.competition.federation.nameRu}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/competitions/$id" params={{ id }}>
              {t('competitionOps.backToCompetition')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/competitions/$id/scoreboard" params={{ id }}>
              {t('competitionOps.hallScreen')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/competitions/$id/operator" params={{ id }}>
              {t('competitionOperator.title')}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/competitions/$id/judge" params={{ id }}>
              {t('competitionJudge.title')}
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('competitionOps.metrics.total')}</div>
            <div className="text-2xl font-semibold tabular-nums">{data.accounting.totalNominations}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('competitionOps.metrics.paid')}</div>
            <div className="text-2xl font-semibold tabular-nums">{data.accounting.paidNominations}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('competitionOps.metrics.weighedIn')}</div>
            <div className="text-2xl font-semibold tabular-nums">{data.accounting.weighedInNominations}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('competitionOps.metrics.entryFees')}</div>
            <div className="text-lg font-semibold tabular-nums">{formatRub(data.accounting.paidEntryFeeKopecks)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">{t('competitionOps.metrics.billing')}</div>
            <div className="text-lg font-semibold tabular-nums">{formatRub(data.accounting.federationBillingKopecks)}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((item) => (
          <Button
            key={item}
            data-testid={`ops-tab-${item}`}
            type="button"
            size="sm"
            variant={tab === item ? 'default' : 'ghost'}
            onClick={() => setTab(item)}
          >
            {t(`competitionOps.tabs.${item}`)}
          </Button>
        ))}
      </div>

      {tab === 'setup' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('competitionOps.tabs.setup')}</CardTitle>
            <CardDescription>{setupReady ? t('competitionOps.setupReady') : t('competitionOps.setupDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button
              data-testid="ops-apply-setup"
              type="button"
              onClick={() => void applySetup.mutateAsync().then(() => toast.success(t('competitionOps.setupApplied')))}
              disabled={applySetup.isPending}
            >
              {applySetup.isPending ? t('common.saving') : t('competitionOps.applySetup')}
            </Button>
            <Button
              data-testid="ops-draw-numbers"
              type="button"
              variant="outline"
              onClick={() => void drawNominations.mutateAsync({ overwrite: true }).then(() => toast.success(t('competitionOps.drawApplied')))}
              disabled={drawNominations.isPending || data.nominations.length === 0}
            >
              {drawNominations.isPending ? t('common.saving') : t('competitionOps.drawNumbers')}
            </Button>
            <Button
              data-testid="ops-auto-plan"
              type="button"
              variant="outline"
              onClick={() => void autoPlanFlights.mutateAsync({}).then(() => toast.success(t('competitionOps.planApplied')))}
              disabled={autoPlanFlights.isPending || data.nominations.length === 0}
            >
              {autoPlanFlights.isPending ? t('common.saving') : t('competitionOps.autoPlan')}
            </Button>
          </CardContent>
        </Card>
      )}

      {tab === 'nominations' && (
        <div className="space-y-4">
          {setupReady && <NominationCreateForm competitionId={id} divisions={data.divisions} />}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void bulkUpdate('mandate')} disabled={bulkSaving !== null || data.nominations.length === 0}>
              {bulkSaving === 'mandate' ? t('common.saving') : t('competitionOps.markAllMandate')}
            </Button>
            <Button type="button" variant="outline" onClick={() => void bulkUpdate('paid')} disabled={bulkSaving !== null || data.nominations.length === 0}>
              {bulkSaving === 'paid' ? t('common.saving') : t('competitionOps.markAllPaid')}
            </Button>
          </div>
          <NominationsTable nominations={data.nominations} divisions={data.divisions} platforms={data.platforms} />
        </div>
      )}

      {tab === 'mandate' && <NominationsTable nominations={data.nominations} divisions={data.divisions} platforms={data.platforms} />}

      {tab === 'flights' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              data-testid="ops-auto-plan-flights"
              type="button"
              onClick={() => void autoPlanFlights.mutateAsync({}).then(() => toast.success(t('competitionOps.planApplied')))}
              disabled={autoPlanFlights.isPending || data.nominations.length === 0}
            >
              {autoPlanFlights.isPending ? t('common.saving') : t('competitionOps.autoPlan')}
            </Button>
          </div>
          <FlightPlanningPanel data={data} />
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
                <h2 className="text-lg font-semibold">{t('competitionOps.filteredNominations')}</h2>
                <p className="text-sm text-muted-foreground">{t('competitionOps.filteredNominationsDesc')}</p>
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
            />
          </div>
        </div>
      )}

      {tab === 'judges' && <JudgeAssignmentsPanel competitionId={id} data={data} />}

      {tab === 'attempts' && (
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('competitionOps.fields.athlete')}</TableHead>
                <TableHead>{t('competitionOps.fields.discipline')}</TableHead>
                <TableHead>{t('competitionOps.fields.component')}</TableHead>
                <TableHead>{t('competitionOps.fields.attempt')}</TableHead>
                <TableHead>{t('competitionOps.fields.weightKg')}</TableHead>
                <TableHead>{t('competitionOps.fields.reps')}</TableHead>
                <TableHead>{t('competitionOps.fields.result')}</TableHead>
                <TableHead>{t('scoreboard.attempts')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.nominations.map((nomination) => (
                <AttemptEditor key={nomination.id} competitionId={id} nomination={nomination} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === 'scoreboard' && <ScoreboardTable data={data} />}

      {tab === 'exports' && (
        <Card>
          <CardHeader>
            <CardTitle>{t('competitionOps.tabs.exports')}</CardTitle>
            <CardDescription>{t('competitionOps.exportsDesc')}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button data-testid="ops-export-protocol" type="button" onClick={() => void exportFile('protocol', 'csv')} disabled={downloading !== null}>
              {downloading === 'protocol' ? t('common.saving') : t('competitionOps.exportProtocol')}
            </Button>
            <Button data-testid="ops-export-protocol-xlsx" type="button" variant="outline" onClick={() => void exportFile('protocol', 'xlsx')} disabled={downloading !== null}>
              {downloading === 'protocol' ? t('common.saving') : t('competitionOps.exportProtocolXlsx')}
            </Button>
            <Button data-testid="ops-export-accounting" type="button" variant="outline" onClick={() => void exportFile('accounting', 'csv')} disabled={downloading !== null}>
              {downloading === 'accounting' ? t('common.saving') : t('competitionOps.exportAccounting')}
            </Button>
            <Button data-testid="ops-export-accounting-xlsx" type="button" variant="outline" onClick={() => void exportFile('accounting', 'xlsx')} disabled={downloading !== null}>
              {downloading === 'accounting' ? t('common.saving') : t('competitionOps.exportAccountingXlsx')}
            </Button>
            <Button asChild variant="outline">
              <Link to="/competitions/$id/protocol-print" params={{ id }}>
                {t('protocolPrint.title')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
