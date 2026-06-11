import type { ReactNode } from 'react';
import type {
  CompetitionOpsResponse,
  JudgeAssignmentDto,
  NominationDto,
  PlatformDto,
} from './operations-api.js';
import { componentOptions, fullName, sortForPlatform } from './tournament-utils.js';

export type PrintableReportKind =
  | 'weighInBlank'
  | 'attemptSheet'
  | 'judgeDecisionBlank'
  | 'protocolVkBlank'
  | 'nominationsAll'
  | 'nominationsByGroups'
  | 'nominationsByPlatforms'
  | 'judgeAssignments'
  | 'judgeAssignmentsEn'
  | 'athleteCardsA4'
  | 'athleteCardsA5'
  | 'athleteCardsWeighedIn'
  | 'scheduleFull'
  | 'schedulePlatforms'
  | 'scheduleGroups'
  | 'participationReferences'
  | 'thankYouLetters';

export const PRINTABLE_REPORT_TITLES: Record<PrintableReportKind, string> = {
  weighInBlank: 'Бланк взвешивания',
  attemptSheet: 'Бланк попыток',
  judgeDecisionBlank: 'Бланк решения судей',
  protocolVkBlank: 'Бланк протокола ВК',
  nominationsAll: 'Все номинации',
  nominationsByGroups: 'Номинации по группам',
  nominationsByPlatforms: 'Номинации по помостам',
  judgeAssignments: 'Назначения судей',
  judgeAssignmentsEn: 'Judge assignments',
  athleteCardsA4: 'Карточки спортсменов A4',
  athleteCardsA5: 'Карточки спортсменов A5',
  athleteCardsWeighedIn: 'Карточки взвешенных спортсменов',
  scheduleFull: 'Полное расписание',
  schedulePlatforms: 'Расписание по помостам',
  scheduleGroups: 'Расписание по группам',
  participationReferences: 'Справки об участии',
  thankYouLetters: 'Благодарственные письма',
};

const JUDGE_ROLE_LABELS: Record<JudgeAssignmentDto['role'], string> = {
  head: 'Главный судья',
  side_left: 'Боковой левый',
  side_right: 'Боковой правый',
  technical: 'Технический судья',
  jury: 'Жюри',
};

const JUDGE_ROLE_LABELS_EN: Record<JudgeAssignmentDto['role'], string> = {
  head: 'Head judge',
  side_left: 'Left side judge',
  side_right: 'Right side judge',
  technical: 'Technical judge',
  jury: 'Jury',
};

const NOMINATION_STATUS_LABELS: Record<NominationDto['status'], string> = {
  draft: 'Черновик',
  paid: 'Оплачено',
  weighed_in: 'Взвешен',
  on_platform: 'На помосте',
  finished: 'Завершен',
  disqualified: 'Дисквалифицирован',
  withdrawn: 'Снят',
};

const ATTEMPT_RESULT_LABELS: Record<NominationDto['attempts'][number]['result'], string> = {
  pending: 'Ожидает',
  good_lift: 'Зачет',
  no_lift: 'Незачет',
  withdrawn: 'Снят',
};

function formatReportDate(value: string): string {
  return new Date(value).toLocaleDateString('ru-RU');
}

function formatReportTime(value: string | null): string {
  return value
    ? new Date(value).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    : '—';
}

function sortForReportSheets(a: NominationDto, b: NominationDto): number {
  return (
    (a.entryNumber ?? Number.POSITIVE_INFINITY) - (b.entryNumber ?? Number.POSITIVE_INFINITY) ||
    sortForPlatform(a, b)
  );
}

function sortedReportNominations(data: CompetitionOpsResponse): NominationDto[] {
  return [...data.nominations].sort(sortForReportSheets);
}

function summaryByDiscipline(nominations: NominationDto[]): string {
  if (nominations.length === 0) return '—';
  const counts = new Map<string, number>();
  for (const nomination of nominations) {
    counts.set(nomination.discipline.nameRu, (counts.get(nomination.discipline.nameRu) ?? 0) + 1);
  }
  return [...counts.entries()].map(([name, count]) => `${name}: ${count}`).join(', ');
}

function platformForNomination(
  data: CompetitionOpsResponse,
  nomination: NominationDto,
): PlatformDto | null {
  if (!nomination.flightId) return null;
  return (
    data.platforms.find((platform) =>
      platform.flights.some((flight) => flight.id === nomination.flightId),
    ) ?? null
  );
}

function groupLabel(data: CompetitionOpsResponse, nomination: NominationDto): string {
  const platform = platformForNomination(data, nomination);
  return (
    [platform?.name, nomination.flight?.name || nomination.flight?.code, nomination.group?.name]
      .filter(Boolean)
      .join(' / ') || '—'
  );
}

function attemptDisplayValue(
  nomination: NominationDto,
  componentId: string | null,
  attemptNumber: number,
): string {
  const attempt = nomination.attempts.find(
    (item) =>
      item.attemptNumber === attemptNumber &&
      (componentId ? item.componentId === componentId : item.componentId === null),
  );
  if (!attempt) return '';
  const reps = attempt.repsCount !== null ? ` / ${attempt.repsCount}` : '';
  return `${attempt.weightKg}${reps} · ${ATTEMPT_RESULT_LABELS[attempt.result]}`;
}

function PrintableReportHeader({
  title,
  data,
  locale = 'ru',
}: {
  title: string;
  data: CompetitionOpsResponse;
  locale?: 'ru' | 'en';
}) {
  const competitionName =
    locale === 'en' ? data.competition.nameEn || data.competition.nameRu : data.competition.nameRu;
  const generatedAt =
    locale === 'en'
      ? `generated ${new Date().toLocaleString('en-US')}`
      : `сформировано ${new Date().toLocaleString('ru-RU')}`;
  const dateRange =
    locale === 'en'
      ? `${new Date(data.competition.startDate).toLocaleDateString('en-US')}–${new Date(
          data.competition.endDate,
        ).toLocaleDateString('en-US')}`
      : `${formatReportDate(data.competition.startDate)}–${formatReportDate(data.competition.endDate)}`;

  return (
    <header className="space-y-1 border-b border-gray-300 pb-3">
      <div className="text-xs font-semibold uppercase text-gray-500">
        {data.competition.federation.code} · {data.competition.federation.nameRu}
      </div>
      <h2 className="text-2xl font-bold">{title}</h2>
      <div className="text-sm">{competitionName}</div>
      <div className="text-xs text-gray-500">
        {dateRange} · {generatedAt}
      </div>
    </header>
  );
}

function EmptyReportRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="pt-muted italic text-center">
        Нет данных для печати.
      </td>
    </tr>
  );
}

function WeighInBlankReport({ data }: { data: CompetitionOpsResponse }) {
  const rows = sortedReportNominations(data);

  return (
    <table className="pt-grid">
      <thead>
        <tr>
          <th className="w-12">№</th>
          <th className="text-left">Спортсмен</th>
          <th className="text-left">Дисциплина</th>
          <th className="text-left">Дивизион</th>
          <th>Заявл. весовая</th>
          <th>Вес</th>
          <th>Итоговая весовая</th>
          <th>Подпись</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyReportRow colSpan={8} />
        ) : (
          rows.map((nomination) => (
            <tr key={nomination.id}>
              <td className="text-right tabular-nums">{nomination.entryNumber ?? '—'}</td>
              <td>{fullName(nomination.athlete)}</td>
              <td>{nomination.discipline.nameRu}</td>
              <td>{nomination.division.nameRu}</td>
              <td>{nomination.declaredWeightClass?.nameRu ?? nomination.weightClass.nameRu}</td>
              <td className="h-8 text-center tabular-nums">
                {nomination.bodyWeightAtWeighIn ?? ''}
              </td>
              <td>{nomination.weightClass.nameRu}</td>
              <td className="h-8" />
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function AttemptSheetReport({ data }: { data: CompetitionOpsResponse }) {
  const rows = sortedReportNominations(data).flatMap((nomination) =>
    componentOptions(nomination).map((component) => ({ nomination, component })),
  );
  const maxAttempts = Math.max(3, ...rows.map((row) => row.component.attemptCount));
  const attemptNumbers = Array.from({ length: maxAttempts }, (_, index) => index + 1);

  return (
    <table className="pt-grid">
      <thead>
        <tr>
          <th className="w-12">№</th>
          <th className="text-left">Спортсмен</th>
          <th className="text-left">Дисциплина</th>
          <th className="text-left">Компонент</th>
          <th>Группа</th>
          {attemptNumbers.map((attemptNumber) => (
            <th key={attemptNumber}>Попытка {attemptNumber}</th>
          ))}
          <th>Подпись</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyReportRow colSpan={6 + attemptNumbers.length} />
        ) : (
          rows.map(({ nomination, component }) => (
            <tr key={`${nomination.id}-${component.id ?? 'main'}`}>
              <td className="text-right tabular-nums">{nomination.entryNumber ?? '—'}</td>
              <td>{fullName(nomination.athlete)}</td>
              <td>{nomination.discipline.nameRu}</td>
              <td>{component.label}</td>
              <td>{nomination.group?.name ?? nomination.flight?.code ?? '—'}</td>
              {attemptNumbers.map((attemptNumber) => (
                <td key={attemptNumber} className="h-8 text-center tabular-nums">
                  {attemptDisplayValue(nomination, component.id, attemptNumber)}
                </td>
              ))}
              <td className="h-8" />
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function JudgeDecisionBlankReport({ data }: { data: CompetitionOpsResponse }) {
  const rows = sortedReportNominations(data).flatMap((nomination) =>
    componentOptions(nomination).flatMap((component) =>
      Array.from({ length: component.attemptCount }, (_, index) => ({
        nomination,
        component,
        attemptNumber: index + 1,
      })),
    ),
  );

  return (
    <table className="pt-grid">
      <thead>
        <tr>
          <th className="w-12">№</th>
          <th className="text-left">Спортсмен</th>
          <th className="text-left">Компонент</th>
          <th>Попытка</th>
          <th>Вес/результат</th>
          <th>Главный</th>
          <th>Левый</th>
          <th>Правый</th>
          <th>Итог</th>
          <th>Подпись</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyReportRow colSpan={10} />
        ) : (
          rows.map(({ nomination, component, attemptNumber }) => (
            <tr key={`${nomination.id}-${component.id ?? 'main'}-${attemptNumber}`}>
              <td className="text-right tabular-nums">{nomination.entryNumber ?? '—'}</td>
              <td>{fullName(nomination.athlete)}</td>
              <td>{component.label}</td>
              <td className="text-center tabular-nums">{attemptNumber}</td>
              <td className="h-8 text-center tabular-nums">
                {attemptDisplayValue(nomination, component.id, attemptNumber)}
              </td>
              <td className="h-8" />
              <td className="h-8" />
              <td className="h-8" />
              <td className="h-8" />
              <td className="h-8" />
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function ProtocolVkBlankReport({ data }: { data: CompetitionOpsResponse }) {
  const rows = sortedReportNominations(data);

  return (
    <table className="pt-grid">
      <thead>
        <tr>
          <th className="w-12">№</th>
          <th className="text-left">Спортсмен</th>
          <th className="text-left">Дисциплина</th>
          <th>Дивизион</th>
          <th>Весовая</th>
          <th>Вес</th>
          <th>Лучший</th>
          <th>Очки</th>
          <th>Место</th>
          <th>Решение ВК</th>
          <th>Подпись</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyReportRow colSpan={11} />
        ) : (
          rows.map((nomination) => (
            <tr key={nomination.id}>
              <td className="text-right tabular-nums">{nomination.entryNumber ?? '—'}</td>
              <td>{fullName(nomination.athlete)}</td>
              <td>{nomination.discipline.nameRu}</td>
              <td>{nomination.division.nameRu}</td>
              <td>{nomination.weightClass.nameRu}</td>
              <td className="text-center tabular-nums">{nomination.bodyWeightAtWeighIn ?? '—'}</td>
              <td className="text-center tabular-nums">
                {nomination.bestSuccessfulAttemptKg ?? '—'}
              </td>
              <td className="text-center tabular-nums">{nomination.finalScore ?? '—'}</td>
              <td className="text-center tabular-nums">
                {nomination.placeInClass ?? nomination.placeOverall ?? '—'}
              </td>
              <td className="h-8" />
              <td className="h-8" />
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function NominationsTable({ data, rows }: { data: CompetitionOpsResponse; rows: NominationDto[] }) {
  return (
    <table className="pt-grid">
      <thead>
        <tr>
          <th className="w-12">№</th>
          <th className="text-left">Спортсмен</th>
          <th className="text-left">Дисциплина</th>
          <th>Дивизион</th>
          <th>Весовая</th>
          <th>Группа</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyReportRow colSpan={7} />
        ) : (
          rows.map((nomination) => (
            <tr key={nomination.id}>
              <td className="text-right tabular-nums">{nomination.entryNumber ?? '—'}</td>
              <td>{fullName(nomination.athlete)}</td>
              <td>{nomination.discipline.nameRu}</td>
              <td>{nomination.division.nameRu}</td>
              <td>{nomination.weightClass.nameRu}</td>
              <td>{groupLabel(data, nomination)}</td>
              <td>{NOMINATION_STATUS_LABELS[nomination.status]}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function ReportSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid space-y-2">
      <h3 className="text-lg font-bold">{title}</h3>
      {children}
    </section>
  );
}

function NominationsReport({
  data,
  mode,
}: {
  data: CompetitionOpsResponse;
  mode: 'all' | 'groups' | 'platforms';
}) {
  const rows = sortedReportNominations(data);

  if (mode === 'all') {
    return <NominationsTable data={data} rows={rows} />;
  }

  if (mode === 'platforms') {
    const unassigned = rows.filter((nomination) => !platformForNomination(data, nomination));
    return (
      <div className="space-y-5">
        {data.platforms.map((platform) => (
          <ReportSection key={platform.id} title={platform.name}>
            <NominationsTable
              data={data}
              rows={rows.filter(
                (nomination) => platformForNomination(data, nomination)?.id === platform.id,
              )}
            />
          </ReportSection>
        ))}
        {unassigned.length > 0 ? (
          <ReportSection title="Без помоста">
            <NominationsTable data={data} rows={unassigned} />
          </ReportSection>
        ) : null}
        {data.platforms.length === 0 && unassigned.length === 0 ? (
          <NominationsTable data={data} rows={[]} />
        ) : null}
      </div>
    );
  }

  const sections = data.platforms.flatMap((platform) =>
    platform.flights.flatMap((flight) =>
      (flight.groups.length > 0 ? flight.groups : [null]).map((group) => ({
        id: `${platform.id}-${flight.id}-${group?.id ?? 'none'}`,
        title: [platform.name, flight.name || flight.code, group?.name ?? 'Без группы'].join(' / '),
        rows: rows.filter((nomination) =>
          group
            ? nomination.groupId === group.id
            : nomination.flightId === flight.id && !nomination.groupId,
        ),
      })),
    ),
  );
  const unassigned = rows.filter((nomination) => !nomination.flightId);

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <ReportSection key={section.id} title={section.title}>
          <NominationsTable data={data} rows={section.rows} />
        </ReportSection>
      ))}
      {unassigned.length > 0 ? (
        <ReportSection title="Без группы">
          <NominationsTable data={data} rows={unassigned} />
        </ReportSection>
      ) : null}
      {sections.length === 0 && unassigned.length === 0 ? (
        <NominationsTable data={data} rows={[]} />
      ) : null}
    </div>
  );
}

function AthleteCardsReport({
  data,
  mode,
}: {
  data: CompetitionOpsResponse;
  mode: 'a4' | 'a5' | 'weighedIn';
}) {
  const rows = sortedReportNominations(data).filter(
    (nomination) => mode !== 'weighedIn' || nomination.bodyWeightAtWeighIn !== null,
  );
  const gridClass = mode === 'a5' ? 'grid grid-cols-2 gap-3' : 'space-y-3';

  if (rows.length === 0) {
    return (
      <table className="pt-grid">
        <tbody>
          <EmptyReportRow colSpan={1} />
        </tbody>
      </table>
    );
  }

  return (
    <div className={gridClass}>
      {rows.map((nomination) => (
        <AthleteCard
          key={nomination.id}
          data={data}
          nomination={nomination}
          compact={mode === 'a5'}
        />
      ))}
    </div>
  );
}

function AthleteCard({
  data,
  nomination,
  compact,
}: {
  data: CompetitionOpsResponse;
  nomination: NominationDto;
  compact: boolean;
}) {
  const components = componentOptions(nomination);
  const maxAttempts = Math.max(3, ...components.map((component) => component.attemptCount));
  const attemptNumbers = Array.from({ length: maxAttempts }, (_, index) => index + 1);

  return (
    <article
      className={`break-inside-avoid border border-gray-400 p-3 ${compact ? 'space-y-2 text-xs' : 'space-y-3'}`}
    >
      <div className="flex items-start justify-between gap-3 border-b border-gray-300 pb-2">
        <div>
          <div className="text-xs font-semibold uppercase text-gray-500">Карточка спортсмена</div>
          <div className={compact ? 'text-base font-bold' : 'text-xl font-bold'}>
            {fullName(nomination.athlete)}
          </div>
          <div>{nomination.discipline.nameRu}</div>
        </div>
        <div className="text-right">
          <div className={compact ? 'text-2xl font-bold' : 'text-4xl font-bold'}>
            {nomination.entryNumber ?? '—'}
          </div>
          <div className="text-xs text-gray-500">номер</div>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
        <dt className="text-gray-500">Дивизион</dt>
        <dd>{nomination.division.nameRu}</dd>
        <dt className="text-gray-500">Весовая</dt>
        <dd>{nomination.weightClass.nameRu}</dd>
        <dt className="text-gray-500">Вес</dt>
        <dd>{nomination.bodyWeightAtWeighIn ?? '—'}</dd>
        <dt className="text-gray-500">Группа</dt>
        <dd>{groupLabel(data, nomination)}</dd>
      </dl>
      <table className="pt-grid">
        <thead>
          <tr>
            <th className="text-left">Компонент</th>
            {attemptNumbers.map((attemptNumber) => (
              <th key={attemptNumber}>П{attemptNumber}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {components.map((component) => (
            <tr key={component.id ?? 'main'}>
              <td>{component.label}</td>
              {attemptNumbers.map((attemptNumber) => (
                <td key={attemptNumber} className="h-8 text-center tabular-nums">
                  {attemptDisplayValue(nomination, component.id, attemptNumber)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="border-t border-gray-300 pt-2">Секретарь</div>
        <div className="border-t border-gray-300 pt-2">Спортсмен</div>
      </div>
    </article>
  );
}

function ParticipationReferencesReport({ data }: { data: CompetitionOpsResponse }) {
  const rows = sortedReportNominations(data);

  if (rows.length === 0) {
    return (
      <table className="pt-grid">
        <tbody>
          <EmptyReportRow colSpan={1} />
        </tbody>
      </table>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((nomination) => (
        <article
          key={nomination.id}
          className="break-inside-avoid space-y-5 border border-gray-400 p-6"
        >
          <div className="text-center">
            <div className="text-xs font-semibold uppercase text-gray-500">
              {data.competition.federation.nameRu}
            </div>
            <h3 className="mt-2 text-2xl font-bold">Справка об участии</h3>
          </div>
          <p className="text-base leading-7">
            Настоящая справка подтверждает, что <strong>{fullName(nomination.athlete)}</strong>{' '}
            принял(а) участие в соревновании <strong>{data.competition.nameRu}</strong> в дисциплине{' '}
            <strong>{nomination.discipline.nameRu}</strong>, дивизион{' '}
            <strong>{nomination.division.nameRu}</strong>, весовая категория{' '}
            <strong>{nomination.weightClass.nameRu}</strong>.
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-gray-500">Даты соревнования</dt>
            <dd>
              {formatReportDate(data.competition.startDate)}–
              {formatReportDate(data.competition.endDate)}
            </dd>
            <dt className="text-gray-500">Статус заявки</dt>
            <dd>{NOMINATION_STATUS_LABELS[nomination.status]}</dd>
            <dt className="text-gray-500">Номер участника</dt>
            <dd>{nomination.entryNumber ?? '—'}</dd>
            <dt className="text-gray-500">Результат</dt>
            <dd>
              {nomination.bestSuccessfulAttemptKg ?? '—'} / {nomination.finalScore ?? '—'}
            </dd>
          </dl>
          <div className="grid grid-cols-2 gap-8 pt-8 text-sm">
            <div className="border-t border-gray-400 pt-2">Главный секретарь</div>
            <div className="border-t border-gray-400 pt-2">Печать / дата</div>
          </div>
        </article>
      ))}
    </div>
  );
}

function ThankYouLettersReport({ data }: { data: CompetitionOpsResponse }) {
  const rows = sortedReportNominations(data);

  if (rows.length === 0) {
    return (
      <table className="pt-grid">
        <tbody>
          <EmptyReportRow colSpan={1} />
        </tbody>
      </table>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((nomination) => (
        <article
          key={nomination.id}
          className="break-inside-avoid space-y-5 border border-gray-400 p-6"
        >
          <div className="text-center">
            <div className="text-xs font-semibold uppercase text-gray-500">
              {data.competition.federation.nameRu}
            </div>
            <h3 className="mt-2 text-2xl font-bold">Благодарственное письмо</h3>
          </div>
          <p className="text-base leading-7">
            Оргкомитет соревнования <strong>{data.competition.nameRu}</strong> выражает
            благодарность <strong>{fullName(nomination.athlete)}</strong>
            {nomination.athlete.clubName ? (
              <>
                {' '}
                из клуба <strong>{nomination.athlete.clubName}</strong>
              </>
            ) : null}{' '}
            за участие, спортивную дисциплину и вклад в развитие стритлифтинга.
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-gray-500">Дисциплина</dt>
            <dd>{nomination.discipline.nameRu}</dd>
            <dt className="text-gray-500">Дивизион</dt>
            <dd>{nomination.division.nameRu}</dd>
            <dt className="text-gray-500">Весовая категория</dt>
            <dd>{nomination.weightClass.nameRu}</dd>
            <dt className="text-gray-500">Дата</dt>
            <dd>{formatReportDate(data.competition.endDate)}</dd>
          </dl>
          <div className="grid grid-cols-2 gap-8 pt-8 text-sm">
            <div className="border-t border-gray-400 pt-2">Оргкомитет</div>
            <div className="border-t border-gray-400 pt-2">Печать / дата</div>
          </div>
        </article>
      ))}
    </div>
  );
}

function JudgeAssignmentsReport({
  data,
  locale = 'ru',
}: {
  data: CompetitionOpsResponse;
  locale?: 'ru' | 'en';
}) {
  const roleLabels = locale === 'en' ? JUDGE_ROLE_LABELS_EN : JUDGE_ROLE_LABELS;
  const emptyPlatform = locale === 'en' ? 'All platforms' : 'Все помосты';
  const headers =
    locale === 'en'
      ? ['Judge', 'Role', 'Platform', 'Category', 'Card', 'Signature']
      : ['Судья', 'Роль', 'Помост', 'Категория', 'Номер', 'Подпись'];
  const rows = [...data.judgeAssignments].sort(
    (a, b) =>
      (a.platform?.order ?? -1) - (b.platform?.order ?? -1) ||
      roleLabels[a.role].localeCompare(roleLabels[b.role]) ||
      fullName(a.judge).localeCompare(fullName(b.judge)),
  );

  return (
    <table className="pt-grid">
      <thead>
        <tr>
          <th className="text-left">{headers[0]}</th>
          <th>{headers[1]}</th>
          <th>{headers[2]}</th>
          <th>{headers[3]}</th>
          <th>{headers[4]}</th>
          <th>{headers[5]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyReportRow colSpan={6} />
        ) : (
          rows.map((assignment) => (
            <tr key={assignment.id}>
              <td>{fullName(assignment.judge)}</td>
              <td>{roleLabels[assignment.role]}</td>
              <td>{assignment.platform?.name ?? emptyPlatform}</td>
              <td>
                {locale === 'en'
                  ? (assignment.judge.categoryEn ?? assignment.judge.categoryRu ?? '—')
                  : (assignment.judge.categoryRu ?? '—')}
              </td>
              <td>{assignment.judge.cardNumber ?? '—'}</td>
              <td className="h-8" />
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

function scheduleRowsForPlatform(data: CompetitionOpsResponse, platform: PlatformDto) {
  return platform.flights.flatMap((flight) => {
    const groups = flight.groups.length > 0 ? flight.groups : [null];
    return groups.map((group) => {
      const nominations = sortedReportNominations(data).filter((nomination) =>
        group
          ? nomination.groupId === group.id
          : nomination.flightId === flight.id && !nomination.groupId,
      );
      return {
        platform,
        flight,
        group,
        nominations,
      };
    });
  });
}

function ScheduleReport({
  data,
  mode,
}: {
  data: CompetitionOpsResponse;
  mode: 'full' | 'platforms' | 'groups';
}) {
  const rows = data.platforms.flatMap((platform) => scheduleRowsForPlatform(data, platform));

  if (mode === 'platforms') {
    return (
      <div className="space-y-5">
        {data.platforms.length === 0 ? (
          <table className="pt-grid">
            <tbody>
              <EmptyReportRow colSpan={6} />
            </tbody>
          </table>
        ) : (
          data.platforms.map((platform) => (
            <section key={platform.id} className="break-inside-avoid space-y-2">
              <h3 className="text-lg font-bold">{platform.name}</h3>
              <ScheduleTable rows={scheduleRowsForPlatform(data, platform)} showPlatform={false} />
            </section>
          ))
        )}
      </div>
    );
  }

  return <ScheduleTable rows={rows} showPlatform={mode !== 'groups'} />;
}

function ScheduleTable({
  rows,
  showPlatform,
}: {
  rows: ReturnType<typeof scheduleRowsForPlatform>;
  showPlatform: boolean;
}) {
  return (
    <table className="pt-grid">
      <thead>
        <tr>
          {showPlatform ? <th className="text-left">Помост</th> : null}
          <th>Поток</th>
          <th>Старт</th>
          <th>Группа</th>
          <th>Заявки</th>
          <th className="text-left">Дисциплины</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 ? (
          <EmptyReportRow colSpan={showPlatform ? 6 : 5} />
        ) : (
          rows.map(({ platform, flight, group, nominations }) => (
            <tr key={`${platform.id}-${flight.id}-${group?.id ?? 'none'}`}>
              {showPlatform ? <td>{platform.name}</td> : null}
              <td>{flight.name || flight.code}</td>
              <td className="text-center tabular-nums">{formatReportTime(flight.startTime)}</td>
              <td>{group?.name ?? 'Без группы'}</td>
              <td className="text-right tabular-nums">{nominations.length}</td>
              <td>{summaryByDiscipline(nominations)}</td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export function PrintableCompetitionReport({
  kind,
  data,
}: {
  kind: PrintableReportKind;
  data: CompetitionOpsResponse;
}) {
  const title = PRINTABLE_REPORT_TITLES[kind];
  const locale = kind === 'judgeAssignmentsEn' ? 'en' : 'ru';
  let body: ReactNode;

  switch (kind) {
    case 'weighInBlank':
      body = <WeighInBlankReport data={data} />;
      break;
    case 'attemptSheet':
      body = <AttemptSheetReport data={data} />;
      break;
    case 'judgeDecisionBlank':
      body = <JudgeDecisionBlankReport data={data} />;
      break;
    case 'protocolVkBlank':
      body = <ProtocolVkBlankReport data={data} />;
      break;
    case 'nominationsAll':
      body = <NominationsReport data={data} mode="all" />;
      break;
    case 'nominationsByGroups':
      body = <NominationsReport data={data} mode="groups" />;
      break;
    case 'nominationsByPlatforms':
      body = <NominationsReport data={data} mode="platforms" />;
      break;
    case 'judgeAssignments':
      body = <JudgeAssignmentsReport data={data} />;
      break;
    case 'judgeAssignmentsEn':
      body = <JudgeAssignmentsReport data={data} locale="en" />;
      break;
    case 'athleteCardsA4':
      body = <AthleteCardsReport data={data} mode="a4" />;
      break;
    case 'athleteCardsA5':
      body = <AthleteCardsReport data={data} mode="a5" />;
      break;
    case 'athleteCardsWeighedIn':
      body = <AthleteCardsReport data={data} mode="weighedIn" />;
      break;
    case 'scheduleFull':
      body = <ScheduleReport data={data} mode="full" />;
      break;
    case 'schedulePlatforms':
      body = <ScheduleReport data={data} mode="platforms" />;
      break;
    case 'scheduleGroups':
      body = <ScheduleReport data={data} mode="groups" />;
      break;
    case 'participationReferences':
      body = <ParticipationReferencesReport data={data} />;
      break;
    case 'thankYouLetters':
      body = <ThankYouLettersReport data={data} />;
      break;
    default:
      body = null;
  }

  return (
    <div
      data-testid={`printable-report-${kind}`}
      className="space-y-4 bg-white text-black print:max-w-none"
    >
      <PrintableReportHeader title={title} data={data} locale={locale} />
      {body}
    </div>
  );
}
