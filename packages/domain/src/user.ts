import { z } from 'zod';
import { UserId, FederationId, CompetitionId } from './ids.js';
import { Role } from './enums.js';

export const User = z.object({
  id: UserId,
  email: z.string().email(),
  isfSubjectId: z.string().uuid().optional().nullable(),
  phone: z.string().optional(),
  telegramHandle: z.string().optional(),
  displayName: z.string().min(1),
  isfPersonId: z.string().optional().nullable(),
  isEmailVerified: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type User = z.infer<typeof User>;

export const RoleAssignment = z.object({
  userId: UserId,
  role: Role,
  federationId: FederationId.optional(),
  competitionId: CompetitionId.optional(),
  grantedBy: UserId.optional(),
  grantedAt: z.string().datetime(),
  revokedAt: z.string().datetime().optional(),
});
export type RoleAssignment = z.infer<typeof RoleAssignment>;
