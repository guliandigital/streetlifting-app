CREATE TYPE "FederationAffiliationStatus" AS ENUM ('unverified', 'national_member', 'suspended', 'withdrawn');
CREATE TYPE "FederationAffiliationBody" AS ENUM ('isf', 'eusf');

ALTER TABLE "federation"
  ADD COLUMN "affiliationStatus" "FederationAffiliationStatus" NOT NULL DEFAULT 'unverified',
  ADD COLUMN "affiliationBody" "FederationAffiliationBody",
  ADD COLUMN "affiliationConfirmedAt" TIMESTAMPTZ(6);

CREATE INDEX "federation_affiliationStatus_affiliationBody_idx"
  ON "federation"("affiliationStatus", "affiliationBody");
