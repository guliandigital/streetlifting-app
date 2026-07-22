CREATE TYPE "OfficialFunction" AS ENUM (
  'judge', 'secretary', 'assistant', 'scoreboard_operator', 'speaker', 'technical_official'
);

CREATE TYPE "CredentialKind" AS ENUM ('category', 'attestation', 'certificate');
CREATE TYPE "CredentialStatus" AS ENUM ('active', 'expired', 'suspended', 'revoked');

CREATE TYPE "CompetitionTeamMemberRole" AS ENUM (
  'organizer', 'head_judge', 'judge', 'secretary', 'assistant', 'scoreboard_operator',
  'speaker', 'technical_official', 'medical_official'
);

CREATE TYPE "CompetitionTeamMemberStatus" AS ENUM (
  'invited', 'confirmed', 'completed', 'declined', 'cancelled'
);

CREATE TABLE "official_profile" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "functions" "OfficialFunction"[] NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "official_profile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "official_profile_userId_key" ON "official_profile"("userId");
ALTER TABLE "official_profile" ADD CONSTRAINT "official_profile_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "official_credential" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "officialProfileId" UUID NOT NULL,
  "kind" "CredentialKind" NOT NULL,
  "name" TEXT NOT NULL,
  "credentialNumber" TEXT,
  "issuedByFederationId" UUID,
  "issuedAt" TIMESTAMPTZ(6) NOT NULL,
  "expiresAt" TIMESTAMPTZ(6),
  "status" "CredentialStatus" NOT NULL DEFAULT 'active',
  "statusReason" TEXT,
  "documentAttachmentId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "official_credential_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "official_credential_valid_dates" CHECK ("expiresAt" IS NULL OR "expiresAt" >= "issuedAt")
);

CREATE INDEX "official_credential_officialProfileId_status_idx" ON "official_credential"("officialProfileId", "status");
CREATE INDEX "official_credential_issuedByFederationId_idx" ON "official_credential"("issuedByFederationId");
ALTER TABLE "official_credential" ADD CONSTRAINT "official_credential_officialProfileId_fkey"
  FOREIGN KEY ("officialProfileId") REFERENCES "official_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "official_credential" ADD CONSTRAINT "official_credential_issuedByFederationId_fkey"
  FOREIGN KEY ("issuedByFederationId") REFERENCES "federation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "official_credential" ADD CONSTRAINT "official_credential_documentAttachmentId_fkey"
  FOREIGN KEY ("documentAttachmentId") REFERENCES "attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "sport_rank_award" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "athleteId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "basis" TEXT NOT NULL,
  "issuedByFederationId" UUID,
  "issuedAt" TIMESTAMPTZ(6) NOT NULL,
  "expiresAt" TIMESTAMPTZ(6),
  "status" "CredentialStatus" NOT NULL DEFAULT 'active',
  "statusReason" TEXT,
  "documentAttachmentId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sport_rank_award_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sport_rank_award_valid_dates" CHECK ("expiresAt" IS NULL OR "expiresAt" >= "issuedAt")
);

CREATE INDEX "sport_rank_award_athleteId_status_idx" ON "sport_rank_award"("athleteId", "status");
CREATE INDEX "sport_rank_award_issuedByFederationId_idx" ON "sport_rank_award"("issuedByFederationId");
ALTER TABLE "sport_rank_award" ADD CONSTRAINT "sport_rank_award_athleteId_fkey"
  FOREIGN KEY ("athleteId") REFERENCES "athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sport_rank_award" ADD CONSTRAINT "sport_rank_award_issuedByFederationId_fkey"
  FOREIGN KEY ("issuedByFederationId") REFERENCES "federation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sport_rank_award" ADD CONSTRAINT "sport_rank_award_documentAttachmentId_fkey"
  FOREIGN KEY ("documentAttachmentId") REFERENCES "attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "competition_team_member" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "competitionId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "platformId" UUID,
  "role" "CompetitionTeamMemberRole" NOT NULL,
  "status" "CompetitionTeamMemberStatus" NOT NULL DEFAULT 'invited',
  "memberNameSnapshot" TEXT NOT NULL,
  "invitedAt" TIMESTAMPTZ(6),
  "confirmedAt" TIMESTAMPTZ(6),
  "completedAt" TIMESTAMPTZ(6),
  "judgeAssignmentId" UUID,
  "correctionOfId" UUID,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "competition_team_member_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "competition_team_member_judgeAssignmentId_key" ON "competition_team_member"("judgeAssignmentId");
CREATE INDEX "competition_team_member_competitionId_status_idx" ON "competition_team_member"("competitionId", "status");
CREATE INDEX "competition_team_member_userId_status_idx" ON "competition_team_member"("userId", "status");
CREATE INDEX "competition_team_member_correctionOfId_idx" ON "competition_team_member"("correctionOfId");
ALTER TABLE "competition_team_member" ADD CONSTRAINT "competition_team_member_competitionId_fkey"
  FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "competition_team_member" ADD CONSTRAINT "competition_team_member_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "competition_team_member" ADD CONSTRAINT "competition_team_member_platformId_fkey"
  FOREIGN KEY ("platformId") REFERENCES "platform"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "competition_team_member" ADD CONSTRAINT "competition_team_member_judgeAssignmentId_fkey"
  FOREIGN KEY ("judgeAssignmentId") REFERENCES "judge_assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "competition_team_member" ADD CONSTRAINT "competition_team_member_correctionOfId_fkey"
  FOREIGN KEY ("correctionOfId") REFERENCES "competition_team_member"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
