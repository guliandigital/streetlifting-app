import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  FederationCreate,
  FederationUpdate,
  PlateSetCreate,
  PlateSetUpdate,
} from '@streetlifting/domain';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma, Prisma } from '../lib/db.js';
import { moduleLogger } from '../lib/logger.js';
import * as audit from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth/middleware.js';
import {
  MailerDeliveryError,
  MailerNotConfiguredError,
  mailerConfigured,
  sendMail,
} from '../lib/mailer.js';

const log = moduleLogger('federations');
const MAX_FEDERATION_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const FederationAttachmentCreateInput = z
  .object({
    filename: z.string().min(1).max(180),
    mimeType: z.string().min(1).max(120),
    contentBase64: z.string().min(1),
  })
  .strict();

const FederationFeedbackCreateInput = z
  .object({
    message: z.string().min(3).max(4000),
  })
  .strict();

const SupportTicketCreateInput = z
  .object({
    subject: z.string().trim().min(1).max(180).optional(),
    message: z.string().trim().min(3).max(4000),
  })
  .strict();

const SupportTicketMessageCreateInput = z
  .object({
    message: z.string().trim().min(3).max(4000),
    isInternal: z.boolean().optional(),
  })
  .strict();

const SupportTicketUpdateInput = z
  .object({
    status: z.enum(['open', 'in_progress', 'resolved', 'closed']),
  })
  .strict();

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

function uploadRoot(): string {
  return process.env.STORAGE_DIR ?? path.join(process.cwd(), 'storage');
}

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[\\/:"*?<>|]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180) || 'file';
}

function contentDispositionFilename(filename: string): string {
  return sanitizeFilename(filename).replace(/[\r\n"]/g, '_');
}

function decodeBase64File(contentBase64: string): Buffer | null {
  const normalized = contentBase64.includes(',')
    ? contentBase64.slice(contentBase64.indexOf(',') + 1)
    : contentBase64;
  try {
    return Buffer.from(normalized, 'base64');
  } catch {
    return null;
  }
}

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

function isPlatformAdmin(
  user: { roles: Array<{ role: string; federationId: string | null }> } | null,
): boolean {
  return user?.roles.some((r) => r.role === 'platform_admin') ?? false;
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

    app.get<{ Params: { id: string } }>(
      '/federations/:id/audit',
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
          select: { id: true },
        });
        if (!federation) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Federation not found', requestId: req.requestId },
          });
        }

        const members = await prisma.roleAssignment.findMany({
          where: { federationId: req.params.id, revokedAt: null },
          select: { userId: true },
          distinct: ['userId'],
        });
        const memberUserIds = members.map((item) => item.userId);
        const auditRows = await prisma.auditLog.findMany({
          where: {
            OR: [
              { scopeFederationId: req.params.id },
              ...(memberUserIds.length > 0
                ? [
                    {
                      targetType: 'user',
                      targetId: { in: memberUserIds },
                      action: { in: ['auth.login.succeeded', 'auth.login.failed'] },
                    },
                  ]
                : []),
            ],
          },
          orderBy: { occurredAt: 'desc' },
          take: 100,
        });

        const userIds = new Set<string>();
        for (const row of auditRows) {
          if (row.actorUserId) userIds.add(row.actorUserId);
          if (row.targetType === 'user') userIds.add(row.targetId);
        }
        const users =
          userIds.size > 0
            ? await prisma.user.findMany({
                where: { id: { in: [...userIds] } },
                select: { id: true, email: true, displayName: true },
              })
            : [];
        const usersById = new Map(users.map((user) => [user.id, user]));

        return {
          audit: auditRows.map((row) => ({
            id: row.id,
            occurredAt: row.occurredAt,
            action: row.action,
            result: row.result,
            actorIp: row.actorIp,
            actorUserAgent: row.actorUserAgent,
            actorUser: row.actorUserId ? usersById.get(row.actorUserId) ?? null : null,
            targetType: row.targetType,
            targetId: row.targetId,
            targetUser: row.targetType === 'user' ? usersById.get(row.targetId) ?? null : null,
            after: row.after,
            notes: row.notes,
          })),
        };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/federations/:id/plate-sets',
      { preHandler: requireAuth() },
      async (req, reply) => {
        if (!canManageFederation(req.user, req.params.id, ['federation_admin'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'federation_admin role required', requestId: req.requestId },
          });
        }
        const parsed = PlateSetCreate.safeParse(req.body);
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

        const plateSet = await prisma.$transaction(async (tx) => {
          const created = await tx.plateSet.create({
            data: {
              federationId: req.params.id,
              competitionId: null,
              name: parsed.data.name.trim(),
              incrementKg: parsed.data.incrementKg,
              barWeightKg: parsed.data.barWeightKg,
              collarWeightKg: parsed.data.collarWeightKg,
              plates: parsed.data.plates as Prisma.InputJsonValue,
            },
          });
          await audit.record(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'federation.plate_set.created',
              result: 'success',
              scopeFederationId: req.params.id,
              scopeCompetitionId: null,
              targetType: 'plate_set',
              targetId: created.id,
              before: null,
              after: parsed.data,
            },
            tx,
          );
          return created;
        });
        return reply.code(201).send({ plateSet });
      },
    );

    app.patch<{ Params: { id: string; plateSetId: string } }>(
      '/federations/:id/plate-sets/:plateSetId',
      { preHandler: requireAuth() },
      async (req, reply) => {
        if (!canManageFederation(req.user, req.params.id, ['federation_admin'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'federation_admin role required', requestId: req.requestId },
          });
        }
        const parsed = PlateSetUpdate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }
        const before = await prisma.plateSet.findFirst({
          where: {
            id: req.params.plateSetId,
            federationId: req.params.id,
            competitionId: null,
          },
        });
        if (!before) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Plate set not found', requestId: req.requestId },
          });
        }

        const updateData: Prisma.PlateSetUpdateInput = {};
        if (parsed.data.name !== undefined) updateData.name = parsed.data.name.trim();
        if (parsed.data.incrementKg !== undefined) updateData.incrementKg = parsed.data.incrementKg;
        if (parsed.data.barWeightKg !== undefined) updateData.barWeightKg = parsed.data.barWeightKg;
        if (parsed.data.collarWeightKg !== undefined) updateData.collarWeightKg = parsed.data.collarWeightKg;
        if (parsed.data.plates !== undefined) updateData.plates = parsed.data.plates as Prisma.InputJsonValue;

        const plateSet = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'federation.plate_set.updated',
            scopeFederationId: req.params.id,
            scopeCompetitionId: null,
            targetType: 'plate_set',
            targetId: req.params.plateSetId,
            before,
            after: parsed.data,
          },
          (tx) =>
            tx.plateSet.update({
              where: { id: req.params.plateSetId },
              data: updateData,
            }),
        );
        return { plateSet };
      },
    );

    app.delete<{ Params: { id: string; plateSetId: string } }>(
      '/federations/:id/plate-sets/:plateSetId',
      { preHandler: requireAuth() },
      async (req, reply) => {
        if (!canManageFederation(req.user, req.params.id, ['federation_admin'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'federation_admin role required', requestId: req.requestId },
          });
        }
        const before = await prisma.plateSet.findFirst({
          where: {
            id: req.params.plateSetId,
            federationId: req.params.id,
            competitionId: null,
          },
        });
        if (!before) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Plate set not found', requestId: req.requestId },
          });
        }

        await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'federation.plate_set.deleted',
            scopeFederationId: req.params.id,
            scopeCompetitionId: null,
            targetType: 'plate_set',
            targetId: req.params.plateSetId,
            before,
            after: null,
          },
          (tx) =>
            tx.plateSet.delete({
              where: { id: req.params.plateSetId },
            }),
        );
        return { status: 'ok' };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/federations/:id/test-email',
      { preHandler: requireAuth() },
      async (req, reply) => {
        if (!canManageFederation(req.user, req.params.id, ['federation_admin'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'federation_admin role required', requestId: req.requestId },
          });
        }

        const federation = await prisma.federation.findUnique({
          where: { id: req.params.id },
          select: { id: true, contactEmail: true },
        });
        if (!federation) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Federation not found', requestId: req.requestId },
          });
        }
        if (!federation.contactEmail) {
          return reply.code(400).send({
            error: { code: 'contact_email_missing', message: 'Federation contact email is empty', requestId: req.requestId },
          });
        }

        try {
          const delivery = await sendMail({
            to: federation.contactEmail,
            subject: 'Тестовое письмо Streetlifting App',
            text: [
              'Streetlifting App: тестовая доставка уведомлений федерации работает.',
              '',
              `Федерация ID: ${federation.id}`,
              `Время: ${new Date().toISOString()}`,
            ].join('\n'),
            html: [
              '<p>Streetlifting App: тестовая доставка уведомлений федерации работает.</p>',
              `<p><strong>Федерация ID:</strong> ${federation.id}</p>`,
              `<p><strong>Время:</strong> ${new Date().toISOString()}</p>`,
            ].join(''),
          });

          await audit.record({
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'federation.test_email.sent',
            result: 'success',
            scopeFederationId: req.params.id,
            scopeCompetitionId: null,
            targetType: 'federation',
            targetId: req.params.id,
            before: null,
            after: {
              recipient: federation.contactEmail,
              provider: delivery.provider,
              messageId: delivery.messageId,
            },
          });

          return {
            status: 'sent',
            recipient: federation.contactEmail,
            smtpConfigured: mailerConfigured(),
            provider: delivery.provider,
            messageId: delivery.messageId,
          };
        } catch (err) {
          const isNotConfigured = err instanceof MailerNotConfiguredError;
          const isDeliveryError = err instanceof MailerDeliveryError;
          await audit.record({
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'federation.test_email.failed',
            result: 'failure',
            scopeFederationId: req.params.id,
            scopeCompetitionId: null,
            targetType: 'federation',
            targetId: req.params.id,
            before: null,
            after: { recipient: federation.contactEmail },
            notes: err instanceof Error ? err.message : 'unknown mailer error',
          });

          if (isNotConfigured) {
            return reply.code(503).send({
              error: {
                code: 'mailer_not_configured',
                message: 'Mail delivery is not configured',
                requestId: req.requestId,
              },
            });
          }
          log.error({ err, federationId: req.params.id }, 'test email delivery failed');
          return reply.code(502).send({
            error: {
              code: isDeliveryError ? 'mailer_delivery_failed' : 'mailer_error',
              message: 'Mail delivery failed',
              requestId: req.requestId,
            },
          });
        }
      },
    );

    app.post<{ Params: { id: string } }>(
      '/federations/:id/feedback',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const visible = visibleFederationIds(req.user);
        if (!('all' in visible) && !visible.ids.includes(req.params.id)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
          });
        }
        const parsed = FederationFeedbackCreateInput.safeParse(req.body);
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

        const subject = parsed.data.message.trim().slice(0, 80);
        const ticket = await prisma.$transaction(async (tx) => {
          const created = await tx.supportTicket.create({
            data: {
              federationId: req.params.id,
              authorUserId: req.user!.id,
              subject,
            },
          });
          await tx.supportTicketMessage.create({
            data: {
              ticketId: created.id,
              authorUserId: req.user!.id,
              body: parsed.data.message.trim(),
            },
          });
          await audit.record(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'federation.support_ticket.created',
              result: 'success',
              scopeFederationId: req.params.id,
              scopeCompetitionId: null,
              targetType: 'support_ticket',
              targetId: created.id,
              before: null,
              after: { subject, message: parsed.data.message.trim(), legacyEndpoint: true },
            },
            tx,
          );
          return created;
        });

        return reply.code(201).send({
          feedback: {
            author: req.user!.displayName,
            message: parsed.data.message.trim(),
            status: 'new',
            ticketId: ticket.id,
          },
        });
      },
    );

    app.get<{ Params: { id: string } }>(
      '/federations/:id/support-tickets',
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
          select: { id: true },
        });
        if (!federation) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Federation not found', requestId: req.requestId },
          });
        }

        const canReadInternal = isPlatformAdmin(req.user);
        const tickets = await prisma.supportTicket.findMany({
          where: { federationId: req.params.id },
          orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
          take: 50,
          include: {
            author: { select: { id: true, email: true, displayName: true } },
            messages: {
              where: canReadInternal ? {} : { isInternal: false },
              orderBy: { createdAt: 'asc' },
              include: { author: { select: { id: true, email: true, displayName: true } } },
            },
          },
        });

        return { tickets };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/federations/:id/support-tickets',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const visible = visibleFederationIds(req.user);
        if (!('all' in visible) && !visible.ids.includes(req.params.id)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
          });
        }
        const parsed = SupportTicketCreateInput.safeParse(req.body);
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

        const subject = parsed.data.subject?.trim() || parsed.data.message.slice(0, 80);
        const ticket = await prisma.$transaction(async (tx) => {
          const created = await tx.supportTicket.create({
            data: {
              federationId: req.params.id,
              authorUserId: req.user!.id,
              subject,
            },
          });
          await tx.supportTicketMessage.create({
            data: {
              ticketId: created.id,
              authorUserId: req.user!.id,
              body: parsed.data.message,
            },
          });
          await audit.record(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'federation.support_ticket.created',
              result: 'success',
              scopeFederationId: req.params.id,
              scopeCompetitionId: null,
              targetType: 'support_ticket',
              targetId: created.id,
              before: null,
              after: { subject, message: parsed.data.message },
            },
            tx,
          );
          return created;
        });

        const fullTicket = await prisma.supportTicket.findUnique({
          where: { id: ticket.id },
          include: {
            author: { select: { id: true, email: true, displayName: true } },
            messages: {
              orderBy: { createdAt: 'asc' },
              include: { author: { select: { id: true, email: true, displayName: true } } },
            },
          },
        });
        return reply.code(201).send({ ticket: fullTicket });
      },
    );

    app.post<{ Params: { id: string; ticketId: string } }>(
      '/federations/:id/support-tickets/:ticketId/messages',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const visible = visibleFederationIds(req.user);
        if (!('all' in visible) && !visible.ids.includes(req.params.id)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
          });
        }
        const parsed = SupportTicketMessageCreateInput.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }

        const ticket = await prisma.supportTicket.findFirst({
          where: { id: req.params.ticketId, federationId: req.params.id },
          select: { id: true, status: true },
        });
        if (!ticket) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Support ticket not found', requestId: req.requestId },
          });
        }
        if (ticket.status === 'closed') {
          return reply.code(409).send({
            error: { code: 'ticket_closed', message: 'Closed ticket cannot receive messages', requestId: req.requestId },
          });
        }

        const canCreateInternal = isPlatformAdmin(req.user);
        const isInternal = canCreateInternal ? Boolean(parsed.data.isInternal) : false;
        const nextStatus = canCreateInternal ? 'in_progress' : 'open';
        const message = await prisma.$transaction(async (tx) => {
          const created = await tx.supportTicketMessage.create({
            data: {
              ticketId: ticket.id,
              authorUserId: req.user!.id,
              body: parsed.data.message,
              isInternal,
            },
            include: { author: { select: { id: true, email: true, displayName: true } } },
          });
          await tx.supportTicket.update({
            where: { id: ticket.id },
            data: {
              status: nextStatus,
              lastMessageAt: created.createdAt,
              resolvedAt: null,
              closedAt: null,
            },
          });
          await audit.record(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'federation.support_ticket.message_created',
              result: 'success',
              scopeFederationId: req.params.id,
              scopeCompetitionId: null,
              targetType: 'support_ticket',
              targetId: ticket.id,
              before: { status: ticket.status },
              after: { status: nextStatus, message: parsed.data.message, isInternal },
            },
            tx,
          );
          return created;
        });

        return reply.code(201).send({ message });
      },
    );

    app.patch<{ Params: { id: string; ticketId: string } }>(
      '/federations/:id/support-tickets/:ticketId',
      { preHandler: requireAuth() },
      async (req, reply) => {
        if (!canManageFederation(req.user, req.params.id, ['federation_admin'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'federation_admin role required', requestId: req.requestId },
          });
        }
        const parsed = SupportTicketUpdateInput.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'validation_error', message: parsed.error.message, requestId: req.requestId },
          });
        }

        const before = await prisma.supportTicket.findFirst({
          where: { id: req.params.ticketId, federationId: req.params.id },
        });
        if (!before) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Support ticket not found', requestId: req.requestId },
          });
        }

        const now = new Date();
        const ticket = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'federation.support_ticket.status_updated',
            scopeFederationId: req.params.id,
            scopeCompetitionId: null,
            targetType: 'support_ticket',
            targetId: before.id,
            before: { status: before.status },
            after: { status: parsed.data.status },
          },
          (tx) =>
            tx.supportTicket.update({
              where: { id: before.id },
              data: {
                status: parsed.data.status,
                resolvedAt: parsed.data.status === 'resolved' ? now : null,
                closedAt: parsed.data.status === 'closed' ? now : null,
              },
              include: {
                author: { select: { id: true, email: true, displayName: true } },
                messages: {
                  where: isPlatformAdmin(req.user) ? {} : { isInternal: false },
                  orderBy: { createdAt: 'asc' },
                  include: { author: { select: { id: true, email: true, displayName: true } } },
                },
              },
            }),
        );

        return { ticket };
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

    app.post<{ Params: { id: string } }>(
      '/federations/:id/attachments',
      { preHandler: requireAuth() },
      async (req, reply) => {
        if (!canManageFederation(req.user, req.params.id, ['federation_admin'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'federation_admin role required', requestId: req.requestId },
          });
        }
        const parsed = FederationAttachmentCreateInput.safeParse(req.body);
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

        const content = decodeBase64File(parsed.data.contentBase64);
        if (!content || content.length === 0 || content.length > MAX_FEDERATION_ATTACHMENT_BYTES) {
          return reply.code(400).send({
            error: {
              code: 'invalid_file',
              message: `File must be between 1 byte and ${MAX_FEDERATION_ATTACHMENT_BYTES} bytes`,
              requestId: req.requestId,
            },
          });
        }

        const filename = sanitizeFilename(parsed.data.filename);
        const storagePath = path.join('federations', req.params.id, `${randomUUID()}-${filename}`);
        const absolutePath = path.join(uploadRoot(), storagePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, content);

        try {
          const attachment = await prisma.$transaction(async (tx) => {
            const created = await tx.attachment.create({
              data: {
                kind: 'federation_file',
                federationId: req.params.id,
                uploadedByUserId: req.user!.id,
                filename,
                mimeType: parsed.data.mimeType,
                sizeBytes: BigInt(content.length),
                sha256: createHash('sha256').update(content).digest('hex'),
                storagePath,
              },
            });
            await audit.record(
              {
                ...audit.fromRequest(req),
                actorUserId: req.user!.id,
                action: 'federation.attachment.uploaded',
                result: 'success',
                scopeFederationId: req.params.id,
                scopeCompetitionId: null,
                targetType: 'attachment',
                targetId: created.id,
                before: null,
                after: { filename, mimeType: parsed.data.mimeType, sizeBytes: content.length },
              },
              tx,
            );
            return created;
          });
          return reply.code(201).send({ attachment });
        } catch (err) {
          await unlink(absolutePath).catch(() => undefined);
          throw err;
        }
      },
    );

    app.delete<{ Params: { id: string; attachmentId: string } }>(
      '/federations/:id/attachments/:attachmentId',
      { preHandler: requireAuth() },
      async (req, reply) => {
        if (!canManageFederation(req.user, req.params.id, ['federation_admin'])) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'federation_admin role required', requestId: req.requestId },
          });
        }
        const before = await prisma.attachment.findFirst({
          where: {
            id: req.params.attachmentId,
            federationId: req.params.id,
            deletedAt: null,
          },
        });
        if (!before) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Attachment not found', requestId: req.requestId },
          });
        }

        await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'federation.attachment.deleted',
            scopeFederationId: req.params.id,
            scopeCompetitionId: null,
            targetType: 'attachment',
            targetId: req.params.attachmentId,
            before: {
              filename: before.filename,
              mimeType: before.mimeType,
              sizeBytes: before.sizeBytes.toString(),
            },
            after: null,
          },
          (tx) =>
            tx.attachment.update({
              where: { id: req.params.attachmentId },
              data: { deletedAt: new Date() },
            }),
        );
        return { status: 'ok' };
      },
    );

    app.get<{ Params: { id: string; attachmentId: string } }>(
      '/federations/:id/attachments/:attachmentId/download',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const visible = visibleFederationIds(req.user);
        if (!('all' in visible) && !visible.ids.includes(req.params.id)) {
          return reply.code(403).send({
            error: { code: 'forbidden', message: 'Out of scope', requestId: req.requestId },
          });
        }

        const attachment = await prisma.attachment.findFirst({
          where: {
            id: req.params.attachmentId,
            federationId: req.params.id,
            deletedAt: null,
          },
        });
        if (!attachment) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Attachment not found', requestId: req.requestId },
          });
        }

        const root = path.resolve(uploadRoot());
        const absolutePath = path.resolve(root, attachment.storagePath);
        if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
          return reply.code(500).send({
            error: { code: 'invalid_storage_path', message: 'Attachment storage path is invalid', requestId: req.requestId },
          });
        }

        try {
          const content = await readFile(absolutePath);
          reply.header('Content-Type', attachment.mimeType);
          reply.header(
            'Content-Disposition',
            `attachment; filename="${contentDispositionFilename(attachment.filename)}"`,
          );
          return reply.send(content);
        } catch (err) {
          log.error({ err, attachmentId: attachment.id }, 'attachment file read failed');
          return reply.code(404).send({
            error: { code: 'file_missing', message: 'Attachment file is missing from storage', requestId: req.requestId },
          });
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
