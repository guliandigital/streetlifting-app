import { randomUUID } from 'node:crypto';
import { z } from 'zod';
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

const PaymentMethodInput = z.enum(['bank_transfer', 'card', 'sbp', 'cash', 'other']);

const ReceiptCreateInput = z
  .object({
    number: z.string().min(1).max(64),
    date: z.coerce.date(),
    nominationsCount: z.number().int().positive(),
    amountKopecks: z.number().int().nonnegative(),
    paymentMethod: PaymentMethodInput.default('bank_transfer'),
    expiresAt: z.coerce.date(),
    externalReference: z.string().max(200).nullable().optional(),
  })
  .strict();

const WriteoffCreateInput = z
  .object({
    number: z.string().min(1).max(64),
    date: z.coerce.date(),
    nominationsCount: z.number().int().positive(),
    competitionId: z.string().uuid().nullable().optional(),
    linkedReceiptId: z.string().uuid().nullable().optional(),
  })
  .strict();

function canManageFederation(
  user: { roles: Array<{ role: string; federationId: string | null }> } | null,
  federationId: string,
  roles: readonly string[],
): boolean {
  if (!user) return false;
  return user.roles.some(
    (r) => r.role === 'platform_admin' || (roles.includes(r.role) && r.federationId === federationId),
  );
}

function dateOnly(value: Date): Date {
  return new Date(value.toISOString().slice(0, 10));
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

    app.get<{ Params: { id: string } }>(
      '/federations/:id/dashboard',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const visible = visibleFederationIds(req.user);
        if (!('all' in visible) && !visible.ids.includes(req.params.id)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
          });
        }

        const federation = await prisma.federation.findUnique({
          where: { id: req.params.id },
          include: {
            attachments: {
              where: { deletedAt: null },
              orderBy: { uploadedAt: 'desc' },
              take: 20,
            },
            plateSets: { orderBy: { name: 'asc' } },
          },
        });
        if (!federation) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Federation not found', requestId: req.requestId },
          });
        }

        const [receipts, writeoffs, competitions, peerFederations] = await Promise.all([
          prisma.receipt.findMany({
            where: { federationId: req.params.id },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            take: 50,
          }),
          prisma.writeoff.findMany({
            where: { federationId: req.params.id },
            orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
            take: 50,
            include: { competition: { select: { id: true, code: true, nameRu: true } } },
          }),
          prisma.competition.findMany({
            where: { federationId: req.params.id },
            orderBy: [{ startDate: 'desc' }, { nameRu: 'asc' }],
            take: 12,
            include: { _count: { select: { nominations: true } } },
          }),
          prisma.federation.findMany({
            where: {
              countryCode: federation.countryCode,
              ...(federation.regionCode ? { regionCode: federation.regionCode } : {}),
            },
            orderBy: { nameRu: 'asc' },
            take: 12,
            include: {
              competitions: {
                select: { nominations: { select: { id: true } } },
              },
            },
          }),
        ]);

        const receivedNominations = receipts.reduce((sum, item) => sum + item.nominationsCount, 0);
        const consumedNominations = writeoffs.reduce((sum, item) => sum + item.nominationsCount, 0);
        const receivedAmountKopecks = receipts.reduce((sum, item) => sum + item.amountKopecks, 0n);
        const regionalComparison = peerFederations.map((item) => ({
          federationId: item.id,
          code: item.code,
          nameRu: item.nameRu,
          nominations: item.competitions.reduce(
            (sum, competition) => sum + competition.nominations.length,
            0,
          ),
        }));

        return {
          federation,
          receipts,
          writeoffs,
          competitions,
          balance: {
            receivedNominations,
            consumedNominations,
            remainingNominations: receivedNominations - consumedNominations,
            receivedAmountKopecks,
          },
          telegramSubscriptionCode: federation.securityKey.replace(/-/g, '').slice(0, 10),
          regionalComparison,
        };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/federations/:id/receipts',
      { preHandler: requireAuth() },
      async (req, reply) => {
        if (!canManageFederation(req.user, req.params.id, ['federation_admin', 'accountant'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'federation accounting role required', requestId: req.requestId },
          });
        }
        const parsed = ReceiptCreateInput.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }
        const federation = await prisma.federation.findUnique({
          where: { id: req.params.id },
          select: { id: true },
        });
        if (!federation) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Federation not found', requestId: req.requestId },
          });
        }

        try {
          const receipt = await prisma.$transaction(async (tx) => {
            const created = await tx.receipt.create({
              data: {
                federationId: req.params.id,
                number: parsed.data.number,
                date: dateOnly(parsed.data.date),
                nominationsCount: parsed.data.nominationsCount,
                amountKopecks: BigInt(parsed.data.amountKopecks),
                paymentMethod: parsed.data.paymentMethod,
                expiresAt: dateOnly(parsed.data.expiresAt),
                externalReference: parsed.data.externalReference ?? null,
              },
            });
            await audit.record(
              {
                ...audit.fromRequest(req),
                actorUserId: req.user!.id,
                action: 'federation.receipt.created',
                scopeFederationId: req.params.id,
                scopeCompetitionId: null,
                targetType: 'receipt',
                targetId: created.id,
                before: null,
                after: {
                  ...parsed.data,
                  date: parsed.data.date.toISOString().slice(0, 10),
                  expiresAt: parsed.data.expiresAt.toISOString().slice(0, 10),
                },
                result: 'success',
              },
              tx,
            );
            return created;
          });
          return reply.code(201).send({ receipt });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: { code: 'number_taken', message: 'Receipt number already exists', requestId: req.requestId },
            });
          }
          throw err;
        }
      },
    );

    app.post<{ Params: { id: string } }>(
      '/federations/:id/writeoffs',
      { preHandler: requireAuth() },
      async (req, reply) => {
        if (!canManageFederation(req.user, req.params.id, ['federation_admin', 'accountant'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'federation accounting role required', requestId: req.requestId },
          });
        }
        const parsed = WriteoffCreateInput.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }
        const federation = await prisma.federation.findUnique({
          where: { id: req.params.id },
          select: { id: true },
        });
        if (!federation) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Federation not found', requestId: req.requestId },
          });
        }
        if (parsed.data.competitionId) {
          const competition = await prisma.competition.findUnique({
            where: { id: parsed.data.competitionId },
            select: { federationId: true },
          });
          if (!competition || competition.federationId !== req.params.id) {
            return reply.code(400).send({
              error: { code: 'competition_out_of_scope', message: 'Competition is not in federation', requestId: req.requestId },
            });
          }
        }
        if (parsed.data.linkedReceiptId) {
          const receipt = await prisma.receipt.findUnique({
            where: { id: parsed.data.linkedReceiptId },
            select: { federationId: true },
          });
          if (!receipt || receipt.federationId !== req.params.id) {
            return reply.code(400).send({
              error: { code: 'receipt_out_of_scope', message: 'Receipt is not in federation', requestId: req.requestId },
            });
          }
        }

        try {
          const writeoff = await prisma.$transaction(async (tx) => {
            const created = await tx.writeoff.create({
              data: {
                federationId: req.params.id,
                number: parsed.data.number,
                date: dateOnly(parsed.data.date),
                nominationsCount: parsed.data.nominationsCount,
                competitionId: parsed.data.competitionId ?? null,
                linkedReceiptId: parsed.data.linkedReceiptId ?? null,
              },
              include: { competition: { select: { id: true, code: true, nameRu: true } } },
            });
            await audit.record(
              {
                ...audit.fromRequest(req),
                actorUserId: req.user!.id,
                action: 'federation.writeoff.created',
                scopeFederationId: req.params.id,
                scopeCompetitionId: parsed.data.competitionId ?? null,
                targetType: 'writeoff',
                targetId: created.id,
                before: null,
                after: {
                  ...parsed.data,
                  date: parsed.data.date.toISOString().slice(0, 10),
                },
                result: 'success',
              },
              tx,
            );
            return created;
          });
          return reply.code(201).send({ writeoff });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: { code: 'number_taken', message: 'Writeoff number already exists', requestId: req.requestId },
            });
          }
          throw err;
        }
      },
    );

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
