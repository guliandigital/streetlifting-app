import { useEffect, useMemo, useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  WorkspaceButton,
  WorkspaceIcon,
  WorkspacePage,
  WorkspacePanel,
} from '../../components/workspace.js';
import { nominationGenderStats } from './gender-stats.js';
import {
  usePublicScoreboard,
  type PublicNominationDto,
  type ScoreboardRowDto,
} from './operations-api.js';

type BroadcastSortMode = 'name' | 'weight' | 'division' | 'score';
type BroadcastColumnKey =
  | 'weightClass'
  | 'bodyWeight'
  | 'rankTitle'
  | 'birthYear'
  | 'coefficient'
  | 'place'
  | 'teamPoints'
  | 'status'
  | 'warnings';

const broadcastColumns: Array<{ key: BroadcastColumnKey; label: string }> = [
  { key: 'weightClass', label: 'Весовая категория' },
  { key: 'bodyWeight', label: 'Собственный вес' },
  { key: 'rankTitle', label: 'Спортивный разряд / звание' },
  { key: 'birthYear', label: 'Год рождения' },
  { key: 'coefficient', label: 'Коэффициент' },
  { key: 'place', label: 'Место' },
  { key: 'teamPoints', label: 'Командные очки' },
  { key: 'status', label: 'Статус номинации' },
  { key: 'warnings', label: 'Предупреждения' },
];

function defaultColumnVisibility(): Record<BroadcastColumnKey, boolean> {
  return {
    weightClass: true,
    bodyWeight: true,
    rankTitle: true,
    birthYear: true,
    coefficient: false,
    place: true,
    teamPoints: false,
    status: true,
    warnings: true,
  };
}

function isCompetitionInBroadcastWindow(startDate: string, endDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const windowEnd = new Date(today);
  windowEnd.setDate(windowEnd.getDate() + 30);
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return true;
  start.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return end >= today && start <= windowEnd;
}

function fullName(person: PublicNominationDto['athlete']): string {
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ');
}

function formatBirthYear(value: number | null | undefined): string {
  return value ? String(value) : '-';
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function sortBroadcastRows(
  rows: ScoreboardRowDto[],
  nominationsById: Map<string, PublicNominationDto>,
  mode: BroadcastSortMode,
): ScoreboardRowDto[] {
  return [...rows].sort((a, b) => {
    if (mode === 'weight') {
      return (
        a.weightClass.localeCompare(b.weightClass) || a.athleteName.localeCompare(b.athleteName)
      );
    }
    if (mode === 'division') {
      return (
        a.division.localeCompare(b.division) ||
        a.weightClass.localeCompare(b.weightClass) ||
        a.athleteName.localeCompare(b.athleteName)
      );
    }
    if (mode === 'score') {
      return (
        Number(b.finalScore ?? 0) - Number(a.finalScore ?? 0) ||
        a.weightClass.localeCompare(b.weightClass) ||
        a.athleteName.localeCompare(b.athleteName)
      );
    }
    return fullName(
      nominationsById.get(a.nominationId)?.athlete ?? {
        id: '',
        firstName: a.athleteName,
        lastName: '',
        middleName: null,
        clubName: null,
        birthYear: null,
        photoUrl: null,
      },
    ).localeCompare(
      fullName(
        nominationsById.get(b.nominationId)?.athlete ?? {
          id: '',
          firstName: b.athleteName,
          lastName: '',
          middleName: null,
          clubName: null,
          birthYear: null,
          photoUrl: null,
        },
      ),
    );
  });
}

export default function CompetitionBroadcastFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/broadcast/competitions/$id' });
  const { data, isLoading, error, isFetching, refetch } = usePublicScoreboard(id);
  const [selectedPlatform, setSelectedPlatform] = useState<'1' | 'admin'>('1');
  const [showAllCompetitions, setShowAllCompetitions] = useState(false);
  const [competitionSelected, setCompetitionSelected] = useState(true);
  const [sortMode, setSortMode] = useState<BroadcastSortMode>('name');
  const [visibleColumns, setVisibleColumns] = useState(defaultColumnVisibility);
  const [hideAthletePhoto, setHideAthletePhoto] = useState(true);
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [localDecision, setLocalDecision] = useState<'good_lift' | 'no_lift' | null>(null);
  const competitionGenderStats = useMemo(
    () => nominationGenderStats(data?.nominations ?? []),
    [data?.nominations],
  );
  const nominationsById = useMemo(
    () => new Map((data?.nominations ?? []).map((nomination) => [nomination.id, nomination])),
    [data?.nominations],
  );
  const showCompetitionRow = data
    ? showAllCompetitions ||
      isCompetitionInBroadcastWindow(data.competition.startDate, data.competition.endDate)
    : false;
  const visibleRows = useMemo(
    () =>
      sortBroadcastRows(
        competitionSelected && showCompetitionRow ? (data?.rows ?? []) : [],
        nominationsById,
        sortMode,
      ),
    [competitionSelected, data?.rows, nominationsById, showCompetitionRow, sortMode],
  );

  const current = useMemo(
    () => (visibleRows[0] ? (nominationsById.get(visibleRows[0].nominationId) ?? null) : null),
    [nominationsById, visibleRows],
  );
  const athleteName = current ? fullName(current.athlete) : '';
  const visibleColumnCount =
    2 + broadcastColumns.filter((column) => visibleColumns[column.key]).length;

  useEffect(() => {
    if (!timerRunning) return undefined;
    const timer = window.setInterval(() => {
      setTimerSeconds((seconds) => {
        if (seconds <= 1) {
          window.clearInterval(timer);
          setTimerRunning(false);
          return 0;
        }
        return seconds - 1;
      });
    }, 1_000);
    return () => window.clearInterval(timer);
  }, [timerRunning]);

  async function refreshList() {
    const result = await refetch();
    if (result.error) {
      toast.error(result.error instanceof Error ? result.error.message : 'Error');
      return;
    }
    toast.success('Список трансляции обновлен');
  }

  function startTimer(seconds = 60) {
    setTimerSeconds(seconds);
    setTimerRunning(true);
  }

  function pauseTimer() {
    setTimerRunning(false);
  }

  function markDecision(decision: 'good_lift' | 'no_lift') {
    setLocalDecision(decision);
    toast.success(
      decision === 'good_lift' ? 'На табло отмечен зачет' : 'На табло отмечен не зачет',
    );
  }

  function setColumnVisibility(key: BroadcastColumnKey, checked: boolean) {
    setVisibleColumns((columns) => ({ ...columns, [key]: checked }));
  }

  function renderColumn(row: ScoreboardRowDto, key: BroadcastColumnKey) {
    const nomination = nominationsById.get(row.nominationId);
    if (key === 'weightClass')
      return (
        <td key={key} className="font-bold">
          {row.weightClass}
        </td>
      );
    if (key === 'bodyWeight')
      return (
        <td key={key} className="text-right">
          {nomination?.bodyWeightAtWeighIn ?? '-'}
        </td>
      );
    if (key === 'rankTitle') return <td key={key}>-</td>;
    if (key === 'birthYear')
      return (
        <td key={key} className="text-right">
          {formatBirthYear(nomination?.athlete.birthYear)}
        </td>
      );
    if (key === 'coefficient')
      return (
        <td key={key} className="text-right">
          {row.finalScore && row.bestSuccessfulAttemptKg
            ? (row.finalScore / row.bestSuccessfulAttemptKg).toFixed(3)
            : '-'}
        </td>
      );
    if (key === 'place')
      return (
        <td key={key} className="text-right">
          {row.placeInClass ?? '-'}
        </td>
      );
    if (key === 'teamPoints')
      return (
        <td key={key} className="text-right">
          {row.finalScore ?? '-'}
        </td>
      );
    if (key === 'status') return <td key={key}>{t(`competitionOps.status.${row.status}`)}</td>;
    return (
      <td key={key}>
        {row.status === 'finished' ? '-' : t(`competitionOps.status.${row.status}`)}
      </td>
    );
  }

  if (isLoading) {
    return <div className="pt-page p-6 text-sm text-gray-600">{t('common.loading')}</div>;
  }
  if (error || !data) {
    return (
      <div className="pt-page p-6 text-sm text-red-700">
        {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }

  return (
    <WorkspacePage
      title={`Помост №${selectedPlatform === 'admin' ? 'Admin' : selectedPlatform}`}
      subtitle={`${data.competition.nameRu} · обновлено ${new Date(data.generatedAt).toLocaleTimeString('ru-RU')}`}
      actions={
        <WorkspaceButton
          type="button"
          icon="refresh"
          onClick={() => void refreshList()}
          disabled={isFetching}
        >
          {isFetching ? t('common.loading') : 'Обновить список'}
        </WorkspaceButton>
      }
      federationBar={
        <>
          <span>{data.competition.federation.code}</span>
          <span>{data.competition.federation.nameRu}</span>
        </>
      }
      tabs={[
        { label: 'Параметры', icon: 'settings' },
        { label: 'Оператор', icon: 'operator', active: true },
        { label: 'Высота стоек/начальные веса', icon: 'platform' },
        { label: 'Звук и Музыка', icon: 'music' },
      ]}
    >
      <div className="pt-info-gray mb-2 flex items-center justify-between">
        <span className="pt-inline-icon">
          <WorkspaceIcon name="warning" />В списке отображаются соревнования + 30 дней от текущей
          даты
        </span>
        <label className="pt-checkline">
          <span>Отобразить все соревнования:</span>
          <input
            type="checkbox"
            checked={showAllCompetitions}
            onChange={(event) => setShowAllCompetitions(event.target.checked)}
          />
        </label>
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_370px]">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="font-bold text-red-700">Выберите номер помоста:</span>
            <WorkspaceButton
              type="button"
              {...(selectedPlatform === '1' ? { tone: 'green' as const } : {})}
              onClick={() => setSelectedPlatform('1')}
            >
              1
            </WorkspaceButton>
            <WorkspaceButton
              type="button"
              {...(selectedPlatform === 'admin' ? { tone: 'green' as const } : {})}
              onClick={() => setSelectedPlatform('admin')}
            >
              Admin
            </WorkspaceButton>
          </div>
          <WorkspaceButton
            type="button"
            icon="refresh"
            onClick={() => void refreshList()}
            disabled={isFetching}
          >
            {isFetching ? t('common.loading') : 'Обновить список'}
          </WorkspaceButton>

          <table className="pt-grid">
            <thead>
              <tr>
                <th></th>
                <th></th>
                <th>
                  <WorkspaceIcon name="timer" className="mx-auto" />
                </th>
                <th>Начало</th>
                <th>Ном</th>
                <th>Жен</th>
                <th>Муж</th>
              </tr>
            </thead>
            <tbody>
              {showCompetitionRow ? (
                <tr className="is-selected">
                  <td>
                    <input
                      type="checkbox"
                      checked={competitionSelected}
                      onChange={(event) => setCompetitionSelected(event.target.checked)}
                    />
                  </td>
                  <td>{data.competition.nameRu}</td>
                  <td>{new Date(data.competition.startDate).toLocaleDateString('ru-RU')}</td>
                  <td>{new Date(data.competition.startDate).toLocaleDateString('ru-RU')}</td>
                  <td className="text-right">{competitionGenderStats.total}</td>
                  <td className="text-right">{competitionGenderStats.women}</td>
                  <td className="text-right">{competitionGenderStats.men}</td>
                </tr>
              ) : (
                <tr>
                  <td colSpan={7} className="italic">
                    Соревнование скрыто 30-дневным фильтром.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <div className="pt-live-controls mt-2">
            {!hideAthletePhoto && current ? (
              current.athlete.photoUrl ? (
                <img
                  src={current.athlete.photoUrl}
                  alt=""
                  className="h-16 w-16 rounded border border-gray-700 object-cover"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded border border-gray-700 bg-black text-lg font-bold text-[#98e400]">
                  {initials(athleteName) || 'SL'}
                </div>
              )
            ) : null}
            <div className="pt-black-display">
              {athleteName || '-'}
              {localDecision ? (
                <span className="ml-3 text-sm font-bold">
                  {localDecision === 'good_lift' ? 'Зачет' : 'Не зачет'}
                </span>
              ) : null}
            </div>
            <WorkspaceButton type="button" icon="break" aria-label="Пауза" onClick={pauseTimer} />
            <WorkspaceButton type="button" onClick={() => startTimer(60)}>
              60s Старт
            </WorkspaceButton>
            <button
              className="pt-big-green"
              type="button"
              onClick={() => setTimerRunning((running) => !running)}
            >
              <WorkspaceIcon name="timer" />
              {timerRunning ? 'Пауза' : 'Старт'} [{timerSeconds} сек]
            </button>
            <WorkspaceButton
              type="button"
              icon="break"
              aria-label="Пауза таймера"
              onClick={pauseTimer}
            />
            <button
              className="pt-big-green"
              type="button"
              onClick={() => markDecision('good_lift')}
            >
              <WorkspaceIcon name="flag" />
              Зачёт
            </button>
            <button className="pt-big-pink" type="button" onClick={() => markDecision('no_lift')}>
              <WorkspaceIcon name="flag" />
              Не зачёт
            </button>
          </div>

          <table className="pt-grid">
            <thead>
              <tr>
                <th>Спортсмен</th>
                <th>Дисц.</th>
                {broadcastColumns
                  .filter((column) => visibleColumns[column.key])
                  .map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr
                  key={row.nominationId}
                  className={index === 0 ? 'is-selected' : index % 2 ? 'is-yellow' : 'is-green'}
                >
                  <td>{row.athleteName}</td>
                  <td>{row.discipline}</td>
                  {broadcastColumns
                    .filter((column) => visibleColumns[column.key])
                    .map((column) => renderColumn(row, column.key))}
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumnCount} className="italic">
                    Номинации скрыты настройками отображения.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <WorkspacePanel className="p-3">
          <div className="font-bold text-blue-900">Упорядочивание номинаций:</div>
          {[
            ['name', 'по ФИО'],
            ['weight', 'по весовой категории, ФИО'],
            ['division', 'по возрастной, ВК, ФИО'],
            ['score', 'по сумме прогноза, ВК, ФИО'],
          ].map(([value, label]) => (
            <label key={label} className="pt-checkline mt-2">
              <input
                name="sort"
                type="radio"
                checked={sortMode === value}
                onChange={() => setSortMode(value as BroadcastSortMode)}
              />
              <span>{label}</span>
            </label>
          ))}

          <div className="mt-4 font-bold text-blue-900">
            Управление видимостью колонок в номинациях
          </div>
          <table className="pt-grid mt-1">
            <thead>
              <tr>
                <th>Вкл</th>
                <th>Название колонки</th>
              </tr>
            </thead>
            <tbody>
              {broadcastColumns.map((column, index) => (
                <tr key={column.key} className={index === 0 ? 'is-selected' : undefined}>
                  <td>
                    <input
                      type="checkbox"
                      checked={visibleColumns[column.key]}
                      onChange={(event) => setColumnVisibility(column.key, event.target.checked)}
                    />
                  </td>
                  <td>{column.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <label className="pt-checkline mt-3">
            <span>Не отображать фото спортсмена:</span>
            <input
              type="checkbox"
              checked={hideAthletePhoto}
              onChange={(event) => setHideAthletePhoto(event.target.checked)}
            />
          </label>
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}
