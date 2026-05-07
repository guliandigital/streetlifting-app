import { DisciplineCreate, DisciplineUpdate } from '@streetlifting/domain';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma, Prisma } from '../lib/db.js';
import { moduleLogger } from '../lib/logger.js';
import * as audit from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth/middleware.js';

const log = moduleLogger('disciplines');

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

export const disciplinesPlugin: FeaturePlugin = {
  name: 'disciplines',
  register: async (app) => {
    app.get('/health/disciplines', async () => ({ status: 'ok', module: 'disciplines' }));

    // ─── List ───────────────────────────────────────────────────────────
    app.get('/disciplines', { preHandler: requireAuth() }, async () => {
      const disciplines = await prisma.discipline.findMany({
        orderBy: [{ family: 'asc' }, { format: 'asc' }, { code: 'asc' }],
      });
      return { disciplines };
    });

    // ─── Get one ────────────────────────────────────────────────────────
    app.get<{ Params: { id: string } }>(
      '/disciplines/:id',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const discipline = await prisma.discipline.findUnique({ where: { id: req.params.id } });
        if (!discipline) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Discipline not found', requestId: req.requestId },
          });
        }
        return { discipline };
      },
    );

    // ─── Create ─────────────────────────────────────────────────────────
    app.post(
      '/disciplines',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = DisciplineCreate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }
        const data = parsed.data;

        try {
          const discipline = await audit.withAudit(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'discipline.created',
              scopeFederationId: null,
              scopeCompetitionId: null,
              targetType: 'discipline',
              targetId: '00000000-0000-0000-0000-000000000000',
              before: null,
              after: { code: data.code, nameRu: data.nameRu },
            },
            (tx) => tx.discipline.create({ data }),
          );
          log.info({ disciplineId: discipline.id, code: discipline.code }, 'discipline created');
          return reply.code(201).send({ discipline });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: { code: 'code_taken', message: 'Discipline code already in use', requestId: req.requestId },
            });
          }
          throw err;
        }
      },
    );

    // ─── Update ─────────────────────────────────────────────────────────
    app.patch<{ Params: { id: string } }>(
      '/disciplines/:id',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = DisciplineUpdate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }
        const before = await prisma.discipline.findUnique({ where: { id: req.params.id } });
        if (!before) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Discipline not found', requestId: req.requestId },
          });
        }
        const updateData = stripUndefined(parsed.data) as Prisma.DisciplineUpdateInput;
        const updated = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'discipline.updated',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'discipline',
            targetId: req.params.id,
            before,
            after: parsed.data,
          },
          (tx) => tx.discipline.update({ where: { id: req.params.id }, data: updateData }),
        );
        return { discipline: updated };
      },
    );
  },
};
