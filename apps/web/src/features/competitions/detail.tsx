import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
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
  toast,
} from '@streetlifting/ui';
import { useAuthStore } from '../../lib/auth/store.js';
import { ApiClientError } from '../../lib/api-client.js';
import { formatRub, rubToKopecks } from '../../lib/money.js';
import { type CompetitionDto, useCompetition, useUpdateCompetition } from './api.js';
import {
  dateTimeInputToIso,
  formatDate,
  formatDateTime,
  toDateInputValue,
  toDateTimeInputValue,
} from './format.js';

const COMPETITION_STATUSES = [
  'draft',
  'registration_open',
  'registration_closed',
  'in_progress',
  'finalized',
  'archived',
] as const;

type CompetitionStatusOption = (typeof COMPETITION_STATUSES)[number];

const controlClass =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function normalizeStatus(status: string): CompetitionStatusOption {
  return COMPETITION_STATUSES.includes(status as CompetitionStatusOption)
    ? (status as CompetitionStatusOption)
    : 'draft';
}

function kopecksToRubInput(kopecks: string | number): string {
  const value = typeof kopecks === 'string' ? Number(kopecks) : kopecks;
  if (!Number.isFinite(value)) return '0';
  const rub = value / 100;
  return Number.isInteger(rub) ? String(rub) : rub.toFixed(2);
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function CompetitionSettingsForm({ competition }: { competition: CompetitionDto }) {
  const { t } = useTranslation();
  const update = useUpdateCompetition(competition.id);
  const [nameRu, setNameRu] = useState(competition.nameRu);
  const [nameEn, setNameEn] = useState(competition.nameEn);
  const [description, setDescription] = useState(competition.description ?? '');
  const [rulebook, setRulebook] = useState(competition.rulebook);
  const [startDate, setStartDate] = useState(toDateInputValue(competition.startDate));
  const [endDate, setEndDate] = useState(toDateInputValue(competition.endDate));
  const [registrationDeadline, setRegistrationDeadline] = useState(
    toDateTimeInputValue(competition.registrationDeadline),
  );
  const [city, setCity] = useState(competition.city ?? '');
  const [venue, setVenue] = useState(competition.venue ?? '');
  const [timezone, setTimezone] = useState(competition.timezone);
  const [status, setStatus] = useState<CompetitionStatusOption>(normalizeStatus(competition.status));
  const [entryFeeRub, setEntryFeeRub] = useState(kopecksToRubInput(competition.entryFeeKopecks));
  const [isOnlineRegistrationOpen, setIsOnlineRegistrationOpen] = useState(
    competition.isOnlineRegistrationOpen,
  );

  useEffect(() => {
    setNameRu(competition.nameRu);
    setNameEn(competition.nameEn);
    setDescription(competition.description ?? '');
    setRulebook(competition.rulebook);
    setStartDate(toDateInputValue(competition.startDate));
    setEndDate(toDateInputValue(competition.endDate));
    setRegistrationDeadline(toDateTimeInputValue(competition.registrationDeadline));
    setCity(competition.city ?? '');
    setVenue(competition.venue ?? '');
    setTimezone(competition.timezone);
    setStatus(normalizeStatus(competition.status));
    setEntryFeeRub(kopecksToRubInput(competition.entryFeeKopecks));
    setIsOnlineRegistrationOpen(competition.isOnlineRegistrationOpen);
  }, [competition]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    try {
      await update.mutateAsync({
        nameRu: nameRu.trim(),
        nameEn: nameEn.trim(),
        description: nullableText(description),
        rulebook: rulebook.trim(),
        startDate,
        endDate,
        registrationDeadline: registrationDeadline.trim()
          ? dateTimeInputToIso(registrationDeadline.trim())
          : null,
        city: nullableText(city),
        venue: nullableText(venue),
        timezone: timezone.trim(),
        status,
        entryFeeKopecks: rubToKopecks(entryFeeRub),
        isOnlineRegistrationOpen,
      });
      toast.success(t('competitions.updated'));
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'invalid_timezone') {
        toast.error(t('competitions.errors.invalidTimezone'));
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('competitions.editTitle')}</CardTitle>
        <CardDescription>{competition.federation.nameRu}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nameRu">{t('competitions.fields.nameRu')}</Label>
              <Input id="nameRu" value={nameRu} onChange={(e) => setNameRu(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="nameEn">{t('competitions.fields.nameEn')}</Label>
              <Input id="nameEn" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">{t('competitions.fields.description')}</Label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={4000}
              rows={3}
              className={`${controlClass} h-auto min-h-20 py-2`}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="startDate">{t('competitions.fields.startDate')}</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">{t('competitions.fields.endDate')}</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="registrationDeadline">{t('competitions.fields.registrationDeadline')}</Label>
              <Input
                id="registrationDeadline"
                type="datetime-local"
                value={registrationDeadline}
                onChange={(e) => setRegistrationDeadline(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">{t('competitions.fields.timezone')}</Label>
              <Input id="timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="city">{t('competitions.fields.city')}</Label>
              <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="venue">{t('competitions.fields.venue')}</Label>
              <Input id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="rulebook">{t('competitions.fields.rulebook')}</Label>
              <Input id="rulebook" value={rulebook} onChange={(e) => setRulebook(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">{t('competitions.fields.status')}</Label>
              <select
                id="status"
                value={status}
                onChange={(e) => setStatus(normalizeStatus(e.target.value))}
                className={controlClass}
              >
                {COMPETITION_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {t(`competitions.status.${value}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="entryFeeRub">{t('competitions.fields.entryFeeRub')}</Label>
              <Input
                id="entryFeeRub"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                value={entryFeeRub}
                onChange={(e) => setEntryFeeRub(e.target.value)}
                required
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isOnlineRegistrationOpen}
              onChange={(e) => setIsOnlineRegistrationOpen(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            {t('competitions.fields.onlineRegistrationOpen')}
          </label>

          <div className="flex justify-end">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function CompetitionDetailFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id' });
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, error } = useCompetition(id);

  if (isLoading) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 text-sm text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-10 text-sm text-destructive">
        {t('common.error')}: {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }

  const c = data.competition;
  const canWrite =
    user?.roles.some(
      (r) =>
        r.role === 'platform_admin' ||
        (r.role === 'federation_admin' && r.federationId === c.federationId),
    ) ?? false;
  const Field = ({ label, value }: { label: string; value: ReactNode }) => (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || <span className="italic text-muted-foreground">—</span>}</dd>
    </>
  );

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div className="flex justify-end gap-2">
        <Button asChild variant="outline">
          <Link to="/competitions/$id/operations" params={{ id }}>
            {t('competitionOps.title')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/competitions/$id/scoreboard" params={{ id }}>
            {t('competitionOps.scoreboard')}
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/competitions/$id/operator" params={{ id }}>
            {t('competitionOperator.title')}
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{c.nameRu}</CardTitle>
          <CardDescription>
            {c.nameEn} · <code className="text-primary">{c.code}</code> · {c.federation.nameRu}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-y-1 text-sm sm:grid-cols-[220px_1fr] sm:gap-x-6 sm:gap-y-3">
            <Field label={t('competitions.fields.federation')} value={`${c.federation.nameRu} (${c.federation.code})`} />
            <Field label={t('competitions.fields.status')} value={t(`competitions.status.${c.status}`)} />
            <Field
              label={t('competitions.fields.dates')}
              value={`${formatDate(c.startDate)} - ${formatDate(c.endDate)}`}
            />
            <Field label={t('competitions.fields.registrationDeadline')} value={formatDateTime(c.registrationDeadline)} />
            <Field label={t('competitions.fields.city')} value={c.city} />
            <Field label={t('competitions.fields.venue')} value={c.venue} />
            <Field label={t('competitions.fields.timezone')} value={c.timezone} />
            <Field label={t('competitions.fields.rulebook')} value={c.rulebook} />
            <Field label={t('competitions.fields.entryFeeRub')} value={formatRub(c.entryFeeKopecks)} />
            <Field label={t('competitions.fields.onlineRegistrationOpen')} value={c.isOnlineRegistrationOpen ? t('common.yes') : t('common.no')} />
            <Field label={t('competitions.cols.nominations')} value={c._count?.nominations ?? 0} />
            <Field label={t('competitions.fields.flights')} value={c._count?.flights ?? 0} />
            <Field label={t('competitions.fields.judgeAssignments')} value={c._count?.judgeAssignments ?? 0} />
            <Field label="ID" value={<span className="font-mono text-xs">{c.id}</span>} />
          </dl>
        </CardContent>
      </Card>

      {canWrite && <CompetitionSettingsForm competition={c} />}
    </div>
  );
}
