ALTER TABLE "athlete"
  ADD COLUMN "birthYear" INTEGER,
  ALTER COLUMN "dateOfBirth" DROP NOT NULL,
  ALTER COLUMN "countryCode" DROP NOT NULL;
ALTER TABLE "athlete" ADD CONSTRAINT "athlete_birth_year_consistent" CHECK (
  ("birthYear" IS NULL OR "birthYear" BETWEEN 1900 AND 2100)
  AND ("dateOfBirth" IS NULL OR "birthYear" IS NULL OR EXTRACT(YEAR FROM "dateOfBirth") = "birthYear")
);
