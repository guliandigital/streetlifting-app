import { z } from 'zod';
import {
  AthleteId,
  AttemptId,
  CompetitionId,
  DisciplineComponentId,
  DisciplineId,
  DivisionId,
  FederationId,
  NominationId,
  RecordId,
  WeightClassId,
} from './ids.js';
import { AttemptResult, CompetitionStatus, Gender } from './enums.js';
import { RecordScope } from './record.js';

export const ISF_EXPORT_SCHEMA_VERSION = 'isf.export.v1' as const;
export const ISF_SYNC_SCHEMA_VERSION = 'isf.sync.v1' as const;

const DateOnly = z.string().date();
const DateTime = z.string().datetime();
const TenantCode = z
  .string()
  .min(2)
  .max(16)
  .regex(/^[a-z0-9_-]+$/);
const CountryCode = z.string().length(2);
const SourceSystem = z.literal('streetlifting.app');

export const IsfSource = z.object({
  system: SourceSystem,
  baseUrl: z.string().url().optional(),
});
export type IsfSource = z.infer<typeof IsfSource>;

export const IsfProvenance = z.object({
  sourceSystem: SourceSystem,
  sourceTable: z.string().min(1),
  sourceId: z.string().min(1),
  exportedAt: DateTime,
});
export type IsfProvenance = z.infer<typeof IsfProvenance>;

const ExportStamped = z.object({
  schemaVersion: z.literal(ISF_EXPORT_SCHEMA_VERSION),
  updatedAt: DateTime,
  source: IsfSource,
  provenance: IsfProvenance,
});

const SyncStamped = z.object({
  schemaVersion: z.literal(ISF_SYNC_SCHEMA_VERSION),
  updatedAt: DateTime,
  source: IsfSource,
  provenance: IsfProvenance,
});

export const IsfApiMeta = ExportStamped.extend({
  generatedAt: DateTime,
  capabilities: z.object({
    changedSince: z.boolean(),
    cursorPagination: z.boolean(),
    competitionSnapshot: z.boolean(),
    records: z.boolean(),
    webhooks: z.boolean(),
  }),
});
export type IsfApiMeta = z.infer<typeof IsfApiMeta>;

export const IsfCompetitionListQuery = z.object({
  tenant: TenantCode.optional(),
  changedSince: DateTime.optional(),
  cursor: z.string().min(1).max(2048).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type IsfCompetitionListQuery = z.infer<typeof IsfCompetitionListQuery>;

export const IsfPublicResultsStatus = z.enum(['draft', 'in_progress', 'published', 'closed']);
export type IsfPublicResultsStatus = z.infer<typeof IsfPublicResultsStatus>;

export const IsfCompetitionListItem = ExportStamped.extend({
  id: CompetitionId,
  tenant: TenantCode,
  federationId: FederationId,
  federationCode: z.string().min(1),
  code: z.string().min(1),
  name: z.string().min(1),
  startDate: DateOnly,
  endDate: DateOnly,
  countryCode: CountryCode,
  city: z.string().nullable(),
  venue: z.string().nullable(),
  timezone: z.string().min(1),
  status: CompetitionStatus,
  publicResultsStatus: IsfPublicResultsStatus,
});
export type IsfCompetitionListItem = z.infer<typeof IsfCompetitionListItem>;

export const IsfPublicAthleteRef = ExportStamped.extend({
  id: AthleteId,
  isfPersonId: z.string().min(1).nullable(),
  publicProfileSlug: z.string().min(1).nullable(),
  displayName: z.string().min(1),
  birthYear: z.number().int().min(1900).max(2100).nullable(),
  ageGroup: z.string().min(1).nullable(),
  sex: Gender,
  countryCode: CountryCode,
  regionCode: z.string().nullable(),
  city: z.string().nullable(),
  clubName: z.string().nullable(),
});
export type IsfPublicAthleteRef = z.infer<typeof IsfPublicAthleteRef>;

export const IsfPublicAttemptRow = ExportStamped.extend({
  id: AttemptId,
  nominationId: NominationId,
  athleteId: AthleteId,
  disciplineId: DisciplineId,
  componentId: DisciplineComponentId.nullable(),
  attemptNumber: z.number().int().positive(),
  weightKg: z.number().nonnegative(),
  repsCount: z.number().int().nonnegative().nullable(),
  result: AttemptResult,
  decidedAt: DateTime.nullable(),
});
export type IsfPublicAttemptRow = z.infer<typeof IsfPublicAttemptRow>;

export const IsfPublicResultRow = ExportStamped.extend({
  id: NominationId,
  competitionId: CompetitionId,
  athlete: IsfPublicAthleteRef,
  disciplineId: DisciplineId,
  disciplineCode: z.string().min(1),
  disciplineName: z.string().min(1),
  divisionId: DivisionId,
  divisionCode: z.string().min(1),
  divisionName: z.string().min(1),
  weightClassId: WeightClassId,
  weightClassCode: z.string().min(1),
  weightClassName: z.string().min(1),
  bodyWeightKg: z.number().positive().nullable(),
  bestSuccessfulAttemptKg: z.number().nullable(),
  finalScore: z.number().nullable(),
  placeInClass: z.number().int().positive().nullable(),
  placeInDivision: z.number().int().positive().nullable(),
  placeOverall: z.number().int().positive().nullable(),
  status: z.string().min(1),
});
export type IsfPublicResultRow = z.infer<typeof IsfPublicResultRow>;

export const IsfRecordRow = ExportStamped.extend({
  id: RecordId,
  scope: RecordScope,
  tenant: TenantCode,
  federationId: FederationId.nullable(),
  federationCode: z.string().min(1).nullable(),
  disciplineId: DisciplineId,
  disciplineCode: z.string().min(1),
  disciplineName: z.string().min(1),
  divisionId: DivisionId,
  divisionCode: z.string().min(1),
  divisionName: z.string().min(1),
  weightClassId: WeightClassId,
  weightClassCode: z.string().min(1),
  weightClassName: z.string().min(1),
  athlete: IsfPublicAthleteRef,
  result: z.number(),
  pointsScore: z.number().nullable(),
  achievedOn: DateOnly,
  ratifiedAt: DateTime.nullable(),
  revokedAt: DateTime.nullable(),
  sourceCompetitionId: CompetitionId,
});
export type IsfRecordRow = z.infer<typeof IsfRecordRow>;

export const IsfCompetitionSnapshot = ExportStamped.extend({
  generatedAt: DateTime,
  competition: IsfCompetitionListItem,
  disciplines: z.array(
    ExportStamped.extend({
      id: DisciplineId,
      code: z.string().min(1),
      name: z.string().min(1),
      family: z.string().min(1),
      format: z.string().min(1),
      equipment: z.string().min(1),
      attemptCount: z.number().int().positive(),
      fixedWeightKg: z.number().nullable(),
    }),
  ),
  divisions: z.array(
    ExportStamped.extend({
      id: DivisionId,
      code: z.string().min(1),
      name: z.string().min(1),
      sex: Gender,
      veteranTier: z.string().min(1),
      ageMin: z.number().int().nullable(),
      ageMax: z.number().int().nullable(),
      veteranCoefficient: z.number(),
    }),
  ),
  weightClasses: z.array(
    ExportStamped.extend({
      id: WeightClassId,
      divisionId: DivisionId,
      disciplineId: DisciplineId.nullable(),
      code: z.string().min(1),
      name: z.string().min(1),
      weightMin: z.number().nullable(),
      weightMax: z.number().nullable(),
      order: z.number().int().nonnegative(),
    }),
  ),
  results: z.array(IsfPublicResultRow),
  attempts: z.array(IsfPublicAttemptRow),
  records: z.array(IsfRecordRow),
  checksum: z.string().min(1),
});
export type IsfCompetitionSnapshot = z.infer<typeof IsfCompetitionSnapshot>;

export const IsfSyncEvent = SyncStamped.extend({
  id: z.string().uuid(),
  eventType: z.string().min(1),
  aggregateType: z.string().min(1),
  aggregateId: z.string().uuid(),
  tenant: TenantCode.nullable(),
  payload: z.record(z.unknown()),
  payloadHash: z.string().min(1),
  occurredAt: DateTime,
});
export type IsfSyncEvent = z.infer<typeof IsfSyncEvent>;

export const IsfWebhookEnvelope = SyncStamped.extend({
  deliveryId: z.string().uuid(),
  generatedAt: DateTime,
  event: IsfSyncEvent,
});
export type IsfWebhookEnvelope = z.infer<typeof IsfWebhookEnvelope>;
