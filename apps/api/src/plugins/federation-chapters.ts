/**
 * Federation chapters plugin (M2.5c). CRUD for "отделения федераций" —
 * regional branches scoped under a parent federation.
 *
 * Reads visible to any member of the parent federation (platform_admin
 * sees all). Writes restricted to platform_admin OR federation_admin
 * scoped to the specific federationId. Every write goes through
 * withAudit per ADR-0005.
 */

import { FederationChapterCreate, FederationChapterUpdate } from '@streetlifting/domain';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma, Prisma } from '../lib/db.js';
import { moduleLogger } from '../lib/logger.js';
import * as audit from '../lib/audit.js';
import { requireAuth } from '../lib/auth/middleware.js';
import { validateUuidParams } from '../lib/params.js';

const log = moduleLogger('federation_chapters');

function stripUndefined<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

/** Caller can read this federation if platform_admin OR has any role scoped to it. */
function canReadFederation(
  user: { roles: Array<{ role: string; federationId: string | null }> } | null,
  federationId: string,
): boolean {
  if (!user) return false;
  return user.roles.some((r) => r.role === 'platform_admin' || r.federationId === federationId);
}

/** Caller can write chapters of this federation if platform_admin OR federation_admin of it. */
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

export const federationChaptersPlugin: FeaturePlugin = {
  name: 'federation_chapters',
  register: async (app) => {
    app.addHook('preHandler', validateUuidParams(['fedId', 'id']));

    app.get('/health/federation_chapters', async () => ({
      status: 'ok',
      module: 'federation_chapters',
    }));

    // ─── List ──────────────────────────────────────────────────────────
    app.get<{ Params: { fedId: string } }>(
      '/federations/:fedId/chapters',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const fed = await prisma.federation.findUnique({ where: { id: req.params.fedId } });
        if (!fed) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Federation not found', requestId: req.requestId },
          });
        }
        if (!canReadFederation(req.user, fed.id)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
          });
        }
        const chapters = await prisma.federationChapter.findMany({
          where: { federationId: fed.id },
          orderBy: [{ nameRu: 'asc' }],
        });
        return { chapters };
      },
    );

    // ─── Get one ───────────────────────────────────────────────────────
    app.get<{ Params: { fedId: string; id: string } }>(
      '/federations/:fedId/chapters/:id',
      { preHandler: requireAuth() },
      async (req, reply) => {
        if (!canReadFederation(req.user, req.params.fedId)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
          });
        }
        const chapter = await prisma.federationChapter.findFirst({
          where: { id: req.params.id, federationId: req.params.fedId },
        });
        if (!chapter) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Chapter not found', requestId: req.requestId },
          });
        }
        return { chapter };
      },
    );

    // ─── Create ────────────────────────────────────────────────────────
    app.post<{ Params: { fedId: string } }>(
      '/federations/:fedId/chapters',
      { preHandler: requireAuth() },
      async (req, reply) => {
        if (!canWriteFederation(req.user, req.params.fedId)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Insufficient role', requestId: req.requestId },
          });
        }
        const fed = await prisma.federation.findUnique({ where: { id: req.params.fedId } });
        if (!fed) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Federation not found', requestId: req.requestId },
          });
        }
        const parsed = FederationChapterCreate.safeParse(req.body);
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
        const createData = stripUndefined({
          federationId: fed.id,
          code: data.code,
          nameRu: data.nameRu,
          nameEn: data.nameEn,
          countryCode: data.countryCode,
          regionCode: data.regionCode,
          city: data.city,
          contactPhone: data.contactPhone,
          contactEmail: data.contactEmail,
          isActive: data.isActive,
        }) as Prisma.FederationChapterUncheckedCreateInput;

        try {
          const chapter = await audit.withAudit(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'federation_chapter.created',
              scopeFederationId: fed.id,
              scopeCompetitionId: null,
              targetType: 'federation_chapter',
              targetId: '00000000-0000-0000-0000-000000000000',
              before: null,
              after: { code: data.code, nameRu: data.nameRu },
            },
            (tx) => tx.federationChapter.create({ data: createData }),
          );
          log.info(
            { chapterId: chapter.id, federationId: fed.id, code: chapter.code },
            'chapter created',
          );
          return reply.code(201).send({ chapter });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: {
                code: 'conflict',
                message: 'A chapter with this code already exists for this federation',
                requestId: req.requestId,
              },
            });
          }
          throw err;
        }
      },
    );

    // ─── Update ────────────────────────────────────────────────────────
    app.patch<{ Params: { fedId: string; id: string } }>(
      '/federations/:fedId/chapters/:id',
      { preHandler: requireAuth() },
      async (req, reply) => {
        if (!canWriteFederation(req.user, req.params.fedId)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Insufficient role', requestId: req.requestId },
          });
        }
        const before = await prisma.federationChapter.findFirst({
          where: { id: req.params.id, federationId: req.params.fedId },
        });
        if (!before) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Chapter not found', requestId: req.requestId },
          });
        }
        const parsed = FederationChapterUpdate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const updateData = stripUndefined(parsed.data) as Prisma.FederationChapterUpdateInput;
        const updated = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'federation_chapter.updated',
            scopeFederationId: req.params.fedId,
            scopeCompetitionId: null,
            targetType: 'federation_chapter',
            targetId: req.params.id,
            before,
            after: parsed.data,
          },
          (tx) => tx.federationChapter.update({ where: { id: req.params.id }, data: updateData }),
        );
        return { chapter: updated };
      },
    );
  },
};
