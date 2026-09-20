BEGIN;
-- CreateTable
CREATE TABLE "protocol_approval" (
    "id" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "approvedByUserId" UUID NOT NULL,
    "approvedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT NOT NULL,
    "evidence" JSONB NOT NULL,

    CONSTRAINT "protocol_approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "record_review" (
    "id" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "nominationId" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMPTZ(6),
    "reviewedByUserId" UUID,
    "reviewReason" TEXT,
    "evidence" JSONB,
    "ratificationReason" TEXT,
    "recordId" UUID,

    CONSTRAINT "record_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issued_result_document" (
    "id" UUID NOT NULL,
    "snapshotId" UUID NOT NULL,
    "nominationId" UUID NOT NULL,
    "athleteId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "previousDocumentId" UUID,
    "issuedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedByUserId" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "payloadHash" CHAR(64) NOT NULL,

    CONSTRAINT "issued_result_document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "protocol_approval_snapshotId_key" ON "protocol_approval"("snapshotId");

-- CreateIndex


-- CreateIndex
CREATE UNIQUE INDEX "record_review_snapshotId_nominationId_key" ON "record_review"("snapshotId", "nominationId");

-- CreateIndex
CREATE INDEX "issued_result_document_athleteId_issuedAt_idx" ON "issued_result_document"("athleteId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "issued_result_document_snapshotId_nominationId_key" ON "issued_result_document"("snapshotId", "nominationId");

-- CreateIndex
CREATE UNIQUE INDEX "issued_result_document_nominationId_version_key" ON "issued_result_document"("nominationId", "version");

-- AddForeignKey
ALTER TABLE "protocol_approval" ADD CONSTRAINT "protocol_approval_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "competition_finalization_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_review" ADD CONSTRAINT "record_review_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "competition_finalization_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_review" ADD CONSTRAINT "record_review_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "nomination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "record_review" ADD CONSTRAINT "record_review_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_result_document" ADD CONSTRAINT "issued_result_document_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "competition_finalization_snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_result_document" ADD CONSTRAINT "issued_result_document_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "nomination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issued_result_document" ADD CONSTRAINT "issued_result_document_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "athlete"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE record_review ADD CONSTRAINT record_review_status_check CHECK (status IN ('candidate','verified','rejected','ratified','superseded'));
ALTER TABLE issued_result_document ADD CONSTRAINT issued_result_document_version_check CHECK (version > 0);
CREATE TRIGGER protocol_approval_immutable BEFORE UPDATE OR DELETE ON protocol_approval
FOR EACH ROW EXECUTE FUNCTION prevent_finalization_snapshot_mutation();
CREATE TRIGGER protocol_approval_no_truncate BEFORE TRUNCATE ON protocol_approval
FOR EACH STATEMENT EXECUTE FUNCTION prevent_finalization_snapshot_mutation();
CREATE TRIGGER issued_result_document_immutable BEFORE UPDATE OR DELETE ON issued_result_document
FOR EACH ROW EXECUTE FUNCTION prevent_finalization_snapshot_mutation();
CREATE TRIGGER issued_result_document_no_truncate BEFORE TRUNCATE ON issued_result_document
FOR EACH STATEMENT EXECUTE FUNCTION prevent_finalization_snapshot_mutation();
COMMIT;
