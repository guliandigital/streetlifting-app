import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api-client.js';
import {
  WorkspaceButton,
  WorkspacePanel,
  WorkspaceSectionTitle,
} from '../../components/workspace.js';

export function AccountingReconciliationPanel({ federationId }: { federationId: string }) {
  const [offset, setOffset] = useState(0);
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ['federations', federationId, 'dashboard', 'reconciliation', offset],
    queryFn: () => api.federations.accountingReconciliation(federationId, offset),
    gcTime: 0,
  });
  const data = query.data;
  return (
    <WorkspacePanel className="p-3" data-testid="accounting-reconciliation">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <WorkspaceSectionTitle>Сверка выступлений и списаний</WorkspaceSectionTitle>
        <WorkspaceButton
          type="button"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          Обновить сверку
        </WorkspaceButton>
      </div>
      <p className="pt-muted my-2">
        Правило тарификации не определено. Это фактические количества, а не начисление долга. Сверка
        не создаёт списаний. Одна номинация с несколькими решёнными попытками учитывается один раз.
      </p>
      {query.isPending ? (
        <p>Загрузка…</p>
      ) : query.error ? (
        <p role="alert">Не удалось загрузить сверку. Повторите запрос кнопкой выше.</p>
      ) : data ? (
        <>
          <p className="my-2" data-testid="reconciliation-totals">
            По всей федерации: с решёнными попытками — {data.summary.withDecidedAttempt}; завершено
            — {data.summary.finished}; списано по документам — {data.ledger.consumedNominations}.
          </p>
          <p className="pt-muted my-2">
            Снято после попытки — {data.summary.withdrawnWithDecidedAttempt}; дисквалифицировано
            после попытки — {data.summary.disqualifiedWithDecidedAttempt}. Завершено без сохранённых
            попыток — {data.summary.finishedWithoutAttempt}: требуется сверка с первичным
            протоколом.
          </p>
          <p className="pt-muted my-2">
            Списания без связи с турниром этой федерации: {data.unmatchedWriteoffs.documents}{' '}
            документов, {data.unmatchedWriteoffs.nominations} номинаций. Поступления и списания
            охватывают все документы; истечение пакетов здесь не рассчитывается.
          </p>
          <div className="overflow-x-auto">
            <table className="pt-grid">
              <thead>
                <tr>
                  <th>Турнир</th>
                  <th>Состояние</th>
                  <th>Номинаций</th>
                  <th>С попытками</th>
                  <th>Завершено</th>
                  <th>Снято / дискв.</th>
                  <th>Без попыток</th>
                  <th>Списано</th>
                  <th>Снимок закрытия</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <Link to="/competitions/$id" params={{ id: row.id }}>
                        {row.nameRu}
                      </Link>
                    </td>
                    <td>{t(`competitions.status.${row.status}`)}</td>
                    <td>{row.nominations}</td>
                    <td>{row.withDecidedAttempt}</td>
                    <td>{row.finished}</td>
                    <td>
                      {row.withdrawn} / {row.disqualified}
                    </td>
                    <td>{row.finishedWithoutAttempt}</td>
                    <td>{row.postedNominations}</td>
                    <td>{row.hasFinalizationSnapshot ? 'Сохранён' : 'Не зафиксирован'}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr>
                    <td colSpan={9}>Турниров на этой странице нет.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <WorkspaceButton
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - data.limit))}
            >
              Назад
            </WorkspaceButton>
            <span>
              Турниров: {data.summary.competitions}. Страница {Math.floor(offset / data.limit) + 1}
            </span>
            <WorkspaceButton
              type="button"
              disabled={offset + data.limit >= data.summary.competitions}
              onClick={() => setOffset(offset + data.limit)}
            >
              Далее
            </WorkspaceButton>
          </div>
          <p className="pt-muted mt-2">
            Сверено: {new Date(data.generatedAt).toLocaleString('ru-RU')}. Снимок закрытия не
            является подтверждением официального утверждения.
          </p>
        </>
      ) : null}
    </WorkspacePanel>
  );
}
