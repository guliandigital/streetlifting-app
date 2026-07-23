CREATE TABLE "federation_protocol_key" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "federationId" UUID NOT NULL,
  "keyId" TEXT NOT NULL,
  "publicKeyPem" TEXT NOT NULL,
  "sanctioningCertId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "validFrom" TIMESTAMPTZ(6),
  "validUntil" TIMESTAMPTZ(6),
  "revokedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "federation_protocol_key_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "federation_protocol_key_keyId_key" ON "federation_protocol_key"("keyId");
CREATE INDEX "federation_protocol_key_federationId_isActive_idx" ON "federation_protocol_key"("federationId", "isActive");
ALTER TABLE "federation_protocol_key" ADD CONSTRAINT "federation_protocol_key_federationId_fkey"
  FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "final_protocol_import" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "protocolId" UUID NOT NULL,
  "revision" INTEGER NOT NULL,
  "supersedesProtocolId" UUID,
  "competitionId" UUID NOT NULL,
  "federationId" UUID NOT NULL,
  "keyId" UUID NOT NULL,
  "sanctioningCertId" TEXT NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  "receivedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "final_protocol_import_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "final_protocol_import_protocolId_revision_key" ON "final_protocol_import"("protocolId", "revision");
CREATE INDEX "final_protocol_import_competitionId_receivedAt_idx" ON "final_protocol_import"("competitionId", "receivedAt");
CREATE INDEX "final_protocol_import_supersedesProtocolId_idx" ON "final_protocol_import"("supersedesProtocolId");
ALTER TABLE "final_protocol_import" ADD CONSTRAINT "final_protocol_import_competitionId_fkey"
  FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "final_protocol_import" ADD CONSTRAINT "final_protocol_import_federationId_fkey"
  FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "final_protocol_import" ADD CONSTRAINT "final_protocol_import_keyId_fkey"
  FOREIGN KEY ("keyId") REFERENCES "federation_protocol_key"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
