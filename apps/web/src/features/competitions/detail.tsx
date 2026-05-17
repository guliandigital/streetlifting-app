import { useEffect, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  WorkspaceButton,
  WorkspaceCheckbox,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceSectionTitle,
  WorkspaceToolbar,
  type WorkspaceIconName,
} from '../../components/workspace.js';
import { useAuthStore } from '../../lib/auth/store.js';
import { ApiClientError } from '../../lib/api-client.js';
import { formatRub, rubToKopecks } from '../../lib/money.js';
import { type CompetitionDto, useCompetition, useUpdateCompetition } from './api.js';
import { type CompetitionOpsResponse, useCompetitionOps } from './operations-api.js';
import { useDisciplines } from '../disciplines/api.js';
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
function CompetitionSettingsForm({
  competition,
  onSaved,
}: {
  competition: CompetitionDto;
  onSaved?: () => void;
}) {
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
  const [status, setStatus] = useState<CompetitionStatusOption>(
    normalizeStatus(competition.status),
  );
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

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const closeAfterSave =
      ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null)?.dataset.intent ===
      'save-close';
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
      if (closeAfterSave) onSaved?.();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'invalid_timezone') {
        toast.error(t('competitions.errors.invalidTimezone'));
      } else {
        toast.error(err instanceof Error ? err.message : 'Error');
      }
    }
  }

  return (
    <WorkspacePanel className="p-3">
      <WorkspaceSectionTitle>{t('competitions.editTitle')}</WorkspaceSectionTitle>
      <form id="competitionSettingsForm" onSubmit={(e) => void onSubmit(e)} className="space-y-3">
        <div className="grid grid-cols-[max-content_1fr_max-content_1fr] items-center gap-2 max-lg:grid-cols-1">
          <label htmlFor="nameRu">Наименование:</label>
          <input
            id="nameRu"
            className="pt-field"
            value={nameRu}
            onChange={(e) => setNameRu(e.target.value)}
            required
          />
          <label htmlFor="nameEn">English:</label>
          <input
            id="nameEn"
            className="pt-field"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
            required
          />
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
            <WorkspaceSectionTitle>Период проведения соревнований</WorkspaceSectionTitle>
            <div className="pt-form-grid">
              <label htmlFor="startDate">с:</label>
              <input
                id="startDate"
                className="pt-field"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
              <label htmlFor="endDate">по:</label>
              <input
                id="endDate"
                className="pt-field"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="pt-info-green">
            <WorkspaceSectionTitle>Период приема заявок</WorkspaceSectionTitle>
            <div className="grid grid-cols-[max-content_190px_1fr] items-center gap-2 max-lg:grid-cols-1">
              <label htmlFor="registrationDeadline">до:</label>
              <input
                id="registrationDeadline"
                className="pt-field"
                type="datetime-local"
                value={registrationDeadline}
                onChange={(e) => setRegistrationDeadline(e.target.value)}
              />
              <WorkspaceCheckbox
                checked={isOnlineRegistrationOpen}
                onChange={setIsOnlineRegistrationOpen}
                label={t('competitions.fields.onlineRegistrationOpen')}
              />
            </div>
          </div>

          <div>
            <label htmlFor="status">Статус:</label>
            <select
              id="status"
              className="pt-select mt-1 w-full"
              value={status}
              onChange={(e) => setStatus(normalizeStatus(e.target.value))}
            >
              {COMPETITION_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {t(`competitions.status.${value}`)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-[max-content_1fr_max-content_1fr_max-content_180px] items-center gap-2 max-lg:grid-cols-1">
          <label htmlFor="city">{t('competitions.fields.city')}:</label>
          <input
            id="city"
            className="pt-field"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <label htmlFor="venue">{t('competitions.fields.venue')}:</label>
          <input
            id="venue"
            className="pt-field"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
          />
          <label htmlFor="timezone">Gmt offset:</label>
          <input
            id="timezone"
            className="pt-field"
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-[max-content_1fr_max-content_190px_max-content_180px] items-center gap-2 max-lg:grid-cols-1">
          <label htmlFor="rulebook">{t('competitions.fields.rulebook')}:</label>
          <input
            id="rulebook"
            className="pt-field"
            value={rulebook}
            onChange={(e) => setRulebook(e.target.value)}
            required
          />
          <label htmlFor="entryFeeRub">{t('competitions.fields.entryFeeRub')}:</label>
          <input
            id="entryFeeRub"
            className="pt-field"
            type="number"
            step="0.01"
            min="0"
            value={entryFeeRub}
            onChange={(e) => setEntryFeeRub(e.target.value)}
            required
          />
          <span>Ранг:</span>
          <span>Окружной</span>
        </div>

        <WorkspaceButton type="submit" tone="green" disabled={update.isPending}>
          {update.isPending ? t('common.saving') : t('common.save')}
        </WorkspaceButton>
      </form>
    </WorkspacePanel>
  );
}

type DetailTab = 'settings' | 'disciplines' | 'weight' | 'age' | 'plates' | 'bars' | 'stages';

const DETAIL_TABS: { key: DetailTab; label: string; icon: WorkspaceIconName }[] = [
  { key: 'settings', label: 'Основные настройки', icon: 'settings' },
  { key: 'disciplines', label: 'Дисциплины', icon: 'awards' },
  { key: 'weight', label: 'Весовые категории', icon: 'athletes' },
  { key: 'age', label: 'Возрастные категории', icon: 'history' },
  { key: 'plates', label: 'Диски', icon: 'plates' },
  { key: 'bars', label: 'Грифы', icon: 'bar' },
  { key: 'stages', label: 'Этапы соревнований', icon: 'stages' },
];

const STANDARD_PLATES: {
  weight: number;
  color: 'green' | 'red' | 'blue' | 'yellow' | 'dark';
}[] = [
  { weight: 50, color: 'green' },
  { weight: 25, color: 'red' },
  { weight: 20, color: 'blue' },
  { weight: 15, color: 'yellow' },
  { weight: 10, color: 'dark' },
  { weight: 5, color: 'dark' },
  { weight: 2.5, color: 'dark' },
  { weight: 2, color: 'dark' },
  { weight: 1.25, color: 'dark' },
  { weight: 1, color: 'dark' },
  { weight: 0.75, color: 'dark' },
  { weight: 0.5, color: 'dark' },
  { weight: 0.25, color: 'dark' },
];

function disciplineFormulaLabel(format: string): string {
  return format === 'reps_to_failure' || format === 'reps_in_time'
    ? 'ISF points'
    : 'Результат умножить на значение';
}

function DisciplinesTabContent({ ops }: { ops: CompetitionOpsResponse | undefined }) {
  const { data: disciplinesData, isLoading } = useDisciplines();
  const allDisciplines = disciplinesData?.disciplines ?? [];
  const usedDisciplineIds = new Set(ops?.nominations.map((n) => n.disciplineId) ?? []);

  return (
    <WorkspacePanel className="p-3">
      <WorkspaceToolbar>
        <WorkspaceButton type="button" icon="check" tone="green">
          Выделить все
        </WorkspaceButton>
        <WorkspaceButton type="button" icon="close">
          Снять выделение
        </WorkspaceButton>
      </WorkspaceToolbar>
      <table className="pt-grid mt-2">
        <thead>
          <tr>
            <th className="w-12">Вкл</th>
            <th className="text-left">Дисциплина</th>
            <th className="text-left">Формула</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr>
              <td colSpan={3} className="pt-muted italic text-center">
                Загружаем дисциплины…
              </td>
            </tr>
          ) : allDisciplines.length === 0 ? (
            <tr>
              <td colSpan={3} className="pt-muted italic text-center">
                Дисциплины ещё не настроены.
              </td>
            </tr>
          ) : (
            allDisciplines.map((d) => {
              const enabled = usedDisciplineIds.has(d.id);
              return (
                <tr key={d.id} className={enabled ? 'is-green' : undefined}>
                  <td className="text-center">
                    <input type="checkbox" checked={enabled} readOnly />
                  </td>
                  <td>{d.nameRu}</td>
                  <td className="pt-muted">{disciplineFormulaLabel(d.format)}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </WorkspacePanel>
  );
}

function WeightClassesTabContent({ ops }: { ops: CompetitionOpsResponse | undefined }) {
  function uniqueWcByGender(gender: 'F' | 'M') {
    const seen = new Set<string>();
    const out: { id: string; name: string; info: string }[] = [];
    if (!ops) return out;
    for (const d of ops.divisions) {
      if (d.gender !== gender) continue;
      for (const wc of d.weightClasses) {
        if (seen.has(wc.nameRu)) continue;
        seen.add(wc.nameRu);
        out.push({ id: wc.id, name: wc.nameRu, info: '' });
      }
    }
    return out;
  }

  function renderTable(rows: { id: string; name: string; info: string }[], emptyText: string) {
    return (
      <table className="pt-grid">
        <thead>
          <tr>
            <th className="w-12">Вкл</th>
            <th className="text-left">Категория</th>
            <th className="text-left">Информация</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={3} className="pt-muted italic text-center">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((wc) => (
              <tr key={wc.id} className="is-green">
                <td className="text-center">
                  <input type="checkbox" checked readOnly />
                </td>
                <td>{wc.name}</td>
                <td className="pt-muted">{wc.info}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <WorkspacePanel className="p-3">
        <WorkspaceSectionTitle>Женщины</WorkspaceSectionTitle>
        {renderTable(uniqueWcByGender('F'), 'Категории для женщин не настроены.')}
      </WorkspacePanel>
      <WorkspacePanel className="p-3">
        <WorkspaceSectionTitle>Мужчины</WorkspaceSectionTitle>
        {renderTable(uniqueWcByGender('M'), 'Категории для мужчин не настроены.')}
      </WorkspacePanel>
    </div>
  );
}

function AgeClassesTabContent({ ops }: { ops: CompetitionOpsResponse | undefined }) {
  const [restrictAge, setRestrictAge] = useState(false);
  const seen = new Set<string>();
  const ageDivisions = (ops?.divisions ?? []).filter((d) => {
    if (seen.has(d.nameRu)) return false;
    seen.add(d.nameRu);
    return true;
  });

  return (
    <WorkspacePanel className="p-3">
      <WorkspaceCheckbox
        checked={restrictAge}
        onChange={setRestrictAge}
        label="Разрешить регистрацию только в своей возрастной"
      />
      <table className="pt-grid mt-2">
        <thead>
          <tr>
            <th className="w-12">Вкл</th>
            <th className="text-left">Возрастные</th>
            <th className="w-20">от</th>
            <th className="w-20">до</th>
          </tr>
        </thead>
        <tbody>
          {ageDivisions.length === 0 ? (
            <tr>
              <td colSpan={4} className="pt-muted italic text-center">
                Возрастные категории не настроены.
              </td>
            </tr>
          ) : (
            ageDivisions.map((d) => (
              <tr key={d.id} className="is-green">
                <td className="text-center">
                  <input type="checkbox" checked readOnly />
                </td>
                <td>{d.nameRu}</td>
                <td className="text-right tabular-nums">{d.ageMin ?? '—'}</td>
                <td className="text-right tabular-nums">{d.ageMax ?? '—'}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </WorkspacePanel>
  );
}

function PlatesTabContent() {
  return (
    <WorkspacePanel className="p-3">
      <div className="pt-info-yellow mb-3">
        Здесь можно указать индивидуальный набор дисков, отличный от общетурнирного, когда вес
        снаряда заполняется 25 кг блинами, затем 20, 15, 10, 5, 2.5 и рекордные.
      </div>
      <div className="pt-plate-canvas">
        <div className="pt-plate-stack">
          {STANDARD_PLATES.map((p, i) => (
            <div
              key={p.weight}
              className={`pt-plate ${p.color}`}
              style={
                {
                  '--plate-w': `${52 - i * 2}px`,
                  '--plate-h': `${230 - i * 12}px`,
                } as CSSProperties
              }
            >
              {p.weight}
            </div>
          ))}
        </div>
      </div>
    </WorkspacePanel>
  );
}

function BarsTabContent({ ops }: { ops: CompetitionOpsResponse | undefined }) {
  const rows = new Map<
    string,
    {
      key: string;
      discipline: string;
      exercise: string;
      equipment: string;
      attemptCount: number;
      fixedWeightKg: number | null;
    }
  >();
  for (const nomination of ops?.nominations ?? []) {
    const components = nomination.discipline.components;
    if (components.length === 0) {
      rows.set(nomination.discipline.id, {
        key: nomination.discipline.id,
        discipline: nomination.discipline.nameRu,
        exercise: nomination.discipline.nameRu,
        equipment: nomination.discipline.format,
        attemptCount: nomination.discipline.attemptCount,
        fixedWeightKg: nomination.discipline.fixedWeightKg,
      });
      continue;
    }
    for (const component of components) {
      rows.set(component.id, {
        key: component.id,
        discipline: nomination.discipline.nameRu,
        exercise: component.nameRu,
        equipment: component.equipment,
        attemptCount: component.attemptCount,
        fixedWeightKg: component.fixedWeightKg,
      });
    }
  }
  const tableRows = [...rows.values()].sort(
    (left, right) =>
      left.discipline.localeCompare(right.discipline) ||
      left.exercise.localeCompare(right.exercise),
  );

  return (
    <WorkspacePanel className="p-3">
      <WorkspaceSectionTitle>Грифы, снаряды и попытки по дисциплинам</WorkspaceSectionTitle>
      <table className="pt-grid mt-2">
        <thead>
          <tr>
            <th className="text-left">Упражнение</th>
            <th className="text-left">Дисциплина</th>
            <th>Оборудование</th>
            <th>Попыток</th>
            <th>Фикс. вес</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row) => (
            <tr key={row.key}>
              <td>{row.exercise}</td>
              <td>{row.discipline}</td>
              <td className="text-center">{row.equipment}</td>
              <td className="text-right tabular-nums">{row.attemptCount}</td>
              <td className="text-right tabular-nums">
                {row.fixedWeightKg === null ? '—' : `${row.fixedWeightKg} кг`}
              </td>
            </tr>
          ))}
          {tableRows.length === 0 ? (
            <tr>
              <td colSpan={5} className="pt-muted italic text-center">
                Номинации не созданы, список упражнений пуст.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </WorkspacePanel>
  );
}

function StagesTabContent({ competition }: { competition: CompetitionDto }) {
  return (
    <WorkspacePanel className="p-3">
      <div className="pt-info-yellow mb-3">
        В текущей версии этапы показываются как хронология текущего соревнования. Отдельная модель
        серии этапов будет добавлена только после утверждения правил объединения зачетов.
      </div>
      <table className="pt-grid mt-2">
        <thead>
          <tr>
            <th className="w-10">N</th>
            <th className="text-left">Соревнование</th>
            <th className="text-left">Город</th>
            <th>Начало</th>
            <th>Окончание</th>
            <th className="text-left">Федерация</th>
            <th className="text-left">Категория</th>
            <th className="text-left">Код в другой федерации</th>
          </tr>
        </thead>
        <tbody>
          <tr className="is-selected">
            <td className="text-right tabular-nums">1</td>
            <td>{competition.nameRu}</td>
            <td>{competition.city ?? '—'}</td>
            <td className="text-center">{formatDate(competition.startDate)}</td>
            <td className="text-center">{formatDate(competition.endDate)}</td>
            <td>{competition.federation.nameRu}</td>
            <td>{competition.status}</td>
            <td className="font-mono text-xs">{competition.code}</td>
          </tr>
        </tbody>
      </table>
    </WorkspacePanel>
  );
}

export default function CompetitionDetailFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id' });
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, error } = useCompetition(id);
  const { data: opsData } = useCompetitionOps(id);
  const [activeTab, setActiveTab] = useState<DetailTab>('settings');

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
    <WorkspacePage
      title={`(${c.code}) ${c.nameRu}`}
      subtitle={`${c.nameEn} · ${c.federation.nameRu}`}
      actions={
        <>
          {canWrite ? (
            <WorkspaceButton
              tone="danger"
              form="competitionSettingsForm"
              type="submit"
              data-intent="save-close"
            >
              Записать и закрыть
            </WorkspaceButton>
          ) : null}
          {canWrite ? (
            <WorkspaceButton form="competitionSettingsForm" type="submit">
              Записать
            </WorkspaceButton>
          ) : null}
          <Link to="/competitions/$id/operations" params={{ id }} className="pt-link-button">
            {t('competitionOps.title')}
          </Link>
          <Link to="/competitions/$id/nominations" params={{ id }} className="pt-link-button">
            Номинации
          </Link>
          <Link to="/competitions/$id/schedule" params={{ id }} className="pt-link-button">
            Потоки
          </Link>
          <Link to="/competitions/$id/judges" params={{ id }} className="pt-link-button">
            Судьи
          </Link>
          <Link to="/competitions/$id/scoreboard" params={{ id }} className="pt-link-button">
            {t('competitionOps.scoreboard')}
          </Link>
          <Link to="/competitions/$id/operator" params={{ id }} className="pt-link-button">
            {t('competitionOperator.title')}
          </Link>
          <Link to="/competitions/$id/speaker" params={{ id }} className="pt-link-button">
            Диктор
          </Link>
          <Link to="/broadcast/competitions/$id" params={{ id }} className="pt-link-button">
            Трансляция
          </Link>
          <Link to="/results/competitions/$id" params={{ id }} className="pt-link-button">
            Результаты
          </Link>
          <Link to="/overlay/competitions/$id" params={{ id }} className="pt-link-button">
            OBS
          </Link>
          <Link to="/competitions/$id/reports" params={{ id }} className="pt-link-button">
            Отчеты
          </Link>
          <Link to="/competitions/$id/awards" params={{ id }} className="pt-link-button">
            Награждение
          </Link>
        </>
      }
      federationBar={
        <>
          <span>{c.federation.code}</span>
          <span>{c.federation.nameRu}</span>
        </>
      }
      tabs={DETAIL_TABS.map((tab) => ({
        label: tab.label,
        icon: tab.icon,
        active: activeTab === tab.key,
        onClick: () => setActiveTab(tab.key),
        testId: `competition-tab-${tab.key}`,
      }))}
    >
      <div className="space-y-3">
        {activeTab === 'settings' && (
          <>
            <WorkspacePanel className="p-3">
              <dl className="grid grid-cols-1 gap-y-2 text-sm sm:grid-cols-[260px_1fr] sm:gap-x-6">
                <Field
                  label={t('competitions.fields.federation')}
                  value={`${c.federation.nameRu} (${c.federation.code})`}
                />
                <Field
                  label={t('competitions.fields.status')}
                  value={t(`competitions.status.${c.status}`)}
                />
                <Field
                  label={t('competitions.fields.dates')}
                  value={`${formatDate(c.startDate)} - ${formatDate(c.endDate)}`}
                />
                <Field
                  label={t('competitions.fields.registrationDeadline')}
                  value={formatDateTime(c.registrationDeadline)}
                />
                <Field label={t('competitions.fields.city')} value={c.city} />
                <Field label={t('competitions.fields.venue')} value={c.venue} />
                <Field label={t('competitions.fields.timezone')} value={c.timezone} />
                <Field label={t('competitions.fields.rulebook')} value={c.rulebook} />
                <Field
                  label={t('competitions.fields.entryFeeRub')}
                  value={formatRub(c.entryFeeKopecks)}
                />
                <Field
                  label={t('competitions.fields.onlineRegistrationOpen')}
                  value={c.isOnlineRegistrationOpen ? t('common.yes') : t('common.no')}
                />
                <Field
                  label={t('competitions.cols.nominations')}
                  value={c._count?.nominations ?? 0}
                />
                <Field label={t('competitions.fields.flights')} value={c._count?.flights ?? 0} />
                <Field
                  label={t('competitions.fields.judgeAssignments')}
                  value={c._count?.judgeAssignments ?? 0}
                />
                <Field label="ID" value={<span className="font-mono text-xs">{c.id}</span>} />
              </dl>
            </WorkspacePanel>

            {canWrite ? (
              <CompetitionSettingsForm
                competition={c}
                onSaved={() => void navigate({ to: '/competitions' })}
              />
            ) : null}

            <div className="pt-info-pink">
              <WorkspaceSectionTitle>Доступ к данным онлайн</WorkspaceSectionTitle>
              Ссылки на протоколы, грамоты и публичное табло доступны из верхней панели действий.
            </div>
          </>
        )}
        {activeTab === 'disciplines' && <DisciplinesTabContent ops={opsData} />}
        {activeTab === 'weight' && <WeightClassesTabContent ops={opsData} />}
        {activeTab === 'age' && <AgeClassesTabContent ops={opsData} />}
        {activeTab === 'plates' && <PlatesTabContent />}
        {activeTab === 'bars' && <BarsTabContent ops={opsData} />}
        {activeTab === 'stages' && <StagesTabContent competition={c} />}
      </div>
    </WorkspacePage>
  );
}
