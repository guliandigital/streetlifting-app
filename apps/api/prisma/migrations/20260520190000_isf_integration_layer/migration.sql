ALTER TABLE "user" ADD COLUMN "isfPersonId" TEXT;

ALTER TABLE "federation" ADD COLUMN "isfTenantCode" TEXT;

ALTER TABLE "athlete"
  ADD COLUMN "isfPersonId" TEXT,
  ADD COLUMN "publicProfileSlug" TEXT,
  ADD COLUMN "privacyMode" TEXT NOT NULL DEFAULT 'public_results';

ALTER TABLE "attempt"
  ADD COLUMN "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "record"
  ADD COLUMN "revokedAt" TIMESTAMPTZ(6),
  ADD COLUMN "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE UNIQUE INDEX "federation_isfTenantCode_key" ON "federation"("isfTenantCode");

CREATE TABLE "external_identity_link" (
  "id" UUID NOT NULL,
  "system" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "localEntityId" UUID NOT NULL,
  "externalId" TEXT NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL,
  "verifiedAt" TIMESTAMPTZ(6),
  "rejectedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "external_identity_link_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_identity_link_system_entityType_externalId_key"
  ON "external_identity_link"("system", "entityType", "externalId");
CREATE INDEX "external_identity_link_entityType_localEntityId_idx"
  ON "external_identity_link"("entityType", "localEntityId");

CREATE TABLE "api_service_client" (
  "id" UUID NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "rateLimitRpm" INTEGER NOT NULL DEFAULT 60,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMPTZ(6),

  CONSTRAINT "api_service_client_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "api_service_client_code_key" ON "api_service_client"("code");
CREATE INDEX "api_service_client_tokenHash_idx" ON "api_service_client"("tokenHash");

CREATE TABLE "sync_outbox" (
  "id" UUID NOT NULL,
  "eventType" TEXT NOT NULL,
  "aggregateType" TEXT NOT NULL,
  "aggregateId" UUID NOT NULL,
  "tenant" TEXT,
  "schemaVersion" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "occurredAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "publishedAt" TIMESTAMPTZ(6),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMPTZ(6),
  "lastError" TEXT,

  CONSTRAINT "sync_outbox_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_outbox_publishedAt_nextAttemptAt_idx"
  ON "sync_outbox"("publishedAt", "nextAttemptAt");
CREATE INDEX "sync_outbox_eventType_aggregateId_idx"
  ON "sync_outbox"("eventType", "aggregateId");
