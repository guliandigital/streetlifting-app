import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  WorkspaceButton,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceSectionTitle,
  WorkspaceToolbar,
  type WorkspaceIconName,
} from '../../components/workspace.js';
import { api } from '../../lib/api-client.js';
import { formatRub } from '../../lib/money.js';
import { nominationGenderStats } from './gender-stats.js';
import { useCompetitionOps } from './operations-api.js';
import {
  REPORT_ACTIONS,
  type ReportAction,
  type ReportExportFormat,
  type ReportExportKind,
} from './report-actions.js';
import {
  PrintableCompetitionReport,
  PRINTABLE_REPORT_TITLES,
  type PrintableReportKind,
} from './report-printables.js';

type ReportsTab =
  | 'protocols'
  | 'blanks'
  | 'nominations'
  | 'judges'
  | 'cards'
  | 'schedule'
  | 'reports'
  | 'finance'
  | 'references';

const REPORTS_TABS: { key: ReportsTab; label: string; icon: WorkspaceIconName }[] = [
  { key: 'protocols', label: 'Протоколы', icon: 'document' },
  { key: 'blanks', label: 'Пустографики', icon: 'print' },
  { key: 'nominations', label: 'Номинации', icon: 'nomination' },
  { key: 'judges', label: 'Судьи', icon: 'judges' },
  { key: 'cards', label: 'Карточки', icon: 'list' },
  { key: 'schedule', label: 'Расписание', icon: 'history' },
  { key: 'reports', label: 'Отчёты', icon: 'reports' },
  { key: 'finance', label: 'Финансы', icon: 'billing' },
  { key: 'references', label: 'Справки', icon: 'certificate' },
];

function StubSection({
  title,
  description,
  children,
  tone = 'gray',
}: {
  title: string;
  description?: string;
  children: ReactNode;
  tone?: 'gray' | 'green' | 'yellow' | 'pink';
}) {
  const toneClass: Record<string, string> = {
    gray: 'pt-info-gray',
    green: 'pt-info-green',
    yellow: 'pt-info-yellow',
    pink: 'pt-info-pink',
  };
  return (
    <WorkspacePanel className={`p-3 space-y-2 ${toneClass[tone]}`}>
      <WorkspaceSectionTitle>{title}</WorkspaceSectionTitle>
      {description ? <div className="pt-muted text-sm">{description}</div> : null}
      <WorkspaceToolbar>{children}</WorkspaceToolbar>
    </WorkspacePanel>
  );
}

const PENDING_REPORT_ACTION_TITLE = 'Форма еще не подключена к генерации';

function PendingReportButton({ icon, children }: { icon: WorkspaceIconName; children: ReactNode }) {
  return (
    <WorkspaceButton
      type="button"
      icon={icon}
      disabled
      title={PENDING_REPORT_ACTION_TITLE}
      data-report-action-state="pending"
    >
      {children}
    </WorkspaceButton>
  );
}

function ReportActionButton({
  action,
  onExport,
  onPrintable,
}: {
  action: ReportAction;
  onExport: (kind: ReportExportKind, format: ReportExportFormat) => void;
  onPrintable: (kind: PrintableReportKind) => void;
}) {
  if (action.state === 'pending') {
    return <PendingReportButton icon={action.icon}>{action.label}</PendingReportButton>;
  }

  if (action.state === 'export') {
    return (
      <WorkspaceButton
        type="button"
        icon={action.icon}
        {...(action.tone ? { tone: action.tone } : {})}
        onClick={() => onExport(action.exportKind, action.exportFormat)}
      >
        {action.label}
      </WorkspaceButton>
    );
  }

  return (
    <WorkspaceButton
      type="button"
      icon={action.icon}
      {...(action.tone ? { tone: action.tone } : {})}
      onClick={() => onPrintable(action.printableKind)}
    >
      {action.label}
    </WorkspaceButton>
  );
}

function ReportActionButtons({
  actions,
  onExport,
  onPrintable,
}: {
  actions: readonly ReportAction[];
  onExport: (kind: ReportExportKind, format: ReportExportFormat) => void;
  onPrintable: (kind: PrintableReportKind) => void;
}) {
  return actions.map((action) => (
    <ReportActionButton
      key={action.id}
      action={action}
      onExport={onExport}
      onPrintable={onPrintable}
    />
  ));
}

function isPastCompetition(endDate: string): boolean {
  const end = new Date(endDate);
  if (Number.isNaN(end.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  end.setHours(0, 0, 0, 0);
  return end < today;
}

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
  const [hidePastCompetitions, setHidePastCompetitions] = useState(false);
  const [competitionSelected, setCompetitionSelected] = useState(true);
  const [activeTab, setActiveTab] = useState<ReportsTab>('protocols');
  const [printableReport, setPrintableReport] = useState<PrintableReportKind | null>(null);
  const competitionGenderStats = useMemo(
    () => nominationGenderStats(data?.nominations ?? []),
    [data?.nominations],
  );
  const showCompetitionRow = data
    ? !hidePastCompetitions || !isPastCompetition(data.competition.endDate)
    : false;
  const visibleRows = useMemo(() => {
    if (!competitionSelected || !showCompetitionRow) return [];
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
  }, [competitionSelected, data, query, showCompetitionRow, t]);

  async function refreshReport() {
    const result = await refetch();
    if (result.error) {
      toast.error(result.error instanceof Error ? result.error.message : 'Error');
      return;
    }
    toast.success('Отчет обновлен');
  }

  async function exportFile(kind: ReportExportKind, format: ReportExportFormat) {
    if (!data) return;
    try {
      const filename = `${data.competition.code}-${kind}.${format}`;
      if (format === 'csv') {
        const text =
          kind === 'protocol'
            ? await api.competitions.protocolCsv(id)
            : await api.competitions.accountingCsv(id);
        downloadText(filename, text);
      } else {
        const blob =
          kind === 'protocol'
            ? await api.competitions.protocolXlsx(id)
            : await api.competitions.accountingXlsx(id);
        downloadBlob(filename, blob);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  function renderReportActions(actions: readonly ReportAction[]) {
    return (
      <ReportActionButtons
        actions={actions}
        onExport={(kind, format) => void exportFile(kind, format)}
        onPrintable={setPrintableReport}
      />
    );
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

  if (printableReport) {
    return (
      <WorkspacePage
        title={PRINTABLE_REPORT_TITLES[printableReport]}
        subtitle={data.competition.nameRu}
        actions={
          <>
            <WorkspaceButton type="button" icon="print" tone="green" onClick={() => window.print()}>
              Печать
            </WorkspaceButton>
            <WorkspaceButton
              type="button"
              icon="arrow-left"
              onClick={() => setPrintableReport(null)}
            >
              Вернуться
            </WorkspaceButton>
          </>
        }
        federationBar={
          <>
            <span>{data.competition.federation.code}</span>
            <span>{data.competition.federation.nameRu}</span>
          </>
        }
      >
        <PrintableCompetitionReport kind={printableReport} data={data} />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage
      title="Отчеты, печатные формы"
      subtitle={data.competition.nameRu}
      actions={
        <>
          <Link to="/competitions/$id/operations" params={{ id }} className="pt-link-button">
            Операции
          </Link>
          <Link to="/competitions/$id/protocol-print" params={{ id }} className="pt-link-button">
            Печатный протокол
          </Link>
          <Link to="/competitions/$id/certificates" params={{ id }} className="pt-link-button">
            Печать грамот
          </Link>
          <Link to="/competitions/$id/awards" params={{ id }} className="pt-link-button">
            Награждение
          </Link>
        </>
      }
      federationBar={
        <>
          <span>{data.competition.federation.code}</span>
          <span>{data.competition.federation.nameRu}</span>
        </>
      }
      tabs={REPORTS_TABS.map((tab) => ({
        label: tab.label,
        icon: tab.icon,
        active: activeTab === tab.key,
        onClick: () => setActiveTab(tab.key),
        testId: `reports-tab-${tab.key}`,
      }))}
    >
      <div className="space-y-3">
        <WorkspacePanel className="p-3">
          <WorkspaceSectionTitle>Соревнование</WorkspaceSectionTitle>
          <label className="pt-checkline mb-2">
            <input
              type="checkbox"
              checked={hidePastCompetitions}
              onChange={(event) => setHidePastCompetitions(event.target.checked)}
            />
            <span>Скрыть прошедшие соревнования</span>
          </label>
          <table className="pt-grid">
            <thead>
              <tr>
                <th className="w-12">Вкл</th>
                <th>Начало</th>
                <th className="text-left">Соревнование</th>
                <th>Н.Всего</th>
                <th>Н.Жен.</th>
                <th>Н.Муж.</th>
              </tr>
            </thead>
            <tbody>
              {showCompetitionRow ? (
                <tr className="is-green">
                  <td className="text-center">
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
                  <td colSpan={6} className="pt-muted italic text-center">
                    Соревнование скрыто фильтром прошедших.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </WorkspacePanel>

        {activeTab === 'protocols' && (
          <div className="space-y-3">
            <StubSection
              title="Форма протоколов соревнований ФПР"
              description="Требуется LibreOffice для PDF-экспорта."
            >
              {renderReportActions(REPORT_ACTIONS.fprProtocols)}
            </StubSection>

            <StubSection title="Формы протоколов для большого количества дисциплин" tone="green">
              {renderReportActions(REPORT_ACTIONS.protocolDisciplineSheets)}
            </StubSection>

            <StubSection title="Выгрузка во внешний файл с листами (необходим LibreOffice)">
              {renderReportActions(REPORT_ACTIONS.protocolExternalFiles)}
            </StubSection>

            <StubSection
              title="WRPF / WEPF / WSF / СПР / ФЖД / WAF / CAP"
              description="Экспорт в форматах сторонних федераций."
            >
              {renderReportActions(REPORT_ACTIONS.externalFederationFormats)}
            </StubSection>

            <StubSection title="Выгрузка протоколов в сторонние сервисы" tone="yellow">
              {renderReportActions(REPORT_ACTIONS.externalServices)}
            </StubSection>
          </div>
        )}

        {activeTab === 'blanks' && (
          <StubSection
            title="Пустографики"
            description="Печать пустых форм для секретариата и судей."
          >
            {renderReportActions(REPORT_ACTIONS.blanks)}
          </StubSection>
        )}

        {activeTab === 'nominations' && (
          <StubSection
            title="Печать номинаций"
            description="Списки спортсменов с номинациями для секретариата."
          >
            {renderReportActions(REPORT_ACTIONS.nominations)}
            <Link to="/competitions/$id/nominations" params={{ id }} className="pt-link-button">
              Открыть страницу номинаций
            </Link>
          </StubSection>
        )}

        {activeTab === 'judges' && (
          <StubSection
            title="Назначения судей"
            description="Печать назначений для бригад и кодов авторизации."
          >
            {renderReportActions(REPORT_ACTIONS.judges)}
          </StubSection>
        )}

        {activeTab === 'cards' && (
          <StubSection
            title="Карточки спортсменов"
            description="Индивидуальные карточки для секретариата и помоста."
          >
            {renderReportActions(REPORT_ACTIONS.cards)}
          </StubSection>
        )}

        {activeTab === 'schedule' && (
          <StubSection
            title="Расписание"
            description="Расписание помостов и групп с временами выходов."
          >
            {renderReportActions(REPORT_ACTIONS.schedule)}
          </StubSection>
        )}

        {activeTab === 'reports' && (
          <WorkspacePanel className="p-3">
            <WorkspaceToolbar>
              <WorkspaceButton
                type="button"
                icon="check"
                tone="green"
                onClick={() => void refreshReport()}
                disabled={isFetching}
              >
                {isFetching ? t('common.loading') : 'Обновить'}
              </WorkspaceButton>
              <input
                className="pt-field ml-auto max-w-xs"
                placeholder="Поиск (Ctrl+F)"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <WorkspaceButton type="button" onClick={() => setShowMore((value) => !value)}>
                {showMore ? 'Скрыть' : 'Еще'}
              </WorkspaceButton>
            </WorkspaceToolbar>
            {showMore ? (
              <div className="pt-info-yellow my-2">
                Отображено строк: {visibleRows.length} из {data.scoreboardRows.length}.
                Дополнительные колонки включены в таблицу ниже.
              </div>
            ) : null}
            <table className="pt-grid mt-2">
              <thead>
                <tr>
                  <th className="w-12">№</th>
                  <th className="text-left">Спортсмен</th>
                  <th className="text-left">Дисциплина</th>
                  {showMore ? <th className="text-left">Возраст</th> : null}
                  <th>Весовая</th>
                  <th>Лучший</th>
                  <th>Очки</th>
                  {showMore ? <th>Место</th> : null}
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, index) => (
                  <tr
                    key={row.nominationId}
                    className={index === 0 ? 'is-selected' : index % 2 ? 'is-yellow' : 'is-green'}
                  >
                    <td className="text-right tabular-nums">{row.entryNumber ?? '—'}</td>
                    <td>{row.athleteName}</td>
                    <td>{row.discipline}</td>
                    {showMore ? <td>{row.division}</td> : null}
                    <td className="text-center">{row.weightClass}</td>
                    <td className="text-right tabular-nums">
                      {row.bestSuccessfulAttemptKg ?? '—'}
                    </td>
                    <td className="text-right tabular-nums">{row.finalScore ?? '—'}</td>
                    {showMore ? (
                      <td className="text-right tabular-nums">{row.placeInClass ?? '—'}</td>
                    ) : null}
                    <td className="text-center">{t(`competitionOps.status.${row.status}`)}</td>
                  </tr>
                ))}
                {visibleRows.length === 0 ? (
                  <tr>
                    <td colSpan={showMore ? 9 : 7} className="pt-muted italic text-center">
                      Строки не найдены.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </WorkspacePanel>
        )}

        {activeTab === 'finance' && (
          <WorkspacePanel className="p-3 space-y-3">
            <WorkspaceSectionTitle>Финансовые показатели</WorkspaceSectionTitle>
            <WorkspaceToolbar>{renderReportActions(REPORT_ACTIONS.finance)}</WorkspaceToolbar>
            <table className="pt-grid">
              <thead>
                <tr>
                  <th className="text-left">Показатель</th>
                  <th>Значение</th>
                </tr>
              </thead>
              <tbody>
                <tr className="is-selected">
                  <td>Заявки</td>
                  <td className="text-right tabular-nums">{data.accounting.totalNominations}</td>
                </tr>
                <tr className="is-green">
                  <td>Мандат пройден</td>
                  <td className="text-right tabular-nums">
                    {data.accounting.mandatePassedNominations}
                  </td>
                </tr>
                <tr className="is-yellow">
                  <td>Взносы</td>
                  <td className="text-right tabular-nums">
                    {formatRub(data.accounting.paidEntryFeeKopecks)}
                  </td>
                </tr>
                <tr className="is-pink">
                  <td>Списание федерации</td>
                  <td className="text-right tabular-nums">
                    {formatRub(data.accounting.federationBillingKopecks)}
                  </td>
                </tr>
              </tbody>
            </table>
            <div className="pt-info-yellow">
              Данные отчёта формируются по текущему состоянию секретариата.
            </div>
          </WorkspacePanel>
        )}

        {activeTab === 'references' && (
          <StubSection
            title="Справки"
            description="Справки об участии, грамоты участника, благодарственные письма."
          >
            <Link to="/competitions/$id/certificates" params={{ id }} className="pt-link-button">
              Открыть Печать грамот
            </Link>
            {renderReportActions(REPORT_ACTIONS.references)}
          </StubSection>
        )}
      </div>
    </WorkspacePage>
  );
}
