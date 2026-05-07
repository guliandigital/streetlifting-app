import { randomUUID } from 'node:crypto';
import { FederationCreate, FederationUpdate } from '@streetlifting/domain';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma, Prisma } from '../lib/db.js';
import { moduleLogger } from '../lib/logger.js';
import * as audit from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth/middleware.js';

const log = moduleLogger('federations');

/**
 * Returns the set of federation IDs the caller is allowed to read/edit.
 *  - platform_admin → all
 *  - federation_admin / accountant / etc. with federationId scope → that one
 */
function visibleFederationIds(
  user: { roles: Array<{ role: string; federationId: string | null }> } | null,
): { all: true } | { ids: string[] } {
  if (!user) return { ids: [] };
  if (user.roles.some((r) => r.role === 'platform_admin')) return { all: true };
  const ids = new Set<string>();
  for (const r of user.roles) {
    if (r.federationId) ids.add(r.federationId);
  }
  return { ids: [...ids] };
}

export const federationsPlugin: FeaturePlugin = {
  name: 'federations',
  register: async (app) => {
    app.get('/health/federations', async () => ({ status: 'ok', module: 'federations' }));

    // ─── List ───────────────────────────────────────────────────────────
    // Auth required; visibility filtered by role scope.
    app.get('/federations', { preHandler: requireAuth() }, async (req) => {
      const visible = visibleFederationIds(req.user);
      const federations = await prisma.federation.findMany({
        where: 'all' in visible ? {} : { id: { in: visible.ids } },
        orderBy: { nameRu: 'asc' },
      });
      return { federations };
    });

    // ─── Get one ────────────────────────────────────────────────────────
    app.get<{ Params: { id: string } }>('/federations/:id', { preHandler: requireAuth() }, async (req, reply) => {
      const visible = visibleFederationIds(req.user);
      if (!('all' in visible) && !visible.ids.includes(req.params.id)) {
        return reply.code(403).send({
          error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
        });
      }
      const federation = await prisma.federation.findUnique({ where: { id: req.params.id } });
      if (!federation) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Federation not found', requestId: req.requestId },
        });
      }
      return { federation };
    });

    // ─── Create ─────────────────────────────────────────────────────────
    // Platform-only: federation creation is gated by the SaaS owner.
    app.post('/federations', { preHandler: requireRole('platform_admin') }, async (req, reply) => {
      const parsed = FederationCreate.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
        });
      }
      const data = parsed.data;
      try {
        const federation = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'federation.created',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'federation',
            targetId: '00000000-0000-0000-0000-000000000000',
            before: null,
            after: { code: data.code, nameRu: data.nameRu },
          },
          (tx) =>
            tx.federation.create({
              data: {
                code: data.code,
                nameRu: data.nameRu,
                nameEn: data.nameEn,
                countryCode: data.countryCode.toUpperCase(),
                ...(data.regionCode !== undefined && { regionCode: data.regionCode }),
                ...(data.contactPhone !== undefined && { contactPhone: data.contactPhone }),
                ...(data.contactEmail !== undefined && { contactEmail: data.contactEmail }),
                ...(data.telegramHandle !== undefined && { telegramHandle: data.telegramHandle }),
                ...(data.vkUrl !== undefined && { vkUrl: data.vkUrl }),
                ...(data.websiteUrl !== undefined && { websiteUrl: data.websiteUrl }),
                ...(data.chiefAccountantName !== undefined && { chiefAccountantName: data.chiefAccountantName }),
                ...(data.cashierName !== undefined && { cashierName: data.cashierName }),
                billingTariffKopecksPerNomination: data.billingTariffKopecksPerNomination,
                securityKey: randomUUID(),
              },
            }),
        );
        log.info({ federationId: federation.id, code: federation.code }, 'federation created');
        return reply.code(201).send({ federation });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          return reply.code(409).send({
            error: { code: 'code_taken', message: 'Federation code already in use', requestId: req.requestId },
          });
        }
        throw err;
      }
    });

    // ─── Update ─────────────────────────────────────────────────────────
    app.patch<{ Params: { id: string } }>('/federations/:id', { preHandler: requireAuth() }, async (req, reply) => {
      const visible = visibleFederationIds(req.user);
      const isPlatformAdmin = 'all' in visible;
      const isMember = isPlatformAdmin || visible.ids.includes(req.params.id);
      if (!isMember) {
        return reply.code(403).send({
          error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
        });
      }
      // Federation_admin (or platform_admin) only can update.
      const canEdit =
        isPlatformAdmin ||
        (req.user?.roles.some(
          (r) => r.role === 'federation_admin' && r.federationId === req.params.id,
        ) ??
          false);
      if (!canEdit) {
        return reply.code(403).send({
          error: { code: 'forbidden', message: 'federation_admin role required', requestId: req.requestId },
        });
      }

      const parsed = FederationUpdate.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
        });
      }
      const before = await prisma.federation.findUnique({ where: { id: req.params.id } });
      if (!before) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Federation not found', requestId: req.requestId },
        });
      }

      // exactOptionalPropertyTypes forbids `key: undefined`. Strip out
      // undefined keys before passing to Prisma.
      const updateData: Prisma.FederationUpdateInput = {};
      for (const [k, v] of Object.entries(parsed.data)) {
        if (v !== undefined) (updateData as Record<string, unknown>)[k] = v;
      }

      const updated = await audit.withAudit(
        {
          ...audit.fromRequest(req),
          actorUserId: req.user!.id,
          action: 'federation.updated',
          scopeFederationId: req.params.id,
          scopeCompetitionId: null,
          targetType: 'federation',
          targetId: req.params.id,
          before: { ...before, billingTariffKopecksPerNomination: before.billingTariffKopecksPerNomination.toString() },
          after: parsed.data,
        },
        (tx) =>
          tx.federation.update({
            where: { id: req.params.id },
            data: updateData,
          }),
      );
      return { federation: updated };
    });
  },
};
