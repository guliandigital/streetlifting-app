import { z } from 'zod';
import { JudgeId, JudgeAssignmentId, CompetitionId, PlatformId } from './ids.js';
import { JudgeRole } from './enums.js';

export const Judge = z.object({
  id: JudgeId,
  lastName: z.string().min(1),
  firstName: z.string().min(1),
  middleName: z.string().optional(),
  categoryRu: z.string().optional(),
  categoryEn: z.string().optional(),
  cardNumber: z.string().optional(),
  cityRegion: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Judge = z.infer<typeof Judge>;

export const JudgeAssignment = z.object({
  id: JudgeAssignmentId,
  competitionId: CompetitionId,
  judgeId: JudgeId,
  platformId: PlatformId.nullable(),
  role: JudgeRole,
  assignedAt: z.string().datetime(),
});
export type JudgeAssignment = z.infer<typeof JudgeAssignment>;
