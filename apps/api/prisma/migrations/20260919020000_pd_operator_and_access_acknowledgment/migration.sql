-- Federation as the personal-data operator: requisites shown in consent texts
-- and used for subject requests (152-ФЗ, art. 9 and 18.1).
ALTER TABLE "federation"
  ADD COLUMN "pdOperatorName" TEXT,
  ADD COLUMN "pdOperatorAddress" TEXT,
  ADD COLUMN "pdOperatorContact" TEXT,
  ADD COLUMN "privacyPolicyUrl" TEXT;

-- Confidentiality acknowledgment recorded per role grant (152-ФЗ, art. 7).
-- Roles that touch other people's data are inactive until acknowledged.
ALTER TABLE "role_assignment"
  ADD COLUMN "acknowledgedAt" TIMESTAMPTZ(6),
  ADD COLUMN "acknowledgedTextVersion" TEXT,
  ADD COLUMN "acknowledgedFromIp" TEXT,
  ADD COLUMN "acknowledgedFromUserAgent" TEXT;
