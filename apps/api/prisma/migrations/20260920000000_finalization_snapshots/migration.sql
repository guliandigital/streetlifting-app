-- Additive: no archive backfill and no changes to existing business rows.
BEGIN;
CREATE TABLE "competition_finalization_snapshot" (
  "id" UUID NOT NULL,
  "competitionId" UUID NOT NULL,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0),
  "schemaVersion" INTEGER NOT NULL CHECK ("schemaVersion" > 0),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" UUID NOT NULL,
  "payloadHash" CHAR(64) NOT NULL,
  "payload" JSONB NOT NULL,
  CONSTRAINT "competition_finalization_snapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "competition_finalization_snapshot_competitionId_fkey"
    FOREIGN KEY ("competitionId") REFERENCES "competition"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "competition_finalization_snapshot_competitionId_revision_key"
  ON "competition_finalization_snapshot"("competitionId", "revision");

CREATE FUNCTION prevent_finalization_snapshot_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Finalization snapshots are immutable' USING ERRCODE = '23514';
END;
$$;
CREATE TRIGGER finalization_snapshot_immutable
BEFORE UPDATE OR DELETE ON "competition_finalization_snapshot"
FOR EACH ROW EXECUTE FUNCTION prevent_finalization_snapshot_mutation();
CREATE TRIGGER finalization_snapshot_no_truncate
BEFORE TRUNCATE ON "competition_finalization_snapshot"
FOR EACH STATEMENT EXECUTE FUNCTION prevent_finalization_snapshot_mutation();
COMMIT;
