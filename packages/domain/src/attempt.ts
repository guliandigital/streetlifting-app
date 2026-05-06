import { z } from 'zod';
import { AttemptId, NominationId, JudgeId } from './ids.js';
import { AttemptResult } from './enums.js';

export const JudgeDecision = z.object({
  judgeId: JudgeId,
  position: z.enum(['head', 'left', 'right']),
  call: z.enum(['white', 'red']),
  reasonCode: z.string().optional(),
  decidedAt: z.string().datetime(),
});
export type JudgeDecision = z.infer<typeof JudgeDecision>;

export const Attempt = z.object({
  id: AttemptId,
  nominationId: NominationId,
  attemptNumber: z.number().int().min(1).max(5),
  weightKg: z.number().nonnegative(),
  result: AttemptResult,
  judgeDecisions: z.array(JudgeDecision).default([]),
  repsCount: z.number().int().nonnegative().nullable(),
  timeoutSeconds: z.number().int().nonnegative().nullable(),
  startedAt: z.string().datetime().nullable(),
  decidedAt: z.string().datetime().nullable(),
  notes: z.string().optional(),
});
export type Attempt = z.infer<typeof Attempt>;
