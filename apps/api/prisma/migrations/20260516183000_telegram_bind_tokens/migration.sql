CREATE TABLE "telegram_bind_token" (
    "id" UUID NOT NULL,
    "federationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6) NOT NULL,
    "usedAt" TIMESTAMPTZ(6),
    "usedByChatId" TEXT,
    "usedByUsername" TEXT,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_bind_token_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_subscription" (
    "id" UUID NOT NULL,
    "federationId" UUID NOT NULL,
    "chatId" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "username" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,
    "lastNotificationAt" TIMESTAMPTZ(6),

    CONSTRAINT "telegram_subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "telegram_notification" (
    "id" UUID NOT NULL,
    "federationId" UUID NOT NULL,
    "competitionId" UUID,
    "nominationId" UUID,
    "subscriptionId" UUID,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "error" TEXT,
    "sentAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "telegram_notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "telegram_bind_token_code_key" ON "telegram_bind_token"("code");
CREATE INDEX "telegram_bind_token_federationId_expiresAt_idx" ON "telegram_bind_token"("federationId", "expiresAt");
CREATE INDEX "telegram_bind_token_usedAt_idx" ON "telegram_bind_token"("usedAt");

CREATE UNIQUE INDEX "telegram_subscription_federationId_chatId_key" ON "telegram_subscription"("federationId", "chatId");
CREATE INDEX "telegram_subscription_chatId_idx" ON "telegram_subscription"("chatId");
CREATE INDEX "telegram_subscription_federationId_isActive_idx" ON "telegram_subscription"("federationId", "isActive");

CREATE INDEX "telegram_notification_federationId_status_createdAt_idx" ON "telegram_notification"("federationId", "status", "createdAt");
CREATE INDEX "telegram_notification_subscriptionId_createdAt_idx" ON "telegram_notification"("subscriptionId", "createdAt");

ALTER TABLE "telegram_bind_token" ADD CONSTRAINT "telegram_bind_token_federationId_fkey" FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_bind_token" ADD CONSTRAINT "telegram_bind_token_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "telegram_subscription" ADD CONSTRAINT "telegram_subscription_federationId_fkey" FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "telegram_notification" ADD CONSTRAINT "telegram_notification_federationId_fkey" FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "telegram_notification" ADD CONSTRAINT "telegram_notification_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "telegram_notification" ADD CONSTRAINT "telegram_notification_nominationId_fkey" FOREIGN KEY ("nominationId") REFERENCES "nomination"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "telegram_notification" ADD CONSTRAINT "telegram_notification_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "telegram_subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;
