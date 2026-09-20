import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { reviewSnapshotSchema, type ProtocolReviewCommand } from '@streetlifting/domain';
import { api } from '../../lib/api-client.js';
import { WorkspaceButton, WorkspacePanel } from '../../components/workspace.js';

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const statuses: Record<string, string> = {
  candidate: 'Кандидат — не рекорд',
  verified: 'Проверен',
  ratified: 'Ратифицирован',
  rejected: 'Отклонён',
  superseded: 'Нужна повторная проверка',
};

export function FinalizationSnapshotPanel({ id }: { id: string }) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ['protocol-review', id],
    queryFn: () => api.competitions.reviewProtocol(id),
    gcTime: 0,
  });
  const [selectedRevision, setSelectedRevision] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const snapshots = query.data?.snapshots ?? [];
  const snapshot = snapshots.find((s) => s.revision === selectedRevision) ?? snapshots[0];
  const parsed = snapshot ? reviewSnapshotSchema.safeParse(snapshot.payload) : null;
  const data = parsed?.success ? parsed.data : null;
  const current = snapshot?.id === snapshots[0]?.id;
  const locked = busy || reason.trim().length < 10 || !current;
  async function act(command: ProtocolReviewCommand) {
    setBusy(true);
    setError('');
    try {
      await api.competitions.decideProtocol(id, command);
      setSelectedRevision(null);
      await Promise.all([
        query.refetch(),
        cache.invalidateQueries({ queryKey: ['competitions', id] }),
        cache.invalidateQueries({ queryKey: ['competition-protocol', id] }),
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось сохранить решение');
    } finally {
      setBusy(false);
    }
  }
  async function getDocument(documentId: string, version: number) {
    try {
      download(
        await api.competitions.issuedDocument(documentId),
        `result-${documentId}-v${version}.html`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось получить документ');
    }
  }
  return (
    <WorkspacePanel className="space-y-3 p-3" data-testid="finalization-snapshot-panel">
      <h2 className="font-semibold">Протокол, рекорды и документы</h2>
      {query.isPending ? (
        <p>Загрузка…</p>
      ) : query.error ? (
        <p role="alert">
          Не удалось загрузить протокол.{' '}
          <button type="button" onClick={() => void query.refetch()}>
            Повторить
          </button>
        </p>
      ) : !snapshot ? (
        <p>
          Снимок не сохранён. Архив нельзя утвердить по текущим справочникам без исходных
          доказательств.
        </p>
      ) : (
        <>
          <label>
            История версий{' '}
            <select
              className="pt-input"
              value={snapshot.revision}
              onChange={(e) => setSelectedRevision(Number(e.target.value))}
            >
              {snapshots.map((s) => (
                <option key={s.id} value={s.revision}>
                  Версия {s.revision} · {s.approval ? 'утверждена' : 'ожидает утверждения'}
                </option>
              ))}
            </select>
          </label>
          <p>
            Версия {snapshot.revision} · {new Date(snapshot.createdAt).toLocaleString('ru-RU')}
          </p>
          <p>
            {snapshot.approval
              ? `Утверждено ${new Date(snapshot.approval.approvedAt).toLocaleString('ru-RU')}. Основание: ${snapshot.approval.reason}`
              : 'Официальное утверждение федерацией не зарегистрировано.'}
          </p>
          {!current && (
            <p>Историческая версия. Новые решения доступны только для последней версии.</p>
          )}
          <WorkspaceButton
            type="button"
            data-testid="download-finalization-snapshot"
            onClick={() =>
              download(
                new Blob(
                  [
                    JSON.stringify(
                      { snapshot, approvalStatus: snapshot.approval ? 'approved' : 'not_recorded' },
                      null,
                      2,
                    ),
                  ],
                  { type: 'application/json' },
                ),
                `competition-${id}-snapshot-r${snapshot.revision}.json`,
              )
            }
          >
            Скачать сохранённый результат
          </WorkspaceButton>
          {!data ? (
            <p role="alert">Неизвестный формат снимка. Решения недоступны.</p>
          ) : (
            <>
              <label className="block">
                Основание решения / ссылка на регламент или реестр
                <textarea
                  className="pt-input block w-full"
                  data-testid="protocol-decision-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={2000}
                  rows={2}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {!snapshot.approval && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void act({
                        action: 'approve',
                        expectedRevision: snapshot.revision,
                        reason,
                        evidence: {
                          signedProtocolReference: String(f.get('signedProtocolReference')),
                          headJudgeSigned: true,
                          chiefSecretarySigned: true,
                        },
                      });
                    }}
                    className="space-y-2"
                  >
                    <ReferenceInput
                      name="signedProtocolReference"
                      label="Подписанный протокол (§9.4)"
                    />
                    <label className="block">
                      <input type="checkbox" required name="headJudgeSigned" /> Заверен главным
                      судьёй потока
                    </label>
                    <label className="block">
                      <input type="checkbox" required name="chiefSecretarySigned" /> Заверен главным
                      секретарём
                    </label>
                    <WorkspaceButton type="submit" disabled={locked} data-testid="approve-protocol">
                      Утвердить протокол
                    </WorkspaceButton>
                  </form>
                )}
                {snapshot.approval && (
                  <WorkspaceButton
                    type="button"
                    disabled={locked}
                    data-testid="prepare-record-candidates"
                    onClick={() =>
                      void act({
                        action: 'candidates',
                        expectedRevision: snapshot.revision,
                        reason,
                      })
                    }
                  >
                    Подготовить кандидатов в рекорды
                  </WorkspaceButton>
                )}
              </div>
              <p className="pt-muted">
                Кандидат не признаётся рекордом автоматически. Администратор проверяет регламент и
                действующий реестр, затем отдельно ратифицирует рекорд федерации. Признание в
                центральном реестре ISF требует отдельной верификации ISF (§7.7.5, §10.4).
              </p>
              <div className="overflow-x-auto">
                <table className="pt-grid">
                  <thead>
                    <tr>
                      <th>Спортсмен / номинация</th>
                      <th>Результат</th>
                      <th>Рекорд федерации</th>
                      <th>Документы</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.nominations.map((n) => {
                      const candidate = snapshot.recordReviews.find((r) => r.nominationId === n.id);
                      const document = snapshot.issuedDocuments.find(
                        (d) => d.nominationId === n.id,
                      );
                      return (
                        <tr key={n.id}>
                          <td>
                            {n.athlete.lastName} {n.athlete.firstName}
                            <br />
                            {n.discipline.nameRu} / {n.weightClass.nameRu}
                          </td>
                          <td>{n.finalScore ?? '—'}</td>
                          <td>
                            {candidate ? (
                              <>
                                <div>{statuses[candidate.status] ?? candidate.status}</div>
                                {candidate.reviewReason && (
                                  <p className="text-xs">{candidate.reviewReason}</p>
                                )}
                                {candidate.status === 'candidate' && (
                                  <div className="flex flex-wrap gap-1">
                                    <RecordEvidenceForm
                                      disabled={locked}
                                      submit={(evidence) =>
                                        act({
                                          action: 'review',
                                          expectedRevision: snapshot.revision,
                                          candidateId: candidate.id,
                                          decision: 'verified',
                                          reason,
                                          evidence,
                                        })
                                      }
                                    />
                                    <WorkspaceButton
                                      disabled={locked}
                                      onClick={() =>
                                        void act({
                                          action: 'review',
                                          expectedRevision: snapshot.revision,
                                          candidateId: candidate.id,
                                          decision: 'rejected',
                                          reason,
                                        })
                                      }
                                    >
                                      Отклонить
                                    </WorkspaceButton>
                                  </div>
                                )}
                                {candidate.status === 'verified' && (
                                  <form
                                    onSubmit={(e) => {
                                      e.preventDefault();
                                      const values = new FormData(e.currentTarget);
                                      void act({
                                        action: 'ratify',
                                        expectedRevision: snapshot.revision,
                                        candidateId: candidate.id,
                                        achievedOn: String(values.get('achievedOn')),
                                        reason,
                                      });
                                    }}
                                  >
                                    <label>
                                      Дата выступления{' '}
                                      <input
                                        className="pt-input"
                                        name="achievedOn"
                                        type="date"
                                        required
                                        min={data.competition.startDate.slice(0, 10)}
                                        max={data.competition.endDate.slice(0, 10)}
                                        defaultValue={data.competition.startDate.slice(0, 10)}
                                      />
                                    </label>
                                    <WorkspaceButton type="submit" disabled={locked}>
                                      Ратифицировать
                                    </WorkspaceButton>
                                  </form>
                                )}
                              </>
                            ) : (
                              'Кандидат не создан'
                            )}
                          </td>
                          <td>
                            {document ? (
                              <WorkspaceButton
                                onClick={() => void getDocument(document.id, document.version)}
                              >
                                Скачать версию {document.version}
                              </WorkspaceButton>
                            ) : snapshot.approval && n.status === 'finished' ? (
                              <WorkspaceButton
                                disabled={locked}
                                onClick={() =>
                                  void act({
                                    action: 'issue',
                                    expectedRevision: snapshot.revision,
                                    nominationId: n.id,
                                    reason,
                                  })
                                }
                              >
                                Выдать выписку
                              </WorkspaceButton>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {current && data.calculationVersion === 'competition-scoring-v2' && (
                <details>
                  <summary>Перевзвешивание при равных результатах (§7.10)</summary>
                  <p>
                    Введите вес всех участников с одинаковыми результатом и исходным весом. Исходное
                    взвешивание сохранится; места пересчитаются в новой версии.
                  </p>
                  <form
                    key={snapshot.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      const weights = data.nominations
                        .filter((n) => f.get(n.id))
                        .map((n) => ({ nominationId: n.id, weightKg: Number(f.get(n.id)) }));
                      void act({
                        action: 'reweigh',
                        expectedRevision: snapshot.revision,
                        reason,
                        sourceReference: String(f.get('sourceReference')),
                        weights,
                      });
                    }}
                  >
                    <ReferenceInput name="sourceReference" label="Протокол перевзвешивания" />
                    {data.nominations
                      .filter((n) => n.status === 'finished')
                      .map((n) => (
                        <label className="block" key={n.id}>
                          {n.athlete.lastName} {n.athlete.firstName} · {n.discipline.nameRu} ·{' '}
                          {n.finalScore} · исходный вес {n.bodyWeightAtWeighIn}
                          <input
                            className="pt-input"
                            name={n.id}
                            type="number"
                            min="0.01"
                            max="500"
                            step="0.01"
                            defaultValue={n.reweighWeightKg ?? ''}
                          />
                        </label>
                      ))}
                    <WorkspaceButton type="submit" disabled={locked}>
                      Сохранить перевзвешивание
                    </WorkspaceButton>
                  </form>
                </details>
              )}
              {current && (
                <details>
                  <summary>Исправить попытку отдельной ревизией</summary>
                  <p>
                    Только исправление ошибки переноса из заверенного первоисточника. Апелляция не
                    изменяет исходную оценку (§7.9.6). Исходный протокол сохранится. Новая версия
                    потребует утверждения; после него связанные рекорды потребуют повторной
                    проверки, а выданные документы останутся в истории.
                  </p>
                  <CorrectionForm
                    key={snapshot.id}
                    data={data}
                    disabled={locked}
                    submit={(fields) =>
                      act({
                        action: 'correct',
                        expectedRevision: snapshot.revision,
                        reason,
                        ...fields,
                      })
                    }
                  />
                </details>
              )}
            </>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </WorkspacePanel>
  );
}

function CorrectionForm({
  data,
  disabled,
  submit,
}: {
  data: ReturnType<typeof reviewSnapshotSchema.parse>;
  disabled: boolean;
  submit: (
    fields: Pick<
      Extract<ProtocolReviewCommand, { action: 'correct' }>,
      | 'nominationId'
      | 'attemptId'
      | 'weightKg'
      | 'repsCount'
      | 'result'
      | 'sourceReference'
      | 'clericalCorrectionOnly'
    >,
  ) => Promise<void>;
}) {
  const [attemptId, setAttemptId] = useState('');
  const nomination = data.nominations.find((n) => n.attempts.some((a) => a.id === attemptId));
  const attempt = nomination?.attempts.find((a) => a.id === attemptId);
  return (
    <div className="space-y-2">
      <label>
        Попытка{' '}
        <select
          className="pt-input"
          value={attemptId}
          onChange={(e) => setAttemptId(e.target.value)}
        >
          <option value="">Выберите попытку</option>
          {data.nominations.flatMap((n) =>
            n.attempts.map((a) => (
              <option key={a.id} value={a.id}>
                {n.athlete.lastName} · {n.discipline.nameRu} ·{' '}
                {n.discipline.components.find((c) => c.id === a.componentId)?.code ?? 'основное'} ·{' '}
                {a.attemptNumber}
              </option>
            )),
          )}
        </select>
      </label>
      {attempt && nomination && (
        <form
          key={attempt.id}
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void submit({
              sourceReference: String(f.get('sourceReference')),
              clericalCorrectionOnly: true,
              nominationId: nomination.id,
              attemptId: attempt.id,
              weightKg: Number(f.get('weight')),
              repsCount: f.get('reps') === '' ? null : Number(f.get('reps')),
              result: String(f.get('result')) as 'good_lift' | 'no_lift' | 'withdrawn',
            });
          }}
        >
          <label>
            Вес, кг{' '}
            <input
              className="pt-input"
              name="weight"
              type="number"
              min="0"
              max="1000"
              step="0.01"
              required
              defaultValue={attempt.weightKg}
            />
          </label>
          <label>
            Повторения / время{' '}
            <input
              className="pt-input"
              name="reps"
              type="number"
              min="0"
              max="10000"
              step="1"
              defaultValue={attempt.repsCount ?? ''}
            />
          </label>
          <label>
            Решение{' '}
            <select className="pt-input" name="result" defaultValue={attempt.result}>
              <option value="good_lift">Зачёт</option>
              <option value="no_lift">Незачёт</option>
              <option value="withdrawn">Отказ</option>
            </select>
          </label>
          <ReferenceInput name="sourceReference" label="Заверенный первоисточник исправления" />
          <label>
            <input type="checkbox" required /> Это ошибка переноса, а не пересмотр судейской оценки
          </label>
          <WorkspaceButton type="submit" disabled={disabled}>
            Сохранить новую ревизию
          </WorkspaceButton>
        </form>
      )}
    </div>
  );
}

function ReferenceInput({ name, label }: { name: string; label: string }) {
  return (
    <label className="block">
      {label}
      <input className="pt-input block" name={name} required minLength={3} maxLength={2000} />
    </label>
  );
}
function RecordEvidenceForm({
  disabled,
  submit,
}: {
  disabled: boolean;
  submit: (
    evidence: NonNullable<Extract<ProtocolReviewCommand, { action: 'review' }>['evidence']>,
  ) => Promise<void>;
}) {
  return (
    <details>
      <summary>Проверить доказательства рекорда</summary>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void submit({
            sanctionReference: String(f.get('sanctionReference')),
            judgingReference: String(f.get('judgingReference')),
            weightReference: String(f.get('weightReference')),
            equipmentReference: String(f.get('equipmentReference')),
            videoReference: String(f.get('videoReference')),
            registryReference: String(f.get('registryReference')),
            previousBest: f.get('previousBest') === '' ? null : Number(f.get('previousBest')),
            categoryAndAttemptEligibilityConfirmed: true,
          });
        }}
      >
        <ReferenceInput name="sanctionReference" label="Санкционирование турнира" />
        <ReferenceInput name="judgingReference" label="Судейский протокол и квалификация судей" />
        <ReferenceInput name="weightReference" label="Подтверждение веса и взвешивания" />
        <ReferenceInput name="equipmentReference" label="Проверка оборудования" />
        <ReferenceInput name="videoReference" label="Фронтальная видеозапись" />
        <ReferenceInput name="registryReference" label="Реестр рекордов: категория и дата сверки" />
        <label className="block">
          Предыдущий рекорд (пусто — первый в категории)
          <input className="pt-input" name="previousBest" type="number" min="0" step="0.01" />
        </label>
        <label className="block">
          <input type="checkbox" required /> Проверены категория, допустимость попытки и первенство
          результата (§7.7)
        </label>
        <WorkspaceButton type="submit" disabled={disabled}>
          Проверен
        </WorkspaceButton>
      </form>
    </details>
  );
}
