import { JudgeCreate, JudgeUpdate, JudgeListQuery } from '@streetlifting/domain';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma } from '../lib/db.js';
import type { Prisma } from '../lib/db.js';
import { moduleLogger } from '../lib/logger.js';
import * as audit from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth/middleware.js';
import { validateUuidParams } from '../lib/params.js';

const log = moduleLogger('judges');

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

function judgePayload<T extends { userId: string | null }>(judge: T, includeUserId: boolean) {
  if (includeUserId) return judge;
  const { userId: _userId, ...publicJudge } = judge;
  return publicJudge;
}

function isPlatformAdmin(user: { roles: Array<{ role: string }> } | null): boolean {
  return user?.roles.some((role) => role.role === 'platform_admin') ?? false;
}

export const judgesPlugin: FeaturePlugin = {
  name: 'judges',
  register: async (app) => {
    app.addHook('preHandler', validateUuidParams(['id']));

    app.get('/health/judges', async () => ({ status: 'ok', module: 'judges' }));

    // ─── List + search ─────────────────────────────────────────────────
    app.get('/judges', { preHandler: requireAuth() }, async (req, reply) => {
      const parsed = JudgeListQuery.safeParse(req.query);
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

      const where: Prisma.JudgeWhereInput = search
        ? {
            OR: [
              { lastName: { contains: search, mode: 'insensitive' } },
              { firstName: { contains: search, mode: 'insensitive' } },
              { middleName: { contains: search, mode: 'insensitive' } },
              { cardNumber: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {};

      const [judges, total] = await Promise.all([
        prisma.judge.findMany({
          where,
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          take: limit,
          skip: offset,
        }),
        prisma.judge.count({ where }),
      ]);

      return {
        judges: judges.map((judge) => judgePayload(judge, isPlatformAdmin(req.user))),
        total,
        limit,
        offset,
      };
    });

    // ─── Get one ──────────────────────────────────────────────────────
    app.get<{ Params: { id: string } }>(
      '/judges/:id',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const judge = await prisma.judge.findUnique({ where: { id: req.params.id } });
        if (!judge) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Judge not found', requestId: req.requestId },
          });
        }
        return { judge: judgePayload(judge, isPlatformAdmin(req.user)) };
      },
    );

    // ─── Create ───────────────────────────────────────────────────────
    app.post('/judges', { preHandler: requireRole('platform_admin') }, async (req, reply) => {
      const parsed = JudgeCreate.safeParse(req.body);
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
      if (data.userId) {
        const [user, linkedJudge] = await Promise.all([
          prisma.user.findUnique({ where: { id: data.userId }, select: { id: true } }),
          prisma.judge.findUnique({ where: { userId: data.userId }, select: { id: true } }),
        ]);
        if (!user) {
          return reply.code(400).send({
            error: { code: 'user_not_found', message: 'User not found', requestId: req.requestId },
          });
        }
        if (linkedJudge) {
          return reply.code(409).send({
            error: {
              code: 'judge_user_already_linked',
              message: 'User is already linked to another judge profile',
              requestId: req.requestId,
            },
          });
        }
      }
      const createData = stripUndefined({
        userId: data.userId,
        lastName: data.lastName,
        firstName: data.firstName,
        middleName: data.middleName,
        categoryRu: data.categoryRu,
        categoryEn: data.categoryEn,
        cardNumber: data.cardNumber,
        cityRegion: data.cityRegion,
      }) as Prisma.JudgeCreateInput;

      const judge = await audit.withAudit(
        {
          ...audit.fromRequest(req),
          actorUserId: req.user!.id,
          action: 'judge.created',
          scopeFederationId: null,
          scopeCompetitionId: null,
          targetType: 'judge',
          targetId: '00000000-0000-0000-0000-000000000000',
          before: null,
          after: { lastName: data.lastName, firstName: data.firstName },
        },
        (tx) => tx.judge.create({ data: createData }),
      );
      log.info({ judgeId: judge.id }, 'judge created');
      return reply.code(201).send({ judge });
    });

    // ─── Update ───────────────────────────────────────────────────────
    app.patch<{ Params: { id: string } }>(
      '/judges/:id',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = JudgeUpdate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const before = await prisma.judge.findUnique({ where: { id: req.params.id } });
        if (!before) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Judge not found', requestId: req.requestId },
          });
        }
        if (parsed.data.userId && parsed.data.userId !== before.userId) {
          const [user, linkedJudge] = await Promise.all([
            prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } }),
            prisma.judge.findUnique({
              where: { userId: parsed.data.userId },
              select: { id: true },
            }),
          ]);
          if (!user) {
            return reply.code(400).send({
              error: {
                code: 'user_not_found',
                message: 'User not found',
                requestId: req.requestId,
              },
            });
          }
          if (linkedJudge && linkedJudge.id !== before.id) {
            return reply.code(409).send({
              error: {
                code: 'judge_user_already_linked',
                message: 'User is already linked to another judge profile',
                requestId: req.requestId,
              },
            });
          }
        }
        const updateData = stripUndefined(parsed.data) as Prisma.JudgeUpdateInput;
        const updated = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'judge.updated',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'judge',
            targetId: req.params.id,
            before,
            after: parsed.data,
          },
          (tx) => tx.judge.update({ where: { id: req.params.id }, data: updateData }),
        );
        return { judge: updated };
      },
    );
  },
};
