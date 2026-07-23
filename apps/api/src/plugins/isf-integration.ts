import {
  ISF_EXPORT_SCHEMA_VERSION,
  IsfCompetitionListQuery,
  presets,
  type IsfPublicResultsStatus,
} from '@streetlifting/domain';
import { createHash, createPublicKey, verify } from 'node:crypto';
import { z } from 'zod';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma, Prisma } from '../lib/db.js';
import * as audit from '../lib/audit.js';
import { requireRole } from '../lib/auth/middleware.js';
import { validateUuidParams } from '../lib/params.js';
import {
  createServiceToken,
  hashServiceToken,
  publicServiceClient,
  requireServiceClient,
} from '../lib/service-auth.js';
import { stableExportSha256 } from '../lib/stable-json.js';
import { isWebhookConfigured, publishPendingSyncOutboxEvents } from '../lib/webhooks.js';
import { assertNoForbiddenExportKeys } from '../lib/privacy-allowlist.js';

const READ_SCOPES = ['isf:read', 'openstreetlifting:read'] as const;
const WEBHOOK_SCOPES = ['isf:webhook'] as const;
const PROTOCOL_WRITE_SCOPES = ['isf:protocol:write'] as const;
const SERVICE_SCOPES = [
  'isf:read',
  'isf:webhook',
  'openstreetlifting:read',
  'isf:protocol:write',
] as const;

const ServiceClientCreate = z.object({
  code: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: z.string().min(2).max(160),
  scopes: z.array(z.enum(SERVICE_SCOPES)).min(1),
  rateLimitRpm: z.number().int().min(1).max(10_000).default(60),
});

const StandardsQuery = z.object({
  rulebook: z.string().min(1).max(64).default('ISF-v5.1'),
});

const ProtocolKeyCreate = z
  .object({
    federationId: z.string().uuid(),
    keyId: z.string().min(3).max(120),
    publicKeyPem: z.string().min(80).max(10_000),
    sanctioningCertId: z.string().min(1).max(160).optional(),
    validFrom: z.string().datetime().optional(),
    validUntil: z.string().datetime().optional(),
  })
  .strict();

const ProtocolKeyListQuery = z.object({ federationId: z.string().uuid().optional() }).strict();

function publicProtocolKey(key: {
  id: string;
  federationId: string;
  keyId: string;
  publicKeyPem: string;
  sanctioningCertId: string | null;
  isActive: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: key.id,
    federationId: key.federationId,
    keyId: key.keyId,
    publicKeyFingerprint: createHash('sha256').update(key.publicKeyPem).digest('hex'),
    sanctioningCertId: key.sanctioningCertId,
    isActive: key.isActive,
    validFrom: key.validFrom?.toISOString() ?? null,
    validUntil: key.validUntil?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString(),
  };
}

const FinalProtocolEnvelope = z
  .object({
    protocol: z
      .object({
        schemaVersion: z.literal('isf.final-protocol/v1'),
        protocolId: z.string().uuid(),
        revision: z.number().int().positive(),
        supersedesProtocolId: z.string().uuid().nullable(),
        competitionId: z.string().uuid(),
        federationCode: z.string().min(1).max(64),
        issuedAt: z.string().datetime(),
      })
      .passthrough(),
    payloadHash: z.string().regex(/^[a-f0-9]{64}$/),
    signature: z
      .object({
        algorithm: z.literal('ed25519'),
        federationKeyId: z.string().min(3).max(120),
        sanctioningCertId: z.string().min(1).max(160),
        value: z.string().min(16).max(20_000),
      })
      .strict(),
  })
  .strict();

interface Cursor {
  updatedAt: string;
  id: string;
}

const CursorSchema = z.object({
  updatedAt: z.string().datetime(),
  id: z.string().uuid(),
});

function iso(value: Date): string {
  return value.toISOString();
}

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function source() {
  return {
    system: 'streetlifting.app' as const,
    ...(process.env.PUBLIC_BASE_URL ? { baseUrl: process.env.PUBLIC_BASE_URL } : {}),
  };
}

function provenance(sourceTable: string, sourceId: string, exportedAt: string) {
  return {
    sourceSystem: 'streetlifting.app' as const,
    sourceTable,
    sourceId,
    exportedAt,
  };
}

function stamp(
  sourceTable: string,
  sourceId: string,
  updatedAt: Date | string,
  exportedAt: string,
) {
  return {
    schemaVersion: ISF_EXPORT_SCHEMA_VERSION,
    updatedAt: typeof updatedAt === 'string' ? updatedAt : iso(updatedAt),
    source: source(),
    provenance: provenance(sourceTable, sourceId, exportedAt),
  };
}

function tenantForFederation(federation: {
  isfTenantCode: string | null;
  countryCode: string;
}): string {
  return federation.isfTenantCode ?? federation.countryCode.toLowerCase();
}

function tenantWhere(tenant: string | undefined): Prisma.FederationWhereInput | undefined {
  if (!tenant) return undefined;
  return {
    OR: [{ isfTenantCode: tenant }, { countryCode: tenant.toUpperCase() }],
  };
}

function publicResultsStatus(competition: {
  status: string;
  federation: { isPublicResultsClosed: boolean };
}): IsfPublicResultsStatus {
  if (competition.federation.isPublicResultsClosed) return 'closed';
  if (competition.status === 'finalized' || competition.status === 'archived') return 'published';
  if (competition.status === 'in_progress') return 'in_progress';
  return 'draft';
}

function displayName(athlete: {
  lastName: string;
  firstName: string;
  middleName: string | null;
}): string {
  return [athlete.lastName, athlete.firstName, athlete.middleName].filter(Boolean).join(' ');
}

function birthYear(dateOfBirth: Date, privacyMode: string): number | null {
  return privacyMode === 'hidden' ? null : dateOfBirth.getUTCFullYear();
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeCursor(raw: string | undefined): Cursor | null {
  if (!raw) return null;
  try {
    return CursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')));
  } catch {
    return null;
  }
}

function cursorWhere(cursor: Cursor | null): Prisma.CompetitionWhereInput | undefined {
  if (!cursor) return undefined;
  return {
    OR: [
      { updatedAt: { gt: new Date(cursor.updatedAt) } },
      { updatedAt: new Date(cursor.updatedAt), id: { gt: cursor.id } },
    ],
  };
}

function recordCursorWhere(cursor: Cursor | null): Prisma.RecordWhereInput | undefined {
  if (!cursor) return undefined;
  return {
    OR: [
      { updatedAt: { gt: new Date(cursor.updatedAt) } },
      { updatedAt: new Date(cursor.updatedAt), id: { gt: cursor.id } },
    ],
  };
}

const competitionListSelect = {
  id: true,
  federationId: true,
  code: true,
  nameRu: true,
  nameEn: true,
  startDate: true,
  endDate: true,
  city: true,
  venue: true,
  timezone: true,
  status: true,
  updatedAt: true,
  federation: {
    select: {
      id: true,
      code: true,
      isfTenantCode: true,
      countryCode: true,
      isPublicResultsClosed: true,
    },
  },
} satisfies Prisma.CompetitionSelect;

function competitionListItem(
  competition: Prisma.CompetitionGetPayload<{ select: typeof competitionListSelect }>,
  exportedAt: string,
) {
  return {
    ...stamp('competition', competition.id, competition.updatedAt, exportedAt),
    id: competition.id,
    tenant: tenantForFederation(competition.federation),
    federationId: competition.federationId,
    federationCode: competition.federation.code,
    code: competition.code,
    name: competition.nameEn || competition.nameRu,
    startDate: dateOnly(competition.startDate),
    endDate: dateOnly(competition.endDate),
    countryCode: competition.federation.countryCode,
    city: competition.city,
    venue: competition.venue,
    timezone: competition.timezone,
    status: competition.status,
    publicResultsStatus: publicResultsStatus(competition),
  };
}

const athletePublicSelect = {
  id: true,
  isfPersonId: true,
  publicProfileSlug: true,
  privacyMode: true,
  lastName: true,
  firstName: true,
  middleName: true,
  dateOfBirth: true,
  gender: true,
  countryCode: true,
  regionCode: true,
  city: true,
  clubName: true,
  updatedAt: true,
} satisfies Prisma.AthleteSelect;

function athleteRef(
  athlete: Prisma.AthleteGetPayload<{ select: typeof athletePublicSelect }>,
  exportedAt: string,
) {
  return {
    ...stamp('athlete', athlete.id, athlete.updatedAt, exportedAt),
    id: athlete.id,
    isfPersonId: athlete.isfPersonId,
    publicProfileSlug: athlete.publicProfileSlug,
    displayName: displayName(athlete),
    birthYear: birthYear(athlete.dateOfBirth, athlete.privacyMode),
    ageGroup: null,
    sex: athlete.gender,
    countryCode: athlete.countryCode,
    regionCode: athlete.regionCode,
    city: athlete.city,
    clubName: athlete.clubName,
  };
}

const recordInclude = {
  federation: { select: { id: true, code: true, isfTenantCode: true, countryCode: true } },
  athlete: { select: athletePublicSelect },
  discipline: { select: { id: true, code: true, nameRu: true, nameEn: true } },
  division: {
    select: {
      id: true,
      code: true,
      nameRu: true,
      nameEn: true,
      competition: {
        select: { federation: { select: { isfTenantCode: true, countryCode: true } } },
      },
    },
  },
  weightClass: { select: { id: true, code: true, nameRu: true, nameEn: true } },
  competition: {
    select: {
      id: true,
      federation: { select: { isfTenantCode: true, countryCode: true } },
    },
  },
} satisfies Prisma.RecordInclude;

function recordRow(
  record: Prisma.RecordGetPayload<{ include: typeof recordInclude }>,
  exportedAt: string,
) {
  const tenant = record.federation
    ? tenantForFederation(record.federation)
    : tenantForFederation(record.competition.federation);
  return {
    ...stamp('record', record.id, record.updatedAt, exportedAt),
    id: record.id,
    scope: record.scope,
    tenant,
    federationId: record.federationId,
    federationCode: record.federation?.code ?? null,
    disciplineId: record.disciplineId,
    disciplineCode: record.discipline.code,
    disciplineName: record.discipline.nameEn || record.discipline.nameRu,
    divisionId: record.divisionId,
    divisionCode: record.division.code,
    divisionName: record.division.nameEn || record.division.nameRu,
    weightClassId: record.weightClassId,
    weightClassCode: record.weightClass.code,
    weightClassName: record.weightClass.nameEn || record.weightClass.nameRu,
    athlete: athleteRef(record.athlete, exportedAt),
    result: record.result,
    pointsScore: record.pointsScore,
    achievedOn: dateOnly(record.achievedOn),
    ratifiedAt: record.ratifiedAt?.toISOString() ?? null,
    revokedAt: record.revokedAt?.toISOString() ?? null,
    sourceCompetitionId: record.competitionId,
  };
}

const snapshotInclude = {
  federation: {
    select: {
      id: true,
      code: true,
      isfTenantCode: true,
      countryCode: true,
      isPublicResultsClosed: true,
    },
  },
  divisions: {
    orderBy: [{ gender: 'asc' }, { code: 'asc' }],
    include: { weightClasses: { orderBy: { order: 'asc' } } },
  },
  nominations: {
    where: { status: { notIn: ['draft', 'withdrawn'] } },
    orderBy: [{ entryNumber: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      competitionId: true,
      athleteId: true,
      disciplineId: true,
      divisionId: true,
      weightClassId: true,
      bodyWeightAtWeighIn: true,
      bestSuccessfulAttemptKg: true,
      finalScore: true,
      placeInClass: true,
      placeInDivision: true,
      placeOverall: true,
      status: true,
      updatedAt: true,
      athlete: { select: athletePublicSelect },
      discipline: {
        select: {
          id: true,
          code: true,
          nameRu: true,
          nameEn: true,
          family: true,
          format: true,
          equipment: true,
          attemptCount: true,
          fixedWeightKg: true,
          components: {
            orderBy: { order: 'asc' },
            select: { id: true, code: true, nameRu: true, nameEn: true },
          },
        },
      },
      division: {
        select: {
          id: true,
          code: true,
          nameRu: true,
          nameEn: true,
          gender: true,
          veteranTier: true,
          ageMin: true,
          ageMax: true,
          veteranCoefficient: true,
        },
      },
      weightClass: {
        select: {
          id: true,
          code: true,
          nameRu: true,
          nameEn: true,
          divisionId: true,
          disciplineId: true,
          weightMin: true,
          weightMax: true,
          order: true,
        },
      },
      attempts: {
        orderBy: [{ attemptNumber: 'asc' }],
        select: {
          id: true,
          nominationId: true,
          componentId: true,
          attemptNumber: true,
          weightKg: true,
          repsCount: true,
          result: true,
          decidedAt: true,
          updatedAt: true,
        },
      },
    },
  },
  records: { include: recordInclude, orderBy: [{ achievedOn: 'desc' }, { result: 'desc' }] },
} satisfies Prisma.CompetitionInclude;

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function canonicalProtocolJson(value: unknown): string {
  if (
    value === null ||
    typeof value === 'boolean' ||
    typeof value === 'number' ||
    typeof value === 'string'
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalProtocolJson).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${canonicalProtocolJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error(`Unsupported protocol value: ${typeof value}`);
}

function protocolHash(protocol: unknown): string {
  return createHash('sha256').update(canonicalProtocolJson(protocol)).digest('hex');
}

function protocolSignatureIsValid(
  protocol: unknown,
  signature: string,
  publicKeyPem: string,
): boolean {
  try {
    return verify(
      null,
      Buffer.from(canonicalProtocolJson(protocol), 'utf8'),
      createPublicKey(publicKeyPem),
      Buffer.from(signature, 'base64'),
    );
  } catch {
    return false;
  }
}

export const isfIntegrationPlugin: FeaturePlugin = {
  name: 'isf-integration',
  register: async (app) => {
    app.addHook('preHandler', validateUuidParams(['id']));

    app.get('/health/isf-integration', async () => ({
      status: 'ok',
      module: 'isf-integration',
      webhooksConfigured: isWebhookConfigured(),
    }));

    const deliveryIntervalMs = Number(process.env.ISF_WEBHOOK_DELIVERY_INTERVAL_MS ?? 0);
    if (Number.isFinite(deliveryIntervalMs) && deliveryIntervalMs > 0) {
      const timer = setInterval(() => {
        void publishPendingSyncOutboxEvents().catch((error: unknown) => {
          app.log.error({ err: error }, 'ISF webhook delivery failed');
        });
      }, deliveryIntervalMs);
      app.addHook('onClose', async () => clearInterval(timer));
    }

    app.post(
      '/integrations/isf/service-clients',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = ServiceClientCreate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }

        const token = createServiceToken();
        const tokenHash = hashServiceToken(token);
        try {
          const client = await audit.withAudit(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'api_service_client.created',
              scopeFederationId: null,
              scopeCompetitionId: null,
              targetType: 'api_service_client',
              targetId: '00000000-0000-0000-0000-000000000000',
              before: null,
              after: {
                code: parsed.data.code,
                name: parsed.data.name,
                scopes: parsed.data.scopes,
                rateLimitRpm: parsed.data.rateLimitRpm,
              },
            },
            (tx) =>
              tx.apiServiceClient.create({
                data: {
                  code: parsed.data.code,
                  name: parsed.data.name,
                  scopes: parsed.data.scopes,
                  rateLimitRpm: parsed.data.rateLimitRpm,
                  tokenHash,
                },
              }),
          );
          return reply.code(201).send({ client: publicServiceClient(client), token });
        } catch (err) {
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: {
                code: 'client_code_taken',
                message: 'Service client code already exists',
                requestId: req.requestId,
              },
            });
          }
          throw err;
        }
      },
    );

    app.get(
      '/integrations/isf/service-clients',
      { preHandler: requireRole('platform_admin') },
      async () => {
        const clients = await prisma.apiServiceClient.findMany({
          orderBy: [{ createdAt: 'desc' }, { code: 'asc' }],
        });
        return { clients: clients.map(publicServiceClient) };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/integrations/isf/service-clients/:id/revoke',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const before = await prisma.apiServiceClient.findUnique({ where: { id: req.params.id } });
        if (!before) {
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Service client not found',
              requestId: req.requestId,
            },
          });
        }

        const revoked = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'api_service_client.revoked',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'api_service_client',
            targetId: before.id,
            before: publicServiceClient(before),
            after: { isActive: false, revokedAt: 'now' },
          },
          (tx) =>
            tx.apiServiceClient.update({
              where: { id: before.id },
              data: { isActive: false, revokedAt: new Date() },
            }),
        );
        return { client: publicServiceClient(revoked) };
      },
    );

    app.post(
      '/integrations/isf/protocol-keys',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = ProtocolKeyCreate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const federation = await prisma.federation.findUnique({
          where: { id: parsed.data.federationId },
          select: { id: true },
        });
        if (!federation)
          return reply.code(404).send({
            error: {
              code: 'federation_not_found',
              message: 'Federation not found',
              requestId: req.requestId,
            },
          });
        try {
          const key = await audit.withAudit(
            {
              ...audit.fromRequest(req),
              actorUserId: req.user!.id,
              action: 'isf.protocol_key.created',
              scopeFederationId: federation.id,
              scopeCompetitionId: null,
              targetType: 'federation_protocol_key',
              targetId: '00000000-0000-0000-0000-000000000000',
              before: null,
              after: {
                federationId: federation.id,
                keyId: parsed.data.keyId,
                sanctioningCertId: parsed.data.sanctioningCertId ?? null,
              },
              requestId: req.requestId,
            },
            (tx) =>
              tx.federationProtocolKey.create({
                data: {
                  federationId: federation.id,
                  keyId: parsed.data.keyId,
                  publicKeyPem: parsed.data.publicKeyPem,
                  sanctioningCertId: parsed.data.sanctioningCertId ?? null,
                  validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
                  validUntil: parsed.data.validUntil ? new Date(parsed.data.validUntil) : null,
                },
              }),
          );
          return reply.code(201).send({ key: publicProtocolKey(key) });
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
            return reply.code(409).send({
              error: {
                code: 'key_id_taken',
                message: 'Key ID already exists',
                requestId: req.requestId,
              },
            });
          throw error;
        }
      },
    );

    app.get(
      '/integrations/isf/protocol-keys',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = ProtocolKeyListQuery.safeParse(req.query);
        if (!parsed.success)
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        const keyQuery: Prisma.FederationProtocolKeyFindManyArgs = {
          orderBy: [{ createdAt: 'desc' }, { keyId: 'asc' }],
        };
        if (parsed.data.federationId) keyQuery.where = { federationId: parsed.data.federationId };
        const keys = await prisma.federationProtocolKey.findMany(keyQuery);
        return { keys: keys.map(publicProtocolKey) };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/integrations/isf/protocol-keys/:id/revoke',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const before = await prisma.federationProtocolKey.findUnique({
          where: { id: req.params.id },
        });
        if (!before)
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Protocol key not found',
              requestId: req.requestId,
            },
          });
        const revoked = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'isf.protocol_key.revoked',
            scopeFederationId: before.federationId,
            scopeCompetitionId: null,
            targetType: 'federation_protocol_key',
            targetId: before.id,
            before: publicProtocolKey(before),
            after: { isActive: false, revokedAt: 'now' },
          },
          (tx) =>
            tx.federationProtocolKey.update({
              where: { id: before.id },
              data: { isActive: false, revokedAt: new Date() },
            }),
        );
        return { key: publicProtocolKey(revoked) };
      },
    );

    app.post(
      '/isf/v1/protocols/final',
      { config: { rateLimit: false }, preHandler: requireServiceClient(PROTOCOL_WRITE_SCOPES) },
      async (req, reply) => {
        const parsed = FinalProtocolEnvelope.safeParse(req.body);
        if (!parsed.success)
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        const envelope = parsed.data;
        if (protocolHash(envelope.protocol) !== envelope.payloadHash)
          return reply.code(400).send({
            error: {
              code: 'payload_hash_invalid',
              message: 'Payload hash does not match canonical protocol',
              requestId: req.requestId,
            },
          });
        const key = await prisma.federationProtocolKey.findUnique({
          where: { keyId: envelope.signature.federationKeyId },
          include: { federation: { select: { id: true, code: true } } },
        });
        const now = new Date();
        if (
          !key ||
          !key.isActive ||
          key.revokedAt ||
          (key.validFrom && key.validFrom > now) ||
          (key.validUntil && key.validUntil < now) ||
          key.federation.code !== envelope.protocol.federationCode ||
          (key.sanctioningCertId && key.sanctioningCertId !== envelope.signature.sanctioningCertId)
        ) {
          return reply.code(403).send({
            error: {
              code: 'untrusted_protocol_key',
              message: 'Protocol key is not trusted for this federation',
              requestId: req.requestId,
            },
          });
        }
        if (
          !protocolSignatureIsValid(envelope.protocol, envelope.signature.value, key.publicKeyPem)
        )
          return reply.code(400).send({
            error: {
              code: 'signature_invalid',
              message: 'Protocol signature is invalid',
              requestId: req.requestId,
            },
          });
        const competition = await prisma.competition.findUnique({
          where: { id: envelope.protocol.competitionId },
          select: { id: true, federationId: true },
        });
        if (!competition || competition.federationId !== key.federationId)
          return reply.code(409).send({
            error: {
              code: 'competition_scope_mismatch',
              message: 'Protocol competition does not belong to the signing federation',
              requestId: req.requestId,
            },
          });
        const existing = await prisma.finalProtocolImport.findUnique({
          where: {
            protocolId_revision: {
              protocolId: envelope.protocol.protocolId,
              revision: envelope.protocol.revision,
            },
          },
        });
        if (existing) {
          if (existing.payloadHash === envelope.payloadHash)
            return { status: 'already_accepted', importId: existing.id };
          return reply.code(409).send({
            error: {
              code: 'protocol_revision_conflict',
              message: 'Protocol revision was already accepted with a different hash',
              requestId: req.requestId,
            },
          });
        }
        if (envelope.protocol.revision > 1 && !envelope.protocol.supersedesProtocolId)
          return reply.code(400).send({
            error: {
              code: 'correction_predecessor_required',
              message: 'Correction must identify its accepted predecessor',
              requestId: req.requestId,
            },
          });
        if (envelope.protocol.supersedesProtocolId) {
          const predecessor = await prisma.finalProtocolImport.findFirst({
            where: {
              protocolId: envelope.protocol.supersedesProtocolId,
              competitionId: competition.id,
            },
            select: { id: true },
          });
          if (!predecessor)
            return reply.code(409).send({
              error: {
                code: 'protocol_predecessor_not_found',
                message: 'Referenced predecessor was not accepted',
                requestId: req.requestId,
              },
            });
        }
        const imported = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: null,
            action: 'isf.final_protocol.accepted',
            scopeFederationId: key.federationId,
            scopeCompetitionId: competition.id,
            targetType: 'final_protocol_import',
            targetId: '00000000-0000-0000-0000-000000000000',
            before: null,
            after: {
              protocolId: envelope.protocol.protocolId,
              revision: envelope.protocol.revision,
              payloadHash: envelope.payloadHash,
              federationKeyId: key.keyId,
            },
            requestId: req.requestId,
          },
          (tx) =>
            tx.finalProtocolImport.create({
              data: {
                protocolId: envelope.protocol.protocolId,
                revision: envelope.protocol.revision,
                supersedesProtocolId: envelope.protocol.supersedesProtocolId,
                competitionId: competition.id,
                federationId: key.federationId,
                keyId: key.id,
                sanctioningCertId: envelope.signature.sanctioningCertId,
                payloadHash: envelope.payloadHash,
                payload: envelope as Prisma.InputJsonValue,
              },
            }),
        );
        return reply.code(202).send({ status: 'accepted', importId: imported.id });
      },
    );

    app.get(
      '/isf/v1/meta',
      { config: { rateLimit: false }, preHandler: requireServiceClient(READ_SCOPES) },
      async (req) => {
        const generatedAt = new Date().toISOString();
        return {
          ...stamp('api_service_client', req.serviceClient?.id ?? 'meta', generatedAt, generatedAt),
          generatedAt,
          capabilities: {
            changedSince: true,
            cursorPagination: true,
            competitionSnapshot: true,
            records: true,
            webhooks: true,
          },
        };
      },
    );

    app.get(
      '/isf/v1/competitions',
      { config: { rateLimit: false }, preHandler: requireServiceClient(READ_SCOPES) },
      async (req, reply) => {
        const parsed = IsfCompetitionListQuery.safeParse(req.query);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const cursor = decodeCursor(parsed.data.cursor);
        if (parsed.data.cursor && !cursor) {
          return reply.code(400).send({
            error: {
              code: 'invalid_cursor',
              message: 'Cursor is invalid',
              requestId: req.requestId,
            },
          });
        }

        const competitionFilters: Prisma.CompetitionWhereInput[] = [];
        if (parsed.data.changedSince) {
          competitionFilters.push({ updatedAt: { gt: new Date(parsed.data.changedSince) } });
        }
        const cursorFilter = cursorWhere(cursor);
        if (cursorFilter) competitionFilters.push(cursorFilter);
        const federationFilter = tenantWhere(parsed.data.tenant);
        if (federationFilter) competitionFilters.push({ federation: federationFilter });
        const where: Prisma.CompetitionWhereInput =
          competitionFilters.length > 0 ? { AND: competitionFilters } : {};
        const rows = await prisma.competition.findMany({
          where,
          select: competitionListSelect,
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take: parsed.data.limit + 1,
        });
        const page = rows.slice(0, parsed.data.limit);
        const last = page.at(-1);
        const nextCursor =
          rows.length > parsed.data.limit && last
            ? encodeCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id })
            : null;
        const exportedAt = new Date().toISOString();
        const items = page.map((competition) => competitionListItem(competition, exportedAt));
        assertNoForbiddenExportKeys(items);
        return {
          schemaVersion: ISF_EXPORT_SCHEMA_VERSION,
          items,
          nextCursor,
          checksum: stableExportSha256(items),
        };
      },
    );

    app.get<{ Params: { id: string } }>(
      '/isf/v1/competitions/:id/snapshot',
      { config: { rateLimit: false }, preHandler: requireServiceClient(READ_SCOPES) },
      async (req, reply) => {
        const competition = await prisma.competition.findUnique({
          where: { id: req.params.id },
          include: snapshotInclude,
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
        const publicStatus = publicResultsStatus(competition);
        if (publicStatus === 'closed') {
          return reply.code(403).send({
            error: {
              code: 'public_results_closed',
              message: 'Public results are closed for this federation',
              requestId: req.requestId,
            },
          });
        }
        if (publicStatus !== 'published') {
          return reply.code(409).send({
            error: {
              code: 'competition_not_published',
              message: 'Competition snapshot is available after finalization',
              requestId: req.requestId,
            },
          });
        }

        const generatedAt = new Date().toISOString();
        const competitionItem = competitionListItem(competition, generatedAt);
        const disciplines = uniqueById(
          competition.nominations.map((nomination) => nomination.discipline),
        ).map((discipline) => ({
          ...stamp('discipline', discipline.id, competition.updatedAt, generatedAt),
          id: discipline.id,
          code: discipline.code,
          name: discipline.nameEn || discipline.nameRu,
          family: discipline.family,
          format: discipline.format,
          equipment: discipline.equipment,
          attemptCount: discipline.attemptCount,
          fixedWeightKg: discipline.fixedWeightKg,
        }));
        const divisions = competition.divisions.map((division) => ({
          ...stamp('division', division.id, competition.updatedAt, generatedAt),
          id: division.id,
          code: division.code,
          name: division.nameEn || division.nameRu,
          sex: division.gender,
          veteranTier: division.veteranTier,
          ageMin: division.ageMin,
          ageMax: division.ageMax,
          veteranCoefficient: division.veteranCoefficient,
        }));
        const weightClasses = competition.divisions.flatMap((division) =>
          division.weightClasses.map((weightClass) => ({
            ...stamp('weight_class', weightClass.id, competition.updatedAt, generatedAt),
            id: weightClass.id,
            divisionId: weightClass.divisionId,
            disciplineId: weightClass.disciplineId,
            code: weightClass.code,
            name: weightClass.nameEn || weightClass.nameRu,
            weightMin: weightClass.weightMin,
            weightMax: weightClass.weightMax,
            order: weightClass.order,
          })),
        );
        const results = competition.nominations.map((nomination) => ({
          ...stamp('nomination', nomination.id, nomination.updatedAt, generatedAt),
          id: nomination.id,
          competitionId: nomination.competitionId,
          athlete: athleteRef(nomination.athlete, generatedAt),
          disciplineId: nomination.disciplineId,
          disciplineCode: nomination.discipline.code,
          disciplineName: nomination.discipline.nameEn || nomination.discipline.nameRu,
          divisionId: nomination.divisionId,
          divisionCode: nomination.division.code,
          divisionName: nomination.division.nameEn || nomination.division.nameRu,
          weightClassId: nomination.weightClassId,
          weightClassCode: nomination.weightClass.code,
          weightClassName: nomination.weightClass.nameEn || nomination.weightClass.nameRu,
          bodyWeightKg: nomination.bodyWeightAtWeighIn,
          bestSuccessfulAttemptKg: nomination.bestSuccessfulAttemptKg,
          finalScore: nomination.finalScore,
          placeInClass: nomination.placeInClass,
          placeInDivision: nomination.placeInDivision,
          placeOverall: nomination.placeOverall,
          status: nomination.status,
        }));
        const attempts = competition.nominations.flatMap((nomination) =>
          nomination.attempts.map((attempt) => ({
            ...stamp('attempt', attempt.id, attempt.updatedAt, generatedAt),
            id: attempt.id,
            nominationId: attempt.nominationId,
            athleteId: nomination.athleteId,
            disciplineId: nomination.disciplineId,
            componentId: attempt.componentId,
            attemptNumber: attempt.attemptNumber,
            weightKg: attempt.weightKg,
            repsCount: attempt.repsCount,
            result: attempt.result,
            decidedAt: attempt.decidedAt?.toISOString() ?? null,
          })),
        );
        const records = competition.records.map((record) => recordRow(record, generatedAt));
        const baseSnapshot = {
          ...stamp('competition', competition.id, competition.updatedAt, generatedAt),
          generatedAt,
          competition: competitionItem,
          disciplines,
          divisions,
          weightClasses,
          results,
          attempts,
          records,
        };
        const snapshot = {
          ...baseSnapshot,
          checksum: stableExportSha256(baseSnapshot),
        };
        assertNoForbiddenExportKeys(snapshot);
        return snapshot;
      },
    );

    app.get(
      '/isf/v1/records',
      { config: { rateLimit: false }, preHandler: requireServiceClient(READ_SCOPES) },
      async (req, reply) => {
        const parsed = IsfCompetitionListQuery.safeParse(req.query);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const cursor = decodeCursor(parsed.data.cursor);
        if (parsed.data.cursor && !cursor) {
          return reply.code(400).send({
            error: {
              code: 'invalid_cursor',
              message: 'Cursor is invalid',
              requestId: req.requestId,
            },
          });
        }

        const recordFilters: Prisma.RecordWhereInput[] = [];
        if (parsed.data.changedSince) {
          recordFilters.push({ updatedAt: { gt: new Date(parsed.data.changedSince) } });
        }
        const recordCursorFilter = recordCursorWhere(cursor);
        if (recordCursorFilter) recordFilters.push(recordCursorFilter);
        const recordFederationFilter = tenantWhere(parsed.data.tenant);
        if (recordFederationFilter) {
          recordFilters.push({
            OR: [
              { federation: recordFederationFilter },
              { competition: { federation: recordFederationFilter } },
            ],
          });
        }
        const where: Prisma.RecordWhereInput =
          recordFilters.length > 0 ? { AND: recordFilters } : {};
        const rows = await prisma.record.findMany({
          where,
          include: recordInclude,
          orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
          take: parsed.data.limit + 1,
        });
        const page = rows.slice(0, parsed.data.limit);
        const last = page.at(-1);
        const nextCursor =
          rows.length > parsed.data.limit && last
            ? encodeCursor({ updatedAt: last.updatedAt.toISOString(), id: last.id })
            : null;
        const exportedAt = new Date().toISOString();
        const items = page.map((record) => recordRow(record, exportedAt));
        assertNoForbiddenExportKeys(items);
        return {
          schemaVersion: ISF_EXPORT_SCHEMA_VERSION,
          items,
          nextCursor,
          checksum: stableExportSha256(items),
        };
      },
    );

    app.get(
      '/isf/v1/standards',
      { config: { rateLimit: false }, preHandler: requireServiceClient(READ_SCOPES) },
      async (req, reply) => {
        const parsed = StandardsQuery.safeParse(req.query);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }
        const normalizedRulebook = parsed.data.rulebook.toLowerCase().replace(/\s+/g, '-');
        if (normalizedRulebook !== 'isf-v5.1') {
          return reply.code(404).send({
            error: {
              code: 'rulebook_not_supported',
              message: 'Only ISF-v5.1 standards are available',
              requestId: req.requestId,
            },
          });
        }

        const generatedAt = new Date().toISOString();
        const standards = {
          ...stamp('rulebook', 'ISF-v5.1', generatedAt, generatedAt),
          generatedAt,
          rulebook: 'ISF-v5.1',
          disciplines: presets.ISF_V51_DISCIPLINES,
          ageCategories: presets.ISF_V51_AGE_CATEGORIES,
          weightCategories: presets.ISF_V51_WEIGHT_CATEGORIES,
          veteranCoefficients: Object.fromEntries(presets.ISF_V51_MASTERS_MULTIPLIERS),
          multirepLoads: presets.ISF_V51_MULTIREP_PRESETS,
          bodyweightLimits: presets.ISF_V51_BW_LIMITS,
          formulaMetadata: {
            isf_points: {
              description: 'ISF points formula for classic max-weight events',
            },
            result_x_coefficient: {
              description: 'Fixed-load multirep result multiplied by configured coefficient',
            },
          },
        };
        return {
          ...standards,
          checksum: stableExportSha256(standards),
        };
      },
    );

    app.post(
      '/isf/v1/outbox/flush',
      { preHandler: requireServiceClient(WEBHOOK_SCOPES) },
      async () => {
        return publishPendingSyncOutboxEvents();
      },
    );
  },
};
