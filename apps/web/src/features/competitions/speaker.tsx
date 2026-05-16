import { useMemo, useState } from 'react';
import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from '@streetlifting/ui';
import {
  WorkspaceButton,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceSectionTitle,
} from '../../components/workspace.js';
import type { NominationDto } from './operations-api.js';
import { useCompetitionOps } from './operations-api.js';
import {
  attemptSummary,
  componentOptions,
  fullName,
  nextAttemptNumber,
  sortForPlatform,
} from './tournament-utils.js';

function birthYear(value: string): string {
  const year = new Date(value).getFullYear();
  return Number.isFinite(year) ? String(year) : '-';
}

function formatKg(value: number | null | undefined): string {
  return value === null || value === undefined ? '-' : `${value} кг`;
}

function statusPriority(status: NominationDto['status']): number {
  if (status === 'on_platform') return 0;
  if (status === 'weighed_in') return 1;
  if (status === 'paid') return 2;
  if (status === 'draft') return 3;
  return 4;
}

function isCallable(nomination: NominationDto): boolean {
  return !['finished', 'disqualified', 'withdrawn'].includes(nomination.status);
}

function currentAttemptLabel(nomination: NominationDto): string {
  const component = componentOptions(nomination)[0];
  if (!component) return 'Попытка 1';
  return `${component.label}, попытка ${nextAttemptNumber(nomination, component.id)}`;
}

function buildAnnouncement(nomination: NominationDto): string {
  const parts = [
    fullName(nomination.athlete),
    nomination.athlete.clubName,
    nomination.discipline.nameRu,
    nomination.division.nameRu,
    nomination.weightClass.nameRu,
    nomination.entryNumber ? `стартовый номер ${nomination.entryNumber}` : null,
    currentAttemptLabel(nomination),
  ].filter(Boolean);
  return parts.join(', ');
}

function AthleteBadge({ nomination }: { nomination: NominationDto }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-3">
      {nomination.athlete.photoUrl ? (
        <img
          src={nomination.athlete.photoUrl}
          alt=""
          className="h-20 w-20 rounded border border-[var(--pt-border)] object-cover"
        />
      ) : (
        <div className="flex h-20 w-20 items-center justify-center rounded border border-[var(--pt-border)] bg-[#111] text-xl font-bold text-[#98e400]">
          {nomination.entryNumber ?? 'SL'}
        </div>
      )}
      <div>
        <div className="text-xl font-bold">{fullName(nomination.athlete)}</div>
        <div className="text-sm text-[var(--pt-muted-foreground)]">
          {nomination.athlete.clubName ?? '-'} · {birthYear(nomination.athlete.dateOfBirth)}
        </div>
        <div className="mt-1 text-sm">
          {nomination.discipline.nameRu} · {nomination.division.nameRu} ·{' '}
          {nomination.weightClass.nameRu}
        </div>
      </div>
    </div>
  );
}

export default function CompetitionSpeakerFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/speaker' });
  const { data, isLoading, error, isFetching, refetch } = useCompetitionOps(id);
  const [platformId, setPlatformId] = useState('all');

  const callableNominations = useMemo(() => {
    const rows = (data?.nominations ?? [])
      .filter(isCallable)
      .filter((nomination) => platformId === 'all' || nomination.flight?.id === platformId)
      .sort(
        (a, b) =>
          statusPriority(a.status) - statusPriority(b.status) ||
          sortForPlatform(a, b) ||
          fullName(a.athlete).localeCompare(fullName(b.athlete)),
      );
    return rows;
  }, [data?.nominations, platformId]);

  const current = callableNominations[0] ?? null;
  const queue = current ? callableNominations.filter((n) => n.id !== current.id).slice(0, 8) : [];

  async function copyCurrentAnnouncement() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(buildAnnouncement(current));
      toast.success('Объявление скопировано');
    } catch {
      toast.error('Не удалось скопировать объявление');
    }
  }

  async function refresh() {
    const result = await refetch();
    if (result.error) {
      toast.error(result.error instanceof Error ? result.error.message : 'Error');
      return;
    }
    toast.success('Очередь диктора обновлена');
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
      title="Диктор"
      subtitle={`${data.competition.nameRu} · ${data.competition.federation.nameRu}`}
      actions={
        <>
          <WorkspaceButton type="button" icon="refresh" onClick={() => void refresh()}>
            {isFetching ? t('common.loading') : 'Обновить'}
          </WorkspaceButton>
          <Link to="/competitions/$id/operator" params={{ id }} className="pt-link-button">
            {t('competitionOperator.title')}
          </Link>
          <Link to="/broadcast/competitions/$id" params={{ id }} className="pt-link-button">
            Трансляция
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
        {
          label: (
            <Link to="/competitions/$id/operator" params={{ id }}>
              Оператор
            </Link>
          ),
          icon: 'operator',
        },
        { label: 'Диктор', icon: 'music', active: true },
        {
          label: (
            <Link to="/broadcast/competitions/$id" params={{ id }}>
              Трансляция
            </Link>
          ),
          icon: 'scoreboard',
        },
      ]}
    >
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-3">
          <WorkspacePanel className="p-3">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <label htmlFor="speakerPlatform" className="pt-label">
                Помост:
              </label>
              <select
                id="speakerPlatform"
                className="pt-select w-64 max-w-full"
                value={platformId}
                onChange={(event) => setPlatformId(event.target.value)}
              >
                <option value="all">Все помосты</option>
                {data.platforms.map((platform) => (
                  <option key={platform.id} value={platform.id}>
                    {platform.name}
                  </option>
                ))}
              </select>
              <WorkspaceButton
                type="button"
                icon="document"
                onClick={() => void copyCurrentAnnouncement()}
                disabled={!current}
              >
                Скопировать
              </WorkspaceButton>
            </div>

            {current ? (
              <div className="space-y-3">
                <AthleteBadge nomination={current} />
                <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                  <div className="pt-info-green">
                    <div className="pt-muted">Попытка</div>
                    <strong>{currentAttemptLabel(current)}</strong>
                  </div>
                  <div className="pt-info-yellow">
                    <div className="pt-muted">Вес</div>
                    <strong>{formatKg(current.bodyWeightAtWeighIn)}</strong>
                  </div>
                  <div className="pt-info-gray">
                    <div className="pt-muted">Группа</div>
                    <strong>{current.group?.name ?? '-'}</strong>
                  </div>
                  <div className="pt-info-gray">
                    <div className="pt-muted">Статус</div>
                    <strong>{t(`competitionOps.status.${current.status}`)}</strong>
                  </div>
                </div>
                <div className="pt-black-display text-lg">{buildAnnouncement(current)}</div>
                <div className="text-sm">
                  <span className="pt-muted">Попытки: </span>
                  {attemptSummary(current)}
                </div>
              </div>
            ) : (
              <p className="text-sm italic text-[var(--pt-muted-foreground)]">
                Активной очереди для объявления нет.
              </p>
            )}
          </WorkspacePanel>

          <WorkspacePanel className="p-3">
            <WorkspaceSectionTitle>Очередь объявлений</WorkspaceSectionTitle>
            <table className="pt-grid mt-2">
              <thead>
                <tr>
                  <th>№</th>
                  <th className="text-left">Спортсмен</th>
                  <th className="text-left">Дисциплина</th>
                  <th>Группа</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((nomination) => (
                  <tr key={nomination.id}>
                    <td className="text-right tabular-nums">{nomination.entryNumber ?? '-'}</td>
                    <td>{fullName(nomination.athlete)}</td>
                    <td>{nomination.discipline.nameRu}</td>
                    <td>{nomination.group?.name ?? '-'}</td>
                    <td>{t(`competitionOps.status.${nomination.status}`)}</td>
                  </tr>
                ))}
                {queue.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center italic">
                      Очередь пуста.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </WorkspacePanel>
        </div>

        <WorkspacePanel className="p-3">
          <WorkspaceSectionTitle>Подсказки диктору</WorkspaceSectionTitle>
          {current ? (
            <dl className="grid grid-cols-[130px_1fr] gap-2 text-sm">
              <dt className="pt-muted">ФИО</dt>
              <dd>{fullName(current.athlete)}</dd>
              <dt className="pt-muted">Клуб</dt>
              <dd>{current.athlete.clubName ?? '-'}</dd>
              <dt className="pt-muted">Год рождения</dt>
              <dd>{birthYear(current.athlete.dateOfBirth)}</dd>
              <dt className="pt-muted">Разряд</dt>
              <dd>{current.athlete.federationCardNumber ?? '-'}</dd>
              <dt className="pt-muted">Весовая</dt>
              <dd>{current.weightClass.nameRu}</dd>
              <dt className="pt-muted">Лучший результат</dt>
              <dd>{formatKg(current.bestSuccessfulAttemptKg)}</dd>
              <dt className="pt-muted">Итоговые очки</dt>
              <dd>{current.finalScore ?? '-'}</dd>
              <dt className="pt-muted">Заметки</dt>
              <dd>{current.notes ?? '-'}</dd>
            </dl>
          ) : (
            <p className="text-sm italic text-[var(--pt-muted-foreground)]">Нет спортсмена.</p>
          )}
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}
