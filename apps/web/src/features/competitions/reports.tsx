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
import {
  useCompetitionOps,
  type CompetitionOpsResponse,
  type NominationDto,
} from './operations-api.js';

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

type StandardReportMode = 'secretary' | 'weightClasses' | 'federation';

const STANDARD_REPORT_MODES: Array<{ key: StandardReportMode; label: string }> = [
  { key: 'secretary', label: 'Техсекретарь' },
  { key: 'weightClasses', label: 'Весовые категории' },
  { key: 'federation', label: 'Сводка федерации' },
];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}

function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : String(value);
}

function formatKg(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value}`;
}

function statusLabel(status: NominationDto['status'], t: ReturnType<typeof useTranslation>['t']) {
  return t(`competitionOps.status.${status}`);
}

function athleteFullName(nomination: NominationDto): string {
  return [nomination.athlete.lastName, nomination.athlete.firstName, nomination.athlete.middleName]
    .filter(Boolean)
    .join(' ');
}

function toCsv(rows: unknown[][]): string {
  return rows
    .map((row) =>
      row
        .map((value) => {
          const text = value === null || value === undefined ? '' : String(value);
          return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
        })
        .join(','),
    )
    .join('\n');
}

function buildSecretaryRows(
  data: CompetitionOpsResponse,
  t: ReturnType<typeof useTranslation>['t'],
) {
  return [...data.nominations]
    .sort(
      (a, b) =>
        (a.entryNumber ?? Number.POSITIVE_INFINITY) - (b.entryNumber ?? Number.POSITIVE_INFINITY) ||
        athleteFullName(a).localeCompare(athleteFullName(b)),
    )
    .map((nomination) => ({
      id: nomination.id,
      entryNumber: nomination.entryNumber,
      athlete: athleteFullName(nomination),
      discipline: nomination.discipline.nameRu,
      division: nomination.division.nameRu,
      declaredWeightClass: nomination.declaredWeightClass?.nameRu ?? '—',
      actualWeightClass: nomination.weightClass.nameRu,
      bodyWeight: nomination.bodyWeightAtWeighIn,
      flight: nomination.flight?.code ?? '—',
      group: nomination.group?.name ?? '—',
      mandate: nomination.isMandatePassed ? 'Да' : 'Нет',
      payment: nomination.isEntryFeePaid ? 'Оплачено' : 'Не оплачено',
      status: statusLabel(nomination.status, t),
      notes: nomination.notes ?? '',
    }));
}

function buildWeightClassSummary(data: CompetitionOpsResponse) {
  const groups = new Map<
    string,
    {
      key: string;
      discipline: string;
      division: string;
      weightClass: string;
      nominations: NominationDto[];
    }
  >();

  for (const nomination of data.nominations) {
    const key = [nomination.discipline.id, nomination.division.id, nomination.weightClass.id].join(
      ':',
    );
    const existing = groups.get(key);
    if (existing) {
      existing.nominations.push(nomination);
    } else {
      groups.set(key, {
        key,
        discipline: nomination.discipline.nameRu,
        division: nomination.division.nameRu,
        weightClass: nomination.weightClass.nameRu,
        nominations: [nomination],
      });
    }
  }

  return [...groups.values()]
    .map((group) => {
      const finished = group.nominations.filter((n) => n.status === 'finished').length;
      const weighedIn = group.nominations.filter((n) => n.bodyWeightAtWeighIn !== null).length;
      const leader = [...group.nominations].sort(
        (a, b) =>
          (a.placeInClass ?? Number.POSITIVE_INFINITY) -
            (b.placeInClass ?? Number.POSITIVE_INFINITY) ||
          Number(b.finalScore ?? 0) - Number(a.finalScore ?? 0) ||
          athleteFullName(a).localeCompare(athleteFullName(b)),
      )[0];
      return {
        ...group,
        total: group.nominations.length,
        weighedIn,
        finished,
        leader: leader ? athleteFullName(leader) : '—',
        bestKg: leader?.bestSuccessfulAttemptKg ?? null,
        score: leader?.finalScore ?? null,
      };
    })
    .sort(
      (a, b) =>
        a.discipline.localeCompare(b.discipline) ||
        a.division.localeCompare(b.division) ||
        a.weightClass.localeCompare(b.weightClass),
    );
}

function buildClubSummary(data: CompetitionOpsResponse) {
  const groups = new Map<
    string,
    {
      club: string;
      total: number;
      paid: number;
      weighedIn: number;
      finished: number;
      paidKopecks: number;
      billingKopecks: number;
    }
  >();
  const tariff = Number(data.competition.federation.billingTariffKopecksPerNomination);

  for (const nomination of data.nominations) {
    const club = nomination.athlete.clubName?.trim() || 'Без клуба';
    const existing = groups.get(club) ?? {
      club,
      total: 0,
      paid: 0,
      weighedIn: 0,
      finished: 0,
      paidKopecks: 0,
      billingKopecks: 0,
    };
    existing.total += 1;
    if (nomination.paymentStatus === 'paid' || nomination.paymentStatus === 'waived') {
      existing.paid += 1;
    }
    if (nomination.bodyWeightAtWeighIn !== null) {
      existing.weighedIn += 1;
      existing.billingKopecks += tariff;
    }
    if (nomination.status === 'finished') existing.finished += 1;
    existing.paidKopecks += Number(nomination.paidAmountKopecks);
    groups.set(club, existing);
  }

  return [...groups.values()].sort((a, b) => b.total - a.total || a.club.localeCompare(b.club));
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
  const [standardReportMode, setStandardReportMode] = useState<StandardReportMode>('secretary');
  const competitionGenderStats = useMemo(
    () => nominationGenderStats(data?.nominations ?? []),
    [data?.nominations],
  );
  const secretaryRows = useMemo(() => (data ? buildSecretaryRows(data, t) : []), [data, t]);
  const weightClassSummary = useMemo(() => (data ? buildWeightClassSummary(data) : []), [data]);
  const clubSummary = useMemo(() => (data ? buildClubSummary(data) : []), [data]);
  const showCompetitionRow = data
    ? !hidePastCompetitions || !isPastCompetition(data.competition.endDate)
    : false;
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

  function exportStandardReportCsv() {
    if (!data) return;
    const filename = `${data.competition.code}-standard-${standardReportMode}.csv`;
    if (standardReportMode === 'secretary') {
      downloadText(
        filename,
        `\uFEFF${toCsv([
          [
            'entryNumber',
            'athlete',
            'discipline',
            'division',
            'declaredWeightClass',
            'actualWeightClass',
            'bodyWeight',
            'flight',
            'group',
            'mandate',
            'payment',
            'status',
            'notes',
          ],
          ...secretaryRows.map((row) => [
            row.entryNumber,
            row.athlete,
            row.discipline,
            row.division,
            row.declaredWeightClass,
            row.actualWeightClass,
            row.bodyWeight,
            row.flight,
            row.group,
            row.mandate,
            row.payment,
            row.status,
            row.notes,
          ]),
        ])}\n`,
      );
      return;
    }
    if (standardReportMode === 'weightClasses') {
      downloadText(
        filename,
        `\uFEFF${toCsv([
          [
            'discipline',
            'division',
            'weightClass',
            'total',
            'weighedIn',
            'finished',
            'leader',
            'bestKg',
            'score',
          ],
          ...weightClassSummary.map((row) => [
            row.discipline,
            row.division,
            row.weightClass,
            row.total,
            row.weighedIn,
            row.finished,
            row.leader,
            row.bestKg,
            row.score,
          ]),
        ])}\n`,
      );
      return;
    }
    downloadText(
      filename,
      `\uFEFF${toCsv([
        ['club', 'total', 'paid', 'weighedIn', 'finished', 'paidKopecks', 'billingKopecks'],
        ...clubSummary.map((row) => [
          row.club,
          row.total,
          row.paid,
          row.weighedIn,
          row.finished,
          row.paidKopecks,
          row.billingKopecks,
        ]),
      ])}\n`,
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
              <WorkspaceButton type="button" icon="document">
                Подробный
              </WorkspaceButton>
              <WorkspaceButton type="button" icon="document">
                Сжатый
              </WorkspaceButton>
              <WorkspaceButton type="button" icon="document">
                Сокращённый
              </WorkspaceButton>
              <WorkspaceButton type="button" icon="document">
                Выгрузка в АСП Паурлифтинг
              </WorkspaceButton>
            </StubSection>

            <StubSection title="Формы протоколов для большого количества дисциплин" tone="green">
              <WorkspaceButton
                type="button"
                icon="chart"
                tone="green"
                onClick={() => void exportFile('protocol', 'xlsx')}
              >
                Дисциплины на отдельном листе
              </WorkspaceButton>
              <WorkspaceButton
                type="button"
                icon="chart"
                tone="green"
                onClick={() => void exportFile('protocol', 'xlsx')}
              >
                Дисциплины на одном листе
              </WorkspaceButton>
            </StubSection>

            <StubSection title="Выгрузка во внешний файл с листами (необходим LibreOffice)">
              <WorkspaceButton
                type="button"
                icon="document"
                onClick={() => void exportFile('protocol', 'csv')}
              >
                Итоговый протокол CSV
              </WorkspaceButton>
              <WorkspaceButton
                type="button"
                icon="document"
                onClick={() => void exportFile('protocol', 'xlsx')}
              >
                Итоговый протокол (ENGLISH) XLSX
              </WorkspaceButton>
            </StubSection>

            <StubSection
              title="WRPF / WEPF / WSF / СПР / ФЖД / WAF / CAP"
              description="Экспорт в форматах сторонних федераций."
            >
              <WorkspaceButton type="button" icon="document">
                Итоговый протокол
              </WorkspaceButton>
              <WorkspaceButton type="button" icon="chart">
                Выгрузка XLSX
              </WorkspaceButton>
            </StubSection>

            <StubSection title="Выгрузка протоколов в сторонние сервисы" tone="yellow">
              <WorkspaceButton type="button" icon="link">
                allpowerlifting.com v1 от 09.2020
              </WorkspaceButton>
              <WorkspaceButton type="button" icon="link">
                Прямая через API allpowerlifting.com (тест)
              </WorkspaceButton>
              <WorkspaceButton type="button" icon="link">
                OpenPowerLifting
              </WorkspaceButton>
            </StubSection>
          </div>
        )}

        {activeTab === 'blanks' && (
          <StubSection
            title="Пустографики"
            description="Печать пустых форм для секретариата и судей."
          >
            <WorkspaceButton type="button" icon="print">
              Бланк весов
            </WorkspaceButton>
            <WorkspaceButton type="button" icon="print">
              Бланк попыток (3 подхода)
            </WorkspaceButton>
            <WorkspaceButton type="button" icon="print">
              Бланк решения судей
            </WorkspaceButton>
            <WorkspaceButton type="button" icon="print">
              Бланк протокола ВК
            </WorkspaceButton>
          </StubSection>
        )}

        {activeTab === 'nominations' && (
          <StubSection
            title="Печать номинаций"
            description="Списки спортсменов с номинациями для секретариата."
          >
            <WorkspaceButton type="button" icon="nomination">
              Все номинации
            </WorkspaceButton>
            <WorkspaceButton type="button" icon="nomination">
              По группам
            </WorkspaceButton>
            <WorkspaceButton type="button" icon="nomination">
              По помостам
            </WorkspaceButton>
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
            <WorkspaceButton type="button" icon="judges">
              Печать назначения судей
            </WorkspaceButton>
            <WorkspaceButton type="button" icon="judges">
              Печать назначения судей (English)
            </WorkspaceButton>
            <WorkspaceButton type="button" icon="telegram">
              Печать кодов быстрой авторизации в телеграм
            </WorkspaceButton>
          </StubSection>
        )}

        {activeTab === 'cards' && (
          <StubSection
            title="Карточки спортсменов"
            description="Индивидуальные карточки для секретариата и помоста."
          >
            <WorkspaceButton type="button" icon="list">
              Карточки A4
            </WorkspaceButton>
            <WorkspaceButton type="button" icon="list">
              Карточки A5 на 2 на лист
            </WorkspaceButton>
            <WorkspaceButton type="button" icon="list">
              Карточки только взвешенных
            </WorkspaceButton>
          </StubSection>
        )}

        {activeTab === 'schedule' && (
          <StubSection
            title="Расписание"
            description="Расписание помостов и групп с временами выходов."
          >
            <WorkspaceButton type="button" icon="history">
              Полное расписание
            </WorkspaceButton>
            <WorkspaceButton type="button" icon="history">
              По помостам
            </WorkspaceButton>
            <WorkspaceButton type="button" icon="history">
              По группам
            </WorkspaceButton>
          </StubSection>
        )}

        {activeTab === 'reports' && (
          <WorkspacePanel className="p-3 space-y-3">
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
              <WorkspaceButton type="button" icon="document" onClick={exportStandardReportCsv}>
                CSV
              </WorkspaceButton>
              <div className="pt-segmented">
                {STANDARD_REPORT_MODES.map((mode) => (
                  <button
                    key={mode.key}
                    type="button"
                    className={standardReportMode === mode.key ? 'is-active' : ''}
                    onClick={() => setStandardReportMode(mode.key)}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
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
                Отчет сформирован из текущего состояния секретариата: {data.nominations.length}{' '}
                номинаций, обновлено {formatDateTime(new Date().toISOString())}. CSV-экспорт
                сохраняет активный вид.
              </div>
            ) : null}

            {standardReportMode === 'secretary' && (
              <table className="pt-grid mt-2">
                <thead>
                  <tr>
                    <th className="w-12">№</th>
                    <th className="text-left">Спортсмен</th>
                    <th className="text-left">Дисциплина</th>
                    <th className="text-left">Дивизион</th>
                    <th>Заявл.</th>
                    <th>Факт</th>
                    <th>Вес</th>
                    {showMore ? <th>Поток</th> : null}
                    {showMore ? <th>Группа</th> : null}
                    <th>Мандат</th>
                    <th>Взнос</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {secretaryRows
                    .filter((row) => {
                      const normalized = query.trim().toLowerCase();
                      if (!normalized) return true;
                      return Object.values(row).some((value) =>
                        String(value ?? '')
                          .toLowerCase()
                          .includes(normalized),
                      );
                    })
                    .map((row, index) => (
                      <tr
                        key={row.id}
                        className={
                          index === 0 ? 'is-selected' : index % 2 ? 'is-yellow' : 'is-green'
                        }
                      >
                        <td className="text-right tabular-nums">{row.entryNumber ?? '—'}</td>
                        <td>{row.athlete}</td>
                        <td>{row.discipline}</td>
                        <td>{row.division}</td>
                        <td className="text-center">{row.declaredWeightClass}</td>
                        <td className="text-center">{row.actualWeightClass}</td>
                        <td className="text-right tabular-nums">{formatKg(row.bodyWeight)}</td>
                        {showMore ? <td className="text-center">{row.flight}</td> : null}
                        {showMore ? <td className="text-center">{row.group}</td> : null}
                        <td className="text-center">{row.mandate}</td>
                        <td className="text-center">{row.payment}</td>
                        <td className="text-center">{row.status}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {standardReportMode === 'weightClasses' && (
              <table className="pt-grid mt-2">
                <thead>
                  <tr>
                    <th className="text-left">Дисциплина</th>
                    <th className="text-left">Дивизион</th>
                    <th>Весовая</th>
                    <th>Заявок</th>
                    <th>Взвеш.</th>
                    <th>Заверш.</th>
                    <th className="text-left">Лидер</th>
                    <th>Лучший</th>
                    <th>Очки</th>
                  </tr>
                </thead>
                <tbody>
                  {weightClassSummary
                    .filter((row) => {
                      const normalized = query.trim().toLowerCase();
                      if (!normalized) return true;
                      return [row.discipline, row.division, row.weightClass, row.leader].some(
                        (value) => value.toLowerCase().includes(normalized),
                      );
                    })
                    .map((row, index) => (
                      <tr
                        key={row.key}
                        className={
                          index === 0 ? 'is-selected' : index % 2 ? 'is-yellow' : 'is-green'
                        }
                      >
                        <td>{row.discipline}</td>
                        <td>{row.division}</td>
                        <td className="text-center">{row.weightClass}</td>
                        <td className="text-right tabular-nums">{row.total}</td>
                        <td className="text-right tabular-nums">{row.weighedIn}</td>
                        <td className="text-right tabular-nums">{row.finished}</td>
                        <td>{row.leader}</td>
                        <td className="text-right tabular-nums">{formatNumber(row.bestKg)}</td>
                        <td className="text-right tabular-nums">{formatNumber(row.score)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}

            {standardReportMode === 'federation' && (
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-4">
                  <WorkspacePanel className="p-3 pt-info-green">
                    <div className="pt-muted text-sm">Номинации</div>
                    <div className="text-2xl font-semibold tabular-nums">
                      {data.accounting.totalNominations}
                    </div>
                  </WorkspacePanel>
                  <WorkspacePanel className="p-3 pt-info-yellow">
                    <div className="pt-muted text-sm">Мандат</div>
                    <div className="text-2xl font-semibold tabular-nums">
                      {data.accounting.mandatePassedNominations}
                    </div>
                  </WorkspacePanel>
                  <WorkspacePanel className="p-3 pt-info-gray">
                    <div className="pt-muted text-sm">Взносы</div>
                    <div className="text-2xl font-semibold tabular-nums">
                      {formatRub(data.accounting.paidEntryFeeKopecks)}
                    </div>
                  </WorkspacePanel>
                  <WorkspacePanel className="p-3 pt-info-pink">
                    <div className="pt-muted text-sm">Списание</div>
                    <div className="text-2xl font-semibold tabular-nums">
                      {formatRub(data.accounting.federationBillingKopecks)}
                    </div>
                  </WorkspacePanel>
                </div>
                <table className="pt-grid">
                  <thead>
                    <tr>
                      <th className="text-left">Клуб / команда</th>
                      <th>Заявок</th>
                      <th>Оплачено</th>
                      <th>Взвешено</th>
                      <th>Завершено</th>
                      <th>Взносы</th>
                      <th>Списание</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clubSummary
                      .filter((row) => {
                        const normalized = query.trim().toLowerCase();
                        return !normalized || row.club.toLowerCase().includes(normalized);
                      })
                      .map((row, index) => (
                        <tr
                          key={row.club}
                          className={
                            index === 0 ? 'is-selected' : index % 2 ? 'is-yellow' : 'is-green'
                          }
                        >
                          <td>{row.club}</td>
                          <td className="text-right tabular-nums">{row.total}</td>
                          <td className="text-right tabular-nums">{row.paid}</td>
                          <td className="text-right tabular-nums">{row.weighedIn}</td>
                          <td className="text-right tabular-nums">{row.finished}</td>
                          <td className="text-right tabular-nums">{formatRub(row.paidKopecks)}</td>
                          <td className="text-right tabular-nums">
                            {formatRub(row.billingKopecks)}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </WorkspacePanel>
        )}

        {activeTab === 'finance' && (
          <WorkspacePanel className="p-3 space-y-3">
            <WorkspaceSectionTitle>Финансовые показатели</WorkspaceSectionTitle>
            <WorkspaceToolbar>
              <WorkspaceButton
                type="button"
                icon="billing"
                onClick={() => void exportFile('accounting', 'csv')}
              >
                Бухгалтерия CSV
              </WorkspaceButton>
              <WorkspaceButton
                type="button"
                icon="chart"
                onClick={() => void exportFile('accounting', 'xlsx')}
              >
                Бухгалтерия XLSX
              </WorkspaceButton>
            </WorkspaceToolbar>
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
            <WorkspaceButton type="button" icon="certificate">
              Справка об участии
            </WorkspaceButton>
            <WorkspaceButton type="button" icon="certificate">
              Благодарственное письмо
            </WorkspaceButton>
          </StubSection>
        )}
      </div>
    </WorkspacePage>
  );
}
