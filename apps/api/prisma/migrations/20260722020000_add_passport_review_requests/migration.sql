CREATE TYPE "PassportReviewRequestKind" AS ENUM ('official_profile', 'official_credential', 'sport_rank');
CREATE TYPE "PassportReviewRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

CREATE TABLE "passport_review_request" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "applicantUserId" UUID NOT NULL,
  "federationId" UUID NOT NULL,
  "kind" "PassportReviewRequestKind" NOT NULL,
  "status" "PassportReviewRequestStatus" NOT NULL DEFAULT 'pending',
  "payload" JSONB NOT NULL,
  "supportingAttachmentId" UUID,
  "resolvedByUserId" UUID,
  "submittedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMPTZ(6),
  "reviewNote" TEXT,
  CONSTRAINT "passport_review_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "passport_review_request_applicantUserId_status_idx" ON "passport_review_request"("applicantUserId", "status");
CREATE INDEX "passport_review_request_federationId_status_submittedAt_idx" ON "passport_review_request"("federationId", "status", "submittedAt");
ALTER TABLE "passport_review_request" ADD CONSTRAINT "passport_review_request_applicantUserId_fkey"
  FOREIGN KEY ("applicantUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "passport_review_request" ADD CONSTRAINT "passport_review_request_federationId_fkey"
  FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "passport_review_request" ADD CONSTRAINT "passport_review_request_supportingAttachmentId_fkey"
  FOREIGN KEY ("supportingAttachmentId") REFERENCES "attachment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "passport_review_request" ADD CONSTRAINT "passport_review_request_resolvedByUserId_fkey"
  FOREIGN KEY ("resolvedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
