import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  PowerTableButton,
  PowerTableCheckbox,
  PowerTablePage,
  PowerTablePanel,
  PowerTableSectionTitle,
} from '../../components/powertable.js';
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

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="pt-muted">{label}</dt>
      <dd>{value || <span className="italic text-gray-500">-</span>}</dd>
    </>
  );
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
    <PowerTablePanel className="p-3">
      <PowerTableSectionTitle>{t('competitions.editTitle')}</PowerTableSectionTitle>
      <form id="competitionSettingsForm" onSubmit={(e) => void onSubmit(e)} className="space-y-3">
        <div className="grid grid-cols-[max-content_1fr_max-content_1fr] items-center gap-2 max-lg:grid-cols-1">
          <label htmlFor="nameRu">Наименование:</label>
          <input id="nameRu" className="pt-field" value={nameRu} onChange={(e) => setNameRu(e.target.value)} required />
          <label htmlFor="nameEn">English:</label>
          <input id="nameEn" className="pt-field" value={nameEn} onChange={(e) => setNameEn(e.target.value)} required />
        </div>

        <label className="block">
          Наименование полное:
          <textarea
            className="pt-textarea mt-1 w-full"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={4000}
            rows={3}
          />
        </label>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[280px_1fr_220px]">
          <div className="pt-info-yellow">
            <PowerTableSectionTitle>Период проведения соревнований</PowerTableSectionTitle>
            <div className="pt-form-grid">
              <label htmlFor="startDate">с:</label>
              <input id="startDate" className="pt-field" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              <label htmlFor="endDate">по:</label>
              <input id="endDate" className="pt-field" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
            </div>
          </div>

          <div className="pt-info-green">
            <PowerTableSectionTitle>Период приема заявок</PowerTableSectionTitle>
            <div className="grid grid-cols-[max-content_190px_1fr] items-center gap-2 max-lg:grid-cols-1">
              <label htmlFor="registrationDeadline">до:</label>
              <input
                id="registrationDeadline"
                className="pt-field"
                type="datetime-local"
                value={registrationDeadline}
                onChange={(e) => setRegistrationDeadline(e.target.value)}
              />
              <PowerTableCheckbox
                checked={isOnlineRegistrationOpen}
                onChange={setIsOnlineRegistrationOpen}
                label={t('competitions.fields.onlineRegistrationOpen')}
              />
            </div>
          </div>

          <div>
            <label htmlFor="status">Статус:</label>
            <select id="status" className="pt-select mt-1 w-full" value={status} onChange={(e) => setStatus(normalizeStatus(e.target.value))}>
              {COMPETITION_STATUSES.map((value) => (
                <option key={value} value={value}>{t(`competitions.status.${value}`)}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-[max-content_1fr_max-content_1fr_max-content_180px] items-center gap-2 max-lg:grid-cols-1">
          <label htmlFor="city">{t('competitions.fields.city')}:</label>
          <input id="city" className="pt-field" value={city} onChange={(e) => setCity(e.target.value)} />
          <label htmlFor="venue">{t('competitions.fields.venue')}:</label>
          <input id="venue" className="pt-field" value={venue} onChange={(e) => setVenue(e.target.value)} />
          <label htmlFor="timezone">Gmt offset:</label>
          <input id="timezone" className="pt-field" value={timezone} onChange={(e) => setTimezone(e.target.value)} required />
        </div>

        <div className="grid grid-cols-[max-content_1fr_max-content_190px_max-content_180px] items-center gap-2 max-lg:grid-cols-1">
          <label htmlFor="rulebook">{t('competitions.fields.rulebook')}:</label>
          <input id="rulebook" className="pt-field" value={rulebook} onChange={(e) => setRulebook(e.target.value)} required />
          <label htmlFor="entryFeeRub">{t('competitions.fields.entryFeeRub')}:</label>
          <input id="entryFeeRub" className="pt-field" type="number" step="0.01" min="0" value={entryFeeRub} onChange={(e) => setEntryFeeRub(e.target.value)} required />
          <span>Ранг:</span>
          <span>Окружной</span>
        </div>

        <PowerTableButton type="submit" tone="green" disabled={update.isPending}>
          {update.isPending ? t('common.saving') : t('common.save')}
        </PowerTableButton>
      </form>
    </PowerTablePanel>
  );
}

export default function CompetitionDetailFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id' });
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, error } = useCompetition(id);

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

  const c = data.competition;
  const canWrite =
    user?.roles.some(
      (r) =>
        r.role === 'platform_admin' ||
        (r.role === 'federation_admin' && r.federationId === c.federationId),
    ) ?? false;

  return (
    <PowerTablePage
      title={`(${c.code}) ${c.nameRu}`}
      subtitle={`${c.nameEn} · ${c.federation.nameRu}`}
      actions={(
        <>
          {canWrite ? <PowerTableButton tone="danger" form="competitionSettingsForm" type="submit">Записать и закрыть</PowerTableButton> : null}
          {canWrite ? <PowerTableButton form="competitionSettingsForm" type="submit">Записать</PowerTableButton> : null}
          <Link to="/competitions/$id/operations" params={{ id }} className="pt-link-button">{t('competitionOps.title')}</Link>
          <Link to="/competitions/$id/nominations" params={{ id }} className="pt-link-button">Номинации</Link>
          <Link to="/competitions/$id/schedule" params={{ id }} className="pt-link-button">Потоки</Link>
          <Link to="/competitions/$id/judges" params={{ id }} className="pt-link-button">Судьи</Link>
          <Link to="/competitions/$id/scoreboard" params={{ id }} className="pt-link-button">{t('competitionOps.scoreboard')}</Link>
          <Link to="/competitions/$id/operator" params={{ id }} className="pt-link-button">{t('competitionOperator.title')}</Link>
          <Link to="/competitions/$id/reports" params={{ id }} className="pt-link-button">Отчеты</Link>
          <Link to="/competitions/$id/awards" params={{ id }} className="pt-link-button">Награждение</Link>
        </>
      )}
      federationBar={<><span>{c.federation.code}</span><span>{c.federation.nameRu}</span></>}
      tabs={[
        { label: 'Основные настройки', icon: 'settings', active: true },
        { label: 'Дисциплины', icon: 'awards' },
        { label: 'Весовые категории', icon: 'bar' },
        { label: 'Возрастные категории' },
        { label: 'Диски', icon: 'plates' },
        { label: 'Грифы', icon: 'bar' },
        { label: 'Этапы соревнований', icon: 'stages' },
      ]}
    >
      <div className="space-y-3">
        <PowerTablePanel className="p-3">
          <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-[260px_1fr] sm:gap-x-6">
            <Field label={t('competitions.fields.federation')} value={`${c.federation.nameRu} (${c.federation.code})`} />
            <Field label={t('competitions.fields.status')} value={t(`competitions.status.${c.status}`)} />
            <Field label={t('competitions.fields.dates')} value={`${formatDate(c.startDate)} - ${formatDate(c.endDate)}`} />
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
        </PowerTablePanel>

        {canWrite ? <CompetitionSettingsForm competition={c} /> : null}

        <div className="pt-info-yellow">Это тестовое соревнование (не более 10 номинаций, без фиксации рекордов и рейтингов).</div>
        <div className="pt-info-pink">
          <PowerTableSectionTitle>Доступ к данным онлайн</PowerTableSectionTitle>
          Ссылки на протоколы, грамоты и публичное табло доступны из верхней панели действий.
        </div>
      </div>
    </PowerTablePage>
  );
}
