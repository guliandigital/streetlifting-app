CREATE TYPE "JudgeDecisionCall" AS ENUM ('white', 'red');

ALTER TABLE "judge"
  ADD COLUMN "userId" UUID;

CREATE UNIQUE INDEX "judge_userId_key" ON "judge"("userId");

ALTER TABLE "judge"
  ADD CONSTRAINT "judge_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "attempt_judge_decision" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "attemptId" UUID NOT NULL,
  "judgeAssignmentId" UUID NOT NULL,
  "call" "JudgeDecisionCall" NOT NULL,
  "reasonCode" TEXT,
  "decidedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attempt_judge_decision_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "attempt_judge_decision_attemptId_judgeAssignmentId_key"
  ON "attempt_judge_decision"("attemptId", "judgeAssignmentId");
CREATE INDEX "attempt_judge_decision_judgeAssignmentId_idx"
  ON "attempt_judge_decision"("judgeAssignmentId");

ALTER TABLE "attempt_judge_decision"
  ADD CONSTRAINT "attempt_judge_decision_attemptId_fkey"
  FOREIGN KEY ("attemptId") REFERENCES "attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "attempt_judge_decision"
  ADD CONSTRAINT "attempt_judge_decision_judgeAssignmentId_fkey"
  FOREIGN KEY ("judgeAssignmentId") REFERENCES "judge_assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
