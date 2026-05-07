-- Rename obsolete `_2lift` → `_total` in any seeded discipline rows.
-- Idempotent: re-running with no matching rows is a no-op.
-- The seed script (`pnpm --filter=@streetlifting/api seed:disciplines`)
-- will refresh the labels to the new wording on its next run.

UPDATE "discipline"
SET    "code" = REPLACE("code", '_2lift', '_total')
WHERE  "code" LIKE '%_2lift%';
