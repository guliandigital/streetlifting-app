-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('federation_admin', 'secretary', 'head_judge', 'judge', 'scoreboard_operator', 'speaker', 'athlete', 'accountant', 'viewer');

-- CreateEnum
CREATE TYPE "CompetitionStatus" AS ENUM ('draft', 'registration_open', 'registration_closed', 'in_progress', 'finalized', 'archived');

-- CreateEnum
CREATE TYPE "NominationStatus" AS ENUM ('draft', 'paid', 'weighed_in', 'on_platform', 'finished', 'disqualified', 'withdrawn');

-- CreateEnum
CREATE TYPE "AttemptResult" AS ENUM ('pending', 'good_lift', 'no_lift', 'withdrawn');

-- CreateEnum
CREATE TYPE "DisciplineFamily" AS ENUM ('streetlifting', 'weighted_calisthenics', 'multi_rep');

-- CreateEnum
CREATE TYPE "DisciplineFormat" AS ENUM ('three_attempts_max', 'reps_to_failure', 'reps_in_time', 'isometric_hold');

-- CreateEnum
CREATE TYPE "Equipment" AS ENUM ('pull_up_bar', 'dip_bars', 'bench', 'squat_rack', 'deadlift_platform', 'parallel_bars', 'rings', 'ground');

-- CreateEnum
CREATE TYPE "VeteranTier" AS ENUM ('kids', 'youth', 'junior', 'open', 'sub_master', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6');

-- CreateEnum
CREATE TYPE "JudgeRole" AS ENUM ('head', 'side_left', 'side_right', 'technical', 'jury');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('bank_transfer', 'card', 'sbp', 'cash', 'other');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('telegram', 'email', 'webhook');

-- CreateEnum
CREATE TYPE "ConsentScope" AS ENUM ('data_processing', 'marketing_email', 'marketing_telegram', 'public_results', 'photo_publication');

-- CreateEnum
CREATE TYPE "AttachmentKind" AS ENUM ('athlete_photo', 'federation_file', 'competition_file', 'certificate_pdf', 'protocol_pdf', 'misc');

-- CreateEnum
CREATE TYPE "PlateColor" AS ENUM ('red', 'blue', 'yellow', 'green', 'white', 'black', 'gray');

-- CreateEnum
CREATE TYPE "RecordScope" AS ENUM ('federation', 'national', 'continental', 'world');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('success', 'failure', 'denied');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "telegramHandle" TEXT,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_assignment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "federationId" UUID,
    "competitionId" UUID,
    "grantedByUserId" UUID,
    "grantedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(6),

    CONSTRAINT "role_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "issuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "revokedAt" TIMESTAMPTZ(6),
    "rotatedToId" UUID,
    "userAgent" TEXT,
    "ip" TEXT,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "federation" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "regionCode" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "telegramHandle" TEXT,
    "vkUrl" TEXT,
    "websiteUrl" TEXT,
    "chiefAccountantName" TEXT,
    "cashierName" TEXT,
    "billingTariffKopecksPerNomination" BIGINT NOT NULL,
    "securityKey" UUID NOT NULL,
    "isPublicResultsClosed" BOOLEAN NOT NULL DEFAULT false,
    "notificationsDisabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "federation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt" (
    "id" UUID NOT NULL,
    "federationId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nominationsCount" INTEGER NOT NULL,
    "amountKopecks" BIGINT NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "expiresAt" DATE NOT NULL,
    "externalReference" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "writeoff" (
    "id" UUID NOT NULL,
    "federationId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "nominationsCount" INTEGER NOT NULL,
    "competitionId" UUID,
    "linkedReceiptId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "writeoff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discipline" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "family" "DisciplineFamily" NOT NULL,
    "format" "DisciplineFormat" NOT NULL,
    "equipment" "Equipment" NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 3,
    "fixedWeightKg" DOUBLE PRECISION,
    "applyVeteranCoefficient" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "discipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "competition" (
    "id" UUID NOT NULL,
    "federationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "description" TEXT,
    "rulebook" TEXT NOT NULL DEFAULT 'ISF v5.1',
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "registrationDeadline" TIMESTAMPTZ(6),
    "city" TEXT,
    "venue" TEXT,
    "timezone" TEXT NOT NULL,
    "status" "CompetitionStatus" NOT NULL,
    "entryFeeKopecks" BIGINT NOT NULL DEFAULT 0,
    "isOnlineRegistrationOpen" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "competition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "division" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "veteranTier" "VeteranTier" NOT NULL,
    "ageMin" INTEGER,
    "ageMax" INTEGER,
    "veteranCoefficient" DOUBLE PRECISION NOT NULL DEFAULT 1.0,

    CONSTRAINT "division_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weight_class" (
    "id" UUID NOT NULL,
    "divisionId" UUID NOT NULL,
    "disciplineId" UUID,
    "code" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "weightMin" DOUBLE PRECISION,
    "weightMax" DOUBLE PRECISION,
    "order" INTEGER NOT NULL,

    CONSTRAINT "weight_class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "athlete" (
    "id" UUID NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "dateOfBirth" DATE NOT NULL,
    "gender" "Gender" NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "regionCode" TEXT,
    "city" TEXT,
    "coachName" TEXT,
    "clubName" TEXT,
    "federationCardNumber" TEXT,
    "photoUrl" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "athlete_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "platform_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "platformId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "startTime" TIMESTAMPTZ(6),

    CONSTRAINT "flight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group" (
    "id" UUID NOT NULL,
    "flightId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judge" (
    "id" UUID NOT NULL,
    "lastName" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "middleName" TEXT,
    "categoryRu" TEXT,
    "categoryEn" TEXT,
    "cardNumber" TEXT,
    "cityRegion" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "judge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "judge_assignment" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "judgeId" UUID NOT NULL,
    "platformId" UUID,
    "role" "JudgeRole" NOT NULL,
    "assignedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "judge_assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nomination" (
    "id" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "athleteId" UUID NOT NULL,
    "disciplineId" UUID NOT NULL,
    "divisionId" UUID NOT NULL,
    "weightClassId" UUID NOT NULL,
    "bodyWeightAtWeighIn" DOUBLE PRECISION,
    "entryNumber" INTEGER,
    "flightId" UUID,
    "groupId" UUID,
    "status" "NominationStatus" NOT NULL,
    "isEntryFeePaid" BOOLEAN NOT NULL DEFAULT false,
    "isMandatePassed" BOOLEAN NOT NULL DEFAULT false,
    "bestSuccessfulAttemptKg" DOUBLE PRECISION,
    "finalScore" DOUBLE PRECISION,
    "placeInClass" INTEGER,
    "placeInDivision" INTEGER,
    "placeOverall" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "nomination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempt" (
    "id" UUID NOT NULL,
    "nominationId" UUID NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "weightKg" DOUBLE PRECISION NOT NULL,
    "result" "AttemptResult" NOT NULL,
    "judgeDecisions" JSONB NOT NULL DEFAULT '[]',
    "repsCount" INTEGER,
    "timeoutSeconds" INTEGER,
    "startedAt" TIMESTAMPTZ(6),
    "decidedAt" TIMESTAMPTZ(6),
    "notes" TEXT,

    CONSTRAINT "attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "veteran_coefficient" (
    "id" UUID NOT NULL,
    "federationId" UUID,
    "tier" "VeteranTier" NOT NULL,
    "multiplier" DOUBLE PRECISION NOT NULL,
    "rulebook" TEXT NOT NULL DEFAULT 'ISF v5.1',
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,

    CONSTRAINT "veteran_coefficient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plate_set" (
    "id" UUID NOT NULL,
    "federationId" UUID,
    "competitionId" UUID,
    "name" TEXT NOT NULL,
    "incrementKg" DOUBLE PRECISION NOT NULL DEFAULT 1.25,
    "barWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 20,
    "collarWeightKg" DOUBLE PRECISION NOT NULL DEFAULT 2.5,
    "plates" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "plate_set_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record" (
    "id" UUID NOT NULL,
    "scope" "RecordScope" NOT NULL,
    "federationId" UUID,
    "disciplineId" UUID NOT NULL,
    "divisionId" UUID NOT NULL,
    "weightClassId" UUID NOT NULL,
    "athleteId" UUID NOT NULL,
    "competitionId" UUID NOT NULL,
    "attemptId" UUID,
    "result" DOUBLE PRECISION NOT NULL,
    "pointsScore" DOUBLE PRECISION,
    "achievedOn" DATE NOT NULL,
    "ratifiedAt" TIMESTAMPTZ(6),
    "ratifiedByUserId" UUID,
    "notes" TEXT,

    CONSTRAINT "record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachment" (
    "id" UUID NOT NULL,
    "kind" "AttachmentKind" NOT NULL,
    "federationId" UUID,
    "competitionId" UUID,
    "athleteId" UUID,
    "uploadedByUserId" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" CHAR(64) NOT NULL,
    "storagePath" TEXT NOT NULL,
    "uploadedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(6),

    CONSTRAINT "attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consent" (
    "id" UUID NOT NULL,
    "scope" "ConsentScope" NOT NULL,
    "userId" UUID,
    "athleteId" UUID,
    "federationId" UUID,
    "textShown" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "textVersion" TEXT NOT NULL,
    "grantedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "grantedFromIp" TEXT,
    "grantedFromUserAgent" TEXT,
    "revokedAt" TIMESTAMPTZ(6),
    "revokeReason" TEXT,

    CONSTRAINT "consent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" UUID,
    "actorIp" TEXT,
    "actorUserAgent" TEXT,
    "action" TEXT NOT NULL,
    "scopeFederationId" UUID,
    "scopeCompetitionId" UUID,
    "targetType" TEXT NOT NULL,
    "targetId" UUID NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "requestId" UUID NOT NULL,
    "result" "AuditResult" NOT NULL,
    "notes" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE INDEX "role_assignment_userId_idx" ON "role_assignment"("userId");

-- CreateIndex
CREATE INDEX "role_assignment_federationId_idx" ON "role_assignment"("federationId");

-- CreateIndex
CREATE INDEX "role_assignment_competitionId_idx" ON "role_assignment"("competitionId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_tokenHash_key" ON "refresh_token"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_token_userId_idx" ON "refresh_token"("userId");

-- CreateIndex
CREATE INDEX "refresh_token_familyId_idx" ON "refresh_token"("familyId");

-- CreateIndex
CREATE INDEX "refresh_token_expiresAt_idx" ON "refresh_token"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "federation_code_key" ON "federation"("code");

-- CreateIndex
CREATE INDEX "receipt_federationId_date_idx" ON "receipt"("federationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "receipt_federationId_number_key" ON "receipt"("federationId", "number");

-- CreateIndex
CREATE INDEX "writeoff_federationId_date_idx" ON "writeoff"("federationId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "writeoff_federationId_number_key" ON "writeoff"("federationId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "discipline_code_key" ON "discipline"("code");

-- CreateIndex
CREATE INDEX "competition_federationId_status_idx" ON "competition"("federationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "competition_federationId_code_key" ON "competition"("federationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "division_competitionId_code_key" ON "division"("competitionId", "code");

-- CreateIndex
CREATE INDEX "weight_class_divisionId_order_idx" ON "weight_class"("divisionId", "order");

-- CreateIndex
CREATE INDEX "athlete_lastName_firstName_idx" ON "athlete"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "athlete_dateOfBirth_idx" ON "athlete"("dateOfBirth");

-- CreateIndex
CREATE UNIQUE INDEX "platform_competitionId_order_key" ON "platform"("competitionId", "order");

-- CreateIndex
CREATE INDEX "flight_platformId_order_idx" ON "flight"("platformId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "flight_competitionId_code_key" ON "flight"("competitionId", "code");

-- CreateIndex
CREATE INDEX "group_flightId_order_idx" ON "group"("flightId", "order");

-- CreateIndex
CREATE INDEX "judge_lastName_firstName_idx" ON "judge"("lastName", "firstName");

-- CreateIndex
CREATE UNIQUE INDEX "judge_assignment_competitionId_judgeId_platformId_role_key" ON "judge_assignment"("competitionId", "judgeId", "platformId", "role");

-- CreateIndex
CREATE INDEX "nomination_competitionId_status_idx" ON "nomination"("competitionId", "status");

-- CreateIndex
CREATE INDEX "nomination_flightId_entryNumber_idx" ON "nomination"("flightId", "entryNumber");

-- CreateIndex
CREATE UNIQUE INDEX "nomination_competitionId_athleteId_disciplineId_divisionId__key" ON "nomination"("competitionId", "athleteId", "disciplineId", "divisionId", "weightClassId");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_nominationId_attemptNumber_key" ON "attempt"("nominationId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "veteran_coefficient_federationId_tier_effectiveFrom_key" ON "veteran_coefficient"("federationId", "tier", "effectiveFrom");

-- CreateIndex
CREATE INDEX "record_scope_achievedOn_idx" ON "record"("scope", "achievedOn");

-- CreateIndex
CREATE UNIQUE INDEX "record_scope_federationId_disciplineId_divisionId_weightCla_key" ON "record"("scope", "federationId", "disciplineId", "divisionId", "weightClassId");

-- CreateIndex
CREATE INDEX "attachment_sha256_idx" ON "attachment"("sha256");

-- CreateIndex
CREATE INDEX "consent_userId_scope_idx" ON "consent"("userId", "scope");

-- CreateIndex
CREATE INDEX "consent_athleteId_scope_idx" ON "consent"("athleteId", "scope");

-- CreateIndex
CREATE INDEX "audit_log_occurredAt_idx" ON "audit_log"("occurredAt");

-- CreateIndex
CREATE INDEX "audit_log_actorUserId_occurredAt_idx" ON "audit_log"("actorUserId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_log_scopeFederationId_occurredAt_idx" ON "audit_log"("scopeFederationId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_log_action_occurredAt_idx" ON "audit_log"("action", "occurredAt");

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_federationId_fkey" FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_assignment" ADD CONSTRAINT "role_assignment_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt" ADD CONSTRAINT "receipt_federationId_fkey" FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writeoff" ADD CONSTRAINT "writeoff_federationId_fkey" FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writeoff" ADD CONSTRAINT "writeoff_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "writeoff" ADD CONSTRAINT "writeoff_linkedReceiptId_fkey" FOREIGN KEY ("linkedReceiptId") REFERENCES "receipt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "competition" ADD CONSTRAINT "competition_federationId_fkey" FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "division" ADD CONSTRAINT "division_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_class" ADD CONSTRAINT "weight_class_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "division"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weight_class" ADD CONSTRAINT "weight_class_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "discipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform" ADD CONSTRAINT "platform_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight" ADD CONSTRAINT "flight_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight" ADD CONSTRAINT "flight_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group" ADD CONSTRAINT "group_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "flight"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_assignment" ADD CONSTRAINT "judge_assignment_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_assignment" ADD CONSTRAINT "judge_assignment_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "judge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "judge_assignment" ADD CONSTRAINT "judge_assignment_platformId_fkey" FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_weightClassId_fkey" FOREIGN KEY ("weightClassId") REFERENCES "weight_class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_flightId_fkey" FOREIGN KEY ("flightId") REFERENCES "flight"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "nomination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "veteran_coefficient" ADD CONSTRAINT "veteran_coefficient_federationId_fkey" FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plate_set" ADD CONSTRAINT "plate_set_federationId_fkey" FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plate_set" ADD CONSTRAINT "plate_set_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record" ADD CONSTRAINT "record_federationId_fkey" FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record" ADD CONSTRAINT "record_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "discipline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record" ADD CONSTRAINT "record_divisionId_fkey" FOREIGN KEY ("divisionId") REFERENCES "division"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record" ADD CONSTRAINT "record_weightClassId_fkey" FOREIGN KEY ("weightClassId") REFERENCES "weight_class"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record" ADD CONSTRAINT "record_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record" ADD CONSTRAINT "record_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record" ADD CONSTRAINT "record_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_federationId_fkey" FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachment" ADD CONSTRAINT "attachment_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consent" ADD CONSTRAINT "consent_federationId_fkey" FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- ─────────────────────────────────────────────────────────────────────────
-- Append-only enforcement for audit_log (ADR-0005).
-- The audit log MUST NOT be modified or deleted after insert. We enforce
-- this with triggers rather than role grants so the constraint applies
-- regardless of which DB role runs a query. Bypass requires explicit
-- DBA action: `ALTER TABLE audit_log DISABLE TRIGGER ...`.
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION audit_log_no_modify() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only; UPDATE and DELETE are not permitted (see ADR-0005)';
END;
$$;

CREATE TRIGGER audit_log_no_update
  BEFORE UPDATE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_no_modify();

CREATE TRIGGER audit_log_no_delete
  BEFORE DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_no_modify();
