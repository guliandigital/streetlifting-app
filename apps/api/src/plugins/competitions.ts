import { CompetitionCreate, CompetitionListQuery, CompetitionUpdate } from '@streetlifting/domain';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma, Prisma } from '../lib/db.js';
import { moduleLogger } from '../lib/logger.js';
import * as audit from '../lib/audit.js';
import { requireAuth } from '../lib/auth/middleware.js';
import { validateUuidParams } from '../lib/params.js';

const log = moduleLogger('competitions');

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

function scopedIds(
  user: {
    roles: Array<{ role: string; federationId: string | null; competitionId: string | null }>;
  } | null,
): { all: true } | { federationIds: string[]; competitionIds: string[] } {
  if (!user) return { federationIds: [], competitionIds: [] };
  if (user.roles.some((r) => r.role === 'platform_admin')) return { all: true };

  const federationIds = new Set<string>();
  const competitionIds = new Set<string>();
  for (const r of user.roles) {
    if (r.federationId) federationIds.add(r.federationId);
    if (r.competitionId) competitionIds.add(r.competitionId);
  }
  return { federationIds: [...federationIds], competitionIds: [...competitionIds] };
}

function canReadCompetition(
  user: {
    roles: Array<{ role: string; federationId: string | null; competitionId: string | null }>;
  } | null,
  competition: { id: string; federationId: string },
): boolean {
  if (!user) return false;
  return user.roles.some(
    (r) =>
      r.role === 'platform_admin' ||
      r.federationId === competition.federationId ||
      r.competitionId === competition.id,
  );
}

function canWriteFederation(
  user: { roles: Array<{ role: string; federationId: string | null }> } | null,
  federationId: string,
): boolean {
  if (!user) return false;
  return user.roles.some(
    (r) =>
      r.role === 'platform_admin' ||
      (r.role === 'federation_admin' && r.federationId === federationId),
  );
}

function assertSupportedTimezone(timezone: string): boolean {
  const supportedValuesOf = Intl.supportedValuesOf?.bind(Intl);
  if (!supportedValuesOf) return true;
  return supportedValuesOf('timeZone').includes(timezone);
}

function toCreateData(data: CompetitionCreate): Prisma.CompetitionUncheckedCreateInput {
  return stripUndefined({
    federationId: data.federationId,
    code: data.code,
    nameRu: data.nameRu,
    nameEn: data.nameEn,
    description: data.description,
    rulebook: data.rulebook,
    startDate: new Date(data.startDate),
    endDate: new Date(data.endDate),
    registrationDeadline: data.registrationDeadline
      ? new Date(data.registrationDeadline)
      : undefined,
    city: data.city,
    venue: data.venue,
    timezone: data.timezone,
    status: data.status,
    entryFeeKopecks: data.entryFeeKopecks,
    isOnlineRegistrationOpen: data.isOnlineRegistrationOpen,
  }) as Prisma.CompetitionUncheckedCreateInput;
}

function toUpdateData(data: CompetitionUpdate): Prisma.CompetitionUpdateInput {
  const updateData = stripUndefined({
    nameRu: data.nameRu,
    nameEn: data.nameEn,
    description: data.description,
    rulebook: data.rulebook,
    startDate: data.startDate ? new Date(data.startDate) : undefined,
    endDate: data.endDate ? new Date(data.endDate) : undefined,
    registrationDeadline:
      data.registrationDeadline === undefined
        ? undefined
        : data.registrationDeadline === null
          ? null
          : new Date(data.registrationDeadline),
    city: data.city,
    venue: data.venue,
    timezone: data.timezone,
    status: data.status,
    entryFeeKopecks: data.entryFeeKopecks,
    isOnlineRegistrationOpen: data.isOnlineRegistrationOpen,
  });
  return updateData as Prisma.CompetitionUpdateInput;
}

const competitionInclude = {
  federation: {
    select: {
      id: true,
      code: true,
      nameRu: true,
      nameEn: true,
    },
  },
  _count: {
    select: {
      nominations: true,
      flights: true,
      judgeAssignments: true,
    },
  },
} satisfies Prisma.CompetitionInclude;

export const competitionsPlugin: FeaturePlugin = {
  name: 'competitions',
  register: async (app) => {
    app.addHook('preHandler', validateUuidParams(['id']));

    app.get('/health/competitions', async () => ({ status: 'ok', module: 'competitions' }));

    app.get('/competitions', { preHandler: requireAuth() }, async (req, reply) => {
      const parsed = CompetitionListQuery.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({
          error: {
            code: 'validation_error',
            message: parsed.error.message,
            requestId: req.requestId,
          },
        });
      }

      const scope = scopedIds(req.user);
      const where: Prisma.CompetitionWhereInput = {
        ...(parsed.data.federationId && { federationId: parsed.data.federationId }),
        ...(parsed.data.status && { status: parsed.data.status }),
      };

      if (!('all' in scope)) {
        if (parsed.data.federationId && !scope.federationIds.includes(parsed.data.federationId)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
          });
        }
        where.OR = [
          { federationId: { in: scope.federationIds } },
          { id: { in: scope.competitionIds } },
        ];
      }

      const [competitions, total] = await Promise.all([
        prisma.competition.findMany({
          where,
          include: competitionInclude,
          orderBy: [{ startDate: 'desc' }, { nameRu: 'asc' }],
          take: parsed.data.limit,
          skip: parsed.data.offset,
        }),
        prisma.competition.count({ where }),
      ]);

      return { competitions, total, limit: parsed.data.limit, offset: parsed.data.offset };
    });

    app.get<{ Params: { id: string } }>(
      '/competitions/:id',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const competition = await prisma.competition.findUnique({
          where: { id: req.params.id },
          include: competitionInclude,
        });
        if (!competition) {
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Competition not found',
              requestId: req.requestId,
            },
          });
        }
        if (!canReadCompetition(req.user, competition)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
          });
        }
        return { competition };
      },
    );

    app.post('/competitions', { preHandler: requireAuth() }, async (req, reply) => {
      const parsed = CompetitionCreate.safeParse(req.body);
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
      if (!canWriteFederation(req.user, data.federationId)) {
        return reply.code(403).send({
          error: {
            code: 'forbidden',
            message: 'federation_admin role required',
            requestId: req.requestId,
          },
        });
      }
      if (!assertSupportedTimezone(data.timezone)) {
        return reply.code(400).send({
          error: {
            code: 'invalid_timezone',
            message: 'Unsupported IANA timezone',
            requestId: req.requestId,
          },
        });
      }

      const federation = await prisma.federation.findUnique({ where: { id: data.federationId } });
      if (!federation) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Federation not found', requestId: req.requestId },
        });
      }

      try {
        const competition = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'competition.created',
            scopeFederationId: data.federationId,
            scopeCompetitionId: null,
            targetType: 'competition',
            targetId: '00000000-0000-0000-0000-000000000000',
            before: null,
            after: { code: data.code, nameRu: data.nameRu, startDate: data.startDate },
          },
          (tx) => tx.competition.create({ data: toCreateData(data), include: competitionInclude }),
        );
        log.info(
          { competitionId: competition.id, federationId: data.federationId },
          'competition created',
        );
        return reply.code(201).send({ competition });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return reply.code(409).send({
            error: {
              code: 'code_taken',
              message: 'Competition code already exists in this federation',
              requestId: req.requestId,
            },
          });
        }
        throw err;
      }
    });

    app.patch<{ Params: { id: string } }>(
      '/competitions/:id',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const before = await prisma.competition.findUnique({ where: { id: req.params.id } });
        if (!before) {
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Competition not found',
              requestId: req.requestId,
            },
          });
        }
        if (!canWriteFederation(req.user, before.federationId)) {
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'federation_admin role required',
              requestId: req.requestId,
            },
          });
        }

        const parsed = CompetitionUpdate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        if (parsed.data.timezone && !assertSupportedTimezone(parsed.data.timezone)) {
          return reply.code(400).send({
            error: {
              code: 'invalid_timezone',
              message: 'Unsupported IANA timezone',
              requestId: req.requestId,
            },
          });
        }

        const updated = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'competition.updated',
            scopeFederationId: before.federationId,
            scopeCompetitionId: before.id,
            targetType: 'competition',
            targetId: before.id,
            before: {
              ...before,
              startDate: before.startDate.toISOString(),
              endDate: before.endDate.toISOString(),
              registrationDeadline: before.registrationDeadline?.toISOString() ?? null,
              entryFeeKopecks: before.entryFeeKopecks.toString(),
            },
            after: parsed.data,
          },
          (tx) =>
            tx.competition.update({
              where: { id: req.params.id },
              data: toUpdateData(parsed.data),
              include: competitionInclude,
            }),
        );

        return { competition: updated };
      },
    );
  },
};
