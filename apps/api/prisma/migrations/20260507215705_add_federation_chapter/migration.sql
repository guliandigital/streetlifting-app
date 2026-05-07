-- CreateTable
CREATE TABLE "federation_chapter" (
    "id" UUID NOT NULL,
    "federationId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "countryCode" CHAR(2),
    "regionCode" TEXT,
    "city" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "federation_chapter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "federation_chapter_federationId_idx" ON "federation_chapter"("federationId");

-- CreateIndex
CREATE UNIQUE INDEX "federation_chapter_federationId_code_key" ON "federation_chapter"("federationId", "code");

-- AddForeignKey
ALTER TABLE "federation_chapter" ADD CONSTRAINT "federation_chapter_federationId_fkey" FOREIGN KEY ("federationId") REFERENCES "federation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
