import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  WorkspaceButton,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceToolbar,
} from '../../components/workspace.js';
import { genderShortLabel, nominationGenderStats } from './gender-stats.js';
import { useCompetitionOps, type ScoreboardRowDto } from './operations-api.js';

type CeremonyPlayer = {
  stop: () => void;
};

type AwardVariant = 'class' | 'overall' | 'teams';

interface AthleteAwardRow {
  kind: 'athlete';
  key: string;
  row: ScoreboardRowDto;
  place: number;
}

interface TeamAwardRow {
  kind: 'team';
  key: string;
  teamName: string;
  nominations: number;
  points: number;
  bestScore: number;
  place: number;
}

type AwardRow = AthleteAwardRow | TeamAwardRow;

function classGroupKey(row: ScoreboardRowDto): string {
  return `${row.discipline} / ${row.division} / ${row.weightClass}`;
}

function overallGroupKey(row: ScoreboardRowDto): string {
  return `${row.discipline} / Абсолютный зачет`;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName);
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)].filter(Boolean);
}

function toggleValue(values: string[], value: string, enabled: boolean): string[] {
  if (enabled) return values.includes(value) ? values : [...values, value];
  return values.filter((item) => item !== value);
}

function startCeremonyPlayer(): CeremonyPlayer {
  const AudioContextClass =
    window.AudioContext ??
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioContextClass) throw new Error('AudioContext is not supported');

  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = 0.05;
  master.connect(context.destination);

  const notes = [392, 494, 587, 784, 587, 494, 392, 587];
  const oscillators = new Set<OscillatorNode>();
  let noteIndex = 0;

  function playNote() {
    const now = context.currentTime;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = notes[noteIndex % notes.length] ?? 440;
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    oscillator.connect(gain);
    gain.connect(master);
    oscillators.add(oscillator);
    oscillator.onended = () => oscillators.delete(oscillator);
    oscillator.start(now);
    oscillator.stop(now + 0.6);
    noteIndex += 1;
  }

  playNote();
  const timer = window.setInterval(playNote, 650);

  return {
    stop: () => {
      window.clearInterval(timer);
      for (const oscillator of oscillators) {
        try {
          oscillator.stop();
        } catch {
          // Already stopped by the scheduled envelope.
        }
      }
      void context.close();
    },
  };
}

export default function CompetitionAwardsFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/awards' });
  const { data, isLoading, error } = useCompetitionOps(id);
  const playerRef = useRef<CeremonyPlayer | null>(null);
  const [musicPlaying, setMusicPlaying] = useState(false);
  const [currentAwardIndex, setCurrentAwardIndex] = useState(0);
  const [competitionSelected, setCompetitionSelected] = useState(true);
  const [awardVariant, setAwardVariant] = useState<AwardVariant>('class');
  const [firstPlaceFirst, setFirstPlaceFirst] = useState(true);
  const [selectedWeights, setSelectedWeights] = useState<string[]>([]);
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([]);
  const allWeights = useMemo(
    () => (data ? uniqueValues(data.scoreboardRows.map((row) => row.weightClass)) : []),
    [data],
  );
  const allDisciplines = useMemo(
    () => (data ? uniqueValues(data.scoreboardRows.map((row) => row.discipline)) : []),
    [data],
  );
  const nominationById = useMemo(
    () => new Map((data?.nominations ?? []).map((nomination) => [nomination.id, nomination])),
    [data?.nominations],
  );
  const scoreboardRowByNominationId = useMemo(
    () => new Map((data?.scoreboardRows ?? []).map((row) => [row.nominationId, row])),
    [data?.scoreboardRows],
  );
  const competitionGenderStats = useMemo(
    () => nominationGenderStats(data?.nominations ?? []),
    [data?.nominations],
  );
  const disciplineGenderStats = useMemo(
    () =>
      new Map(
        allDisciplines.map((discipline) => [
          discipline,
          nominationGenderStats(
            data?.nominations ?? [],
            (nomination) => nomination.discipline.nameRu === discipline,
          ),
        ]),
      ),
    [allDisciplines, data?.nominations],
  );
  const leftWeights = allWeights.slice(0, Math.ceil(allWeights.length / 2));
  const rightWeights = allWeights.slice(Math.ceil(allWeights.length / 2));
  const filteredScoreboardRows = useMemo(
    () =>
      competitionSelected
        ? (data?.scoreboardRows.filter(
            (row) =>
              selectedWeights.includes(row.weightClass) &&
              selectedDisciplines.includes(row.discipline),
          ) ?? [])
        : [],
    [competitionSelected, data?.scoreboardRows, selectedDisciplines, selectedWeights],
  );
  const awardRows = useMemo(() => {
    if (awardVariant === 'teams') {
      const teams = new Map<string, { nominations: number; points: number; bestScore: number }>();
      for (const nomination of data?.nominations ?? []) {
        if (!competitionSelected) continue;
        if (!selectedWeights.includes(nomination.weightClass.nameRu)) continue;
        if (!selectedDisciplines.includes(nomination.discipline.nameRu)) continue;
        const row = scoreboardRowByNominationId.get(nomination.id);
        const score = Number(row?.finalScore ?? 0);
        const teamName = nomination.athlete.clubName?.trim() || 'Без команды';
        const current = teams.get(teamName) ?? { nominations: 0, points: 0, bestScore: 0 };
        teams.set(teamName, {
          nominations: current.nominations + 1,
          points: current.points + score,
          bestScore: Math.max(current.bestScore, score),
        });
      }

      return [...teams.entries()]
        .sort(
          (a, b) =>
            b[1].points - a[1].points ||
            b[1].bestScore - a[1].bestScore ||
            a[0].localeCompare(b[0]),
        )
        .slice(0, 3)
        .map<AwardRow>(([teamName, team], index) => ({
          kind: 'team',
          key: teamName,
          teamName,
          nominations: team.nominations,
          points: team.points,
          bestScore: team.bestScore,
          place: index + 1,
        }));
    }

    const getPlace = (row: ScoreboardRowDto) =>
      awardVariant === 'overall' ? row.placeOverall : row.placeInClass;
    const getKey = awardVariant === 'overall' ? overallGroupKey : classGroupKey;
    const groups = new Map<string, AthleteAwardRow[]>();
    for (const row of filteredScoreboardRows) {
      const place = getPlace(row);
      if (!place || place > 3) continue;
      const key = getKey(row);
      groups.set(key, [...(groups.get(key) ?? []), { kind: 'athlete', key, row, place }]);
    }

    return [...groups.entries()].flatMap(([, rows]) =>
      [...rows].sort((a, b) => (firstPlaceFirst ? a.place - b.place : b.place - a.place)),
    );
  }, [
    awardVariant,
    competitionSelected,
    data?.nominations,
    filteredScoreboardRows,
    firstPlaceFirst,
    scoreboardRowByNominationId,
    selectedDisciplines,
    selectedWeights,
  ]);
  const nextAward = useCallback(() => {
    setCurrentAwardIndex((index) => (awardRows.length > 0 ? (index + 1) % awardRows.length : 0));
  }, [awardRows.length]);

  useEffect(
    () => () => {
      playerRef.current?.stop();
      playerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    setCurrentAwardIndex(0);
  }, [awardRows.length]);

  useEffect(() => {
    setSelectedWeights(allWeights);
  }, [allWeights]);

  useEffect(() => {
    setSelectedDisciplines(allDisciplines);
  }, [allDisciplines]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== 'Space' || isEditableTarget(event.target)) return;
      event.preventDefault();
      nextAward();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [nextAward]);

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

  function stopMusic() {
    playerRef.current?.stop();
    playerRef.current = null;
    setMusicPlaying(false);
  }

  function toggleMusic() {
    if (playerRef.current) {
      stopMusic();
      return;
    }
    try {
      playerRef.current = startCeremonyPlayer();
      setMusicPlaying(true);
    } catch {
      toast.error('Браузер не смог запустить аудио');
    }
  }

  return (
    <WorkspacePage
      title="Награждение"
      subtitle={data.competition.nameRu}
      actions={
        <>
          <WorkspaceButton type="button" tone="green" icon="music" onClick={toggleMusic}>
            {musicPlaying ? 'Остановить звуковой сигнал' : 'Запустить звуковой сигнал церемонии'}
          </WorkspaceButton>
          <WorkspaceButton type="button" onClick={() => window.print()}>
            Печать
          </WorkspaceButton>
          <Link to="/competitions/$id/reports" params={{ id }} className="pt-link-button">
            Отчеты
          </Link>
          <Link to="/competitions/$id/operations" params={{ id }} className="pt-link-button">
            Операции
          </Link>
        </>
      }
      federationBar={
        <>
          <span>{data.competition.federation.code}</span>
          <span>{data.competition.federation.nameRu}</span>
        </>
      }
      tabs={[{ label: 'Награждение', icon: 'awards', active: true }]}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-3">
          <table className="pt-grid">
            <thead>
              <tr>
                <th>Вкл</th>
                <th>Соревнование</th>
                <th>Начало</th>
                <th>Н.Всего</th>
                <th>Н.Жен.</th>
                <th>Н.Муж.</th>
              </tr>
            </thead>
            <tbody>
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
                <td className="text-right">{competitionGenderStats.total}</td>
                <td className="text-right">{competitionGenderStats.women}</td>
                <td className="text-right">{competitionGenderStats.men}</td>
              </tr>
            </tbody>
          </table>

          <div className="flex items-center gap-4">
            <span>Вариант:</span>
            <label>
              <input
                type="radio"
                name="awardVariant"
                checked={awardVariant === 'class'}
                onChange={() => setAwardVariant('class')}
              />{' '}
              Весовые
            </label>
            <label>
              <input
                type="radio"
                name="awardVariant"
                checked={awardVariant === 'overall'}
                onChange={() => setAwardVariant('overall')}
              />{' '}
              Абсолютка
            </label>
            <label>
              <input
                type="radio"
                name="awardVariant"
                checked={awardVariant === 'teams'}
                onChange={() => setAwardVariant('teams')}
              />{' '}
              Команды
            </label>
          </div>
          <label className="pt-checkline">
            <input
              type="checkbox"
              checked={firstPlaceFirst}
              onChange={(event) => setFirstPlaceFirst(event.target.checked)}
            />{' '}
            Награждение с первого места
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <WorkspacePanel className="p-2">
              <WorkspaceToolbar>
                <WorkspaceButton
                  type="button"
                  icon="check"
                  aria-label="Выбрать все весовые слева"
                  onClick={() => setSelectedWeights(allWeights)}
                />
                <WorkspaceButton
                  type="button"
                  icon="list"
                  aria-label="Очистить весовые слева"
                  onClick={() => setSelectedWeights([])}
                />
              </WorkspaceToolbar>
              <table className="pt-grid">
                <thead>
                  <tr>
                    <th>Вкл</th>
                    <th>Весовая категория</th>
                    <th>Н</th>
                  </tr>
                </thead>
                <tbody>
                  {leftWeights.map((weight, index) => (
                    <tr key={weight} className={index === 0 ? 'is-selected' : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedWeights.includes(weight)}
                          onChange={(event) =>
                            setSelectedWeights((values) =>
                              toggleValue(values, weight, event.target.checked),
                            )
                          }
                        />
                      </td>
                      <td>{weight}</td>
                      <td className="text-right">
                        {data.scoreboardRows.filter((row) => row.weightClass === weight).length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </WorkspacePanel>

            <WorkspacePanel className="p-2">
              <WorkspaceToolbar>
                <WorkspaceButton
                  type="button"
                  icon="check"
                  aria-label="Выбрать все весовые справа"
                  onClick={() => setSelectedWeights(allWeights)}
                />
                <WorkspaceButton
                  type="button"
                  icon="list"
                  aria-label="Очистить весовые справа"
                  onClick={() => setSelectedWeights([])}
                />
              </WorkspaceToolbar>
              <table className="pt-grid">
                <thead>
                  <tr>
                    <th>Вкл</th>
                    <th>Весовая категория</th>
                    <th>Н</th>
                  </tr>
                </thead>
                <tbody>
                  {rightWeights.map((weight, index) => (
                    <tr key={weight} className={index === 0 ? 'is-selected' : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedWeights.includes(weight)}
                          onChange={(event) =>
                            setSelectedWeights((values) =>
                              toggleValue(values, weight, event.target.checked),
                            )
                          }
                        />
                      </td>
                      <td>{weight}</td>
                      <td className="text-right">
                        {data.scoreboardRows.filter((row) => row.weightClass === weight).length}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </WorkspacePanel>
          </div>

          <WorkspacePanel className="p-2">
            <WorkspaceToolbar>
              <WorkspaceButton
                type="button"
                icon="check"
                aria-label="Выбрать все дисциплины"
                onClick={() => setSelectedDisciplines(allDisciplines)}
              />
              <WorkspaceButton
                type="button"
                icon="list"
                aria-label="Очистить дисциплины"
                onClick={() => setSelectedDisciplines([])}
              />
            </WorkspaceToolbar>
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>Вкл</th>
                  <th>Дисциплина</th>
                  <th>Н</th>
                  <th>Н.Жен.</th>
                  <th>Н.Муж.</th>
                </tr>
              </thead>
              <tbody>
                {allDisciplines.map((discipline, index) => (
                  <tr key={discipline} className={index === 0 ? 'is-selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedDisciplines.includes(discipline)}
                        onChange={(event) =>
                          setSelectedDisciplines((values) =>
                            toggleValue(values, discipline, event.target.checked),
                          )
                        }
                      />
                    </td>
                    <td>{discipline}</td>
                    <td className="text-right">
                      {disciplineGenderStats.get(discipline)?.total ?? 0}
                    </td>
                    <td className="text-right">
                      {disciplineGenderStats.get(discipline)?.women ?? 0}
                    </td>
                    <td className="text-right">
                      {disciplineGenderStats.get(discipline)?.men ?? 0}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </WorkspacePanel>
        </div>

        <WorkspacePanel className="p-2">
          <WorkspaceButton
            className="mb-2"
            type="button"
            tone="danger"
            icon="arrow-down"
            onClick={nextAward}
            disabled={awardRows.length === 0}
          >
            Следующий (пробел переключает на следующего)
          </WorkspaceButton>
          <table className="pt-grid">
            <thead>
              <tr>
                <th>Дисциплина</th>
                <th>Возраст</th>
                <th>Пол</th>
                <th>Упражнение</th>
                <th>ВК</th>
                <th>Спортсмен</th>
                <th>Место</th>
                <th>Команда</th>
              </tr>
            </thead>
            <tbody>
              {awardRows.map((award, index) => (
                <tr
                  key={
                    award.kind === 'athlete' ? `${award.row.nominationId}-${award.key}` : award.key
                  }
                  className={
                    index === currentAwardIndex
                      ? 'is-selected'
                      : index % 4 === 0
                        ? 'is-gray'
                        : undefined
                  }
                >
                  {award.kind === 'athlete' ? (
                    <>
                      <td>{award.row.discipline}</td>
                      <td>{award.row.division}</td>
                      <td>
                        {genderShortLabel(
                          nominationById.get(award.row.nominationId)?.division.gender,
                        )}
                      </td>
                      <td>{award.key.split(' / ')[0]}</td>
                      <td className="font-bold">
                        {awardVariant === 'overall' ? 'ABS' : award.row.weightClass}
                      </td>
                      <td>{award.row.athleteName}</td>
                      <td
                        className={
                          award.place === 1 ? 'pt-row-yellow text-right' : 'pt-row-gray text-right'
                        }
                      >
                        {award.place}
                      </td>
                      <td>{nominationById.get(award.row.nominationId)?.athlete.clubName ?? '-'}</td>
                    </>
                  ) : (
                    <>
                      <td>Командный зачет</td>
                      <td>Все</td>
                      <td>Все</td>
                      <td>Очки команды</td>
                      <td className="font-bold">{award.nominations}</td>
                      <td>{award.teamName}</td>
                      <td
                        className={
                          award.place === 1 ? 'pt-row-yellow text-right' : 'pt-row-gray text-right'
                        }
                      >
                        {award.place}
                      </td>
                      <td className="text-right tabular-nums">{award.points.toFixed(2)}</td>
                    </>
                  )}
                </tr>
              ))}
              {awardRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="italic">
                    Призеры пока не рассчитаны. Сохраните попытки и места в секретариате.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}
