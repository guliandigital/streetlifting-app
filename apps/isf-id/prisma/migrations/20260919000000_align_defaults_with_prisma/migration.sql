-- Align the hand-written initial migration with the Prisma datamodel: `id`
-- and `updatedAt` are supplied by Prisma (`@default(uuid())`, `@updatedAt`),
-- so the database-level defaults are unused and only show up as drift in the
-- CI `prisma migrate diff` check. Metadata-only change.

-- AlterTable
ALTER TABLE "identity_account" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "identity_session" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "login_challenge" ALTER COLUMN "id" DROP DEFAULT;
