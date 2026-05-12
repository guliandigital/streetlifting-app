import { useMemo, useState } from 'react';
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
import { api } from '../../lib/api-client.js';
import { formatRub } from '../../lib/money.js';
import { nominationGenderStats } from './gender-stats.js';
import { useCompetitionOps } from './operations-api.js';

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function CompetitionReportsFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/reports' });
  const { data, isLoading, error, isFetching, refetch } = useCompetitionOps(id);
  const [query, setQuery] = useState('');
  const [showMore, setShowMore] = useState(false);
  const competitionGenderStats = useMemo(
    () => nominationGenderStats(data?.nominations ?? []),
    [data?.nominations],
  );
  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!data || !normalized) return data?.scoreboardRows ?? [];
    return data.scoreboardRows.filter((row) =>
      [
        row.entryNumber?.toString() ?? '',
        row.athleteName,
        row.discipline,
        row.division,
        row.weightClass,
        t(`competitionOps.status.${row.status}`),
      ].some((value) => value.toLowerCase().includes(normalized)),
    );
  }, [data, query, t]);

  async function refreshReport() {
    const result = await refetch();
    if (result.error) {
      toast.error(result.error instanceof Error ? result.error.message : 'Error');
      return;
    }
    toast.success('Отчет обновлен');
  }

  async function exportFile(kind: 'protocol' | 'accounting', format: 'csv' | 'xlsx') {
    if (!data) return;
    try {
      const filename = `${data.competition.code}-${kind}.${format}`;
      if (format === 'csv') {
        const text = kind === 'protocol' ? await api.competitions.protocolCsv(id) : await api.competitions.accountingCsv(id);
        downloadText(filename, text);
      } else {
        const blob = kind === 'protocol' ? await api.competitions.protocolXlsx(id) : await api.competitions.accountingXlsx(id);
        downloadBlob(filename, blob);
      }
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
    <PowerTablePage
      title="Отчеты, печатные формы"
      subtitle={data.competition.nameRu}
      actions={(
        <>
          <Link to="/competitions/$id/operations" params={{ id }} className="pt-link-button">Операции</Link>
          <Link to="/competitions/$id/protocol-print" params={{ id }} className="pt-link-button">Печатный протокол</Link>
          <Link to="/competitions/$id/certificates" params={{ id }} className="pt-link-button">Печать грамот</Link>
          <Link to="/competitions/$id/awards" params={{ id }} className="pt-link-button">Награждение</Link>
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
      <PowerTableSectionTitle>Соревнования</PowerTableSectionTitle>
      <label className="pt-checkline mb-2">
        <input type="checkbox" defaultChecked />
        <span>Скрыть прошедшие соревнования</span>
      </label>
      <table className="pt-grid">
        <thead>
          <tr><th>Вкл</th><th>Начало</th><th>Соревнование</th><th>Н.Всего</th><th>Н.Жен.</th><th>Н.Муж.</th></tr>
        </thead>
        <tbody>
          <tr className="is-green">
            <td><input type="checkbox" defaultChecked /></td>
            <td>{new Date(data.competition.startDate).toLocaleDateString('ru-RU')}</td>
            <td>{data.competition.nameRu}</td>
            <td className="text-right">{competitionGenderStats.total}</td>
            <td className="text-right">{competitionGenderStats.women}</td>
            <td className="text-right">{competitionGenderStats.men}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
        <PowerTablePanel className="p-3">
          <PowerTableSectionTitle>Выгрузки</PowerTableSectionTitle>
          <PowerTableToolbar>
            <PowerTableButton type="button" icon="document" onClick={() => void exportFile('protocol', 'csv')}>Протокол CSV</PowerTableButton>
            <PowerTableButton type="button" icon="chart" onClick={() => void exportFile('protocol', 'xlsx')}>Протокол XLSX</PowerTableButton>
            <PowerTableButton type="button" icon="billing" onClick={() => void exportFile('accounting', 'csv')}>Бухгалтерия CSV</PowerTableButton>
            <PowerTableButton type="button" icon="chart" onClick={() => void exportFile('accounting', 'xlsx')}>Бухгалтерия XLSX</PowerTableButton>
          </PowerTableToolbar>
          <table className="pt-grid mt-2">
            <thead><tr><th>Показатель</th><th>Значение</th></tr></thead>
            <tbody>
              <tr className="is-selected"><td>Заявки</td><td className="text-right">{data.accounting.totalNominations}</td></tr>
              <tr className="is-green"><td>Мандат</td><td className="text-right">{data.accounting.mandatePassedNominations}</td></tr>
              <tr className="is-yellow"><td>Взносы</td><td className="text-right">{formatRub(data.accounting.paidEntryFeeKopecks)}</td></tr>
              <tr className="is-pink"><td>Списание</td><td className="text-right">{formatRub(data.accounting.federationBillingKopecks)}</td></tr>
            </tbody>
          </table>
          <div className="pt-info-yellow mt-3">
            Данные отчета формируются по текущему состоянию секретариата.
          </div>
        </PowerTablePanel>

        <PowerTablePanel className="p-3">
          <PowerTableToolbar>
            <PowerTableButton type="button" icon="check" onClick={() => void refreshReport()} disabled={isFetching}>
              {isFetching ? t('common.loading') : 'Обновить'}
            </PowerTableButton>
            <input className="pt-field ml-auto max-w-xs" placeholder="Поиск (Ctrl+F)" value={query} onChange={(event) => setQuery(event.target.value)} />
            <PowerTableButton type="button" onClick={() => setShowMore((value) => !value)}>
              {showMore ? 'Скрыть' : 'Еще'}
            </PowerTableButton>
          </PowerTableToolbar>
          {showMore ? (
            <div className="pt-info-yellow mb-2">
              Отображено строк: {visibleRows.length} из {data.scoreboardRows.length}. Дополнительные колонки включены в таблицу ниже.
            </div>
          ) : null}
          <table className="pt-grid">
            <thead>
              <tr>
                <th>№</th><th>Спортсмен</th><th>Дисциплина</th>{showMore ? <th>Возраст</th> : null}<th>Весовая</th><th>Лучший</th><th>Очки</th>{showMore ? <th>Место</th> : null}<th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row.nominationId} className={index === 0 ? 'is-selected' : index % 2 ? 'is-yellow' : 'is-green'}>
                  <td>{row.entryNumber ?? '-'}</td>
                  <td>{row.athleteName}</td>
                  <td>{row.discipline}</td>
                  {showMore ? <td>{row.division}</td> : null}
                  <td>{row.weightClass}</td>
                  <td className="text-right tabular-nums">{row.bestSuccessfulAttemptKg ?? '-'}</td>
                  <td className="text-right tabular-nums">{row.finalScore ?? '-'}</td>
                  {showMore ? <td className="text-right tabular-nums">{row.placeInClass ?? '-'}</td> : null}
                  <td>{t(`competitionOps.status.${row.status}`)}</td>
                </tr>
              ))}
              {visibleRows.length === 0 ? (
                <tr><td colSpan={showMore ? 9 : 7} className="italic">Строки не найдены.</td></tr>
              ) : null}
            </tbody>
          </table>
        </PowerTablePanel>
      </div>
    </PowerTablePage>
  );
}
