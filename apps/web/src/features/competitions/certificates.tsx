import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  WorkspaceButton,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceSectionTitle,
  WorkspaceToolbar,
} from '../../components/workspace.js';
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

function weightFilterKey(gender: 'F' | 'M', weightClass: string): string {
  return `${gender}:${weightClass}`;
}

interface WeightFilterRow {
  key: string;
  gender: 'F' | 'M';
  name: string;
  count: number;
}

export default function CompetitionCertificatesFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/certificates' });
  const { data, isLoading, error, isFetching, refetch } = useCompetitionOps(id);
  const [selectedWeightKeys, setSelectedWeightKeys] = useState<string[]>([]);
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [selectedDisciplines, setSelectedDisciplines] = useState<string[]>([]);
  const [selectedPlaces, setSelectedPlaces] = useState<number[]>([1, 2, 3]);
  const [showAllPlaces, setShowAllPlaces] = useState(false);
  const [hidePastCompetitions, setHidePastCompetitions] = useState(false);
  const [competitionSelected, setCompetitionSelected] = useState(true);
  const competitionGenderStats = useMemo(
    () => nominationGenderStats(data?.nominations ?? []),
    [data?.nominations],
  );
  const showCompetitionRow = data
    ? !hidePastCompetitions || !isPastCompetition(data.competition.endDate)
    : false;
  const weightFilters = useMemo<WeightFilterRow[]>(() => {
    if (!data) return [];
    const map = new Map<string, WeightFilterRow>();
    for (const nomination of data.nominations) {
      const gender = nomination.division.gender;
      const name = nomination.weightClass.nameRu;
      const key = weightFilterKey(gender, name);
      const current = map.get(key) ?? { key, gender, name, count: 0 };
      map.set(key, { ...current, count: current.count + 1 });
    }
    return [...map.values()].sort(
      (a, b) => a.gender.localeCompare(b.gender) || a.name.localeCompare(b.name),
    );
  }, [data]);
  const womenWeightFilters = useMemo(
    () => weightFilters.filter((row) => row.gender === 'F'),
    [weightFilters],
  );
  const menWeightFilters = useMemo(
    () => weightFilters.filter((row) => row.gender === 'M'),
    [weightFilters],
  );
  const nominationById = useMemo(
    () => new Map((data?.nominations ?? []).map((nomination) => [nomination.id, nomination])),
    [data?.nominations],
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
          Boolean(
            nominationById.get(row.nominationId) &&
            selectedWeightKeys.includes(
              weightFilterKey(
                nominationById.get(row.nominationId)!.division.gender,
                row.weightClass,
              ),
            ),
          ) &&
          selectedDivisions.includes(row.division) &&
          selectedDisciplines.includes(row.discipline),
      ) ?? [],
    [
      competitionSelected,
      data?.scoreboardRows,
      nominationById,
      selectedDisciplines,
      selectedDivisions,
      selectedPlaces,
      selectedWeightKeys,
      showAllPlaces,
      showCompetitionRow,
    ],
  );

  useEffect(() => {
    setSelectedWeightKeys(weightFilters.map((row) => row.key));
  }, [weightFilters]);

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

  function setWeightGroup(filters: WeightFilterRow[], enabled: boolean) {
    const keys = new Set(filters.map((row) => row.key));
    setSelectedWeightKeys((values) => {
      if (!enabled) return values.filter((value) => !keys.has(value));
      return [...new Set([...values, ...keys])];
    });
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
      title={`Печать грамот. Данные на ${new Date().toLocaleTimeString('ru-RU')} (UTC+3)`}
      subtitle={data.competition.nameRu}
      actions={
        <>
          <WorkspaceButton
            type="button"
            onClick={() => window.print()}
            disabled={rows.length === 0}
          >
            Печать / PDF
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
      tabs={[
        { label: 'Фильтры', icon: 'filter', active: true },
        {
          label: (
            <Link to="/competitions/$id/nominations" params={{ id }}>
              Номинации
            </Link>
          ),
          icon: 'nomination',
        },
        {
          label: (
            <Link to="/competitions/$id/reports" params={{ id }}>
              Отчеты
            </Link>
          ),
          icon: 'reports',
        },
        { label: 'Сертификат участника', icon: 'certificate' },
      ]}
    >
      <div className="print:hidden">
        <WorkspaceSectionTitle>Соревнования</WorkspaceSectionTitle>
        <label className="pt-checkline mb-2">
          <input
            type="checkbox"
            checked={hidePastCompetitions}
            onChange={(event) => setHidePastCompetitions(event.target.checked)}
          />{' '}
          Скрыть прошедшие соревнования
        </label>
        <table className="pt-grid">
          <thead>
            <tr>
              <th>Вкл</th>
              <th>Начало</th>
              <th>Соревнование</th>
              <th>Н.Всего</th>
              <th>Н.Жен.</th>
              <th>Н.Муж.</th>
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
                <td>{new Date(data.competition.startDate).toLocaleDateString('ru-RU')}</td>
                <td>{data.competition.nameRu}</td>
                <td className="text-right">{competitionGenderStats.total}</td>
                <td className="text-right">{competitionGenderStats.women}</td>
                <td className="text-right">{competitionGenderStats.men}</td>
              </tr>
            ) : (
              <tr>
                <td colSpan={6} className="italic">
                  Соревнование скрыто фильтром прошедших.
                </td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr_210px]">
          <WorkspacePanel className="p-2">
            <WorkspaceSectionTitle>Фильтр весовых: женщины</WorkspaceSectionTitle>
            <WorkspaceToolbar>
              <WorkspaceButton
                type="button"
                icon="check"
                aria-label="Выбрать все женские весовые"
                onClick={() => setWeightGroup(womenWeightFilters, true)}
              />
              <WorkspaceButton
                type="button"
                icon="list"
                aria-label="Очистить женские весовые"
                onClick={() => setWeightGroup(womenWeightFilters, false)}
              />
            </WorkspaceToolbar>
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>Вкл</th>
                  <th>Весовая категория</th>
                  <th>Номинаций</th>
                </tr>
              </thead>
              <tbody>
                {womenWeightFilters.map((weight, index) => (
                  <tr key={weight.key} className={index === 0 ? 'is-selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedWeightKeys.includes(weight.key)}
                        onChange={(event) =>
                          setSelectedWeightKeys((values) =>
                            toggleValue(values, weight.key, event.target.checked),
                          )
                        }
                      />
                    </td>
                    <td>{weight.name}</td>
                    <td className="text-right">{weight.count}</td>
                  </tr>
                ))}
                {womenWeightFilters.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="italic">
                      Женских весовых категорий пока нет.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </WorkspacePanel>

          <WorkspacePanel className="p-2">
            <WorkspaceSectionTitle>Фильтр весовых: мужчины</WorkspaceSectionTitle>
            <WorkspaceToolbar>
              <WorkspaceButton
                type="button"
                icon="check"
                aria-label="Выбрать все мужские весовые"
                onClick={() => setWeightGroup(menWeightFilters, true)}
              />
              <WorkspaceButton
                type="button"
                icon="list"
                aria-label="Очистить мужские весовые"
                onClick={() => setWeightGroup(menWeightFilters, false)}
              />
            </WorkspaceToolbar>
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>Вкл</th>
                  <th>Весовая категория</th>
                  <th>Номинаций</th>
                </tr>
              </thead>
              <tbody>
                {menWeightFilters.map((weight, index) => (
                  <tr key={weight.key} className={index === 0 ? 'is-selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedWeightKeys.includes(weight.key)}
                        onChange={(event) =>
                          setSelectedWeightKeys((values) =>
                            toggleValue(values, weight.key, event.target.checked),
                          )
                        }
                      />
                    </td>
                    <td>{weight.name}</td>
                    <td className="text-right">{weight.count}</td>
                  </tr>
                ))}
                {menWeightFilters.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="italic">
                      Мужских весовых категорий пока нет.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </WorkspacePanel>

          <WorkspacePanel className="p-3">
            <WorkspaceSectionTitle>Фильтр мест</WorkspaceSectionTitle>
            {[1, 2, 3].map((place) => (
              <label key={place} className="pt-checkline mb-3 text-lg font-bold">
                <span>Место №{place}:</span>
                <input
                  type="checkbox"
                  checked={selectedPlaces.includes(place)}
                  onChange={(event) =>
                    setSelectedPlaces((values) => {
                      if (event.target.checked)
                        return values.includes(place) ? values : [...values, place].sort();
                      return values.filter((value) => value !== place);
                    })
                  }
                />
              </label>
            ))}
            <label className="pt-checkline mt-8">
              <span>Отобразить все места:</span>
              <input
                type="checkbox"
                checked={showAllPlaces}
                onChange={(event) => setShowAllPlaces(event.target.checked)}
              />
            </label>
          </WorkspacePanel>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <WorkspacePanel className="p-2">
            <WorkspaceSectionTitle>Фильтр возрастные</WorkspaceSectionTitle>
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>Вкл</th>
                  <th>Возрастная</th>
                  <th>Номинаций</th>
                </tr>
              </thead>
              <tbody>
                {divisions.map((division, index) => (
                  <tr key={division} className={index === 0 ? 'is-selected' : undefined}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedDivisions.includes(division)}
                        onChange={(event) =>
                          setSelectedDivisions((values) =>
                            toggleValue(values, division, event.target.checked),
                          )
                        }
                      />
                    </td>
                    <td>{division}</td>
                    <td className="text-right">
                      {data.scoreboardRows.filter((row) => row.division === division).length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </WorkspacePanel>

          <WorkspacePanel className="p-2">
            <WorkspaceSectionTitle>Фильтр дисциплины</WorkspaceSectionTitle>
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>Вкл</th>
                  <th>Дисциплина</th>
                  <th>Номинаций</th>
                </tr>
              </thead>
              <tbody>
                {disciplines.map((discipline, index) => (
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
                      {data.scoreboardRows.filter((row) => row.discipline === discipline).length}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </WorkspacePanel>
        </div>

        <WorkspaceToolbar className="mt-2">
          <WorkspaceButton
            type="button"
            icon="refresh"
            onClick={() => void refreshLists()}
            disabled={isFetching}
          >
            {isFetching
              ? t('common.loading')
              : 'Обновить списки номинаций, рекордов, команд, тренеров'}
          </WorkspaceButton>
        </WorkspaceToolbar>
      </div>

      <div className="hidden print:block">
        {rows.map((row) => (
          <section
            key={row.nominationId}
            className="mb-0 flex h-[190mm] w-[277mm] break-after-page flex-col items-center justify-center gap-5 border-0 bg-white p-12 text-center text-black"
          >
            <div className="text-sm uppercase tracking-[0.35em]">
              {data.competition.federation.nameRu}
            </div>
            <div className="text-6xl font-semibold">Грамота</div>
            <div className="max-w-3xl text-lg">награждается участник соревнования</div>
            <div className="text-4xl font-semibold">{row.athleteName}</div>
            <div className="text-xl">
              {row.placeInClass} место · {row.discipline} · {row.weightClass}
            </div>
            <div className="text-lg">
              Лучший результат: {row.bestSuccessfulAttemptKg ?? '-'} · Очки: {row.finalScore ?? '-'}
            </div>
            <div className="mt-10 grid w-full max-w-3xl grid-cols-2 gap-16 text-left text-sm">
              <div className="border-t border-black pt-2">Главный судья</div>
              <div className="border-t border-black pt-2">Главный секретарь</div>
            </div>
          </section>
        ))}
      </div>
    </WorkspacePage>
  );
}
