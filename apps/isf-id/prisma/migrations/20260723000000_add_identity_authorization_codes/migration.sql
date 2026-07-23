CREATE TABLE "identity_authorization_code" (
    "id" UUID NOT NULL,
    "accountId" UUID NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "clientId" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "codeChallenge" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "identity_authorization_code_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "identity_authorization_code_codeHash_key"
    ON "identity_authorization_code"("codeHash");
CREATE INDEX "identity_authorization_code_accountId_expiresAt_idx"
    ON "identity_authorization_code"("accountId", "expiresAt");
CREATE INDEX "identity_authorization_code_expiresAt_idx"
    ON "identity_authorization_code"("expiresAt");

ALTER TABLE "identity_authorization_code"
    ADD CONSTRAINT "identity_authorization_code_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "identity_account"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
