-- PostgreSQL treats NULL values as distinct in a multi-column UNIQUE index.
-- Keep one global assignment per competition/judge/role when platformId is NULL.
CREATE UNIQUE INDEX IF NOT EXISTS "judge_assignment_competitionId_judgeId_global_role_key"
  ON "judge_assignment"("competitionId", "judgeId", "role")
  WHERE "platformId" IS NULL;
