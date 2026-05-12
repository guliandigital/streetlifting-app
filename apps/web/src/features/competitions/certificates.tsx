import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  PowerTableButton,
  PowerTablePage,
  PowerTablePanel,
  PowerTableSectionTitle,
  PowerTableToolbar,
} from '../../components/powertable.js';
import { nominationGenderStats } from './gender-stats.js';
import { useCompetitionOps } from './operations-api.js';

function isPastCompetition(endDate: string): boolean {
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return end < today;
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)].filter(Boolean);
}

function toggleValue(values: string[], value: string, enabled: boolean): string[] {
  if (enabled) return values.includes(value) ? values : [...values, value];
  return values.filter((item) => item !== value);
}

export default function CompetitionCertificatesFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/certificates' });
  const { data, isLoading, error, isFetching, refetch } = useCompetitionOps(id);
  const [selectedWeights, setSelectedWeights] = useState<string[]>([]);
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([]);
  const [selectedPlaces, setSelectedPlaces] = useState<number[]>([1, 2, 3]);
  const [showAllPlaces, setShowAllPlaces] = useState(false);
  const [hidePastCompetitions, setHidePastCompetitions] = useState(true);
  const [competitionSelected, setCompetitionSelected] = useState(true);
  const competitionGenderStats = useMemo(
    () => nominationGenderStats(data?.nominations ?? []),
    [data?.nominations],
  );
  const showCompetitionRow = data ? (!hidePastCompetitions || !isPastCompetition(data.competition.endDate)) : false;
  const weights = useMemo(
    () => (data ? uniqueValues(data.scoreboardRows.map((row) => row.weightClass)) : []),
    [data],
  );
  const divisions = useMemo(
    () => (data ? uniqueValues(data.scoreboardRows.map((row) => row.division)) : []),
    [data],
  );
  const disciplines = useMemo(
    () => (data ? uniqueValues(data.scoreboardRows.map((row) => row.discipline)) : []),
    [data],
  );
  const rows = useMemo(
    () =>
      data?.scoreboardRows.filter(
        (row) =>
          competitionSelected &&
          showCompetitionRow &&
          row.placeInClass !== null &&
          (showAllPlaces || selectedPlaces.includes(row.placeInClass)) &&
          selectedWeights.includes(row.weightClass) &&
          selectedDivisions.includes(row.division) &&
          selectedDisciplines.includes(row.discipline),
      ) ?? [],
    [competitionSelected, data?.scoreboardRows, selectedDisciplines, selectedDivisions, selectedPlaces, selectedWeights, showAllPlaces, showCompetitionRow],
  );

  useEffect(() => {
    setSelectedWeights(weights);
  }, [weights]);

  useEffect(() => {
    setSelectedDivisions(divisions);
  }, [divisions]);

  useEffect(() => {
    setSelectedDisciplines(disciplines);
  }, [disciplines]);

  async function refreshLists() {
    const result = await refetch();
    if (result.error) {
      toast.error(result.error instanceof Error ? result.error.message : 'Error');
      return;
    }
    toast.success('Списки грамот обновлены');
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
    <PowerTablePage
      title={`Печать грамот. Данные на ${new Date().toLocaleTimeString('ru-RU')} (UTC+3)`}
      subtitle={data.competition.nameRu}
      actions={(
        <>
          <PowerTableButton type="button" onClick={() => window.print()}>Печать / PDF</PowerTableButton>
          <Link to="/competitions/$id/reports" params={{ id }} className="pt-link-button">Отчеты</Link>
          <Link to="/competitions/$id/operations" params={{ id }} className="pt-link-button">Операции</Link>
        </>
      )}
      federationBar={<><span>{data.competition.federation.code}</span><span>{data.competition.federation.nameRu}</span></>}
      tabs={[
        { label: 'Фильтры', icon: 'filter', active: true },
        { label: 'Номинации', icon: 'nomination' },
        { label: 'Рекорды', icon: 'records' },
        { label: 'Команды', icon: 'teams' },
        { label: 'Тренеры', icon: 'coach' },
        { label: 'Сертификат участника', icon: 'certificate' },
      ]}
    >
      <div className="print:hidden">
        <PowerTableSectionTitle>Соревнования</PowerTableSectionTitle>
        <label className="pt-checkline mb-2"><input type="checkbox" checked={hidePastCompetitions} onChange={(event) => setHidePastCompetitions(event.target.checked)} /> Скрыть прошедшие соревнования</label>
        <table className="pt-grid">
          <thead><tr><th>Вкл</th><th>Начало</th><th>Соревнование</th><th>Н.Всего</th><th>Н.Жен.</th><th>Н.Муж.</th></tr></thead>
          <tbody>
            {showCompetitionRow ? (
              <tr className="is-selected">
                <td><input type="checkbox" checked={competitionSelected} onChange={(event) => setCompetitionSelected(event.target.checked)} /></td>
                <td>{new Date(data.competition.startDate).toLocaleDateString('ru-RU')}</td>
                <td>{data.competition.nameRu}</td>
                <td className="text-right">{competitionGenderStats.total}</td>
                <td className="text-right">{competitionGenderStats.women}</td>
                <td className="text-right">{competitionGenderStats.men}</td>
              </tr>
            ) : (
              <tr><td colSpan={6} className="italic">Соревнование скрыто фильтром прошедших.</td></tr>
            )}
          </tbody>
        </table>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr_210px]">
          <PowerTablePanel className="p-2">
            <PowerTableSectionTitle>Фильтр ВКЖ</PowerTableSectionTitle>
            <PowerTableToolbar>
              <PowerTableButton type="button" icon="check" aria-label="Выбрать все весовые слева" onClick={() => setSelectedWeights(weights)} />
              <PowerTableButton type="button" icon="list" aria-label="Очистить весовые слева" onClick={() => setSelectedWeights([])} />
            </PowerTableToolbar>
            <table className="pt-grid">
              <thead><tr><th>Вкл</th><th>Весовая категория</th><th>Номинаций</th></tr></thead>
              <tbody>
                {weights.slice(0, Math.ceil(weights.length / 2)).map((weight, index) => (
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
            <PowerTableSectionTitle>Фильтр ВКМ</PowerTableSectionTitle>
            <PowerTableToolbar>
              <PowerTableButton type="button" icon="check" aria-label="Выбрать все весовые справа" onClick={() => setSelectedWeights(weights)} />
              <PowerTableButton type="button" icon="list" aria-label="Очистить весовые справа" onClick={() => setSelectedWeights([])} />
            </PowerTableToolbar>
            <table className="pt-grid">
              <thead><tr><th>Вкл</th><th>Весовая категория</th><th>Номинаций</th></tr></thead>
              <tbody>
                {weights.slice(Math.ceil(weights.length / 2)).map((weight, index) => (
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

          <PowerTablePanel className="p-3">
            <PowerTableSectionTitle>Фильтр мест</PowerTableSectionTitle>
            {[1, 2, 3].map((place) => (
              <label key={place} className="pt-checkline mb-3 text-lg font-bold">
                <span>Место №{place}:</span>
                <input
                  type="checkbox"
                  checked={selectedPlaces.includes(place)}
                  onChange={(event) => setSelectedPlaces((values) => {
                    if (event.target.checked) return values.includes(place) ? values : [...values, place].sort();
                    return values.filter((value) => value !== place);
                  })}
                />
              </label>
            ))}
            <label className="pt-checkline mt-8">
              <span>Отобразить все места:</span>
              <input type="checkbox" checked={showAllPlaces} onChange={(event) => setShowAllPlaces(event.target.checked)} />
            </label>
          </PowerTablePanel>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <PowerTablePanel className="p-2">
            <PowerTableSectionTitle>Фильтр возрастные</PowerTableSectionTitle>
            <table className="pt-grid">
              <thead><tr><th>Вкл</th><th>Возрастная</th><th>Номинаций</th></tr></thead>
              <tbody>
                {divisions.map((division, index) => (
                  <tr key={division} className={index === 0 ? 'is-selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedDivisions.includes(division)}
                        onChange={(event) => setSelectedDivisions((values) => toggleValue(values, division, event.target.checked))}
                      />
                    </td>
                    <td>{division}</td>
                    <td className="text-right">{data.scoreboardRows.filter((row) => row.division === division).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PowerTablePanel>

          <PowerTablePanel className="p-2">
            <PowerTableSectionTitle>Фильтр дисциплины</PowerTableSectionTitle>
            <table className="pt-grid">
              <thead><tr><th>Вкл</th><th>Дисциплина</th><th>Номинаций</th></tr></thead>
              <tbody>
                {disciplines.map((discipline, index) => (
                  <tr key={discipline} className={index === 0 ? 'is-selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedDisciplines.includes(discipline)}
                        onChange={(event) => setSelectedDisciplines((values) => toggleValue(values, discipline, event.target.checked))}
                      />
                    </td>
                    <td>{discipline}</td>
                    <td className="text-right">{data.scoreboardRows.filter((row) => row.discipline === discipline).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PowerTablePanel>
        </div>

        <PowerTableToolbar className="mt-2">
          <PowerTableButton type="button" icon="refresh" onClick={() => void refreshLists()} disabled={isFetching}>
            {isFetching ? t('common.loading') : 'Обновить списки номинаций, рекордов, команд, тренеров'}
          </PowerTableButton>
        </PowerTableToolbar>
      </div>

      <div className="hidden print:block">
        {rows.map((row) => (
          <section key={row.nominationId} className="mb-0 flex h-[190mm] w-[277mm] break-after-page flex-col items-center justify-center gap-5 border-0 bg-white p-12 text-center text-black">
            <div className="text-sm uppercase tracking-[0.35em]">{data.competition.federation.nameRu}</div>
            <div className="text-6xl font-semibold">Грамота</div>
            <div className="max-w-3xl text-lg">награждается участник соревнования</div>
            <div className="text-4xl font-semibold">{row.athleteName}</div>
            <div className="text-xl">{row.placeInClass} место · {row.discipline} · {row.weightClass}</div>
            <div className="text-lg">Лучший результат: {row.bestSuccessfulAttemptKg ?? '-'} · Очки: {row.finalScore ?? '-'}</div>
            <div className="mt-10 grid w-full max-w-3xl grid-cols-2 gap-16 text-left text-sm">
              <div className="border-t border-black pt-2">Главный судья</div>
              <div className="border-t border-black pt-2">Главный секретарь</div>
            </div>
          </section>
        ))}
      </div>
    </PowerTablePage>
  );
}
