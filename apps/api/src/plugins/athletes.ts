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
        const athlete = await prisma.athlete.findUnique({
          where: { id: req.params.id },
          include: {
            nominations: {
              include: {
                competition: {
                  select: {
                    id: true,
                    code: true,
                    nameRu: true,
                    startDate: true,
                    endDate: true,
                    city: true,
                    status: true,
                    federation: { select: { id: true, code: true, nameRu: true } },
                  },
                },
                discipline: { select: { id: true, code: true, nameRu: true, nameEn: true } },
                division: {
                  select: {
                    id: true,
                    code: true,
                    nameRu: true,
                    nameEn: true,
                    gender: true,
                    veteranTier: true,
                  },
                },
                weightClass: {
                  select: {
                    id: true,
                    code: true,
                    nameRu: true,
                    nameEn: true,
                    weightMin: true,
                    weightMax: true,
                  },
                },
                attempts: {
                  orderBy: [{ attemptNumber: 'asc' }],
                  include: {
                    component: { select: { id: true, code: true, nameRu: true, nameEn: true } },
                  },
                },
              },
            },
            records: {
              include: {
                federation: { select: { id: true, code: true, nameRu: true } },
                competition: { select: { id: true, code: true, nameRu: true, startDate: true } },
                discipline: { select: { id: true, code: true, nameRu: true, nameEn: true } },
                division: { select: { id: true, code: true, nameRu: true, nameEn: true } },
                weightClass: { select: { id: true, code: true, nameRu: true, nameEn: true } },
              },
            },
            attachments: {
              where: { deletedAt: null },
              orderBy: { uploadedAt: 'desc' },
              take: 50,
              select: {
                id: true,
                kind: true,
                filename: true,
                mimeType: true,
                sizeBytes: true,
                uploadedAt: true,
              },
            },
          },
        });
        if (!athlete) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        }
        const { nominations, records, attachments, ...athleteProfile } = athlete;
        const appearances = [...nominations].sort((left, right) => {
          const byDate =
            right.competition.startDate.getTime() - left.competition.startDate.getTime();
          if (byDate !== 0) return byDate;
          return left.discipline.code.localeCompare(right.discipline.code);
        });
        const sortedRecords = [...records].sort(
          (left, right) => right.achievedOn.getTime() - left.achievedOn.getTime(),
        );
        return { athlete: athleteProfile, appearances, records: sortedRecords, attachments };
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
