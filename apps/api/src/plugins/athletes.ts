import { AthleteCreate, AthleteUpdate, AthleteListQuery } from '@streetlifting/domain';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma } from '../lib/db.js';
import type { Prisma } from '../lib/db.js';
import { moduleLogger } from '../lib/logger.js';
import * as audit from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth/middleware.js';
import { validateUuidParams } from '../lib/params.js';

const log = moduleLogger('athletes');

/**
 * Strip undefined keys before passing to Prisma —
 * `exactOptionalPropertyTypes` forbids `key: undefined`.
 */
function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export const athletesPlugin: FeaturePlugin = {
  name: 'athletes',
  register: async (app) => {
    app.addHook('preHandler', validateUuidParams(['id']));

    app.get('/health/athletes', async () => ({ status: 'ok', module: 'athletes' }));

    // ─── List + search ─────────────────────────────────────────────────
    app.get('/athletes', { preHandler: requireAuth() }, async (req, reply) => {
      const parsed = AthleteListQuery.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: parsed.error.message,
            requestId: req.requestId,
          },
        });
      }
      const { search, limit, offset } = parsed.data;

      const where: Prisma.AthleteWhereInput = search
        ? {
            OR: [
              { lastName: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { middleName: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {};

      const [athletes, total] = await Promise.all([
        prisma.athlete.findMany({
          where,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          take: limit,
          skip: offset,
        }),
        prisma.athlete.count({ where }),
      ]);

      return { athletes, total, limit, offset };
    });

    // ─── Get one ──────────────────────────────────────────────────────
    app.get<{ Params: { id: string } }>(
      '/athletes/:id',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const athlete = await prisma.athlete.findUnique({ where: { id: req.params.id } });
        if (!athlete) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        }
        return { athlete };
      },
    );

    // ─── Appearances (cross-meet competition history) ─────────────────
    app.get<{ Params: { id: string } }>(
      '/athletes/:id/appearances',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const exists = await prisma.athlete.findUnique({
          where: { id: req.params.id },
          select: { id: true },
        });
        if (!exists) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        }
        const nominations = await prisma.nomination.findMany({
          where: { athleteId: req.params.id },
          include: {
            competition: {
              select: { id: true, nameRu: true, startDate: true, city: true },
            },
            discipline: { select: { code: true, nameRu: true } },
            division: { select: { code: true, nameRu: true } },
            weightClass: { select: { code: true, nameRu: true } },
          },
          orderBy: [{ competition: { startDate: 'desc' } }],
        });
        const appearances = nominations.map((n) => ({
          id: n.id,
          competitionId: n.competitionId,
          competitionName: n.competition.nameRu,
          competitionStartDate: n.competition.startDate.toISOString(),
          competitionCity: n.competition.city,
          disciplineCode: n.discipline.code,
          disciplineName: n.discipline.nameRu,
          divisionCode: n.division.code,
          divisionName: n.division.nameRu,
          weightClassCode: n.weightClass.code,
          weightClassName: n.weightClass.nameRu,
          bodyWeightAtWeighIn: n.bodyWeightAtWeighIn,
          bestSuccessfulAttemptKg: n.bestSuccessfulAttemptKg,
          finalScore: n.finalScore,
          placeOverall: n.placeOverall,
          placeInDivision: n.placeInDivision,
          placeInClass: n.placeInClass,
          status: n.status,
        }));
        return { appearances, total: appearances.length };
      },
    );

    // ─── Records (federation/national/continental/world held by athlete) ──
    app.get<{ Params: { id: string } }>(
      '/athletes/:id/records',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const exists = await prisma.athlete.findUnique({
          where: { id: req.params.id },
          select: { id: true },
        });
        if (!exists) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        }
        const records = await prisma.record.findMany({
          where: { athleteId: req.params.id },
          include: {
            discipline: { select: { code: true, nameRu: true } },
            division: { select: { code: true, nameRu: true } },
            weightClass: { select: { code: true, nameRu: true } },
            competition: { select: { id: true, nameRu: true } },
          },
          orderBy: [{ achievedOn: 'desc' }],
        });
        const items = records.map((r) => ({
          id: r.id,
          scope: r.scope,
          achievedOn: r.achievedOn.toISOString(),
          disciplineCode: r.discipline.code,
          disciplineName: r.discipline.nameRu,
          divisionCode: r.division.code,
          divisionName: r.division.nameRu,
          weightClassCode: r.weightClass.code,
          weightClassName: r.weightClass.nameRu,
          result: r.result,
          pointsScore: r.pointsScore,
          competitionId: r.competitionId,
          competitionName: r.competition.nameRu,
          ratifiedAt: r.ratifiedAt ? r.ratifiedAt.toISOString() : null,
        }));
        return { records: items, total: items.length };
      },
    );

    // ─── Documents (attachments linked to athlete) ─────────────────────
    app.get<{ Params: { id: string } }>(
      '/athletes/:id/documents',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const exists = await prisma.athlete.findUnique({
          where: { id: req.params.id },
          select: { id: true },
        });
        if (!exists) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        }
        const attachments = await prisma.attachment.findMany({
          where: { athleteId: req.params.id, deletedAt: null },
          select: {
            id: true,
            kind: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
            uploadedAt: true,
          },
          orderBy: [{ uploadedAt: 'desc' }],
        });
        const documents = attachments.map((a) => ({
          id: a.id,
          kind: a.kind,
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes.toString(),
          uploadedAt: a.uploadedAt.toISOString(),
        }));
        return { documents, total: documents.length };
      },
    );

    // ─── Create ───────────────────────────────────────────────────────
    // V1: platform_admin only. M3 will add a public registration flow
    // gated by federation invite + 152-ФЗ consent capture.
    app.post('/athletes', { preHandler: requireRole('platform_admin') }, async (req, reply) => {
      const parsed = AthleteCreate.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: parsed.error.message,
            requestId: req.requestId,
          },
        });
      }
      const data = parsed.data;

      const athlete = await audit.withAudit(
        {
          ...audit.fromRequest(req),
          actorUserId: req.user!.id,
          action: 'athlete.created',
          scopeFederationId: null,
          scopeCompetitionId: null,
          targetType: 'athlete',
          targetId: '00000000-0000-0000-0000-000000000000',
          before: null,
          after: {
            lastName: data.lastName,
            firstName: data.firstName,
            dateOfBirth: data.dateOfBirth,
          },
        },
        (tx) =>
          tx.athlete.create({
            data: {
              lastName: data.lastName,
              firstName: data.firstName,
              ...(data.middleName !== undefined && { middleName: data.middleName }),
              dateOfBirth: new Date(data.dateOfBirth),
              gender: data.gender,
              countryCode: data.countryCode.toUpperCase(),
              ...(data.regionCode !== undefined && { regionCode: data.regionCode }),
              ...(data.city !== undefined && { city: data.city }),
              ...(data.coachName !== undefined && { coachName: data.coachName }),
              ...(data.clubName !== undefined && { clubName: data.clubName }),
              ...(data.federationCardNumber !== undefined && {
                federationCardNumber: data.federationCardNumber,
              }),
            },
          }),
      );

      log.info({ athleteId: athlete.id }, 'athlete created');
      return reply.code(201).send({ athlete });
    });

    // ─── Update ───────────────────────────────────────────────────────
    app.patch<{ Params: { id: string } }>(
      '/athletes/:id',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = AthleteUpdate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const before = await prisma.athlete.findUnique({ where: { id: req.params.id } });
        if (!before) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        }

        const updateData = stripUndefined(parsed.data) as Prisma.AthleteUpdateInput;
        // dateOfBirth comes in as a string; Prisma wants a Date
        if (typeof updateData.dateOfBirth === 'string') {
          updateData.dateOfBirth = new Date(updateData.dateOfBirth);
        }
        if (typeof updateData.countryCode === 'string') {
          updateData.countryCode = updateData.countryCode.toUpperCase();
        }

        const updated = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'athlete.updated',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'athlete',
            targetId: req.params.id,
            before: { ...before, dateOfBirth: before.dateOfBirth.toISOString() },
            after: parsed.data,
          },
          (tx) => tx.athlete.update({ where: { id: req.params.id }, data: updateData }),
        );
        return { athlete: updated };
      },
    );
  },
};
