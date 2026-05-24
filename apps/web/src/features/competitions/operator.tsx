import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
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
import type { CompetitionLiveOpsResponse, LiveNominationDto } from './operations-api.js';
import { useCompetitionLiveOps, useUpdateNomination, useUpsertAttempt } from './operations-api.js';
import {
  attemptSummary,
  componentOptions,
  fullName,
  nextAttemptNumber,
  sortForPlatform,
} from './tournament-utils.js';

const controlClass = 'pt-field w-full';

type OperatorTab = 'params' | 'operator' | 'heights' | 'sound';

const OPERATOR_TABS: { key: OperatorTab; label: string; icon: WorkspaceIconName }[] = [
  { key: 'params', label: 'Параметры', icon: 'settings' },
  { key: 'operator', label: 'Оператор', icon: 'operator' },
  { key: 'heights', label: 'Высота стоек / начальные веса', icon: 'bar' },
  { key: 'sound', label: 'Звук и Музыка', icon: 'music' },
];

const ORDERINGS: { key: string; label: string }[] = [
  { key: 'name', label: 'по ФИО' },
  { key: 'wc-name', label: 'по весовой категории, ФИО' },
  { key: 'age-wc-name', label: 'по возрастной, ВК, ФИО' },
  { key: 'forecast', label: 'по сумме прогноза, ВК, ФИО' },
];

const COLUMN_OPTIONS: { key: string; label: string; defaultOn: boolean }[] = [
  { key: 'wc', label: 'Весовая категория', defaultOn: true },
  { key: 'bw', label: 'Собственный вес', defaultOn: true },
  { key: 'rank', label: 'Спортивный разряд / звание', defaultOn: true },
  { key: 'yob', label: 'Год рождения', defaultOn: true },
  { key: 'coef', label: 'Коэффициент', defaultOn: false },
  { key: 'place', label: 'Место', defaultOn: true },
  { key: 'kg-to-first', label: 'Сколько кг не хватает до 1 места', defaultOn: false },
  { key: 'team-points', label: 'Командные очки', defaultOn: false },
  { key: 'place-abs', label: 'Место в абсолютном первенстве', defaultOn: true },
  { key: 'rank-done', label: 'Выполненный разряд', defaultOn: false },
  { key: 'place-forecast', label: 'Место (ПРОГНОЗ)', defaultOn: false },
  {
    key: 'kg-to-first-forecast',
    label: 'Сколько кг не хватает до 1 места (ПРОГНОЗ)',
    defaultOn: false,
  },
  { key: 'place-abs-forecast', label: 'Место в абсолютном первенстве (ПРОГНОЗ)', defaultOn: false },
  { key: 'coef-forecast', label: 'Коэффициент (ПРОГНОЗ)', defaultOn: false },
  { key: 'status', label: 'Статус номинации', defaultOn: true },
  { key: 'warnings', label: 'Предупреждения', defaultOn: true },
  { key: 'place-sum', label: 'МестоСумма', defaultOn: false },
  { key: 'sum-attempts', label: 'СуммаПопыток', defaultOn: false },
];

function selectableNominations(nominations: LiveNominationDto[]): LiveNominationDto[] {
  return nominations
    .filter((nomination) => !['finished', 'disqualified', 'withdrawn'].includes(nomination.status))
    .sort(sortForPlatform);
}

function ParamsTab({
  platformNumber,
  setPlatformNumber,
  ordering,
  setOrdering,
  columns,
  setColumns,
  hidePhoto,
  setHidePhoto,
}: {
  platformNumber: number;
  setPlatformNumber: (n: number) => void;
  ordering: string;
  setOrdering: (v: string) => void;
  columns: Record<string, boolean>;
  setColumns: (v: Record<string, boolean>) => void;
  hidePhoto: boolean;
  setHidePhoto: (v: boolean) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_minmax(280px,360px)]">
      <WorkspacePanel className="p-3 space-y-3">
        <div className="pt-info-yellow">
          В списке отображаются соревнования +- 30 дней от текущей даты.
        </div>
        <div className="flex items-center gap-3">
          <label htmlFor="platformNumber" className="pt-label">
            Выберите номер помоста:
          </label>
          <input
            id="platformNumber"
            type="number"
            min="0"
            max="20"
            value={platformNumber}
            onChange={(e) => setPlatformNumber(Number(e.target.value) || 0)}
            className="pt-field w-20"
          />
        </div>
        <WorkspaceToolbar>
          <WorkspaceButton type="button" icon="refresh" tone="green">
            Обновить список
          </WorkspaceButton>
        </WorkspaceToolbar>
        <div className="pt-info-yellow">
          После выбора группы укажите упражнение. Если при выборе группы список упражнений не
          заполняется — в номинациях есть ошибки. Описание ошибок появляется во всплывающем окне
          справа внизу.
        </div>
      </WorkspacePanel>

      <WorkspacePanel className="p-3 space-y-3">
        <WorkspaceSectionTitle>Упорядочивание номинаций</WorkspaceSectionTitle>
        <div className="space-y-1">
          {ORDERINGS.map((opt) => (
            <label key={opt.key} className="pt-checkline">
              <input
                type="radio"
                name="ordering"
                value={opt.key}
                checked={ordering === opt.key}
                onChange={() => setOrdering(opt.key)}
              />
              <span>{opt.label}</span>
            </label>
          ))}
        </div>

        <WorkspaceSectionTitle>Управление видимостью колонок</WorkspaceSectionTitle>
        <table className="pt-grid">
          <thead>
            <tr>
              <th className="w-12">Вкл</th>
              <th className="text-left">Название колонки</th>
            </tr>
          </thead>
          <tbody>
            {COLUMN_OPTIONS.map((c) => (
              <tr key={c.key} className={columns[c.key] ? 'is-selected' : undefined}>
                <td className="text-center">
                  <input
                    type="checkbox"
                    checked={columns[c.key] ?? false}
                    onChange={(e) => setColumns({ ...columns, [c.key]: e.target.checked })}
                  />
                </td>
                <td>{c.label}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <WorkspaceCheckbox
          checked={hidePhoto}
          onChange={setHidePhoto}
          label="Не отображать фото спортсмена:"
        />
      </WorkspacePanel>
    </div>
  );
}

function HeightsTab({ data }: { data: CompetitionLiveOpsResponse }) {
  const rows = data.nominations.slice().sort(sortForPlatform);
  return (
    <WorkspacePanel className="p-3">
      <WorkspaceToolbar>
        <WorkspaceButton type="button" icon="refresh" tone="green">
          Обновить
        </WorkspaceButton>
      </WorkspaceToolbar>
      <table className="pt-grid mt-2">
        <thead>
          <tr>
            <th className="w-10">П</th>
            <th className="w-10">М</th>
            <th className="text-left">Группа</th>
            <th className="w-12">№</th>
            <th>Помост</th>
            <th className="text-left">Спортсмен</th>
            <th className="text-left">Дисциплина</th>
            <th>Вес</th>
            <th>WC</th>
            <th>Статус</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={10} className="pt-muted italic text-center">
                Нет назначенных номинаций.
              </td>
            </tr>
          ) : (
            rows.map((n) => (
              <tr key={n.id}>
                <td className="text-center">{n.flightId ? '✓' : ''}</td>
                <td className="text-center">{n.isMandatePassed ? '✓' : ''}</td>
                <td>{n.group?.name ?? '—'}</td>
                <td className="text-right tabular-nums">{n.entryNumber ?? '—'}</td>
                <td>{n.flight?.name ?? '—'}</td>
                <td>{fullName(n.athlete)}</td>
                <td>{n.discipline.nameRu}</td>
                <td className="text-right tabular-nums">{n.bodyWeightAtWeighIn ?? '—'}</td>
                <td className="text-center">{n.weightClass.nameRu}</td>
                <td>{n.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </WorkspacePanel>
  );
}

function SoundTab({
  useSound,
  setUseSound,
  voiceJudges,
  setVoiceJudges,
  voiceLang,
  setVoiceLang,
  useMusic,
  setUseMusic,
}: {
  useSound: boolean;
  setUseSound: (v: boolean) => void;
  voiceJudges: boolean;
  setVoiceJudges: (v: boolean) => void;
  voiceLang: 'ru' | 'en';
  setVoiceLang: (v: 'ru' | 'en') => void;
  useMusic: boolean;
  setUseMusic: (v: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <WorkspacePanel className="p-3 space-y-3">
        <WorkspaceSectionTitle>Звуковые уведомления</WorkspaceSectionTitle>
        <div className="flex items-center gap-3">
          <WorkspaceCheckbox
            checked={useSound}
            onChange={setUseSound}
            label="Использовать звуковое уведомление:"
          />
          <WorkspaceButton type="button" icon="music">
            Проверить звук
          </WorkspaceButton>
        </div>
        <ol className="pt-muted text-sm space-y-1 ml-4 list-decimal">
          <li>Звучит сигнал на отметке 30 секунд.</li>
          <li>За 3 секунды до окончания таймера раздаётся 2 щелчка.</li>
          <li>При неудачной попытке раздаётся звук сирены.</li>
        </ol>
        <div className="flex items-center gap-3">
          <WorkspaceCheckbox
            checked={voiceJudges}
            onChange={setVoiceJudges}
            label="Озвучивать оценки судей (Вес взят, Вес взят два к одному, Попытка неудачная, 30 секунд, Время вышло):"
          />
          <div className="pt-checkline">
            <input
              type="radio"
              name="voiceLang"
              checked={voiceLang === 'ru'}
              onChange={() => setVoiceLang('ru')}
            />
            <span>Русский</span>
          </div>
          <div className="pt-checkline">
            <input
              type="radio"
              name="voiceLang"
              checked={voiceLang === 'en'}
              onChange={() => setVoiceLang('en')}
            />
            <span>English</span>
          </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel className="p-3 space-y-3 pt-info-green">
        <WorkspaceSectionTitle>Настройка музыкального сопровождения</WorkspaceSectionTitle>
        <ol className="pt-muted text-sm space-y-1 ml-4 list-decimal">
          <li>
            Установите галочку «Использовать музыкальное сопровождение». Будут загружены ранее не
            загруженные персональные мелодии спортсменов.
          </li>
          <li>
            <WorkspaceCheckbox
              checked={useMusic}
              onChange={setUseMusic}
              label="Использовать музыкальное сопровождение:"
            />
          </li>
          <li>
            Скопируйте подборку музыки в формате mp3 в папку{' '}
            <code className="font-mono">C:\PowerTable_music</code>.
          </li>
          <li>
            <WorkspaceButton type="button" icon="music" tone="green">
              Создать плейлист / запустить плеер
            </WorkspaceButton>
          </li>
          <li>
            Спортсмены могут добавлять любимую композицию в формате mp3 через мессенджер Telegram,
            бот <strong>@PowerTable_bot</strong>.
          </li>
          <li>
            Основной фон играет с громкостью 80%. Если спортсмен добавил музыку, она играет на 100%.
          </li>
          <li>Громкость автоматически снижается на 50% пока работает таймер выхода на помост.</li>
        </ol>
      </WorkspacePanel>
    </div>
  );
}

export default function CompetitionOperatorFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/operator' });
  const { data, isLoading, error } = useCompetitionLiveOps(id);
  const updateNomination = useUpdateNomination(id);
  const upsertAttempt = useUpsertAttempt(id);
  const [selectedNominationId, setSelectedNominationId] = useState('');
  const [componentId, setComponentId] = useState<string | null>(null);
  const [attemptNumber, setAttemptNumber] = useState('1');
  const [weightKg, setWeightKg] = useState('');
  const [repsCount, setRepsCount] = useState('');
  const [timerSeconds, setTimerSeconds] = useState(60);
  const [timerRunning, setTimerRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<OperatorTab>('operator');
  const [platformNumber, setPlatformNumber] = useState(1);
  const [ordering, setOrdering] = useState('name');
  const [columns, setColumns] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(COLUMN_OPTIONS.map((c) => [c.key, c.defaultOn])),
  );
  const [hidePhoto, setHidePhoto] = useState(false);
  const [useSound, setUseSound] = useState(false);
  const [voiceJudges, setVoiceJudges] = useState(false);
  const [voiceLang, setVoiceLang] = useState<'ru' | 'en'>('ru');
  const [useMusic, setUseMusic] = useState(false);

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

  async function setStatus(status: LiveNominationDto['status']) {
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
      tabs={OPERATOR_TABS.map((tab) => ({
        label: tab.label,
        icon: tab.icon,
        active: activeTab === tab.key,
        onClick: () => setActiveTab(tab.key),
        testId: `operator-tab-${tab.key}`,
      }))}
      className="competition-operator"
    >
      <div data-testid="competition-operator" className="space-y-3">
        {activeTab === 'params' && (
          <ParamsTab
            platformNumber={platformNumber}
            setPlatformNumber={setPlatformNumber}
            ordering={ordering}
            setOrdering={setOrdering}
            columns={columns}
            setColumns={setColumns}
            hidePhoto={hidePhoto}
            setHidePhoto={setHidePhoto}
          />
        )}
        {activeTab === 'heights' && <HeightsTab data={data} />}
        {activeTab === 'sound' && (
          <SoundTab
            useSound={useSound}
            setUseSound={setUseSound}
            voiceJudges={voiceJudges}
            setVoiceJudges={setVoiceJudges}
            voiceLang={voiceLang}
            setVoiceLang={setVoiceLang}
            useMusic={useMusic}
            setUseMusic={setUseMusic}
          />
        )}
        {activeTab === 'operator' &&
          (!selected ? (
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
                      <label htmlFor="operatorNomination">
                        {t('competitionOps.fields.athlete')}
                      </label>
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
                <WorkspaceSectionTitle>
                  {t('competitionOperator.nextAthletes')}
                </WorkspaceSectionTitle>
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
          ))}
      </div>
    </WorkspacePage>
  );
}
