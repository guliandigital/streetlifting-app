import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  PowerTableButton,
  PowerTablePage,
  PowerTablePanel,
  PowerTableSectionTitle,
  PowerTableToolbar,
} from '../../components/powertable.js';
import { useCompetitionOps } from './operations-api.js';

export default function CompetitionCertificatesFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/certificates' });
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

  const rows = data.scoreboardRows.filter((row) => row.placeInClass !== null);
  const weights = [...new Set(data.scoreboardRows.map((row) => row.weightClass))];
  const divisions = [...new Set(data.scoreboardRows.map((row) => row.division))];
  const disciplines = [...new Set(data.scoreboardRows.map((row) => row.discipline))];

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
        <label className="pt-checkline mb-2"><input type="checkbox" defaultChecked /> Скрыть прошедшие соревнования</label>
        <table className="pt-grid">
          <thead><tr><th>Вкл</th><th>Начало</th><th>Соревнование</th><th>Н.Всего</th><th>Н.Жен.</th><th>Н.Муж.</th></tr></thead>
          <tbody>
            <tr className="is-selected">
              <td><input type="checkbox" defaultChecked /></td>
              <td>{new Date(data.competition.startDate).toLocaleDateString('ru-RU')}</td>
              <td>{data.competition.nameRu}</td>
              <td className="text-right">{data.accounting.totalNominations}</td>
              <td className="text-right">-</td>
              <td className="text-right">-</td>
            </tr>
          </tbody>
        </table>

        <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_1fr_210px]">
          <PowerTablePanel className="p-2">
            <PowerTableSectionTitle>Фильтр ВКЖ</PowerTableSectionTitle>
            <PowerTableToolbar><PowerTableButton icon="check" aria-label="Выбрать" /><PowerTableButton icon="list" aria-label="Список" /></PowerTableToolbar>
            <table className="pt-grid">
              <thead><tr><th>Вкл</th><th>Весовая категория</th><th>Номинаций</th></tr></thead>
              <tbody>
                {weights.slice(0, Math.ceil(weights.length / 2)).map((weight, index) => (
                  <tr key={weight} className={index === 0 ? 'is-selected' : undefined}>
                    <td><input type="checkbox" defaultChecked /></td><td>{weight}</td><td className="text-right">{data.scoreboardRows.filter((row) => row.weightClass === weight).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PowerTablePanel>

          <PowerTablePanel className="p-2">
            <PowerTableSectionTitle>Фильтр ВКМ</PowerTableSectionTitle>
            <PowerTableToolbar><PowerTableButton icon="check" aria-label="Выбрать" /><PowerTableButton icon="list" aria-label="Список" /></PowerTableToolbar>
            <table className="pt-grid">
              <thead><tr><th>Вкл</th><th>Весовая категория</th><th>Номинаций</th></tr></thead>
              <tbody>
                {weights.slice(Math.ceil(weights.length / 2)).map((weight, index) => (
                  <tr key={weight} className={index === 0 ? 'is-selected' : undefined}>
                    <td><input type="checkbox" defaultChecked /></td><td>{weight}</td><td className="text-right">{data.scoreboardRows.filter((row) => row.weightClass === weight).length}</td>
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
                <input type="checkbox" defaultChecked />
              </label>
            ))}
            <label className="pt-checkline mt-8"><span>Отобразить все места:</span><input type="checkbox" /></label>
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
                    <td><input type="checkbox" defaultChecked /></td><td>{division}</td><td className="text-right">{data.scoreboardRows.filter((row) => row.division === division).length}</td>
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
                    <td><input type="checkbox" defaultChecked /></td><td>{discipline}</td><td className="text-right">{data.scoreboardRows.filter((row) => row.discipline === discipline).length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PowerTablePanel>
        </div>

        <PowerTableToolbar className="mt-2">
          <PowerTableButton type="button" icon="refresh" onClick={() => window.print()}>Обновить списки номинаций, рекордов, команд, тренеров</PowerTableButton>
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
