import { useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@streetlifting/ui';
import { api } from '../lib/api-client.js';
import { useFederations } from '../lib/federations-api.js';
import { WorkspaceButton } from './workspace.js';

export function AthleteReport({ athleteId }: { athleteId: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sending = useRef(false);
  const [kind, setKind] = useState('Дубликат профиля');
  const [federationId, setFederationId] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const federations = useFederations();
  const queryClient = useQueryClient();

  function open(nextKind: string) {
    setKind(nextKind);
    setError('');
    dialog.current?.showModal();
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending.current || !federationId || message.trim().length < 3) return;
    sending.current = true;
    setPending(true);
    setError('');
    try {
      const result = await api.federations.supportTickets.create(federationId, {
        subject: kind,
        message: `${kind}\nПрофиль: /athletes/${athleteId}\n${message.trim()}`,
      });
      await queryClient.invalidateQueries({ queryKey: ['federations', federationId] });
      toast.success(`Обращение сохранено: ${result.ticket.id}`);
      setMessage('');
      dialog.current?.close();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить обращение');
    } finally {
      sending.current = false;
      setPending(false);
    }
  }
  return (
    <>
      <WorkspaceButton type="button" icon="warning" onClick={() => open('Дубликат профиля')}>
        Заявить о дубликате
      </WorkspaceButton>
      <WorkspaceButton type="button" icon="warning" onClick={() => open('Жалоба на спам')}>
        Спам
      </WorkspaceButton>
      <dialog
        ref={dialog}
        aria-labelledby="athlete-report-title"
        className="w-full max-w-lg rounded-lg border bg-background p-6 text-foreground backdrop:bg-black/40"
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <h2 id="athlete-report-title" className="text-lg font-semibold">
            {kind}
          </h2>
          <p>
            Обращение появится в поддержке выбранной федерации. Укажите, какие данные необходимо
            проверить.
          </p>
          <label className="block">
            Федерация
            <select
              required
              value={federationId}
              onChange={(event) => setFederationId(event.target.value)}
              disabled={pending}
              className="block w-full border bg-background p-2"
            >
              <option value="">Выберите федерацию</option>
              {federations.data?.federations.map((fed) => (
                <option key={fed.id} value={fed.id}>
                  {fed.nameRu}
                </option>
              ))}
            </select>
          </label>
          {federations.isError ? (
            <p role="alert">
              Не удалось загрузить федерации.{' '}
              <button type="button" onClick={() => void federations.refetch()}>
                Повторить
              </button>
            </p>
          ) : null}
          {!federations.isLoading &&
          !federations.isError &&
          !federations.data?.federations.length ? (
            <p>Нет доступной федерации для обращения. Обратитесь к организатору соревнования.</p>
          ) : null}
          <label className="block">
            Описание
            <textarea
              required
              minLength={3}
              maxLength={3500}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={pending}
              className="block w-full border bg-background p-2"
              rows={5}
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <WorkspaceButton
            type="submit"
            disabled={pending || !federationId || message.trim().length < 3}
          >
            {pending ? 'Сохранение…' : 'Отправить обращение'}
          </WorkspaceButton>
          <WorkspaceButton type="button" disabled={pending} onClick={() => dialog.current?.close()}>
            Отмена
          </WorkspaceButton>
        </form>
      </dialog>
    </>
  );
}
