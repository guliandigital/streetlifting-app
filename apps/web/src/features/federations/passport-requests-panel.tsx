import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from '@streetlifting/ui';
import { api } from '../../lib/api-client.js';
import {
  WorkspaceButton,
  WorkspacePanel,
  WorkspaceSectionTitle,
} from '../../components/workspace.js';
import type { PassportFederationReviewRequest } from '../profile/api.js';

type ResolutionDraft = {
  note: string;
  function:
    | 'judge'
    | 'secretary'
    | 'assistant'
    | 'scoreboard_operator'
    | 'speaker'
    | 'technical_official';
  credentialKind: 'category' | 'attestation' | 'certificate';
  name: string;
  basis: string;
  issuedAt: string;
  expiresAt: string;
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function initialDraft(): ResolutionDraft {
  return {
    note: '',
    function: 'judge',
    credentialKind: 'attestation',
    name: '',
    basis: '',
    issuedAt: today(),
    expiresAt: '',
  };
}

function resolutionFor(
  request: PassportFederationReviewRequest,
  draft: ResolutionDraft,
): Record<string, unknown> {
  if (request.kind === 'official_profile') return { functions: [draft.function] };
  if (request.kind === 'official_credential') {
    return {
      kind: draft.credentialKind,
      name: draft.name.trim(),
      issuedAt: draft.issuedAt,
      expiresAt: draft.expiresAt || null,
    };
  }
  return {
    name: draft.name.trim(),
    basis: draft.basis.trim(),
    issuedAt: draft.issuedAt,
    expiresAt: draft.expiresAt || null,
  };
}

export function PassportRequestsPanel({ federationId }: { federationId: string }) {
  const qc = useQueryClient();
  const requests = useQuery({
    queryKey: ['passport', 'federations', federationId, 'review-requests'],
    queryFn: () => api.passport.federationReviewRequests(federationId),
  });
  const [drafts, setDrafts] = useState<Record<string, ResolutionDraft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  function draftFor(id: string): ResolutionDraft {
    return drafts[id] ?? initialDraft();
  }

  function updateDraft(id: string, patch: Partial<ResolutionDraft>): void {
    setDrafts((current) => ({ ...current, [id]: { ...draftFor(id), ...patch } }));
  }

  async function downloadDocument(id: string): Promise<void> {
    try {
      const blob = await api.passport.downloadAttachment(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = '';
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось открыть документ');
    }
  }

  async function resolve(
    request: PassportFederationReviewRequest,
    status: 'approved' | 'rejected',
  ): Promise<void> {
    const draft = draftFor(request.id);
    if (
      status === 'approved' &&
      request.kind !== 'official_profile' &&
      (!draft.name.trim() || (request.kind === 'sport_rank' && !draft.basis.trim()))
    ) {
      toast.error('Заполните итоговые данные федерации');
      return;
    }
    setBusyId(request.id);
    try {
      await api.passport.reviewRequest(request.id, {
        status,
        ...(draft.note.trim() ? { reviewNote: draft.note.trim() } : {}),
        ...(status === 'approved' ? { resolution: resolutionFor(request, draft) } : {}),
      });
      await qc.invalidateQueries({ queryKey: ['passport', 'federations', federationId] });
      toast.success(status === 'approved' ? 'Заявка одобрена' : 'Заявка отклонена');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Не удалось рассмотреть заявку');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <WorkspacePanel className="p-3">
      <WorkspaceSectionTitle>Заявки на паспорт</WorkspaceSectionTitle>
      {requests.isLoading ? <p className="pt-muted mt-2">Загрузка…</p> : null}
      {requests.data?.requests.length === 0 ? (
        <p className="pt-muted mt-2">Нет заявок, ожидающих рассмотрения.</p>
      ) : null}
      <div className="mt-3 space-y-3">
        {requests.data?.requests.map((request) => {
          const draft = draftFor(request.id);
          return (
            <div key={request.id} className="rounded border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong>{request.applicant.displayName}</strong>
                <span className="pt-muted">{request.kind}</span>
              </div>
              {request.payload ? (
                <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-muted p-2 text-xs">
                  {JSON.stringify(request.payload, null, 2)}
                </pre>
              ) : null}
              {request.supportingAttachment ? (
                <WorkspaceButton
                  type="button"
                  className="mt-2"
                  onClick={() => void downloadDocument(request.supportingAttachment!.id)}
                >
                  Документ: {request.supportingAttachment.filename}
                </WorkspaceButton>
              ) : null}
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {request.kind === 'official_profile' ? (
                  <label className="pt-label">
                    Функция
                    <select
                      className="pt-field mt-1 w-full"
                      value={draft.function}
                      onChange={(event) =>
                        updateDraft(request.id, {
                          function: event.target.value as ResolutionDraft['function'],
                        })
                      }
                    >
                      <option value="judge">Судья</option>
                      <option value="secretary">Секретарь</option>
                      <option value="assistant">Ассистент</option>
                      <option value="scoreboard_operator">Оператор табло</option>
                      <option value="speaker">Ведущий</option>
                      <option value="technical_official">Технический специалист</option>
                    </select>
                  </label>
                ) : (
                  <>
                    <label className="pt-label">
                      {request.kind === 'sport_rank' ? 'Звание или разряд' : 'Наименование'}
                      <input
                        className="pt-field mt-1 w-full"
                        value={draft.name}
                        onChange={(event) => updateDraft(request.id, { name: event.target.value })}
                      />
                    </label>
                    {request.kind === 'official_credential' ? (
                      <label className="pt-label">
                        Вид
                        <select
                          className="pt-field mt-1 w-full"
                          value={draft.credentialKind}
                          onChange={(event) =>
                            updateDraft(request.id, {
                              credentialKind: event.target
                                .value as ResolutionDraft['credentialKind'],
                            })
                          }
                        >
                          <option value="attestation">Аттестация</option>
                          <option value="category">Категория</option>
                          <option value="certificate">Сертификат</option>
                        </select>
                      </label>
                    ) : (
                      <label className="pt-label">
                        Основание
                        <input
                          className="pt-field mt-1 w-full"
                          value={draft.basis}
                          onChange={(event) =>
                            updateDraft(request.id, { basis: event.target.value })
                          }
                        />
                      </label>
                    )}
                    <label className="pt-label">
                      Дата выдачи
                      <input
                        className="pt-field mt-1 w-full"
                        type="date"
                        value={draft.issuedAt}
                        onChange={(event) =>
                          updateDraft(request.id, { issuedAt: event.target.value })
                        }
                      />
                    </label>
                    <label className="pt-label">
                      Действует до
                      <input
                        className="pt-field mt-1 w-full"
                        type="date"
                        value={draft.expiresAt}
                        onChange={(event) =>
                          updateDraft(request.id, { expiresAt: event.target.value })
                        }
                      />
                    </label>
                  </>
                )}
                <label className="pt-label md:col-span-2">
                  Комментарий федерации
                  <textarea
                    className="pt-field mt-1 min-h-20 w-full"
                    value={draft.note}
                    onChange={(event) => updateDraft(request.id, { note: event.target.value })}
                    maxLength={1000}
                  />
                </label>
              </div>
              <div className="mt-2 flex gap-2">
                <WorkspaceButton
                  type="button"
                  tone="green"
                  disabled={busyId === request.id}
                  onClick={() => void resolve(request, 'approved')}
                >
                  Одобрить
                </WorkspaceButton>
                <WorkspaceButton
                  type="button"
                  disabled={busyId === request.id}
                  onClick={() => void resolve(request, 'rejected')}
                >
                  Отклонить
                </WorkspaceButton>
              </div>
            </div>
          );
        })}
      </div>
    </WorkspacePanel>
  );
}
