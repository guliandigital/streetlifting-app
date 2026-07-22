ALTER TABLE "user"
  ADD COLUMN "isfSubjectId" UUID;

CREATE UNIQUE INDEX "user_isfSubjectId_key" ON "user"("isfSubjectId");

ALTER TABLE "athlete"
  ADD COLUMN "userId" UUID;

CREATE UNIQUE INDEX "athlete_userId_key" ON "athlete"("userId");

ALTER TABLE "athlete"
  ADD CONSTRAINT "athlete_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "isf_sso_assertion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "issuer" TEXT NOT NULL,
  "jti" TEXT NOT NULL,
  "subjectId" UUID NOT NULL,
  "audience" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "consumedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "isf_sso_assertion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "isf_sso_assertion_issuer_jti_key"
  ON "isf_sso_assertion"("issuer", "jti");
CREATE INDEX "isf_sso_assertion_expiresAt_idx" ON "isf_sso_assertion"("expiresAt");
