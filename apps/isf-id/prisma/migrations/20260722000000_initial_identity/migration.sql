CREATE TABLE "identity_account" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "email" TEXT NOT NULL,
  "emailNormalized" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "emailVerifiedAt" TIMESTAMPTZ(6),
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identity_account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "identity_account_email_key" ON "identity_account"("email");
CREATE UNIQUE INDEX "identity_account_emailNormalized_key" ON "identity_account"("emailNormalized");

CREATE TABLE "identity_session" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "accountId" UUID NOT NULL,
  "tokenHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "revokedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "identity_session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "identity_session_tokenHash_key" ON "identity_session"("tokenHash");
CREATE INDEX "identity_session_accountId_expiresAt_idx" ON "identity_session"("accountId", "expiresAt");
ALTER TABLE "identity_session" ADD CONSTRAINT "identity_session_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "identity_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "login_challenge" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "emailNormalized" TEXT NOT NULL,
  "codeHash" CHAR(64) NOT NULL,
  "expiresAt" TIMESTAMPTZ(6) NOT NULL,
  "consumedAt" TIMESTAMPTZ(6),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_challenge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "login_challenge_emailNormalized_createdAt_idx" ON "login_challenge"("emailNormalized", "createdAt");
CREATE INDEX "login_challenge_expiresAt_idx" ON "login_challenge"("expiresAt");
