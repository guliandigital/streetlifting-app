import { createSyncOutboxEvent, outboxPayload } from '../lib/sync-outbox.js';
import {
  protocolReviewCommand,
  correctProtocol,
  reviewSnapshotSchema,
  validateRecordEvidence,
  reweighProtocol,
  requireResolvedTies,
} from '@streetlifting/domain';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma, type Prisma } from '../lib/db.js';
import { requireAuth, type AuthenticatedUser } from '../lib/auth/middleware.js';
import { validateUuidParams } from '../lib/params.js';
import { snapshotHash } from '../lib/finalization-snapshot.js';
import { lockCompetition, CompetitionConflict } from '../lib/competition-lifecycle.js';
import { runSerializable } from '../lib/serializable.js';
import * as audit from '../lib/audit.js';

function administer(user: AuthenticatedUser | null, federationId: string) {
  return user?.roles.some(
    (r) =>
      r.role === 'platform_admin' ||
      (r.role === 'federation_admin' && r.federationId === federationId && !r.competitionId),
  );
}
function conflict(message: string): never {
  throw new CompetitionConflict('protocol_review_conflict', message);
}
function json(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonObject;
}

export const protocolReviewPlugin: FeaturePlugin = {
  name: 'protocol-review',
  register: async (app) => {
    app.addHook('preValidation', validateUuidParams(['id']));
    app.get('/health/protocol-review', async () => ({ status: 'ok', module: 'protocol-review' }));
    app.get<{ Params: { id: string } }>(
      '/competitions/:id/protocol-review',
      { preHandler: requireAuth() },
      async (req, reply) => {
        reply.header('Cache-Control', 'private, no-store');
        const competition = await prisma.competition.findUnique({ where: { id: req.params.id } });
        if (!competition)
          return reply
            .code(404)
            .send({ error: { code: 'not_found', message: 'Competition not found' } });
        if (!administer(req.user, competition.federationId))
          return reply
            .code(403)
            .send({ error: { code: 'forbidden', message: 'Federation administrator required' } });
        return prisma.$transaction(
          async (tx) => {
            const snapshots = await tx.competitionFinalizationSnapshot.findMany({
              where: { competitionId: competition.id },
              orderBy: { revision: 'desc' },
              include: {
                approval: true,
                recordReviews: { orderBy: { createdAt: 'asc' } },
                issuedDocuments: {
                  select: {
                    id: true,
                    nominationId: true,
                    version: true,
                    issuedAt: true,
                    previousDocumentId: true,
                  },
                },
              },
            });
            return { snapshots };
          },
          { isolationLevel: 'RepeatableRead' },
        );
      },
    );

    app.post<{ Params: { id: string } }>(
      '/competitions/:id/protocol-review',
      { preHandler: requireAuth() },
      async (req, reply) => {
        reply.header('Cache-Control', 'private, no-store');
        const parsed = protocolReviewCommand.safeParse(req.body);
        if (!parsed.success)
          return reply
            .code(400)
            .send({ error: { code: 'validation_error', message: parsed.error.message } });
        const command = parsed.data;
        return runSerializable(() =>
          prisma.$transaction(
            async (tx) => {
              await lockCompetition(tx, req.params.id);
              const competition = await tx.competition.findUniqueOrThrow({
                where: { id: req.params.id },
                include: { federation: { select: { isfTenantCode: true, countryCode: true } } },
              });
              if (!administer(req.user, competition.federationId))
                throw Object.assign(new Error('Federation administrator required'), {
                  statusCode: 403,
                  code: 'forbidden',
                });
              if (!['finalized', 'archived'].includes(competition.status))
                conflict('Сначала завершите турнир');
              const snapshot = await tx.competitionFinalizationSnapshot.findFirst({
                where: { competitionId: competition.id },
                orderBy: { revision: 'desc' },
                include: { approval: true },
              });
              if (!snapshot)
                conflict(
                  'Нет сохранённого протокола. Импортированный архив нельзя утвердить без исходных доказательств',
                );
              if (
                snapshotHash(snapshot.payload) !== snapshot.payloadHash ||
                snapshot.schemaVersion !== 1
              )
                conflict('Нарушена целостность снимка');
              const payload = reviewSnapshotSchema.parse(snapshot.payload);
              if (
                payload.competition.id !== competition.id ||
                payload.competition.federationId !== competition.federationId
              )
                conflict('Снимок не относится к этому турниру');
              if (snapshot.revision !== command.expectedRevision) {
                const correction = payload.correction as { requestHash?: string } | undefined;
                if (
                  ['correct', 'reweigh'].includes(command.action) &&
                  snapshot.revision === command.expectedRevision + 1 &&
                  correction?.requestHash === snapshotHash(json(command))
                )
                  return { id: snapshot.id, replayed: true };
                conflict('Версия протокола изменилась. Обновите страницу');
              }
              let result: { id: string; replayed?: boolean };
              let before: unknown = null;
              if (command.action === 'correct' || command.action === 'reweigh') {
                let corrected;
                try {
                  corrected =
                    command.action === 'correct'
                      ? correctProtocol(snapshot.payload, command)
                      : reweighProtocol(snapshot.payload, command);
                } catch (error) {
                  conflict(error instanceof Error ? error.message : 'Некорректное исправление');
                }
                const nextPayload = json({
                  ...corrected,
                  correction: { ...corrected.correction, requestHash: snapshotHash(json(command)) },
                });
                const next = await tx.competitionFinalizationSnapshot.create({
                  data: {
                    competitionId: competition.id,
                    revision: snapshot.revision + 1,
                    schemaVersion: 1,
                    createdByUserId: req.user!.id,
                    payload: nextPayload,
                    payloadHash: snapshotHash(nextPayload),
                  },
                });
                result = { id: next.id };
              } else if (command.action === 'approve') {
                if (snapshot.approval) {
                  if (
                    snapshot.approval.reason !== command.reason ||
                    snapshotHash(snapshot.approval.evidence) !==
                      snapshotHash(json(command.evidence))
                  )
                    conflict('Решение уже сохранено с другим основанием');
                  return { id: snapshot.approval.id, replayed: true };
                }
                try {
                  requireResolvedTies(payload);
                } catch (error) {
                  conflict(error instanceof Error ? error.message : 'Требуется перевзвешивание');
                }
                // A correction updates the operational projection only when explicitly approved.
                if (snapshot.revision > 1) {
                  const baseline = await tx.competitionFinalizationSnapshot.findFirstOrThrow({
                    where: {
                      competitionId: competition.id,
                      revision: { lt: snapshot.revision },
                      OR: [{ approval: { isNot: null } }, { revision: 1 }],
                    },
                    orderBy: { revision: 'desc' },
                  });
                  if (snapshotHash(baseline.payload) !== baseline.payloadHash)
                    conflict('Нарушена целостность исходной версии');
                  const original = reviewSnapshotSchema.parse(baseline.payload);
                  const currentRows = await tx.nomination.findMany({
                    where: { competitionId: competition.id },
                    include: { attempts: true },
                  });
                  if (currentRows.length !== original.nominations.length)
                    conflict('Состав протокола изменился вне процесса исправлений');
                  for (const n of payload.nominations) {
                    const current = currentRows.find((row) => row.id === n.id);
                    const baseNomination = original.nominations.find((row) => row.id === n.id);
                    if (
                      !current ||
                      !baseNomination ||
                      current.athleteId !== n.athleteId ||
                      current.disciplineId !== n.disciplineId ||
                      current.divisionId !== n.divisionId ||
                      current.weightClassId !== n.weightClassId ||
                      current.status !== n.status ||
                      current.bodyWeightAtWeighIn !== n.bodyWeightAtWeighIn
                    )
                      conflict('Связи или допуск номинации изменились вне процесса исправлений');
                    if (
                      current.finalScore !== baseNomination.finalScore ||
                      current.bestSuccessfulAttemptKg !== baseNomination.bestSuccessfulAttemptKg ||
                      current.placeInClass !== baseNomination.placeInClass ||
                      current.placeInDivision !== baseNomination.placeInDivision ||
                      current.placeOverall !== baseNomination.placeOverall
                    )
                      conflict('Итоговые места изменены вне процесса исправлений');
                    if (current.attempts.length !== baseNomination.attempts.length)
                      conflict('Состав попыток изменился');
                    for (const attempt of n.attempts) {
                      const actual = current.attempts.find((a) => a.id === attempt.id);
                      const expected = baseNomination.attempts.find((a) => a.id === attempt.id);
                      if (
                        !actual ||
                        !expected ||
                        actual.weightKg !== expected.weightKg ||
                        actual.repsCount !== expected.repsCount ||
                        actual.result !== expected.result
                      )
                        conflict('Попытка изменена вне процесса исправлений');
                      if (
                        actual.weightKg !== attempt.weightKg ||
                        actual.repsCount !== attempt.repsCount ||
                        actual.result !== attempt.result
                      )
                        await tx.attempt.update({
                          where: { id: attempt.id },
                          data: {
                            weightKg: attempt.weightKg,
                            repsCount: attempt.repsCount,
                            result: attempt.result,
                          },
                        });
                    }
                    if (
                      current.finalScore !== n.finalScore ||
                      current.bestSuccessfulAttemptKg !== n.bestSuccessfulAttemptKg ||
                      current.placeInClass !== n.placeInClass ||
                      current.placeInDivision !== n.placeInDivision ||
                      current.placeOverall !== n.placeOverall
                    )
                      await tx.nomination.update({
                        where: { id: n.id },
                        data: {
                          finalScore: n.finalScore,
                          bestSuccessfulAttemptKg: n.bestSuccessfulAttemptKg,
                          placeInClass: n.placeInClass,
                          placeInDivision: n.placeInDivision,
                          placeOverall: n.placeOverall,
                        },
                      });
                  }
                  const previous = await tx.recordReview.findMany({
                    where: {
                      snapshot: { competitionId: competition.id },
                      snapshotId: { not: snapshot.id },
                      status: { in: ['candidate', 'verified', 'ratified'] },
                    },
                  });
                  before = { supersededRecordReviews: previous };
                  for (const review of previous) {
                    if (review.recordId)
                      await tx.record.update({
                        where: { id: review.recordId },
                        data: { revokedAt: new Date() },
                      });
                    await tx.recordReview.update({
                      where: { id: review.id },
                      data: { status: 'superseded' },
                    });
                  }
                }
                const approval = await tx.protocolApproval.create({
                  data: {
                    snapshotId: snapshot.id,
                    approvedByUserId: req.user!.id,
                    evidence: json(command.evidence),
                    reason: command.reason,
                  },
                });
                const updated = await tx.competition.update({
                  where: { id: competition.id },
                  data: { updatedAt: new Date() },
                });
                await createSyncOutboxEvent(tx, {
                  eventType:
                    snapshot.revision > 1
                      ? 'competition.protocol.corrected'
                      : 'competition.updated',
                  aggregateType: 'competition',
                  aggregateId: competition.id,
                  tenant:
                    competition.federation.isfTenantCode ??
                    competition.federation.countryCode.toLowerCase(),
                  payload: outboxPayload({
                    competitionId: competition.id,
                    federationId: competition.federationId,
                    code: competition.code,
                    beforeStatus: competition.status,
                    status: updated.status,
                    changedFields: ['protocolApproval'],
                    updatedAt: updated.updatedAt.toISOString(),
                    revision: snapshot.revision,
                    payloadHash: snapshot.payloadHash,
                    approvalId: approval.id,
                  }),
                });
                result = { id: approval.id };
              } else {
                if (!snapshot.approval) conflict('Сначала утвердите эту версию протокола');
                if (command.action === 'candidates') {
                  for (const n of payload.nominations.filter(
                    (n) => n.status === 'finished' && n.finalScore !== null && n.finalScore > 0,
                  )) {
                    await tx.recordReview.upsert({
                      where: {
                        snapshotId_nominationId: { snapshotId: snapshot.id, nominationId: n.id },
                      },
                      create: { snapshotId: snapshot.id, nominationId: n.id },
                      update: {},
                    });
                  }
                  result = { id: snapshot.id };
                } else if (command.action === 'issue') {
                  const n = payload.nominations.find((n) => n.id === command.nominationId);
                  if (!n || n.status !== 'finished')
                    conflict('Выписка доступна для завершённой номинации');
                  const existing = await tx.issuedResultDocument.findUnique({
                    where: {
                      snapshotId_nominationId: { snapshotId: snapshot.id, nominationId: n.id },
                    },
                  });
                  if (existing) return { id: existing.id, replayed: true };
                  const previous = await tx.issuedResultDocument.findFirst({
                    where: { nominationId: n.id },
                    orderBy: { version: 'desc' },
                  });
                  const federation = await tx.federation.findUniqueOrThrow({
                    where: { id: competition.federationId },
                  });
                  const documentPayload = json({
                    templateVersion: 1,
                    title: 'Выписка из утверждённого протокола',
                    federationName: federation.nameRu,
                    competition: payload.competition,
                    nomination: n,
                    snapshotHash: snapshot.payloadHash,
                    protocolRevision: snapshot.revision,
                    approvalId: snapshot.approval.id,
                  });
                  const document = await tx.issuedResultDocument.create({
                    data: {
                      snapshotId: snapshot.id,
                      nominationId: n.id,
                      athleteId: n.athleteId,
                      version: (previous?.version ?? 0) + 1,
                      previousDocumentId: previous?.id ?? null,
                      issuedByUserId: req.user!.id,
                      reason: command.reason,
                      payload: documentPayload,
                      payloadHash: snapshotHash(documentPayload),
                    },
                  });
                  result = { id: document.id };
                } else {
                  const review = await tx.recordReview.findUnique({
                    where: { id: command.candidateId },
                  });
                  if (!review || review.snapshotId !== snapshot.id)
                    conflict('Кандидат относится к другой версии');
                  before = review;
                  if (command.action === 'review') {
                    if (command.decision === 'verified') {
                      const n = payload.nominations.find((n) => n.id === review.nominationId)!;
                      try {
                        validateRecordEvidence(
                          n.discipline.format,
                          n.finalScore ?? 0,
                          command.evidence,
                        );
                      } catch (error) {
                        conflict(
                          error instanceof Error ? error.message : 'Недостаточно доказательств',
                        );
                      }
                    }
                    if (
                      review.status === command.decision &&
                      review.reviewReason === command.reason &&
                      snapshotHash(review.evidence) ===
                        snapshotHash(command.evidence ? json(command.evidence) : null)
                    )
                      return { id: review.id, replayed: true };
                    if (!['candidate', 'verified'].includes(review.status))
                      conflict('Решение по кандидату уже принято');
                    await tx.recordReview.update({
                      where: { id: review.id },
                      data: {
                        status: command.decision,
                        reviewReason: command.reason,
                        ...(command.evidence ? { evidence: json(command.evidence) } : {}),
                        reviewedByUserId: req.user!.id,
                        reviewedAt: new Date(),
                      },
                    });
                    result = { id: review.id };
                  } else {
                    if (review.status === 'ratified')
                      return { id: review.recordId!, replayed: true };
                    if (review.status !== 'verified')
                      conflict('Сначала проверьте кандидата и укажите основание');
                    const n = payload.nominations.find((n) => n.id === review.nominationId)!;
                    if (n.status !== 'finished' || n.finalScore === null || n.finalScore <= 0)
                      conflict('Нет результата для ратификации');
                    try {
                      validateRecordEvidence(n.discipline.format, n.finalScore, review.evidence);
                    } catch (error) {
                      conflict(
                        error instanceof Error ? error.message : 'Недостаточно доказательств',
                      );
                    }
                    // Only federation scope is authorized here. No automatic world/national claim.
                    const key = {
                      scope: 'federation' as const,
                      federationId: competition.federationId,
                      disciplineId: n.disciplineId,
                      divisionId: n.divisionId,
                      weightClassId: n.weightClassId,
                    };
                    const existing = await tx.record.findFirst({
                      where: key,
                      include: { reviews: true },
                    });
                    if (
                      existing &&
                      (!existing.revokedAt ||
                        !existing.reviews.some(
                          (r) => r.status === 'superseded' && r.nominationId === n.id,
                        ))
                    )
                      conflict(
                        'В этой категории уже есть запись. Исторический реестр не заменяется автоматически',
                      );
                    const values = {
                      ...key,
                      athleteId: n.athleteId,
                      competitionId: competition.id,
                      result: n.finalScore,
                      pointsScore: null,
                      achievedOn: new Date(command.achievedOn),
                      ratifiedAt: new Date(),
                      ratifiedByUserId: req.user!.id,
                      revokedAt: null,
                      notes: command.reason,
                    };
                    if (
                      command.achievedOn < payload.competition.startDate.slice(0, 10) ||
                      command.achievedOn > payload.competition.endDate.slice(0, 10)
                    )
                      conflict('Дата выступления вне дат турнира');
                    const record = existing
                      ? await tx.record.update({ where: { id: existing.id }, data: values })
                      : await tx.record.create({ data: values });
                    before = { review, record: existing };
                    await tx.recordReview.update({
                      where: { id: review.id },
                      data: {
                        status: 'ratified',
                        ratificationReason: command.reason,
                        recordId: record.id,
                      },
                    });
                    result = { id: record.id };
                  }
                }
              }
              await audit.record(
                {
                  ...audit.fromRequest(req),
                  actorUserId: req.user!.id,
                  action: `competition.protocol.${command.action}`,
                  result: 'success',
                  scopeFederationId: competition.federationId,
                  scopeCompetitionId: competition.id,
                  targetType: 'protocol_revision',
                  targetId: snapshot.id,
                  before,
                  after: { command, result, payloadHash: snapshot.payloadHash },
                  notes: command.reason,
                },
                tx,
              );
              return result;
            },
            { isolationLevel: 'Serializable', timeout: 30000 },
          ),
        );
      },
    );
  },
};
