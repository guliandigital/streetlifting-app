import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@streetlifting/ui';

interface FederationRow {
  code: string;
  shortName: string;
  name: string;
  eventCount: number | null;
  href: string;
}

interface CityRow {
  countryCode: string;
  countryName: string;
  city: string;
  eventCount: number | null;
  href: string;
}

interface CompetitionRow {
  fed: string;
  regionId: string;
  regionName: string;
  meetId: string;
  name: string;
  leadingDate: string;
  href: string;
  city?: string;
  startDate?: string;
  endDate?: string;
}

interface AthleteMentionRow {
  meetId: string;
  sportsmanId: string;
  name: string;
  birthYear: string;
  team: string;
  className?: string;
  division: string;
  gender: string;
  category: string;
  href: string;
  dsp?: string;
  disciplineCode?: string;
  disciplineLabel?: string;
  bodyWeightKg?: number;
  resultValue?: number | null;
  attempts?: PowerTableAttemptRow[];
}

interface PowerTableAttemptRow {
  componentCode: string;
  attemptNumber: number;
  weightKg: number;
  result: string;
  repsCount?: number;
}

interface PowerTableReferenceRow {
  federationCode?: string;
  dsp?: string;
  disciplineCode?: string;
  disciplineLabel?: string;
  levelCode?: string;
  levelLabel?: string;
  countryCode?: string;
  countryLabel?: string;
  year?: string;
  federationFilter?: string;
  dataDate?: string | null;
  cells: string[];
}

interface PowerTablePublicReferences {
  generatedAt: string;
  federationCode: string;
  federationCodes?: string[];
  disciplines: Array<{
    dsp: string;
    disciplineCode: string;
    disciplineLabel: string;
  }>;
  endpoints: Array<{
    key: string;
    url: string;
    status: number;
  }>;
  normRows: PowerTableReferenceRow[];
  recordRows: PowerTableReferenceRow[];
  athleteRatingRows: PowerTableReferenceRow[];
  coachRatingRows: PowerTableReferenceRow[];
}

interface PowerTableOpenData {
  generatedAt: string;
  source: {
    system: string;
    federation: string;
    federationCode: string;
    federationCodes?: string[];
    collectedAt: string;
    mode: string;
  };
  counts: {
    federations: number;
    clubs: number;
    cities: number;
    competitions: number;
    athleteMentions: number;
    uniquePublicAthletes: number;
    judges: number;
    resultRows?: number;
    attempts?: number;
    disciplines?: number;
    disciplinePages?: number;
    normRows?: number;
    recordRows?: number;
    athleteRatingRows?: number;
    coachRatingRows?: number;
    publicReferenceEndpoints?: number;
  };
  notes: string[];
  federations: FederationRow[];
  clubs: FederationRow[];
  cities: CityRow[];
  competitions: CompetitionRow[];
  athleteMentions: AthleteMentionRow[];
  publicReferences?: PowerTablePublicReferences;
}

type Tab =
  | 'athletes'
  | 'results'
  | 'competitions'
  | 'norms'
  | 'records'
  | 'athleteRatings'
  | 'coachRatings'
  | 'federations'
  | 'cities'
  | 'clubs'
  | 'judges';

const tabs: Array<{ id: Tab; label: string }> = [
  { id: 'athletes', label: 'Спортсмены' },
  { id: 'results', label: 'Результаты' },
  { id: 'competitions', label: 'Соревнования' },
  { id: 'norms', label: 'Нормативы' },
  { id: 'records', label: 'Рекорды' },
  { id: 'athleteRatings', label: 'Рейтинг спортсменов' },
  { id: 'coachRatings', label: 'Рейтинг тренеров' },
  { id: 'federations', label: 'Федерации' },
  { id: 'cities', label: 'Города' },
  { id: 'clubs', label: 'Клубы' },
  { id: 'judges', label: 'Судьи' },
];

function numberLabel(value: number | null): string {
  return value === null ? '-' : new Intl.NumberFormat('ru-RU').format(value);
}

function includesQuery(values: Array<string | number | null | undefined>, query: string): boolean {
  if (!query) return true;
  const haystack = values.filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
}

function referenceIncludesQuery(row: PowerTableReferenceRow, query: string): boolean {
  return includesQuery(
    [
      row.federationCode,
      row.dsp,
      row.disciplineCode,
      row.disciplineLabel,
      row.levelLabel,
      row.countryCode,
      row.countryLabel,
      row.year,
      row.dataDate,
      ...row.cells,
    ],
    query,
  );
}

function eventUrl(href: string): string {
  if (href.startsWith('http')) return href;
  if (href.startsWith('/')) return `https://powertable.ru${href}`;
  return `https://powertable.ru/api/hs/p/${href}`;
}

export default function PowerTableOpenDataFeature() {
  const [data, setData] = useState<PowerTableOpenData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('athletes');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/data/powertable/open-data.json', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return (await response.json()) as PowerTableOpenData;
      })
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'unknown error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const athletes = useMemo(
    () =>
      (data?.athleteMentions ?? []).filter((row) =>
        includesQuery(
          [
            row.name,
            row.sportsmanId,
            row.meetId,
            row.team,
            row.division,
            row.gender,
            row.category,
            row.disciplineCode,
            row.disciplineLabel,
          ],
          normalizedQuery,
        ),
      ),
    [data?.athleteMentions, normalizedQuery],
  );

  const competitions = useMemo(
    () =>
      (data?.competitions ?? []).filter((row) =>
        includesQuery(
          [row.fed, row.meetId, row.name, row.regionName, row.leadingDate],
          normalizedQuery,
        ),
      ),
    [data?.competitions, normalizedQuery],
  );

  const federations = useMemo(
    () =>
      (data?.federations ?? []).filter((row) =>
        includesQuery([row.code, row.shortName, row.name, row.eventCount], normalizedQuery),
      ),
    [data?.federations, normalizedQuery],
  );

  const cities = useMemo(
    () =>
      (data?.cities ?? []).filter((row) =>
        includesQuery(
          [row.countryCode, row.countryName, row.city, row.eventCount],
          normalizedQuery,
        ),
      ),
    [data?.cities, normalizedQuery],
  );

  const clubs = useMemo(
    () =>
      (data?.clubs ?? []).filter((row) =>
        includesQuery([row.code, row.shortName, row.name, row.eventCount], normalizedQuery),
      ),
    [data?.clubs, normalizedQuery],
  );

  const normRows = useMemo(
    () =>
      (data?.publicReferences?.normRows ?? []).filter((row) =>
        referenceIncludesQuery(row, normalizedQuery),
      ),
    [data?.publicReferences?.normRows, normalizedQuery],
  );

  const recordRows = useMemo(
    () =>
      (data?.publicReferences?.recordRows ?? []).filter((row) =>
        referenceIncludesQuery(row, normalizedQuery),
      ),
    [data?.publicReferences?.recordRows, normalizedQuery],
  );

  const athleteRatingRows = useMemo(
    () =>
      (data?.publicReferences?.athleteRatingRows ?? []).filter((row) =>
        referenceIncludesQuery(row, normalizedQuery),
      ),
    [data?.publicReferences?.athleteRatingRows, normalizedQuery],
  );

  const coachRatingRows = useMemo(
    () =>
      (data?.publicReferences?.coachRatingRows ?? []).filter((row) =>
        referenceIncludesQuery(row, normalizedQuery),
      ),
    [data?.publicReferences?.coachRatingRows, normalizedQuery],
  );
  const sourceFederationCodes =
    data?.source.federationCodes ?? [data?.source.federationCode].filter(Boolean);

  return (
    <div data-testid="powertable-open-data" className="mx-auto max-w-7xl px-6 py-8 space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="text-sm font-semibold text-primary">PowerTable public import</div>
          <h1 className="text-3xl font-semibold tracking-tight">Открытые данные стритлифтинга</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Публичная read-only выгрузка PowerTable по streetlifting-федерациям: федерации, клубы,
            города, соревнования и строки спортсменов из открытых рабочих протоколов по всем
            доступным дисциплинам. Также добавлены публичные нормативы, рекорды и рейтинги
            PowerTable.
          </p>
        </div>
        <Link to="/login" className="text-sm font-semibold text-primary hover:underline">
          Войти в рабочий кабинет
        </Link>
      </header>

      {error ? (
        <Card>
          <CardHeader>
            <CardTitle>Данные недоступны</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{error}</CardContent>
        </Card>
      ) : null}

      {!data && !error ? <p className="text-sm text-muted-foreground">Загрузка данных...</p> : null}

      {data ? (
        <>
          <section className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
            <Metric label="Streetlifting фед." value={sourceFederationCodes.length} />
            <Metric label="Федерации" value={data.counts.federations} />
            <Metric label="Клубы" value={data.counts.clubs} />
            <Metric label="Города" value={data.counts.cities} />
            <Metric label="Соревнования" value={data.counts.competitions} />
            <Metric label="Строки спортсменов" value={data.counts.athleteMentions} />
            <Metric label="Уникальные спортсмены" value={data.counts.uniquePublicAthletes} />
            <Metric label="Дисциплины" value={data.counts.disciplines ?? 0} />
            <Metric label="Результаты" value={data.counts.resultRows ?? 0} />
            <Metric label="Попытки" value={data.counts.attempts ?? 0} />
            <Metric label="Нормативы" value={data.counts.normRows ?? 0} />
            <Metric label="Рекорды" value={data.counts.recordRows ?? 0} />
            <Metric label="Рейтинг спортсменов" value={data.counts.athleteRatingRows ?? 0} />
            <Metric label="Рейтинг тренеров" value={data.counts.coachRatingRows ?? 0} />
          </section>

          <Card>
            <CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_auto]">
              <label className="space-y-1">
                <span className="text-sm font-medium">Поиск по открытым данным</span>
                <input
                  className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ФИО, город, дисциплина, федерация, рекорд, норматив, id соревнования"
                />
              </label>
              <div className="flex flex-wrap items-end gap-2">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                      activeTab === tab.id
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border hover:text-primary'
                    }`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {activeTab === 'athletes' ? <AthletesTable rows={athletes} /> : null}
          {activeTab === 'results' ? <ResultsTable rows={athletes} /> : null}
          {activeTab === 'competitions' ? <CompetitionsTable rows={competitions} /> : null}
          {activeTab === 'norms' ? (
            <ReferenceTable rows={normRows} title="Нормативы PowerTable" showDiscipline />
          ) : null}
          {activeTab === 'records' ? (
            <ReferenceTable rows={recordRows} title="Рекорды PowerTable" showDiscipline showLevel />
          ) : null}
          {activeTab === 'athleteRatings' ? (
            <ReferenceTable
              rows={athleteRatingRows}
              title="Рейтинг спортсменов PowerTable · за все время"
              showDiscipline
              showYear
            />
          ) : null}
          {activeTab === 'coachRatings' ? (
            <ReferenceTable
              rows={coachRatingRows}
              title="Рейтинг тренеров PowerTable · за все время"
              showYear
            />
          ) : null}
          {activeTab === 'federations' ? (
            <FederationLikeTable rows={federations} title="Федерации PowerTable" />
          ) : null}
          {activeTab === 'cities' ? <CitiesTable rows={cities} /> : null}
          {activeTab === 'clubs' ? (
            <FederationLikeTable rows={clubs} title="Клубы PowerTable" />
          ) : null}
          {activeTab === 'judges' ? <JudgesNotice /> : null}

          <footer className="rounded-md border border-border bg-muted/40 p-4 text-xs leading-6 text-muted-foreground">
            <div>
              Источник: {data.source.system}, federations={sourceFederationCodes.join(', ')},
              collected {new Date(data.source.collectedAt).toLocaleString('ru-RU')}.
            </div>
            {data.notes.map((note) => (
              <div key={note}>{note}</div>
            ))}
          </footer>
        </>
      ) : null}
    </div>
  );
}

function Metric(props: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="text-2xl font-semibold tabular-nums">{numberLabel(props.value)}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
        {props.label}
      </div>
    </div>
  );
}

function AthletesTable(props: { rows: AthleteMentionRow[] }) {
  return (
    <DataCard title={`Спортсмены · ${numberLabel(props.rows.length)}`}>
      <table className="min-w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left">PowerTable ID</th>
            <th className="px-3 py-2 text-left">Спортсмен</th>
            <th className="px-3 py-2 text-left">Год</th>
            <th className="px-3 py-2 text-left">Пол</th>
            <th className="px-3 py-2 text-left">Дисциплина</th>
            <th className="px-3 py-2 text-left">Вес</th>
            <th className="px-3 py-2 text-left">Результат</th>
            <th className="px-3 py-2 text-left">Дивизион</th>
            <th className="px-3 py-2 text-left">Категория</th>
            <th className="px-3 py-2 text-left">Команда</th>
            <th className="px-3 py-2 text-left">Соревнование</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.slice(0, 500).map((row, index) => (
            <tr
              key={`${row.meetId}-${row.sportsmanId}-${index}`}
              className="border-b border-border/60"
            >
              <td className="px-3 py-2 font-mono text-xs">{row.sportsmanId || '-'}</td>
              <td className="px-3 py-2 font-medium">{row.name}</td>
              <td className="px-3 py-2 tabular-nums">{row.birthYear || '-'}</td>
              <td className="px-3 py-2">{row.gender || '-'}</td>
              <td className="px-3 py-2">{row.disciplineLabel || row.disciplineCode || '-'}</td>
              <td className="px-3 py-2 tabular-nums">{row.bodyWeightKg ?? '-'}</td>
              <td className="px-3 py-2 tabular-nums">{row.resultValue ?? '-'}</td>
              <td className="px-3 py-2">{row.division || '-'}</td>
              <td className="px-3 py-2">{row.category || '-'}</td>
              <td className="px-3 py-2">{row.team || '-'}</td>
              <td className="px-3 py-2">
                <a
                  className="text-primary hover:underline"
                  href={eventUrl(row.href)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {row.meetId}
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {props.rows.length > 500 ? (
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Показаны первые 500 строк. Уточните поиск, чтобы сузить список.
        </div>
      ) : null}
    </DataCard>
  );
}

function attemptLabel(attempt: PowerTableAttemptRow): string {
  const result = attempt.result === 'good_lift' ? 'ok' : attempt.result;
  const value =
    attempt.repsCount !== undefined
      ? `${attempt.repsCount} reps @ ${attempt.weightKg}`
      : `${attempt.weightKg}`;
  return `${attempt.componentCode}${attempt.attemptNumber}: ${value} ${result}`;
}

function ResultsTable(props: { rows: AthleteMentionRow[] }) {
  const rows = props.rows.filter((row) => row.resultValue !== undefined);
  return (
    <DataCard title={`Результаты · ${numberLabel(rows.length)}`}>
      <table className="min-w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left">Соревнование</th>
            <th className="px-3 py-2 text-left">Спортсмен</th>
            <th className="px-3 py-2 text-left">Дисциплина</th>
            <th className="px-3 py-2 text-left">Дивизион</th>
            <th className="px-3 py-2 text-left">Вес</th>
            <th className="px-3 py-2 text-left">Итог</th>
            <th className="px-3 py-2 text-left">Попытки</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 500).map((row, index) => (
            <tr
              key={`${row.meetId}-${row.sportsmanId}-${row.disciplineCode}-${index}`}
              className="border-b border-border/60"
            >
              <td className="px-3 py-2 font-mono text-xs">
                <a
                  className="text-primary hover:underline"
                  href={eventUrl(row.href)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {row.meetId}
                </a>
              </td>
              <td className="px-3 py-2 font-medium">{row.name}</td>
              <td className="px-3 py-2">{row.disciplineLabel || row.disciplineCode || '-'}</td>
              <td className="px-3 py-2">{row.division || '-'}</td>
              <td className="px-3 py-2 tabular-nums">{row.bodyWeightKg ?? '-'}</td>
              <td className="px-3 py-2 tabular-nums">{row.resultValue ?? '-'}</td>
              <td className="max-w-xl px-3 py-2 text-xs text-muted-foreground">
                {(row.attempts ?? []).map(attemptLabel).join('; ') || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 500 ? (
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Показаны первые 500 строк. Уточните поиск, чтобы сузить список.
        </div>
      ) : null}
    </DataCard>
  );
}

function ReferenceTable(props: {
  rows: PowerTableReferenceRow[];
  title: string;
  showDiscipline?: boolean;
  showLevel?: boolean;
  showYear?: boolean;
}) {
  const visibleRows = props.rows.slice(0, 500);
  const maxCells = Math.min(12, Math.max(1, ...visibleRows.map((row) => row.cells.length)));

  return (
    <DataCard title={`${props.title} · ${numberLabel(props.rows.length)}`}>
      <table className="min-w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left">Фед.</th>
            {props.showDiscipline ? <th className="px-3 py-2 text-left">Дисциплина</th> : null}
            {props.showLevel ? <th className="px-3 py-2 text-left">Уровень</th> : null}
            {props.showYear ? <th className="px-3 py-2 text-left">Период</th> : null}
            <th className="px-3 py-2 text-left">Дата данных</th>
            {Array.from({ length: maxCells }, (_, index) => (
              <th key={index} className="px-3 py-2 text-left">
                {index + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((row, index) => (
            <tr
              key={`${row.federationCode ?? 'fed'}-${row.dsp ?? 'coach'}-${row.levelLabel ?? row.year ?? 'row'}-${index}`}
              className="border-b border-border/60"
            >
              <td className="px-3 py-2 font-mono text-xs">{row.federationCode || '-'}</td>
              {props.showDiscipline ? (
                <td className="px-3 py-2">
                  <div className="font-medium">{row.disciplineLabel || '-'}</div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {row.disciplineCode || row.dsp || '-'}
                  </div>
                </td>
              ) : null}
              {props.showLevel ? (
                <td className="px-3 py-2">
                  {row.levelLabel || '-'}
                  {row.countryLabel ? (
                    <span className="block text-xs text-muted-foreground">{row.countryLabel}</span>
                  ) : null}
                </td>
              ) : null}
              {props.showYear ? (
                <td className="px-3 py-2">{row.year === 'all' ? 'За все время' : row.year}</td>
              ) : null}
              <td className="px-3 py-2 text-xs text-muted-foreground">{row.dataDate || '-'}</td>
              {Array.from({ length: maxCells }, (_, cellIndex) => (
                <td key={cellIndex} className="px-3 py-2">
                  {row.cells[cellIndex] || '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {props.rows.length > 500 ? (
        <div className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Показаны первые 500 строк. Уточните поиск, чтобы сузить список.
        </div>
      ) : null}
    </DataCard>
  );
}

function CompetitionsTable(props: { rows: CompetitionRow[] }) {
  return (
    <DataCard title={`Соревнования streetlifting · ${numberLabel(props.rows.length)}`}>
      <table className="min-w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left">Фед.</th>
            <th className="px-3 py-2 text-left">ID</th>
            <th className="px-3 py-2 text-left">Регион</th>
            <th className="px-3 py-2 text-left">Город</th>
            <th className="px-3 py-2 text-left">Дата</th>
            <th className="px-3 py-2 text-left">Название</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={`${row.fed}-${row.meetId}`} className="border-b border-border/60">
              <td className="px-3 py-2 font-mono text-xs">{row.fed}</td>
              <td className="px-3 py-2 font-mono text-xs">
                <a
                  className="text-primary hover:underline"
                  href={eventUrl(row.href)}
                  target="_blank"
                  rel="noreferrer"
                >
                  {row.meetId}
                </a>
              </td>
              <td className="px-3 py-2">{row.regionName || '-'}</td>
              <td className="px-3 py-2">{row.city || '-'}</td>
              <td className="px-3 py-2 tabular-nums">{row.startDate || row.leadingDate || '-'}</td>
              <td className="px-3 py-2 font-medium">{row.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataCard>
  );
}

function FederationLikeTable(props: { rows: FederationRow[]; title: string }) {
  return (
    <DataCard title={`${props.title} · ${numberLabel(props.rows.length)}`}>
      <table className="min-w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left">Код</th>
            <th className="px-3 py-2 text-left">Короткое имя</th>
            <th className="px-3 py-2 text-left">Название</th>
            <th className="px-3 py-2 text-right">Соревнований</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={`${row.code}-${row.shortName}`} className="border-b border-border/60">
              <td className="px-3 py-2 font-mono text-xs">{row.code}</td>
              <td className="px-3 py-2 font-medium">{row.shortName}</td>
              <td className="px-3 py-2">{row.name || '-'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{numberLabel(row.eventCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataCard>
  );
}

function CitiesTable(props: { rows: CityRow[] }) {
  return (
    <DataCard title={`Города · ${numberLabel(props.rows.length)}`}>
      <table className="min-w-full text-sm">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-3 py-2 text-left">Страна</th>
            <th className="px-3 py-2 text-left">Город</th>
            <th className="px-3 py-2 text-right">Соревнований</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={`${row.countryCode}-${row.city}`} className="border-b border-border/60">
              <td className="px-3 py-2">
                <span className="font-mono text-xs">{row.countryCode}</span>{' '}
                <span className="text-muted-foreground">{row.countryName}</span>
              </td>
              <td className="px-3 py-2 font-medium">{row.city}</td>
              <td className="px-3 py-2 text-right tabular-nums">{numberLabel(row.eventCount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </DataCard>
  );
}

function JudgesNotice() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Судьи</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>
          Публичный PowerTable API не отдаёт каталог судей. Для переноса судей нужен официальный
          экспорт из кабинета федерации или federation `sk` с endpoint, который содержит судейские
          назначения.
        </p>
        <p>
          В этой публикации не используются закрытые токены и не добавляются догадки вместо реальных
          данных.
        </p>
      </CardContent>
    </Card>
  );
}

function DataCard(props: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">{props.children}</CardContent>
    </Card>
  );
}
