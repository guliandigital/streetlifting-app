import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  PowerTableButton,
  PowerTablePage,
  PowerTablePanel,
  PowerTableSectionTitle,
  PowerTableToolbar,
} from '../../components/powertable.js';
import { useCompetitionOps, type ScoreboardRowDto } from './operations-api.js';

function groupKey(row: ScoreboardRowDto): string {
  return `${row.discipline} / ${row.division} / ${row.weightClass}`;
}

export default function CompetitionAwardsFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/awards' });
  const { data, isLoading, error } = useCompetitionOps(id);

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

  const groups = new Map<string, ScoreboardRowDto[]>();
  for (const row of data.scoreboardRows) {
    if (!row.placeInClass || row.placeInClass > 3) continue;
    groups.set(groupKey(row), [...(groups.get(groupKey(row)) ?? []), row]);
  }

  const awardRows = [...groups.entries()].flatMap(([key, rows]) =>
    rows
      .sort((a, b) => (a.placeInClass ?? 99) - (b.placeInClass ?? 99))
      .map((row) => ({ key, row })),
  );

  return (
    <PowerTablePage
      title="Награждение"
      subtitle={data.competition.nameRu}
      actions={(
        <>
          <PowerTableButton type="button" tone="green" icon="music" onClick={() => window.print()}>Запустить плеер с торжественной музыкой</PowerTableButton>
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
                <td className="text-right">{data.accounting.totalNominations}</td>
                <td className="text-right">-</td>
                <td className="text-right">-</td>
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
              <PowerTableToolbar><PowerTableButton icon="check" aria-label="Выбрать" /><PowerTableButton icon="list" aria-label="Список" /></PowerTableToolbar>
              <table className="pt-grid">
                <thead><tr><th>Вкл</th><th>Весовая категория</th><th>Н</th></tr></thead>
                <tbody>
                  {['44 kg', '48 kg', '52 kg', '56 kg', '60 kg', '67.5 kg', '+67.5 kg'].map((weight, index) => (
                    <tr key={weight} className={index === 0 ? 'is-selected' : undefined}>
                      <td><input type="checkbox" defaultChecked /></td><td>{weight}</td><td className="text-right">{index === 5 ? 1 : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PowerTablePanel>

            <PowerTablePanel className="p-2">
              <PowerTableToolbar><PowerTableButton icon="check" aria-label="Выбрать" /><PowerTableButton icon="list" aria-label="Список" /></PowerTableToolbar>
              <table className="pt-grid">
                <thead><tr><th>Вкл</th><th>Весовая категория</th><th>Н</th></tr></thead>
                <tbody>
                  {[...new Set(data.scoreboardRows.map((row) => row.weightClass))].slice(0, 10).map((weight, index) => (
                    <tr key={weight} className={index === 0 ? 'is-selected' : undefined}>
                      <td><input type="checkbox" defaultChecked /></td><td>{weight}</td><td className="text-right">{data.scoreboardRows.filter((row) => row.weightClass === weight).length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </PowerTablePanel>
          </div>

          <PowerTablePanel className="p-2">
            <PowerTableToolbar><PowerTableButton icon="check" aria-label="Выбрать" /><PowerTableButton icon="list" aria-label="Список" /></PowerTableToolbar>
            <table className="pt-grid">
              <thead><tr><th>Вкл</th><th>Дисциплина</th><th>Н</th><th>Н.Жен.</th><th>Н.Муж.</th></tr></thead>
              <tbody>
                {[...new Set(data.scoreboardRows.map((row) => row.discipline))].map((discipline, index) => (
                  <tr key={discipline} className={index === 0 ? 'is-selected' : undefined}>
                    <td><input type="checkbox" defaultChecked /></td>
                    <td>{discipline}</td>
                    <td className="text-right">{data.scoreboardRows.filter((row) => row.discipline === discipline).length}</td>
                    <td className="text-right">-</td>
                    <td className="text-right">-</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PowerTablePanel>
        </div>

        <PowerTablePanel className="p-2">
          <PowerTableButton className="mb-2" tone="danger" icon="arrow-down">Следующий (пробел переключает на следующего)</PowerTableButton>
          <table className="pt-grid">
            <thead>
              <tr><th>Дисциплина</th><th>Возраст</th><th>Пол</th><th>Упражнение</th><th>ВК</th><th>Спортсмен</th><th>Место</th><th>Команда</th></tr>
            </thead>
            <tbody>
              {awardRows.map(({ key, row }, index) => (
                <tr key={`${row.nominationId}-${key}`} className={index === 0 ? 'is-selected' : index % 4 === 0 ? 'is-gray' : undefined}>
                  <td>{row.discipline}</td>
                  <td>{row.division}</td>
                  <td>-</td>
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
