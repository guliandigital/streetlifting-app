-- Align hand-written migrations with the Prisma datamodel.
--
-- Earlier migrations gave `id` and `updatedAt` database-level defaults
-- (gen_random_uuid(), now()) that schema.prisma does not declare: Prisma
-- supplies both values itself (`@default(uuid())`, `@updatedAt`). The CI
-- drift check (`prisma migrate diff --from-migrations`) flags the difference,
-- so drop the unused defaults. Every insert goes through Prisma, and the one
-- SQL seed (20260723020000) sets these columns explicitly, so nothing relies
-- on them. Metadata-only change; no rows are touched.

-- AlterTable
ALTER TABLE "attempt" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "attempt_judge_decision" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "competition_team_member" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "external_identity_link" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "federation_protocol_key" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "final_protocol_import" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "isf_sso_assertion" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "official_credential" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "official_profile" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "passport_review_request" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "record" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "sport_rank_award" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;
