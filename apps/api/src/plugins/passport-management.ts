import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma } from '../lib/db.js';
import type { Prisma } from '@prisma/client';
import * as audit from '../lib/audit.js';
import { requireAuth } from '../lib/auth/middleware.js';

const uuid = z.string().uuid();
const MAX_PASSPORT_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const passportAttachmentInput = z
  .object({
    filename: z.string().trim().min(1).max(180),
    mimeType: z.string().trim().min(1).max(120),
    contentBase64: z.string().min(1),
    kind: z.enum(['certificate_pdf', 'misc']).default('misc'),
  })
  .strict();
const credentialInput = z.object({
  kind: z.enum(['category', 'attestation', 'certificate']),
  name: z.string().trim().min(1).max(160),
  credentialNumber: z.string().trim().min(1).max(120).nullable().optional(),
  issuedByFederationId: uuid,
  issuedAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable().optional(),
  documentAttachmentId: uuid.nullable().optional(),
});
const rankInput = credentialInput.omit({ kind: true, credentialNumber: true }).extend({
  basis: z.string().trim().min(1).max(1000),
});
const teamMemberInput = z.object({
  userId: uuid,
  role: z.enum([
    'organizer',
    'head_judge',
    'judge',
    'secretary',
    'assistant',
    'scoreboard_operator',
    'speaker',
    'technical_official',
    'medical_official',
  ]),
  platformId: uuid.nullable().optional(),
  judgeAssignmentId: uuid.nullable().optional(),
});
const teamMemberCorrectionInput = teamMemberInput
  .omit({ userId: true })
  .extend({ status: z.enum(['invited', 'confirmed', 'completed', 'declined', 'cancelled']) });
const passportRequestInput = z.object({
  federationId: uuid,
  kind: z.enum(['official_profile', 'official_credential', 'sport_rank']),
  payload: z.record(z.unknown()),
  supportingAttachmentId: uuid.nullable().optional(),
});
const officialProfileResolution = z.object({
  functions: z
    .array(
      z.enum([
        'judge',
        'secretary',
        'assistant',
        'scoreboard_operator',
        'speaker',
        'technical_official',
      ]),
    )
    .min(1),
});
const reviewInput = z.object({
  status: z.enum(['approved', 'rejected']),
  reviewNote: z.string().trim().max(1000).optional(),
  resolution: z.record(z.unknown()).optional(),
});
const profileUpdateInput = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    phone: z.string().trim().min(3).max(40).nullable().optional(),
    telegramHandle: z.string().trim().min(2).max(64).nullable().optional(),
  })
  .refine(
    (value) => Object.values(value).some((item) => item !== undefined),
    'No changes provided',
  );
const privacyInput = z.object({ privacyMode: z.enum(['public_results', 'hidden']) });
const reviewRequestQuery = z.object({
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
});

function defined(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function isFederationManager(
  req: { user: NonNullable<FastifyRequest['user']> },
  federationId: string,
  competitionId?: string,
): boolean {
  return req.user.roles.some(
    (role) =>
      role.role === 'platform_admin' ||
      ((role.role === 'federation_admin' || role.role === 'secretary') &&
        (role.federationId === federationId ||
          (competitionId && role.competitionId === competitionId))),
  );
}

function invalid(reply: FastifyReply, requestId: string, message: string) {
  return reply.code(400).send({ error: { code: 'validation_error', message, requestId } });
}

function uploadRoot(): string {
  return process.env.STORAGE_DIR ?? path.join(process.cwd(), 'storage');
}

function sanitizeFilename(filename: string): string {
  return (
    filename
      .replace(/[\\/:"*?<>|]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 180) || 'file'
  );
}

function decodeBase64File(contentBase64: string): Buffer | null {
  const normalized = contentBase64.includes(',')
    ? contentBase64.slice(contentBase64.indexOf(',') + 1)
    : contentBase64;
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 === 1) return null;
  try {
    return Buffer.from(normalized, 'base64');
  } catch {
    return null;
  }
}

function contentDispositionFilename(filename: string): string {
  return sanitizeFilename(filename).replace(/[\r\n"]/g, '_');
}

function resolveApproval(
  request: { kind: string; federationId: string; applicantUserId: string },
  resolution: Record<string, unknown> | undefined,
) {
  if (!resolution) return { error: 'Approval requires final federation data' } as const;
  if (request.kind === 'official_profile') {
    const parsed = officialProfileResolution.safeParse(resolution);
    return parsed.success
      ? { kind: request.kind, value: parsed.data }
      : { error: parsed.error.message };
  }
  if (request.kind === 'official_credential') {
    const parsed = credentialInput.safeParse({
      ...resolution,
      issuedByFederationId: request.federationId,
    });
    if (!parsed.success) return { error: parsed.error.message } as const;
    if (parsed.data.expiresAt && parsed.data.expiresAt < parsed.data.issuedAt)
      return { error: 'expiresAt must not precede issuedAt' } as const;
    return { kind: request.kind, value: parsed.data };
  }
  if (request.kind === 'sport_rank') {
    const parsed = rankInput.safeParse({
      ...resolution,
      issuedByFederationId: request.federationId,
    });
    if (!parsed.success) return { error: parsed.error.message } as const;
    if (parsed.data.expiresAt && parsed.data.expiresAt < parsed.data.issuedAt)
      return { error: 'expiresAt must not precede issuedAt' } as const;
    return { kind: request.kind, value: parsed.data };
  }
  return { error: 'Unsupported passport request kind' } as const;
}

/** Federation-only finalization paths for Passport evidence. There is
 * deliberately no owner update endpoint for credentials, ranks or team facts. */
export const passportManagementPlugin: FeaturePlugin = {
  name: 'passport-management',
  register: async (app) => {
    app.patch('/passport/profile', { preHandler: requireAuth() }, async (req, reply) => {
      const parsed = profileUpdateInput.safeParse(req.body);
      if (!parsed.success) return invalid(reply, req.requestId, parsed.error.message);
      const before = await prisma.user.findUnique({ where: { id: req.user!.id } });
      if (!before)
        return reply.code(404).send({
          error: { code: 'not_found', message: 'User not found', requestId: req.requestId },
        });
      const user = await audit.withAudit(
        {
          ...audit.fromRequest(req),
          actorUserId: req.user!.id,
          action: 'passport.profile.updated',
          scopeFederationId: null,
          scopeCompetitionId: null,
          targetType: 'user',
          targetId: before.id,
          before: {
            displayName: before.displayName,
            phone: before.phone,
            telegramHandle: before.telegramHandle,
          },
          after: parsed.data,
        },
        (tx) =>
          tx.user.update({
            where: { id: before.id },
            data: defined(parsed.data) as Prisma.UserUncheckedUpdateInput,
            select: { id: true, displayName: true, phone: true, telegramHandle: true },
          }),
      );
      return { user };
    });

    app.patch('/passport/privacy', { preHandler: requireAuth() }, async (req, reply) => {
      const parsed = privacyInput.safeParse(req.body);
      if (!parsed.success) return invalid(reply, req.requestId, parsed.error.message);
      const before = await prisma.athlete.findUnique({
        where: { userId: req.user!.id },
        select: { id: true, privacyMode: true },
      });
      if (!before)
        return reply.code(404).send({
          error: {
            code: 'not_found',
            message: 'Athlete profile not linked',
            requestId: req.requestId,
          },
        });
      const athlete = await audit.withAudit(
        {
          ...audit.fromRequest(req),
          actorUserId: req.user!.id,
          action: 'passport.privacy.updated',
          scopeFederationId: null,
          scopeCompetitionId: null,
          targetType: 'athlete',
          targetId: before.id,
          before,
          after: parsed.data,
        },
        (tx) =>
          tx.athlete.update({
            where: { id: before.id },
            data: parsed.data,
            select: { id: true, privacyMode: true },
          }),
      );
      return { athlete };
    });

    app.post<{ Params: { id: string } }>(
      '/passport/consents/:id/revoke',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const before = await prisma.consent.findFirst({
          where: {
            id: req.params.id,
            revokedAt: null,
            OR: [{ userId: req.user!.id }, { athlete: { userId: req.user!.id } }],
          },
        });
        if (!before)
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Active consent not found',
              requestId: req.requestId,
            },
          });
        const consent = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'passport.consent.revoked',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'consent',
            targetId: before.id,
            before,
            after: { revokedAt: new Date().toISOString() },
          },
          (tx) => tx.consent.update({ where: { id: before.id }, data: { revokedAt: new Date() } }),
        );
        return { consent };
      },
    );

    app.get('/passport/attachments', { preHandler: requireAuth() }, async (req) => {
      const attachments = await prisma.attachment.findMany({
        where: {
          deletedAt: null,
          OR: [
            { uploadedByUserId: req.user!.id },
            { passportReviewRequests: { some: { applicantUserId: req.user!.id } } },
            {
              officialCredentialDocuments: {
                some: { officialProfile: { userId: req.user!.id } },
              },
            },
            { sportRankAwardDocuments: { some: { athlete: { userId: req.user!.id } } } },
          ],
        },
        select: {
          id: true,
          kind: true,
          filename: true,
          mimeType: true,
          sizeBytes: true,
          uploadedAt: true,
        },
        orderBy: { uploadedAt: 'desc' },
      });
      return {
        attachments: attachments.map((attachment) => ({
          ...attachment,
          sizeBytes: attachment.sizeBytes.toString(),
          uploadedAt: attachment.uploadedAt.toISOString(),
        })),
      };
    });

    app.post('/passport/attachments', { preHandler: requireAuth() }, async (req, reply) => {
      const parsed = passportAttachmentInput.safeParse(req.body);
      if (!parsed.success) return invalid(reply, req.requestId, parsed.error.message);
      const content = decodeBase64File(parsed.data.contentBase64);
      if (!content || content.length === 0 || content.length > MAX_PASSPORT_ATTACHMENT_BYTES)
        return reply.code(400).send({
          error: {
            code: 'invalid_file',
            message: `File must be between 1 byte and ${MAX_PASSPORT_ATTACHMENT_BYTES} bytes`,
            requestId: req.requestId,
          },
        });
      const filename = sanitizeFilename(parsed.data.filename);
      const storagePath = path.join('passport', req.user!.id, `${randomUUID()}-${filename}`);
      const absolutePath = path.join(uploadRoot(), storagePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content);
      try {
        const attachment = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'passport.attachment.uploaded',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'attachment',
            targetId: 'pending',
            before: null,
            after: {
              kind: parsed.data.kind,
              filename,
              mimeType: parsed.data.mimeType,
              sizeBytes: content.length,
            },
          },
          (tx) =>
            tx.attachment.create({
              data: {
                kind: parsed.data.kind,
                uploadedByUserId: req.user!.id,
                filename,
                mimeType: parsed.data.mimeType,
                sizeBytes: BigInt(content.length),
                sha256: createHash('sha256').update(content).digest('hex'),
                storagePath,
              },
            }),
        );
        return reply.code(201).send({
          attachment: {
            id: attachment.id,
            kind: attachment.kind,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
            sizeBytes: attachment.sizeBytes.toString(),
            uploadedAt: attachment.uploadedAt.toISOString(),
          },
        });
      } catch (error) {
        await unlink(absolutePath).catch(() => undefined);
        throw error;
      }
    });

    app.get<{ Params: { id: string } }>(
      '/passport/attachments/:id/download',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const attachment = await prisma.attachment.findUnique({
          where: { id: req.params.id },
          include: {
            passportReviewRequests: { select: { applicantUserId: true, federationId: true } },
            officialCredentialDocuments: {
              select: { officialProfile: { select: { userId: true } } },
            },
            sportRankAwardDocuments: { select: { athlete: { select: { userId: true } } } },
          },
        });
        const canRead =
          attachment &&
          !attachment.deletedAt &&
          (attachment.uploadedByUserId === req.user!.id ||
            attachment.passportReviewRequests.some(
              (request) =>
                request.applicantUserId === req.user!.id ||
                isFederationManager(req as never, request.federationId),
            ) ||
            attachment.officialCredentialDocuments.some(
              (credential) => credential.officialProfile.userId === req.user!.id,
            ) ||
            attachment.sportRankAwardDocuments.some(
              (rank) => rank.athlete.userId === req.user!.id,
            ));
        if (!canRead || !attachment)
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Attachment not found', requestId: req.requestId },
          });
        const root = path.resolve(uploadRoot());
        const absolutePath = path.resolve(root, attachment.storagePath);
        if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`))
          return reply.code(500).send({
            error: {
              code: 'invalid_storage_path',
              message: 'Attachment storage path is invalid',
              requestId: req.requestId,
            },
          });
        try {
          const content = await readFile(absolutePath);
          reply.header('Content-Type', attachment.mimeType);
          reply.header(
            'Content-Disposition',
            `attachment; filename="${contentDispositionFilename(attachment.filename)}"`,
          );
          return reply.send(content);
        } catch {
          return reply.code(404).send({
            error: {
              code: 'file_missing',
              message: 'Attachment file is missing',
              requestId: req.requestId,
            },
          });
        }
      },
    );

    app.get('/passport/requests', { preHandler: requireAuth() }, async (req) => {
      const requests = await prisma.passportReviewRequest.findMany({
        where: { applicantUserId: req.user!.id },
        orderBy: { submittedAt: 'desc' },
        select: {
          id: true,
          federationId: true,
          kind: true,
          status: true,
          payload: true,
          supportingAttachmentId: true,
          submittedAt: true,
          resolvedAt: true,
          reviewNote: true,
        },
      });
      return { requests };
    });

    app.get<{ Params: { federationId: string } }>(
      '/passport/federations/:federationId/review-requests',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const federationId = uuid.safeParse(req.params.federationId);
        const query = reviewRequestQuery.safeParse(req.query);
        if (!federationId.success) return invalid(reply, req.requestId, federationId.error.message);
        if (!query.success) return invalid(reply, req.requestId, query.error.message);
        if (!isFederationManager(req as never, federationId.data))
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'Federation approval required',
              requestId: req.requestId,
            },
          });
        const requests = await prisma.passportReviewRequest.findMany({
          where: {
            federationId: federationId.data,
            ...(query.data.status ? { status: query.data.status } : {}),
          },
          orderBy: { submittedAt: 'asc' },
          select: {
            id: true,
            kind: true,
            status: true,
            payload: true,
            submittedAt: true,
            resolvedAt: true,
            reviewNote: true,
            applicant: { select: { id: true, displayName: true } },
            supportingAttachment: {
              select: {
                id: true,
                filename: true,
                mimeType: true,
                sizeBytes: true,
                uploadedAt: true,
              },
            },
          },
        });
        return {
          requests: requests.map((item) => ({
            ...item,
            submittedAt: item.submittedAt.toISOString(),
            resolvedAt: item.resolvedAt?.toISOString() ?? null,
            supportingAttachment: item.supportingAttachment
              ? {
                  ...item.supportingAttachment,
                  sizeBytes: item.supportingAttachment.sizeBytes.toString(),
                  uploadedAt: item.supportingAttachment.uploadedAt.toISOString(),
                }
              : null,
          })),
        };
      },
    );

    app.post('/passport/requests', { preHandler: requireAuth() }, async (req, reply) => {
      const parsed = passportRequestInput.safeParse(req.body);
      if (!parsed.success) return invalid(reply, req.requestId, parsed.error.message);
      const [federation, attachment] = await Promise.all([
        prisma.federation.findUnique({
          where: { id: parsed.data.federationId },
          select: { id: true },
        }),
        parsed.data.supportingAttachmentId
          ? prisma.attachment.findFirst({
              where: {
                id: parsed.data.supportingAttachmentId,
                uploadedByUserId: req.user!.id,
                deletedAt: null,
              },
              select: { id: true },
            })
          : null,
      ]);
      if (!federation)
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Federation not found', requestId: req.requestId },
        });
      if (parsed.data.supportingAttachmentId && !attachment)
        return reply.code(403).send({
          error: {
            code: 'forbidden',
            message: 'Supporting document is not owned by user',
            requestId: req.requestId,
          },
        });
      const request = await audit.withAudit(
        {
          ...audit.fromRequest(req),
          actorUserId: req.user!.id,
          action: 'passport.review_request.submitted',
          scopeFederationId: parsed.data.federationId,
          scopeCompetitionId: null,
          targetType: 'passport_review_request',
          targetId: 'pending',
          before: null,
          after: parsed.data,
        },
        (tx) =>
          tx.passportReviewRequest.create({
            data: defined({
              ...parsed.data,
              applicantUserId: req.user!.id,
            }) as Prisma.PassportReviewRequestUncheckedCreateInput,
          }),
      );
      return reply.code(201).send({ request });
    });

    app.post<{ Params: { id: string } }>(
      '/passport/requests/:id/cancel',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const before = await prisma.passportReviewRequest.findUnique({
          where: { id: req.params.id },
        });
        if (!before)
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Request not found', requestId: req.requestId },
          });
        if (before.applicantUserId !== req.user!.id)
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'Request belongs to another user',
              requestId: req.requestId,
            },
          });
        if (before.status !== 'pending')
          return reply.code(409).send({
            error: {
              code: 'request_not_pending',
              message: 'Only pending requests can be cancelled',
              requestId: req.requestId,
            },
          });
        const request = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'passport.review_request.cancelled',
            scopeFederationId: before.federationId,
            scopeCompetitionId: null,
            targetType: 'passport_review_request',
            targetId: before.id,
            before,
            after: { status: 'cancelled' },
          },
          (tx) =>
            tx.passportReviewRequest.update({
              where: { id: before.id },
              data: { status: 'cancelled' },
            }),
        );
        return { request };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/passport/requests/:id/review',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const parsed = reviewInput.safeParse(req.body);
        if (!parsed.success) return invalid(reply, req.requestId, parsed.error.message);
        const before = await prisma.passportReviewRequest.findUnique({
          where: { id: req.params.id },
        });
        if (!before)
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Request not found', requestId: req.requestId },
          });
        if (!isFederationManager(req as never, before.federationId))
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'Federation approval required',
              requestId: req.requestId,
            },
          });
        if (before.status !== 'pending')
          return reply.code(409).send({
            error: {
              code: 'request_not_pending',
              message: 'Request has already been resolved',
              requestId: req.requestId,
            },
          });
        const approval =
          parsed.data.status === 'approved'
            ? resolveApproval(before, parsed.data.resolution)
            : null;
        if (approval && 'error' in approval) return invalid(reply, req.requestId, approval.error);
        if (approval?.kind === 'official_credential') {
          const profile = await prisma.officialProfile.findUnique({
            where: { userId: before.applicantUserId },
            select: { id: true },
          });
          if (!profile)
            return reply.code(409).send({
              error: {
                code: 'official_profile_required',
                message: 'Official profile must be approved before a credential',
                requestId: req.requestId,
              },
            });
        }
        if (approval?.kind === 'sport_rank') {
          const athlete = await prisma.athlete.findUnique({
            where: { userId: before.applicantUserId },
            select: { id: true },
          });
          if (!athlete)
            return reply.code(409).send({
              error: {
                code: 'athlete_profile_required',
                message: 'Athlete profile must be linked before a sport rank',
                requestId: req.requestId,
              },
            });
        }
        const request = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: `passport.review_request.${parsed.data.status}`,
            scopeFederationId: before.federationId,
            scopeCompetitionId: null,
            targetType: 'passport_review_request',
            targetId: before.id,
            before,
            after: {
              status: parsed.data.status,
              reviewNote: parsed.data.reviewNote,
              resolution: approval,
            },
          },
          async (tx) => {
            if (approval?.kind === 'official_profile') {
              const profileResolution = officialProfileResolution.parse(parsed.data.resolution);
              await tx.officialProfile.upsert({
                where: { userId: before.applicantUserId },
                create: { userId: before.applicantUserId, functions: profileResolution.functions },
                update: { functions: profileResolution.functions },
              });
            } else if (approval?.kind === 'official_credential') {
              const profile = await tx.officialProfile.findUnique({
                where: { userId: before.applicantUserId },
                select: { id: true },
              });
              if (!profile)
                throw new Error('Official profile must be approved before a credential');
              await tx.officialCredential.create({
                data: defined({
                  ...approval.value,
                  officialProfileId: profile.id,
                }) as Prisma.OfficialCredentialUncheckedCreateInput,
              });
            } else if (approval?.kind === 'sport_rank') {
              const athlete = await tx.athlete.findUnique({
                where: { userId: before.applicantUserId },
                select: { id: true },
              });
              if (!athlete) throw new Error('Athlete profile must be linked before a sport rank');
              await tx.sportRankAward.create({
                data: defined({
                  ...approval.value,
                  athleteId: athlete.id,
                }) as Prisma.SportRankAwardUncheckedCreateInput,
              });
            }
            return tx.passportReviewRequest.update({
              where: { id: before.id },
              data: defined({
                status: parsed.data.status,
                reviewNote: parsed.data.reviewNote,
                resolvedAt: new Date(),
                resolvedByUserId: req.user!.id,
              }) as Prisma.PassportReviewRequestUncheckedUpdateInput,
            });
          },
        );
        return { request };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/passport/official-profiles/:id/credentials',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const parsed = credentialInput.safeParse(req.body);
        if (!parsed.success) return invalid(reply, req.requestId, parsed.error.message);
        if (parsed.data.expiresAt && parsed.data.expiresAt < parsed.data.issuedAt)
          return invalid(reply, req.requestId, 'expiresAt must not precede issuedAt');
        if (!isFederationManager(req as never, parsed.data.issuedByFederationId))
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'Federation approval required',
              requestId: req.requestId,
            },
          });
        const profile = await prisma.officialProfile.findUnique({
          where: { id: req.params.id },
          select: { id: true },
        });
        if (!profile)
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Official profile not found',
              requestId: req.requestId,
            },
          });
        const credential = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'passport.official_credential.issued',
            scopeFederationId: parsed.data.issuedByFederationId,
            scopeCompetitionId: null,
            targetType: 'official_credential',
            targetId: 'pending',
            before: null,
            after: parsed.data,
          },
          (tx) =>
            tx.officialCredential.create({
              data: defined({
                ...parsed.data,
                officialProfileId: profile.id,
              }) as Prisma.OfficialCredentialUncheckedCreateInput,
            }),
        );
        return reply.code(201).send({ credential });
      },
    );

    app.post<{ Params: { id: string } }>(
      '/passport/athletes/:id/ranks',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const parsed = rankInput.safeParse(req.body);
        if (!parsed.success) return invalid(reply, req.requestId, parsed.error.message);
        if (parsed.data.expiresAt && parsed.data.expiresAt < parsed.data.issuedAt)
          return invalid(reply, req.requestId, 'expiresAt must not precede issuedAt');
        if (!isFederationManager(req as never, parsed.data.issuedByFederationId))
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'Federation approval required',
              requestId: req.requestId,
            },
          });
        const athlete = await prisma.athlete.findUnique({
          where: { id: req.params.id },
          select: { id: true },
        });
        if (!athlete)
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        const rank = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'passport.sport_rank.issued',
            scopeFederationId: parsed.data.issuedByFederationId,
            scopeCompetitionId: null,
            targetType: 'sport_rank_award',
            targetId: 'pending',
            before: null,
            after: parsed.data,
          },
          (tx) =>
            tx.sportRankAward.create({
              data: defined({
                ...parsed.data,
                athleteId: athlete.id,
              }) as Prisma.SportRankAwardUncheckedCreateInput,
            }),
        );
        return reply.code(201).send({ rank });
      },
    );

    app.get<{ Params: { id: string } }>(
      '/competitions/:id/team-members',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const competition = await prisma.competition.findUnique({
          where: { id: req.params.id },
          select: { id: true, federationId: true },
        });
        if (!competition)
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Competition not found',
              requestId: req.requestId,
            },
          });
        if (!isFederationManager(req as never, competition.federationId, competition.id))
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'Competition team management required',
              requestId: req.requestId,
            },
          });
        const teamMembers = await prisma.competitionTeamMember.findMany({
          where: { competitionId: competition.id },
          select: {
            id: true,
            userId: true,
            role: true,
            status: true,
            memberNameSnapshot: true,
            platform: { select: { id: true, name: true } },
            judgeAssignmentId: true,
            invitedAt: true,
            confirmedAt: true,
            completedAt: true,
            correctionOfId: true,
          },
          orderBy: [{ invitedAt: 'desc' }, { id: 'desc' }],
        });
        return {
          teamMembers: teamMembers.map((member) => ({
            ...member,
            invitedAt: member.invitedAt?.toISOString() ?? null,
            confirmedAt: member.confirmedAt?.toISOString() ?? null,
            completedAt: member.completedAt?.toISOString() ?? null,
          })),
        };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/competitions/:id/team-members',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const parsed = teamMemberInput.safeParse(req.body);
        if (!parsed.success) return invalid(reply, req.requestId, parsed.error.message);
        const competition = await prisma.competition.findUnique({
          where: { id: req.params.id },
          select: { id: true, federationId: true, status: true },
        });
        if (!competition)
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Competition not found',
              requestId: req.requestId,
            },
          });
        if (!isFederationManager(req as never, competition.federationId, competition.id))
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'Competition team management required',
              requestId: req.requestId,
            },
          });
        if (competition.status === 'finalized' || competition.status === 'archived')
          return reply.code(409).send({
            error: {
              code: 'competition_team_frozen',
              message: 'Create a correction instead of changing a finalized team',
              requestId: req.requestId,
            },
          });
        const memberUser = await prisma.user.findUnique({
          where: { id: parsed.data.userId },
          select: { displayName: true },
        });
        if (!memberUser)
          return reply.code(400).send({
            error: {
              code: 'user_not_found',
              message: 'User not found',
              requestId: req.requestId,
            },
          });
        if (parsed.data.judgeAssignmentId && !['judge', 'head_judge'].includes(parsed.data.role))
          return invalid(
            reply,
            req.requestId,
            'judgeAssignmentId is only valid for judge or head_judge team roles',
          );
        const assignments = ['judge', 'head_judge'].includes(parsed.data.role)
          ? await prisma.judgeAssignment.findMany({
              where: {
                competitionId: competition.id,
                judge: { userId: parsed.data.userId },
                ...(parsed.data.judgeAssignmentId ? { id: parsed.data.judgeAssignmentId } : {}),
              },
              select: { id: true },
              take: parsed.data.judgeAssignmentId ? 1 : 2,
            })
          : [];
        if (parsed.data.judgeAssignmentId && assignments.length !== 1)
          return reply.code(409).send({
            error: {
              code: 'judge_assignment_mismatch',
              message: 'Judge assignment must belong to this competition and team member',
              requestId: req.requestId,
            },
          });
        const judgeAssignmentId =
          parsed.data.judgeAssignmentId ?? (assignments.length === 1 ? assignments[0]!.id : null);
        const teamMember = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'passport.team_member.invited',
            scopeFederationId: competition.federationId,
            scopeCompetitionId: competition.id,
            targetType: 'competition_team_member',
            targetId: 'pending',
            before: null,
            after: parsed.data,
          },
          (tx) =>
            tx.competitionTeamMember.create({
              data: defined({
                ...parsed.data,
                judgeAssignmentId,
                competitionId: competition.id,
                memberNameSnapshot: memberUser.displayName,
                status: 'invited',
                invitedAt: new Date(),
              }) as Prisma.CompetitionTeamMemberUncheckedCreateInput,
            }),
        );
        return reply.code(201).send({ teamMember });
      },
    );

    // The member can only answer their own invitation. This never changes a
    // finalized team snapshot and is fully auditable.
    app.post<{ Params: { id: string } }>(
      '/competition-team-members/:id/respond',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const parsed = z.object({ status: z.enum(['confirmed', 'declined']) }).safeParse(req.body);
        if (!parsed.success) return invalid(reply, req.requestId, parsed.error.message);
        const before = await prisma.competitionTeamMember.findUnique({
          where: { id: req.params.id },
          include: { competition: { select: { federationId: true, status: true } } },
        });
        if (!before)
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Team member not found',
              requestId: req.requestId,
            },
          });
        if (before.userId !== req.user!.id)
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'Invitation belongs to another user',
              requestId: req.requestId,
            },
          });
        if (
          before.status !== 'invited' ||
          before.competition.status === 'finalized' ||
          before.competition.status === 'archived'
        )
          return reply.code(409).send({
            error: {
              code: 'invitation_not_actionable',
              message: 'Invitation is not actionable',
              requestId: req.requestId,
            },
          });
        const at = new Date();
        const teamMember = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: `passport.team_member.${parsed.data.status}`,
            scopeFederationId: before.competition.federationId,
            scopeCompetitionId: before.competitionId,
            targetType: 'competition_team_member',
            targetId: before.id,
            before,
            after: parsed.data,
          },
          (tx) =>
            tx.competitionTeamMember.update({
              where: { id: before.id },
              data:
                parsed.data.status === 'confirmed'
                  ? { status: 'confirmed', confirmedAt: at }
                  : { status: 'declined' },
            }),
        );
        return { teamMember };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/competition-team-members/:id/complete',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const before = await prisma.competitionTeamMember.findUnique({
          where: { id: req.params.id },
          include: { competition: { select: { federationId: true } } },
        });
        if (!before)
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Team member not found',
              requestId: req.requestId,
            },
          });
        if (
          !isFederationManager(req as never, before.competition.federationId, before.competitionId)
        )
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'Competition team management required',
              requestId: req.requestId,
            },
          });
        if (before.status !== 'confirmed')
          return reply.code(409).send({
            error: {
              code: 'team_member_not_confirmed',
              message: 'Only confirmed members can be completed',
              requestId: req.requestId,
            },
          });
        const teamMember = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'passport.team_member.completed',
            scopeFederationId: before.competition.federationId,
            scopeCompetitionId: before.competitionId,
            targetType: 'competition_team_member',
            targetId: before.id,
            before,
            after: { status: 'completed' },
          },
          (tx) =>
            tx.competitionTeamMember.update({
              where: { id: before.id },
              data: { status: 'completed', completedAt: new Date() },
            }),
        );
        return { teamMember };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/competition-team-members/:id/corrections',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const parsed = teamMemberCorrectionInput.safeParse(req.body);
        if (!parsed.success) return invalid(reply, req.requestId, parsed.error.message);
        const before = await prisma.competitionTeamMember.findUnique({
          where: { id: req.params.id },
          include: { competition: { select: { federationId: true } } },
        });
        if (!before)
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Team member not found',
              requestId: req.requestId,
            },
          });
        if (
          !isFederationManager(req as never, before.competition.federationId, before.competitionId)
        )
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'Competition team management required',
              requestId: req.requestId,
            },
          });
        if (parsed.data.judgeAssignmentId && !['judge', 'head_judge'].includes(parsed.data.role))
          return invalid(
            reply,
            req.requestId,
            'judgeAssignmentId is only valid for judge or head_judge team roles',
          );
        const assignments = ['judge', 'head_judge'].includes(parsed.data.role)
          ? await prisma.judgeAssignment.findMany({
              where: {
                competitionId: before.competitionId,
                judge: { userId: before.userId },
                ...(parsed.data.judgeAssignmentId ? { id: parsed.data.judgeAssignmentId } : {}),
              },
              select: { id: true },
              take: parsed.data.judgeAssignmentId ? 1 : 2,
            })
          : [];
        if (parsed.data.judgeAssignmentId && assignments.length !== 1)
          return reply.code(409).send({
            error: {
              code: 'judge_assignment_mismatch',
              message: 'Judge assignment must belong to this competition and team member',
              requestId: req.requestId,
            },
          });
        const judgeAssignmentId =
          parsed.data.judgeAssignmentId ?? (assignments.length === 1 ? assignments[0]!.id : null);
        const teamMember = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'passport.team_member.corrected',
            scopeFederationId: before.competition.federationId,
            scopeCompetitionId: before.competitionId,
            targetType: 'competition_team_member',
            targetId: before.id,
            before,
            after: parsed.data,
          },
          (tx) =>
            tx.competitionTeamMember.create({
              data: defined({
                ...parsed.data,
                judgeAssignmentId,
                competitionId: before.competitionId,
                userId: before.userId,
                memberNameSnapshot: before.memberNameSnapshot,
                correctionOfId: before.id,
                invitedAt: before.invitedAt,
                confirmedAt: before.confirmedAt,
                completedAt:
                  parsed.data.status === 'completed' ? (before.completedAt ?? new Date()) : null,
              }) as Prisma.CompetitionTeamMemberUncheckedCreateInput,
            }),
        );
        return reply.code(201).send({ teamMember });
      },
    );
  },
};
