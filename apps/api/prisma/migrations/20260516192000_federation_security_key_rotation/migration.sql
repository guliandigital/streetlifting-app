CREATE TABLE "federation_security_key_rotation_token" (
    "id" UUID NOT NULL,
    "federationId" UUID NOT NULL,
    "codeHash" TEXT NOT NULL,
    "createdByUserId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),

    CONSTRAINT "federation_security_key_rotation_token_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "federation_security_key_rotation_token_federationId_expiresAt_idx" ON "federation_security_key_rotation_token"("federationId", "expiresAt");
CREATE INDEX "federation_security_key_rotation_token_createdByUserId_idx" ON "federation_security_key_rotation_token"("createdByUserId");
CREATE UNIQUE INDEX "federation_security_key_rotation_token_federationId_codeHash_usedAt_key" ON "federation_security_key_rotation_token"("federationId", "codeHash", "usedAt");

ALTER TABLE "federation_security_key_rotation_token"
  ADD CONSTRAINT "federation_security_key_rotation_token_federationId_fkey"
  FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "federation_security_key_rotation_token"
  ADD CONSTRAINT "federation_security_key_rotation_token_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
