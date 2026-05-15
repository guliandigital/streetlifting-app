import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  AthleteCreate,
  AthleteUpdate,
  AthleteListQuery,
  calculations,
  presets,
} from '@streetlifting/domain';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma } from '../lib/db.js';
import type { Prisma } from '../lib/db.js';
import { moduleLogger } from '../lib/logger.js';
import * as audit from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth/middleware.js';
import { validateUuidParams } from '../lib/params.js';

const PRESET_BY_DISCIPLINE_CODE = new Map(presets.ISF_V51_DISCIPLINES.map((p) => [p.code, p]));

function isfClassicDisciplineForCode(code: string): calculations.ISFClassicDiscipline | null {
  const preset = PRESET_BY_DISCIPLINE_CODE.get(code);
  if (!preset) return null;
  return calculations.mapEventToISFClassicDiscipline(preset.event);
}

function computeAppearanceIsfPoints(
  disciplineCode: string,
  sex: 'M' | 'F',
  bodyWeightAtWeighIn: number | null,
  bestSuccessfulAttemptKg: number | null,
): { isfPointsRaw: number | null; isfPointsPub: number | null; isfCurveVersion: string | null } {
  const classicDiscipline = isfClassicDisciplineForCode(disciplineCode);
  if (!classicDiscipline || bodyWeightAtWeighIn === null || bestSuccessfulAttemptKg === null) {
    return { isfPointsRaw: null, isfPointsPub: null, isfCurveVersion: null };
  }
  const r = calculations.isfPoints({
    result: bestSuccessfulAttemptKg,
    bodyWeightKg: bodyWeightAtWeighIn,
    sex,
    discipline: classicDiscipline,
  });
  if (!r) return { isfPointsRaw: null, isfPointsPub: null, isfCurveVersion: null };
  return {
    isfPointsRaw: r.pointsRaw,
    isfPointsPub: r.pointsPub,
    isfCurveVersion: r.curveVersion,
  };
}

const log = moduleLogger('athletes');

const MAX_ATHLETE_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATHLETE_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_PHOTO_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

const AthleteAttachmentCreateInput = z
  .object({
    filename: z.string().min(1).max(180),
    mimeType: z.string().min(1).max(120),
    contentBase64: z.string().min(1),
    kind: z.enum(['certificate_pdf', 'misc']).default('misc'),
  })
  .strict();

const AthletePhotoCreateInput = z
  .object({
    filename: z.string().min(1).max(180),
    mimeType: z.string().min(1).max(120),
    contentBase64: z.string().min(1),
  })
  .strict();

function photoUrlFor(athleteId: string): string {
  return `/api/athletes/${athleteId}/photo`;
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
      const { search, gender, countryCode, cardNumberContains, bornFrom, bornTo, limit, offset } =
        parsed.data;

      const conditions: Prisma.AthleteWhereInput[] = [];
      if (search) {
        conditions.push({
          OR: [
            { lastName: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { middleName: { contains: search, mode: 'insensitive' } },
          ],
        });
      }
      if (gender) conditions.push({ gender });
      if (countryCode) conditions.push({ countryCode: countryCode.toUpperCase() });
      if (cardNumberContains) {
        conditions.push({
          federationCardNumber: { contains: cardNumberContains, mode: 'insensitive' },
        });
      }
      if (bornFrom || bornTo) {
        const dobRange: { gte?: Date; lte?: Date } = {};
        if (bornFrom) dobRange.gte = new Date(bornFrom);
        if (bornTo) dobRange.lte = new Date(bornTo);
        conditions.push({ dateOfBirth: dobRange });
      }
      const where: Prisma.AthleteWhereInput = conditions.length ? { AND: conditions } : {};

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
        const athlete = await prisma.athlete.findUnique({ where: { id: req.params.id } });
        if (!athlete) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        }
        return { athlete };
      },
    );

    // ─── Appearances (cross-meet competition history) ─────────────────
    app.get<{ Params: { id: string } }>(
      '/athletes/:id/appearances',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const athlete = await prisma.athlete.findUnique({
          where: { id: req.params.id },
          select: { id: true, gender: true },
        });
        if (!athlete) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        }
        const nominations = await prisma.nomination.findMany({
          where: { athleteId: req.params.id },
          include: {
            competition: {
              select: { id: true, nameRu: true, startDate: true, city: true },
            },
            discipline: { select: { code: true, nameRu: true } },
            division: { select: { code: true, nameRu: true } },
            weightClass: { select: { code: true, nameRu: true } },
          },
          orderBy: [{ competition: { startDate: 'desc' } }],
        });
        const appearances = nominations.map((n) => {
          const points = computeAppearanceIsfPoints(
            n.discipline.code,
            athlete.gender,
            n.bodyWeightAtWeighIn,
            n.bestSuccessfulAttemptKg,
          );
          return {
            id: n.id,
            competitionId: n.competitionId,
            competitionName: n.competition.nameRu,
            competitionStartDate: n.competition.startDate.toISOString(),
            competitionCity: n.competition.city,
            disciplineCode: n.discipline.code,
            disciplineName: n.discipline.nameRu,
            divisionCode: n.division.code,
            divisionName: n.division.nameRu,
            weightClassCode: n.weightClass.code,
            weightClassName: n.weightClass.nameRu,
            bodyWeightAtWeighIn: n.bodyWeightAtWeighIn,
            bestSuccessfulAttemptKg: n.bestSuccessfulAttemptKg,
            finalScore: n.finalScore,
            isfPointsRaw: points.isfPointsRaw,
            isfPointsPub: points.isfPointsPub,
            isfCurveVersion: points.isfCurveVersion,
            placeOverall: n.placeOverall,
            placeInDivision: n.placeInDivision,
            placeInClass: n.placeInClass,
            status: n.status,
          };
        });
        return { appearances, total: appearances.length };
      },
    );

    // ─── Records (federation/national/continental/world held by athlete) ──
    app.get<{ Params: { id: string } }>(
      '/athletes/:id/records',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const exists = await prisma.athlete.findUnique({
          where: { id: req.params.id },
          select: { id: true },
        });
        if (!exists) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        }
        const records = await prisma.record.findMany({
          where: { athleteId: req.params.id },
          include: {
            discipline: { select: { code: true, nameRu: true } },
            division: { select: { code: true, nameRu: true } },
            weightClass: { select: { code: true, nameRu: true } },
            competition: { select: { id: true, nameRu: true } },
          },
          orderBy: [{ achievedOn: 'desc' }],
        });
        const items = records.map((r) => ({
          id: r.id,
          scope: r.scope,
          achievedOn: r.achievedOn.toISOString(),
          disciplineCode: r.discipline.code,
          disciplineName: r.discipline.nameRu,
          divisionCode: r.division.code,
          divisionName: r.division.nameRu,
          weightClassCode: r.weightClass.code,
          weightClassName: r.weightClass.nameRu,
          result: r.result,
          pointsScore: r.pointsScore,
          competitionId: r.competitionId,
          competitionName: r.competition.nameRu,
          ratifiedAt: r.ratifiedAt ? r.ratifiedAt.toISOString() : null,
        }));
        return { records: items, total: items.length };
      },
    );

    // ─── Documents (attachments linked to athlete) ─────────────────────
    app.get<{ Params: { id: string } }>(
      '/athletes/:id/documents',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const exists = await prisma.athlete.findUnique({
          where: { id: req.params.id },
          select: { id: true },
        });
        if (!exists) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        }
        const attachments = await prisma.attachment.findMany({
          where: { athleteId: req.params.id, deletedAt: null },
          select: {
            id: true,
            kind: true,
            filename: true,
            mimeType: true,
            sizeBytes: true,
            uploadedAt: true,
          },
          orderBy: [{ uploadedAt: 'desc' }],
        });
        const documents = attachments.map((a) => ({
          id: a.id,
          kind: a.kind,
          filename: a.filename,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes.toString(),
          uploadedAt: a.uploadedAt.toISOString(),
        }));
        return { documents, total: documents.length };
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

    // ─── Upload attachment (document) ──────────────────────────────────
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
          log.info(
            { athleteId: req.params.id, attachmentId: attachment.id, filename },
            'athlete attachment uploaded',
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
        } catch (err) {
          await unlink(absolutePath).catch(() => undefined);
          throw err;
        }
      },
    );

    // ─── Delete attachment (soft) ─────────────────────────────────────
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

    // ─── Download attachment ──────────────────────────────────────────
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
          log.error({ err, attachmentId: attachment.id }, 'attachment file read failed');
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

    // ─── Photo upload (one current per athlete) ───────────────────────
    app.post<{ Params: { id: string } }>(
      '/athletes/:id/photo',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = AthletePhotoCreateInput.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        if (!ALLOWED_PHOTO_MIME.has(parsed.data.mimeType)) {
          return reply.code(400).send({
            error: {
              code: 'invalid_mime',
              message: 'Photo must be JPEG, PNG or WebP',
              requestId: req.requestId,
            },
          });
        }
        const athlete = await prisma.athlete.findUnique({
          where: { id: req.params.id },
          select: { id: true, photoUrl: true },
        });
        if (!athlete) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        }

        const content = decodeBase64File(parsed.data.contentBase64);
        if (!content || content.length === 0 || content.length > MAX_ATHLETE_PHOTO_BYTES) {
          return reply.code(400).send({
            error: {
              code: 'invalid_file',
              message: `Photo must be between 1 byte and ${MAX_ATHLETE_PHOTO_BYTES} bytes`,
              requestId: req.requestId,
            },
          });
        }

        const filename = sanitizeFilename(parsed.data.filename);
        const storagePath = path.join(
          'athlete-photos',
          req.params.id,
          `${randomUUID()}-${filename}`,
        );
        const absolutePath = path.join(uploadRoot(), storagePath);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        await writeFile(absolutePath, content);

        try {
          const updated = await prisma.$transaction(async (tx) => {
            await tx.attachment.updateMany({
              where: {
                athleteId: req.params.id,
                kind: 'athlete_photo',
                deletedAt: null,
              },
              data: { deletedAt: new Date() },
            });
            await tx.attachment.create({
              data: {
                kind: 'athlete_photo',
                athleteId: req.params.id,
                uploadedByUserId: req.user!.id,
                filename,
                mimeType: parsed.data.mimeType,
                sizeBytes: BigInt(content.length),
                sha256: createHash('sha256').update(content).digest('hex'),
                storagePath,
              },
            });
            const result = await tx.athlete.update({
              where: { id: req.params.id },
              data: { photoUrl: photoUrlFor(req.params.id) },
            });
            await audit.record(
              {
                ...audit.fromRequest(req),
                actorUserId: req.user!.id,
                action: 'athlete.photo.uploaded',
                result: 'success',
                scopeFederationId: null,
                scopeCompetitionId: null,
                targetType: 'athlete',
                targetId: req.params.id,
                before: { photoUrl: athlete.photoUrl },
                after: { photoUrl: result.photoUrl, filename, mimeType: parsed.data.mimeType },
              },
              tx,
            );
            return result;
          });
          log.info(
            { athleteId: req.params.id, filename, sizeBytes: content.length },
            'athlete photo uploaded',
          );
          return reply.code(201).send({ athlete: updated });
        } catch (err) {
          await unlink(absolutePath).catch(() => undefined);
          throw err;
        }
      },
    );

    // ─── Photo delete ─────────────────────────────────────────────────
    app.delete<{ Params: { id: string } }>(
      '/athletes/:id/photo',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const athlete = await prisma.athlete.findUnique({
          where: { id: req.params.id },
          select: { id: true, photoUrl: true },
        });
        if (!athlete) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        }
        if (!athlete.photoUrl) {
          return reply.code(404).send({
            error: { code: 'no_photo', message: 'Athlete has no photo', requestId: req.requestId },
          });
        }

        await prisma.$transaction(async (tx) => {
          await tx.attachment.updateMany({
            where: {
              athleteId: req.params.id,
              kind: 'athlete_photo',
              deletedAt: null,
            },
            data: { deletedAt: new Date() },
          });
          await tx.athlete.update({
            where: { id: req.params.id },
            data: { photoUrl: null },
          });
          await audit.record(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'athlete.photo.deleted',
              result: 'success',
              scopeFederationId: null,
              scopeCompetitionId: null,
              targetType: 'athlete',
              targetId: req.params.id,
              before: { photoUrl: athlete.photoUrl },
              after: { photoUrl: null },
            },
            tx,
          );
        });
        return { status: 'ok' };
      },
    );

    // ─── Photo download (public, no auth — <img> can't send Bearer) ───
    app.get<{ Params: { id: string } }>('/athletes/:id/photo', async (req, reply) => {
      const photo = await prisma.attachment.findFirst({
        where: {
          athleteId: req.params.id,
          kind: 'athlete_photo',
          deletedAt: null,
        },
        orderBy: { uploadedAt: 'desc' },
      });
      if (!photo) {
        return reply.code(404).send({
          error: { code: 'not_found', message: 'Photo not found', requestId: req.requestId },
        });
      }

      const root = path.resolve(uploadRoot());
      const absolutePath = path.resolve(root, photo.storagePath);
      if (absolutePath !== root && !absolutePath.startsWith(`${root}${path.sep}`)) {
        return reply.code(500).send({
          error: {
            code: 'invalid_storage_path',
            message: 'Photo storage path is invalid',
            requestId: req.requestId,
          },
        });
      }

      try {
        const content = await readFile(absolutePath);
        reply.header('Content-Type', photo.mimeType);
        reply.header('Cache-Control', 'private, max-age=300');
        return reply.send(content);
      } catch (err) {
        log.error({ err, photoId: photo.id }, 'photo file read failed');
        return reply.code(404).send({
          error: {
            code: 'file_missing',
            message: 'Photo file is missing from storage',
            requestId: req.requestId,
          },
        });
      }
    });
  },
};
