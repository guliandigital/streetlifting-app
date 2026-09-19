import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api-client.js';
import { WorkspaceButton, WorkspacePanel } from '../../components/workspace.js';

export function FinalizationSnapshotPanel({ id }: { id: string }) {
  const query = useQuery({
    queryKey: ['finalization-snapshot', id],
    queryFn: () => api.competitions.finalizationSnapshot(id),
    gcTime: 0,
  });
  const snapshot = query.data?.snapshot;
  function download() {
    if (!snapshot) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(query.data, null, 2)], { type: 'application/json' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `competition-${id}-snapshot-r${snapshot.revision}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <WorkspacePanel className="p-3" data-testid="finalization-snapshot-panel">
      <h2 className="font-semibold">Сохранённый результат финализации</h2>
      <p className="pt-muted mt-2">
        Фиксирует правила, попытки и места на момент закрытия турнира. Официальное утверждение
        федерацией здесь не зарегистрировано.
      </p>
      {query.isPending ? (
        <p>Загрузка…</p>
      ) : query.error ? (
        <p role="alert">
          Не удалось получить сохранённый результат.{' '}
          <button type="button" onClick={() => void query.refetch()}>
            Повторить
          </button>
        </p>
      ) : snapshot ? (
        <>
          <p className="my-2">
            Версия {snapshot.revision} · {new Date(snapshot.createdAt).toLocaleString('ru-RU')}
          </p>
          <WorkspaceButton
            type="button"
            onClick={download}
            data-testid="download-finalization-snapshot"
          >
            Скачать сохранённый результат
          </WorkspaceButton>
        </>
      ) : (
        <p className="mt-2">
          Снимок не сохранён. Исторические правила и результаты не восстанавливаются автоматически
          из текущих справочников.
        </p>
      )}
    </WorkspacePanel>
  );
}
