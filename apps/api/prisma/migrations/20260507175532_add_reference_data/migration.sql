-- CreateTable
CREATE TABLE "country" (
    "id" UUID NOT NULL,
    "codeIso2" CHAR(2) NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "region" (
    "id" UUID NOT NULL,
    "countryId" UUID NOT NULL,
    "codeIso" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "city" (
    "id" UUID NOT NULL,
    "regionId" UUID NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "city_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lookup_value" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameRu" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lookup_value_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "country_codeIso2_key" ON "country"("codeIso2");

-- CreateIndex
CREATE INDEX "country_sortOrder_idx" ON "country"("sortOrder");

-- CreateIndex
CREATE INDEX "region_countryId_sortOrder_idx" ON "region"("countryId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "region_countryId_codeIso_key" ON "region"("countryId", "codeIso");

-- CreateIndex
CREATE INDEX "city_regionId_nameRu_idx" ON "city"("regionId", "nameRu");

-- CreateIndex
CREATE INDEX "city_nameRu_idx" ON "city"("nameRu");

-- CreateIndex
CREATE UNIQUE INDEX "city_regionId_nameRu_key" ON "city"("regionId", "nameRu");

-- CreateIndex
CREATE INDEX "lookup_value_kind_sortOrder_idx" ON "lookup_value"("kind", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_value_kind_code_key" ON "lookup_value"("kind", "code");

-- AddForeignKey
ALTER TABLE "region" ADD CONSTRAINT "region_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "city" ADD CONSTRAINT "city_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "region"("id") ON DELETE CASCADE ON UPDATE CASCADE;
