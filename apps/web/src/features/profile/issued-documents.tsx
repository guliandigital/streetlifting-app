import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@streetlifting/ui';
import { api } from '../../lib/api-client.js';

export function MyIssuedDocuments() {
  const query = useQuery({
    queryKey: ['my-issued-documents'],
    queryFn: api.competitions.myIssuedDocuments,
    gcTime: 0,
  });
  const [error, setError] = useState('');
  async function download(id: string, version: number) {
    try {
      const url = URL.createObjectURL(await api.competitions.issuedDocument(id));
      const link = document.createElement('a');
      link.href = url;
      link.download = `result-${id}-v${version}.html`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось скачать документ');
    }
  }
  return (
    <section className="mt-4 space-y-2" data-testid="my-issued-documents">
      <h3 className="text-sm font-medium">Выданные выписки из протоколов</h3>
      <p className="text-xs text-muted-foreground">
        Сохраняются все выданные версии. При скачивании проверяется, заменён ли исходный протокол;
        устаревшая выписка получает соответствующую отметку.
      </p>
      {query.isPending ? (
        <p>Загрузка…</p>
      ) : query.error ? (
        <p role="alert">
          Не удалось получить документы.{' '}
          <button onClick={() => void query.refetch()}>Повторить</button>
        </p>
      ) : !query.data?.documents.length ? (
        <p>Выданных выписок пока нет.</p>
      ) : (
        <ul className="space-y-2">
          {query.data.documents.map((doc) => (
            <li key={doc.id} className="flex flex-wrap items-center gap-2">
              <span>
                {doc.snapshot.competition.nameRu} · документ v{doc.version} · протокол r
                {doc.snapshot.revision}
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void download(doc.id, doc.version)}
              >
                Скачать
              </Button>
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
