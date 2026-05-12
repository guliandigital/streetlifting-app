import { useMemo, useState } from 'react';
import { toast } from '@streetlifting/ui';
import {
  PowerTableButton,
  PowerTablePanel,
  PowerTableSectionTitle,
  PowerTableToolbar,
} from '../../components/powertable.js';
import { useAuthStore } from '../../lib/auth/store.js';
import {
  type SupportTicketDto,
  type SupportTicketStatus,
  useCreateFederationSupportTicket,
  useCreateFederationSupportTicketMessage,
  useFederationSupportTickets,
  useUpdateFederationSupportTicket,
} from './api.js';

const statusLabels: Record<SupportTicketStatus, string> = {
  open: 'Открыт',
  in_progress: 'В работе',
  resolved: 'Решен',
  closed: 'Закрыт',
};

function canManageSupport(
  user: ReturnType<typeof useAuthStore.getState>['user'],
  federationId: string,
): boolean {
  return (
    user?.roles.some(
      (role) =>
        role.role === 'platform_admin' ||
        (role.role === 'federation_admin' && role.federationId === federationId),
    ) ?? false
  );
}

function canUseInternalNotes(user: ReturnType<typeof useAuthStore.getState>['user']): boolean {
  return user?.roles.some((role) => role.role === 'platform_admin') ?? false;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('ru-RU');
}

function lastPublicMessage(ticket: SupportTicketDto): string {
  const message = [...ticket.messages].reverse().find((item) => !item.isInternal);
  return message?.body ?? '-';
}

export function SupportTicketsPanel({ federationId }: { federationId: string }) {
  const user = useAuthStore((state) => state.user);
  const { data, isLoading } = useFederationSupportTickets(federationId);
  const createTicket = useCreateFederationSupportTicket(federationId);
  const createMessage = useCreateFederationSupportTicketMessage(federationId);
  const updateTicket = useUpdateFederationSupportTicket(federationId);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [replyText, setReplyText] = useState('');
  const [replyInternal, setReplyInternal] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState('');

  const tickets = useMemo(() => data?.tickets ?? [], [data?.tickets]);
  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0] ?? null,
    [selectedTicketId, tickets],
  );
  const canManage = canManageSupport(user, federationId);
  const canInternal = canUseInternalNotes(user);

  async function submitTicket() {
    const body = message.trim();
    if (body.length < 3) {
      toast.error('Напишите текст обращения');
      return;
    }
    try {
      const subjectText = subject.trim();
      const payload: { subject?: string; message: string } = { message: body };
      if (subjectText) payload.subject = subjectText;
      const result = await createTicket.mutateAsync(payload);
      setSubject('');
      setMessage('');
      setSelectedTicketId(result.ticket.id);
      toast.success('Обращение создано');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function submitReply() {
    if (!selectedTicket) return;
    const body = replyText.trim();
    if (body.length < 3) {
      toast.error('Напишите ответ');
      return;
    }
    try {
      await createMessage.mutateAsync({
        ticketId: selectedTicket.id,
        message: body,
        isInternal: canInternal ? replyInternal : false,
      });
      setReplyText('');
      setReplyInternal(false);
      toast.success('Сообщение добавлено');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  async function setStatus(ticketId: string, status: SupportTicketStatus) {
    try {
      await updateTicket.mutateAsync({ ticketId, status });
      toast.success('Статус обращения обновлен');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_420px]">
      <PowerTablePanel className="p-3">
        <PowerTableSectionTitle>Обращения в поддержку</PowerTableSectionTitle>
        <div className="pt-form-grid max-w-5xl">
          <label htmlFor="supportSubject">Тема:</label>
          <input
            id="supportSubject"
            className="pt-field"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={180}
          />
          <label htmlFor="supportMessage">Сообщение:</label>
          <textarea
            id="supportMessage"
            className="pt-textarea"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            rows={4}
            placeholder="Опишите вопрос или доработку"
          />
        </div>
        <PowerTableToolbar className="mt-2">
          <PowerTableButton type="button" icon="add" onClick={() => void submitTicket()} disabled={createTicket.isPending}>
            Создать обращение
          </PowerTableButton>
        </PowerTableToolbar>

        <div className="mt-4 overflow-x-auto">
          <table className="pt-grid">
            <thead>
              <tr><th>Дата</th><th>Тема</th><th>Статус</th><th>Последнее сообщение</th></tr>
            </thead>
            <tbody>
              {isLoading ? <tr><td colSpan={4}>Загружаем...</td></tr> : null}
              {!isLoading && tickets.map((ticket, index) => (
                <tr
                  key={ticket.id}
                  className={ticket.id === selectedTicket?.id ? 'is-selected' : index % 2 ? 'is-green' : undefined}
                  onClick={() => setSelectedTicketId(ticket.id)}
                >
                  <td>{formatDate(ticket.lastMessageAt)}</td>
                  <td>{ticket.subject}</td>
                  <td>{statusLabels[ticket.status]}</td>
                  <td>{lastPublicMessage(ticket)}</td>
                </tr>
              ))}
              {!isLoading && tickets.length === 0 ? (
                <tr><td colSpan={4} className="italic">Обращений пока нет.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </PowerTablePanel>

      <PowerTablePanel className="p-3">
        <PowerTableSectionTitle>Переписка</PowerTableSectionTitle>
        {selectedTicket ? (
          <div className="space-y-3">
            <div className="pt-info-yellow">
              <b>{selectedTicket.subject}</b><br />
              Статус: {statusLabels[selectedTicket.status]}
            </div>
            <div className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
              {selectedTicket.messages.map((item) => (
                <div key={item.id} className={item.isInternal ? 'pt-info-pink' : 'pt-info-green'}>
                  <div className="mb-1 text-xs font-bold">
                    {item.author.displayName} · {formatDate(item.createdAt)}
                    {item.isInternal ? ' · внутренне' : ''}
                  </div>
                  <div className="whitespace-pre-wrap">{item.body}</div>
                </div>
              ))}
            </div>
            {selectedTicket.status !== 'closed' ? (
              <>
                <textarea
                  className="pt-textarea w-full"
                  value={replyText}
                  onChange={(event) => setReplyText(event.target.value)}
                  rows={3}
                  placeholder="Ответить в обращение"
                />
                {canInternal ? (
                  <label className="pt-checkline">
                    <input
                      type="checkbox"
                      checked={replyInternal}
                      onChange={(event) => setReplyInternal(event.target.checked)}
                    />
                    <span>Внутренняя заметка</span>
                  </label>
                ) : null}
                <PowerTableToolbar>
                  <PowerTableButton type="button" icon="add" onClick={() => void submitReply()} disabled={createMessage.isPending}>
                    Добавить сообщение
                  </PowerTableButton>
                </PowerTableToolbar>
              </>
            ) : (
              <div className="pt-muted italic">Закрытое обращение нельзя дополнять.</div>
            )}
            {canManage ? (
              <PowerTableToolbar>
                <PowerTableButton type="button" onClick={() => void setStatus(selectedTicket.id, 'open')} disabled={updateTicket.isPending}>
                  Открыть
                </PowerTableButton>
                <PowerTableButton type="button" onClick={() => void setStatus(selectedTicket.id, 'in_progress')} disabled={updateTicket.isPending}>
                  В работу
                </PowerTableButton>
                <PowerTableButton type="button" tone="green" onClick={() => void setStatus(selectedTicket.id, 'resolved')} disabled={updateTicket.isPending}>
                  Решено
                </PowerTableButton>
                <PowerTableButton type="button" tone="danger" onClick={() => void setStatus(selectedTicket.id, 'closed')} disabled={updateTicket.isPending}>
                  Закрыть
                </PowerTableButton>
              </PowerTableToolbar>
            ) : null}
          </div>
        ) : (
          <div className="pt-muted italic">Выберите обращение из списка.</div>
        )}
      </PowerTablePanel>
    </div>
  );
}
