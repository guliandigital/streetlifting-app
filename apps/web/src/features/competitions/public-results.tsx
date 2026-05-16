import { useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@streetlifting/ui';
import { ApiClientError } from '../../lib/api-client.js';
import type { NominationDto, ScoreboardRowDto } from './operations-api.js';
import { usePublicScoreboard } from './operations-api.js';

function fullName(person: NominationDto['athlete']): string {
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ');
}

function birthYear(value: string): string {
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? String(year) : '-';
}

function rowKey(row: ScoreboardRowDto): string {
  return `${row.discipline} · ${row.division} · ${row.weightClass}`;
}

function compareRows(a: ScoreboardRowDto, b: ScoreboardRowDto): number {
  return (
    a.discipline.localeCompare(b.discipline) ||
    a.division.localeCompare(b.division) ||
    a.weightClass.localeCompare(b.weightClass) ||
    (a.placeInClass ?? Number.POSITIVE_INFINITY) - (b.placeInClass ?? Number.POSITIVE_INFINITY) ||
    a.athleteName.localeCompare(b.athleteName)
  );
}

function toRows(nominations: NominationDto[], rows: ScoreboardRowDto[]): ScoreboardRowDto[] {
  if (rows.length > 0) return rows;
  return nominations.map((n) => ({
    nominationId: n.id,
    entryNumber: n.entryNumber,
    athleteName: fullName(n.athlete),
    discipline: n.discipline.nameRu,
    division: n.division.nameRu,
    weightClass: n.weightClass.nameRu,
    placeInClass: n.placeInClass,
    placeInDivision: n.placeInDivision,
    placeOverall: n.placeOverall,
    bestSuccessfulAttemptKg: n.bestSuccessfulAttemptKg,
    finalScore: n.finalScore,
    status: n.status,
  }));
}

function visibleStatus(status: NominationDto['status']): string {
  const labels: Record<NominationDto['status'], string> = {
    draft: 'Заявка',
    paid: 'Оплачено',
    weighed_in: 'Взвешен',
    on_platform: 'На помосте',
    finished: 'Завершено',
    disqualified: 'Дисквалификация',
    withdrawn: 'Снят',
  };
  return labels[status];
}

export default function PublicCompetitionResultsFeature() {
  const { id } = useParams({ from: '/results/competitions/$id' });
  const { data, isLoading, error } = usePublicScoreboard(id);
  const [query, setQuery] = useState('');
  const [groupKey, setGroupKey] = useState('all');

  const nominationsById = useMemo(
    () => new Map((data?.nominations ?? []).map((nomination) => [nomination.id, nomination])),
    [data?.nominations],
  );

  const rows = useMemo(
    () => toRows(data?.nominations ?? [], data?.rows ?? []).sort(compareRows),
    [data?.nominations, data?.rows],
  );

  const groups = useMemo(() => Array.from(new Set(rows.map(rowKey))), [rows]);

  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (groupKey !== 'all' && rowKey(row) !== groupKey) return false;
      if (!normalized) return true;
      const nomination = nominationsById.get(row.nominationId);
      const haystack = [
        row.athleteName,
        row.discipline,
        row.division,
        row.weightClass,
        nomination?.athlete.clubName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [groupKey, nominationsById, query, rows]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground">Загрузка...</div>
    );
  }

  if (error || !data) {
    const isClosed = error instanceof ApiClientError && error.code === 'public_results_closed';
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <Card>
          <CardHeader>
            <CardTitle>{isClosed ? 'Результаты закрыты' : 'Результаты недоступны'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              {isClosed
                ? 'Федерация временно закрыла публичную публикацию результатов.'
                : error instanceof Error
                  ? error.message
                  : 'Соревнование не найдено.'}
            </p>
            <Link to="/" className="text-primary underline">
              На главную
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div data-testid="public-results" className="mx-auto max-w-7xl px-6 py-8 space-y-5">
      <header className="space-y-2">
        <div className="text-sm text-muted-foreground">{data.competition.federation.nameRu}</div>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">{data.competition.nameRu}</h1>
            <div className="mt-1 text-sm text-muted-foreground">
              Обновлено {new Date(data.generatedAt).toLocaleString('ru-RU')} · строк{' '}
              {visibleRows.length} из {rows.length}
            </div>
          </div>
          <Link
            to="/broadcast/competitions/$id"
            params={{ id }}
            className="rounded-md border border-border px-3 py-2 text-sm font-semibold hover:text-primary"
          >
            Табло трансляции
          </Link>
        </div>
      </header>

      <Card>
        <CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[1fr_320px]">
          <label className="space-y-1">
            <span className="text-sm font-medium">Поиск</span>
            <input
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ФИО, клуб, дисциплина"
            />
          </label>
          <label className="space-y-1">
            <span className="text-sm font-medium">Группа результатов</span>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
              value={groupKey}
              onChange={(event) => setGroupKey(event.target.value)}
            >
              <option value="all">Все группы</option>
              {groups.map((group) => (
                <option key={group} value={group}>
                  {group}
                </option>
              ))}
            </select>
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border bg-muted/50">
              <tr>
                <th className="px-3 py-2 text-left">Место</th>
                <th className="px-3 py-2 text-left">Спортсмен</th>
                <th className="px-3 py-2 text-left">Дисциплина</th>
                <th className="px-3 py-2 text-left">Дивизион</th>
                <th className="px-3 py-2 text-left">Весовая</th>
                <th className="px-3 py-2 text-right">Лучший результат</th>
                <th className="px-3 py-2 text-right">Очки</th>
                <th className="px-3 py-2 text-left">Статус</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row) => {
                const nomination = nominationsById.get(row.nominationId);
                return (
                  <tr key={row.nominationId} className="border-b border-border/60">
                    <td className="px-3 py-2 tabular-nums">{row.placeInClass ?? '-'}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.athleteName}</div>
                      <div className="text-xs text-muted-foreground">
                        {nomination?.athlete.clubName ?? '-'} ·{' '}
                        {nomination ? birthYear(nomination.athlete.dateOfBirth) : '-'}
                      </div>
                    </td>
                    <td className="px-3 py-2">{row.discipline}</td>
                    <td className="px-3 py-2">{row.division}</td>
                    <td className="px-3 py-2">{row.weightClass}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {row.bestSuccessfulAttemptKg ?? '-'}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{row.finalScore ?? '-'}</td>
                    <td className="px-3 py-2">{visibleStatus(row.status)}</td>
                  </tr>
                );
              })}
              {visibleRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">
                    По выбранным фильтрам результатов нет.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
