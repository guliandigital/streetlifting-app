import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { AthleteCreate, AthleteUpdate, AthleteListQuery } from '@streetlifting/domain';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma } from '../lib/db.js';
import type { Prisma } from '../lib/db.js';
import { moduleLogger } from '../lib/logger.js';
import * as audit from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth/middleware.js';
import { validateUuidParams } from '../lib/params.js';

const log = moduleLogger('athletes');
const MAX_ATHLETE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

const AthleteAttachmentCreateInput = z
  .object({
    filename: z.string().min(1).max(180),
    mimeType: z.string().min(1).max(120),
    contentBase64: z.string().min(1),
    kind: z.enum(['athlete_photo', 'misc']).default('misc'),
  })
  .strict();

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

export const athletesPlugin: FeaturePlugin = {
  name: 'athletes',
  register: async (app) => {
    app.addHook('preHandler', validateUuidParams(['id', 'attachmentId']));

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

    app.post<{ Params: { id: string } }>(
      '/athletes/:id/attachments',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = AthleteAttachmentCreateInput.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }

        const athlete = await prisma.athlete.findUnique({
          where: { id: req.params.id },
          select: { id: true },
        });
        if (!athlete) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        }

        const content = decodeBase64File(parsed.data.contentBase64);
        if (!content || content.length === 0 || content.length > MAX_ATHLETE_ATTACHMENT_BYTES) {
          return reply.code(400).send({
            error: {
              code: 'invalid_file',
              message: `File must be between 1 byte and ${MAX_ATHLETE_ATTACHMENT_BYTES} bytes`,
              requestId: req.requestId,
            },
          });
        }
        if (
          parsed.data.kind === 'athlete_photo' &&
          !parsed.data.mimeType.toLowerCase().startsWith('image/')
        ) {
          return reply.code(400).send({
            error: {
              code: 'invalid_file',
              message: 'Athlete photo must be an image file',
              requestId: req.requestId,
            },
          });
        }

        const filename = sanitizeFilename(parsed.data.filename);
        const storagePath = path.join('athletes', req.params.id, `${randomUUID()}-${filename}`);
        const absolutePath = path.join(uploadRoot(), storagePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, content);

        try {
          const attachment = await prisma.$transaction(async (tx) => {
            const created = await tx.attachment.create({
              data: {
                kind: parsed.data.kind,
                athleteId: req.params.id,
                uploadedByUserId: req.user!.id,
                filename,
                mimeType: parsed.data.mimeType,
                sizeBytes: BigInt(content.length),
                sha256: createHash('sha256').update(content).digest('hex'),
                storagePath,
              },
              select: {
                id: true,
                kind: true,
                filename: true,
                mimeType: true,
                sizeBytes: true,
                uploadedAt: true,
              },
            });
            await audit.record(
              {
                ...audit.fromRequest(req),
                actorUserId: req.user!.id,
                action: 'athlete.attachment.uploaded',
                result: 'success',
                scopeFederationId: null,
                scopeCompetitionId: null,
                targetType: 'attachment',
                targetId: created.id,
                before: null,
                after: {
                  athleteId: req.params.id,
                  kind: parsed.data.kind,
                  filename,
                  mimeType: parsed.data.mimeType,
                  sizeBytes: content.length,
                },
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
      '/athletes/:id/attachments/:attachmentId',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const before = await prisma.attachment.findFirst({
          where: {
            id: req.params.attachmentId,
            athleteId: req.params.id,
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
            action: 'athlete.attachment.deleted',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'attachment',
            targetId: req.params.attachmentId,
            before: {
              athleteId: req.params.id,
              kind: before.kind,
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
      '/athletes/:id/attachments/:attachmentId/download',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const attachment = await prisma.attachment.findFirst({
          where: {
            id: req.params.attachmentId,
            athleteId: req.params.id,
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
            error: {
              code: 'invalid_storage_path',
              message: 'Attachment storage path is invalid',
              requestId: req.requestId,
            },
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
          log.error({ err, attachmentId: attachment.id }, 'athlete attachment file read failed');
          return reply.code(404).send({
            error: {
              code: 'file_missing',
              message: 'Attachment file is missing from storage',
              requestId: req.requestId,
            },
          });
        }
      },
    );
  },
};
