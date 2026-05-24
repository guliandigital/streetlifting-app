import { Link, useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  WorkspacePage,
  WorkspacePanel,
  WorkspaceSectionTitle,
} from '../../components/workspace.js';
import { useScoreboard } from './operations-api.js';

function fullName(person: {
  lastName: string;
  firstName: string;
  middleName?: string | null;
}): string {
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ');
}

export default function CompetitionScoreboardFeature() {
  const { t } = useTranslation();
  const { id } = useParams({ from: '/competitions/$id/scoreboard' });
  const { data, isLoading, error } = useScoreboard(id);

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

  const rows =
    data.rows.length > 0
      ? data.rows
      : data.nominations.map((n) => ({
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

  return (
    <WorkspacePage
      title={t('scoreboard.title')}
      subtitle={`${data.competition.nameRu} · ${t('scoreboard.generatedAt', { value: new Date(data.generatedAt).toLocaleTimeString() })}`}
      actions={
        <>
          <Link to="/competitions/$id/operations" params={{ id }} className="pt-link-button">
            {t('scoreboard.operations')}
          </Link>
          <Link to="/competitions/$id/operator" params={{ id }} className="pt-link-button">
            {t('competitionOperator.title')}
          </Link>
          <Link to="/competitions/$id/protocol-print" params={{ id }} className="pt-link-button">
            {t('protocolPrint.title')}
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
            <Link to="/competitions/$id/operations" params={{ id }}>
              Операции
            </Link>
          ),
          icon: 'settings',
        },
        { label: 'Табло', icon: 'scoreboard', active: true },
        {
          label: (
            <Link to="/competitions/$id/operator" params={{ id }}>
              Оператор
            </Link>
          ),
          icon: 'operator',
        },
      ]}
    >
      <WorkspacePanel className="p-3">
        <WorkspaceSectionTitle>{t('scoreboard.currentBoard')}</WorkspaceSectionTitle>
        <div className="mb-2 text-sm text-[var(--pt-muted)]">
          {t('scoreboard.count', { count: rows.length })}
        </div>
        {rows.length === 0 ? (
          <p className="text-sm italic text-[var(--pt-muted)]">{t('scoreboard.empty')}</p>
        ) : (
          <table className="pt-grid" data-testid="scoreboard-table">
            <thead>
              <tr>
                <th>{t('competitionOps.fields.entryNumber')}</th>
                <th>{t('competitionOps.fields.athlete')}</th>
                <th>{t('competitionOps.fields.discipline')}</th>
                <th>{t('competitionOps.fields.weightClass')}</th>
                <th>{t('competitionOps.fields.placeInClass')}</th>
                <th>{t('competitionOps.fields.placeOverall')}</th>
                <th className="text-right">{t('scoreboard.best')}</th>
                <th className="text-right">{t('scoreboard.score')}</th>
                <th>{t('competitionOps.fields.status')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.nominationId}>
                  <td className="text-lg tabular-nums">{row.entryNumber ?? '-'}</td>
                  <td className="text-lg font-medium">{row.athleteName}</td>
                  <td>{row.discipline}</td>
                  <td>{row.weightClass}</td>
                  <td className="tabular-nums">{row.placeInClass ?? '-'}</td>
                  <td className="tabular-nums">{row.placeOverall ?? '-'}</td>
                  <td className="text-right tabular-nums">{row.bestSuccessfulAttemptKg ?? '-'}</td>
                  <td className="text-right tabular-nums">{row.finalScore ?? '-'}</td>
                  <td>{t(`competitionOps.status.${row.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
