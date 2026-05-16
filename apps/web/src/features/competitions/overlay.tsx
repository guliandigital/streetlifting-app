import { useMemo } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { NominationDto, ScoreboardRowDto } from './operations-api.js';
import { usePublicScoreboard } from './operations-api.js';
import {
  componentOptions,
  fullName,
  nextAttemptNumber,
  sortForPlatform,
} from './tournament-utils.js';

function isLive(nomination: NominationDto): boolean {
  return !['finished', 'disqualified', 'withdrawn'].includes(nomination.status);
}

function initials(nomination: NominationDto): string {
  return [nomination.athlete.lastName, nomination.athlete.firstName]
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

function attemptLabel(nomination: NominationDto): string {
  const component = componentOptions(nomination)[0];
  if (!component) return 'Попытка 1';
  return `${component.label} · попытка ${nextAttemptNumber(nomination, component.id)}`;
}

function scoreText(row: ScoreboardRowDto | undefined): string {
  if (!row) return '-';
  if (row.finalScore !== null) return String(row.finalScore);
  if (row.bestSuccessfulAttemptKg !== null) return `${row.bestSuccessfulAttemptKg} кг`;
  return '-';
}

export default function CompetitionOverlayFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/overlay/competitions/$id' });
  const { data, isLoading, error } = usePublicScoreboard(id);

  const rowByNominationId = useMemo(
    () => new Map((data?.rows ?? []).map((row) => [row.nominationId, row])),
    [data?.rows],
  );

  const liveQueue = useMemo(
    () => (data?.nominations ?? []).filter(isLive).sort(sortForPlatform),
    [data?.nominations],
  );
  const current = liveQueue[0] ?? null;
  const next = liveQueue.slice(1, 5);
  const currentRow = current ? rowByNominationId.get(current.id) : undefined;

  if (isLoading) {
    return <div className="pt-obs-overlay-root pt-obs-message">{t('common.loading')}</div>;
  }

  if (error || !data) {
    return (
      <div className="pt-obs-overlay-root pt-obs-message">
        {error instanceof Error ? error.message : 'not found'}
      </div>
    );
  }

  return (
    <div className="pt-obs-overlay-root">
      <section className="pt-obs-current">
        <div className="pt-obs-competition">
          <span>{data.competition.nameRu}</span>
          <span>{new Date(data.generatedAt).toLocaleTimeString('ru-RU')}</span>
        </div>
        {current ? (
          <div className="pt-obs-card">
            {current.athlete.photoUrl ? (
              <img src={current.athlete.photoUrl} alt="" className="pt-obs-photo" />
            ) : (
              <div className="pt-obs-photo pt-obs-photo-fallback">{initials(current) || 'SL'}</div>
            )}
            <div className="min-w-0">
              <div className="pt-obs-label">На помосте</div>
              <div className="pt-obs-name">{fullName(current.athlete)}</div>
              <div className="pt-obs-meta">
                {current.discipline.nameRu} · {current.division.nameRu} ·{' '}
                {current.weightClass.nameRu}
              </div>
              <div className="pt-obs-attempt">{attemptLabel(current)}</div>
            </div>
            <div className="pt-obs-score">
              <span>Очки</span>
              <strong>{scoreText(currentRow)}</strong>
            </div>
          </div>
        ) : (
          <div className="pt-obs-card pt-obs-empty">Очередь помоста пуста</div>
        )}
      </section>

      <aside className="pt-obs-next">
        <div className="pt-obs-label">Далее</div>
        {next.map((nomination) => (
          <div key={nomination.id} className="pt-obs-next-row">
            <span className="tabular-nums">{nomination.entryNumber ?? '-'}</span>
            <span>{fullName(nomination.athlete)}</span>
            <small>{nomination.weightClass.nameRu}</small>
          </div>
        ))}
        {next.length === 0 ? <div className="pt-obs-next-row">Нет следующих заявок</div> : null}
      </aside>
    </div>
  );
}
