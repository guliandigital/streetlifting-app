import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  PowerTableButton,
  PowerTablePage,
  PowerTablePanel,
  PowerTableToolbar,
} from '../../components/powertable.js';
import { genderShortLabel, nominationGenderStats } from './gender-stats.js';
import { useCompetitionOps, type ScoreboardRowDto } from './operations-api.js';

type CeremonyPlayer = {
  stop: () => void;
};

function groupKey(row: ScoreboardRowDto): string {
  return `${row.discipline} / ${row.division} / ${row.weightClass}`;
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
    (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
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
  const competitionGenderStats = useMemo(
    () => nominationGenderStats(data?.nominations ?? []),
    [data?.nominations],
  );
  const disciplineGenderStats = useMemo(
    () =>
      new Map(
        allDisciplines.map((discipline) => [
          discipline,
          nominationGenderStats(data?.nominations ?? [], (nomination) => nomination.discipline.nameRu === discipline),
        ]),
      ),
    [allDisciplines, data?.nominations],
  );
  const leftWeights = allWeights.slice(0, Math.ceil(allWeights.length / 2));
  const rightWeights = allWeights.slice(Math.ceil(allWeights.length / 2));
  const filteredScoreboardRows = useMemo(
    () =>
      data?.scoreboardRows.filter(
        (row) =>
          selectedWeights.includes(row.weightClass) &&
          selectedDisciplines.includes(row.discipline),
      ) ?? [],
    [data?.scoreboardRows, selectedDisciplines, selectedWeights],
  );
  const awardRows = useMemo(
    () => {
      const groups = new Map<string, ScoreboardRowDto[]>();
      for (const row of filteredScoreboardRows) {
        if (!row.placeInClass || row.placeInClass > 3) continue;
        groups.set(groupKey(row), [...(groups.get(groupKey(row)) ?? []), row]);
      }

      return [...groups.entries()].flatMap(([key, rows]) =>
        [...rows]
          .sort((a, b) => (a.placeInClass ?? 99) - (b.placeInClass ?? 99))
          .map((row) => ({ key, row })),
      );
    },
    [filteredScoreboardRows],
  );
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
    <PowerTablePage
      title="Награждение"
      subtitle={data.competition.nameRu}
      actions={(
        <>
          <PowerTableButton type="button" tone="green" icon="music" onClick={toggleMusic}>
            {musicPlaying ? 'Остановить музыку' : 'Запустить плеер с торжественной музыкой'}
          </PowerTableButton>
          <PowerTableButton type="button" onClick={() => window.print()}>Печать</PowerTableButton>
          <Link to="/competitions/$id/reports" params={{ id }} className="pt-link-button">Отчеты</Link>
          <Link to="/competitions/$id/operations" params={{ id }} className="pt-link-button">Операции</Link>
        </>
      )}
      federationBar={<><span>{data.competition.federation.code}</span><span>{data.competition.federation.nameRu}</span></>}
      tabs={[
        { label: 'Параметры', icon: 'settings' },
        { label: 'Награждение', icon: 'awards', active: true },
        { label: 'Звук и музыка', icon: 'music' },
      ]}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(360px,0.95fr)_minmax(0,1.05fr)]">
        <div className="space-y-3">
          <table className="pt-grid">
            <thead><tr><th>Вкл</th><th>Соревнование</th><th>Начало</th><th>Н.Всего</th><th>Н.Жен.</th><th>Н.Муж.</th></tr></thead>
            <tbody>
              <tr className="is-selected">
                <td><input type="checkbox" defaultChecked /></td>
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
            <label><input type="radio" name="awardVariant" defaultChecked /> Весовые</label>
            <label><input type="radio" name="awardVariant" /> Абсолютка</label>
            <label><input type="radio" name="awardVariant" /> Команды</label>
          </div>
          <label className="pt-checkline"><input type="checkbox" defaultChecked /> Награждение с первого места</label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <PowerTablePanel className="p-2">
              <PowerTableToolbar>
                <PowerTableButton type="button" icon="check" aria-label="Выбрать все весовые слева" onClick={() => setSelectedWeights(allWeights)} />
                <PowerTableButton type="button" icon="list" aria-label="Очистить весовые слева" onClick={() => setSelectedWeights([])} />
              </PowerTableToolbar>
              <table className="pt-grid">
                <thead><tr><th>Вкл</th><th>Весовая категория</th><th>Н</th></tr></thead>
                <tbody>
                  {leftWeights.map((weight, index) => (
                    <tr key={weight} className={index === 0 ? 'is-selected' : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedWeights.includes(weight)}
                          onChange={(event) => setSelectedWeights((values) => toggleValue(values, weight, event.target.checked))}
                        />
                      </td>
                      <td>{weight}</td>
                      <td className="text-right">{data.scoreboardRows.filter((row) => row.weightClass === weight).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PowerTablePanel>

            <PowerTablePanel className="p-2">
              <PowerTableToolbar>
                <PowerTableButton type="button" icon="check" aria-label="Выбрать все весовые справа" onClick={() => setSelectedWeights(allWeights)} />
                <PowerTableButton type="button" icon="list" aria-label="Очистить весовые справа" onClick={() => setSelectedWeights([])} />
              </PowerTableToolbar>
              <table className="pt-grid">
                <thead><tr><th>Вкл</th><th>Весовая категория</th><th>Н</th></tr></thead>
                <tbody>
                  {rightWeights.map((weight, index) => (
                    <tr key={weight} className={index === 0 ? 'is-selected' : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedWeights.includes(weight)}
                          onChange={(event) => setSelectedWeights((values) => toggleValue(values, weight, event.target.checked))}
                        />
                      </td>
                      <td>{weight}</td>
                      <td className="text-right">{data.scoreboardRows.filter((row) => row.weightClass === weight).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PowerTablePanel>
          </div>

          <PowerTablePanel className="p-2">
            <PowerTableToolbar>
              <PowerTableButton type="button" icon="check" aria-label="Выбрать все дисциплины" onClick={() => setSelectedDisciplines(allDisciplines)} />
              <PowerTableButton type="button" icon="list" aria-label="Очистить дисциплины" onClick={() => setSelectedDisciplines([])} />
            </PowerTableToolbar>
            <table className="pt-grid">
              <thead><tr><th>Вкл</th><th>Дисциплина</th><th>Н</th><th>Н.Жен.</th><th>Н.Муж.</th></tr></thead>
              <tbody>
                {allDisciplines.map((discipline, index) => (
                  <tr key={discipline} className={index === 0 ? 'is-selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedDisciplines.includes(discipline)}
                        onChange={(event) => setSelectedDisciplines((values) => toggleValue(values, discipline, event.target.checked))}
                      />
                    </td>
                    <td>{discipline}</td>
                    <td className="text-right">{disciplineGenderStats.get(discipline)?.total ?? 0}</td>
                    <td className="text-right">{disciplineGenderStats.get(discipline)?.women ?? 0}</td>
                    <td className="text-right">{disciplineGenderStats.get(discipline)?.men ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PowerTablePanel>
        </div>

        <PowerTablePanel className="p-2">
          <PowerTableButton className="mb-2" type="button" tone="danger" icon="arrow-down" onClick={nextAward} disabled={awardRows.length === 0}>
            Следующий (пробел переключает на следующего)
          </PowerTableButton>
          <table className="pt-grid">
            <thead>
              <tr><th>Дисциплина</th><th>Возраст</th><th>Пол</th><th>Упражнение</th><th>ВК</th><th>Спортсмен</th><th>Место</th><th>Команда</th></tr>
            </thead>
            <tbody>
              {awardRows.map(({ key, row }, index) => (
                <tr key={`${row.nominationId}-${key}`} className={index === currentAwardIndex ? 'is-selected' : index % 4 === 0 ? 'is-gray' : undefined}>
                  <td>{row.discipline}</td>
                  <td>{row.division}</td>
                  <td>{genderShortLabel(nominationById.get(row.nominationId)?.division.gender)}</td>
                  <td>{key.split(' / ')[0]}</td>
                  <td className="font-bold">{row.weightClass}</td>
                  <td>{row.athleteName}</td>
                  <td className={row.placeInClass === 1 ? 'pt-row-yellow text-right' : 'pt-row-gray text-right'}>{row.placeInClass}</td>
                  <td>-</td>
                </tr>
              ))}
              {awardRows.length === 0 ? (
                <tr><td colSpan={8} className="italic">Призеры пока не рассчитаны. Сохраните попытки и места в секретариате.</td></tr>
              ) : null}
            </tbody>
          </table>
        </PowerTablePanel>
      </div>
    </PowerTablePage>
  );
}
