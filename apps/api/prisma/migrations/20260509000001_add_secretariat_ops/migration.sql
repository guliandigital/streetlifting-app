-- Secretariat Pilot MVP: discipline components, manual payment tracking,
-- declared/factual weight classes, and component-scoped attempts.

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('unpaid', 'partial', 'paid', 'waived', 'refunded');

-- CreateTable
CREATE TABLE "discipline_component" (
    "id" UUID NOT NULL,
    "disciplineId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "equipment" "Equipment" NOT NULL,
    "order" INTEGER NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 3,
    "fixedWeightKg" DOUBLE PRECISION,

    CONSTRAINT "discipline_component_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "nomination"
    ADD COLUMN "declaredWeightClassId" UUID,
    ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'unpaid',
    ADD COLUMN "paidAmountKopecks" BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN "paymentMethod" "PaymentMethod",
    ADD COLUMN "paymentComment" TEXT,
    ADD COLUMN "paidAt" TIMESTAMPTZ(6);

-- Backfill declared class + manual payment state from the launch MVP boolean.
UPDATE "nomination"
SET "declaredWeightClassId" = "weightClassId";

UPDATE "nomination" n
SET
    "paymentStatus" = 'paid',
    "paidAmountKopecks" = c."entryFeeKopecks",
    "paidAt" = n."updatedAt"
FROM "competition" c
WHERE n."competitionId" = c."id"
  AND n."isEntryFeePaid" = true;

-- AlterTable
ALTER TABLE "attempt"
    ADD COLUMN "componentId" UUID;

-- DropIndex
DROP INDEX "nomination_competitionId_athleteId_disciplineId_divisionId__key";

-- DropIndex
DROP INDEX "attempt_nominationId_attemptNumber_key";

-- CreateIndex
CREATE UNIQUE INDEX "discipline_component_disciplineId_code_key" ON "discipline_component"("disciplineId", "code");

-- CreateIndex
CREATE INDEX "discipline_component_disciplineId_order_idx" ON "discipline_component"("disciplineId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "nomination_competitionId_athleteId_disciplineId_divisionId_key" ON "nomination"("competitionId", "athleteId", "disciplineId", "divisionId");

-- CreateIndex
CREATE INDEX "nomination_declaredWeightClassId_idx" ON "nomination"("declaredWeightClassId");

-- CreateIndex
CREATE UNIQUE INDEX "attempt_nominationId_componentId_attemptNumber_key" ON "attempt"("nominationId", "componentId", "attemptNumber");

-- CreateIndex
CREATE INDEX "attempt_componentId_idx" ON "attempt"("componentId");

-- AddForeignKey
ALTER TABLE "discipline_component" ADD CONSTRAINT "discipline_component_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "discipline"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nomination" ADD CONSTRAINT "nomination_declaredWeightClassId_fkey" FOREIGN KEY ("declaredWeightClassId") REFERENCES "weight_class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempt" ADD CONSTRAINT "attempt_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "discipline_component"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
