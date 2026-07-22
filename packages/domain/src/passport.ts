import { z } from 'zod';
import {
  AthleteId,
  AttachmentId,
  CompetitionId,
  CompetitionTeamMemberId,
  FederationId,
  JudgeAssignmentId,
  OfficialCredentialId,
  OfficialProfileId,
  PlatformId,
  SportRankAwardId,
  UserId,
} from './ids.js';

const DateTime = z.string().datetime();

/** A person can perform more than one official function simultaneously. */
export const OfficialFunction = z.enum([
  'judge',
  'secretary',
  'assistant',
  'scoreboard_operator',
  'speaker',
  'technical_official',
]);
export type OfficialFunction = z.infer<typeof OfficialFunction>;

export const CredentialKind = z.enum(['category', 'attestation', 'certificate']);
export type CredentialKind = z.infer<typeof CredentialKind>;

export const CredentialStatus = z.enum(['active', 'expired', 'suspended', 'revoked']);
export type CredentialStatus = z.infer<typeof CredentialStatus>;

export const TeamMemberRole = z.enum([
  'organizer',
  'head_judge',
  'judge',
  'secretary',
  'assistant',
  'scoreboard_operator',
  'speaker',
  'technical_official',
  'medical_official',
]);
export type TeamMemberRole = z.infer<typeof TeamMemberRole>;

export const TeamMemberStatus = z.enum([
  'invited',
  'confirmed',
  'completed',
  'declined',
  'cancelled',
]);
export type TeamMemberStatus = z.infer<typeof TeamMemberStatus>;

export const OfficialProfile = z.object({
  id: OfficialProfileId,
  userId: UserId,
  functions: z.array(OfficialFunction).min(1),
  createdAt: DateTime,
  updatedAt: DateTime,
});
export type OfficialProfile = z.infer<typeof OfficialProfile>;

export const OfficialCredential = z
  .object({
    id: OfficialCredentialId,
    officialProfileId: OfficialProfileId,
    kind: CredentialKind,
    name: z.string().min(1).max(160),
    credentialNumber: z.string().min(1).max(120).nullable(),
    issuedByFederationId: FederationId.nullable(),
    issuedAt: DateTime,
    expiresAt: DateTime.nullable(),
    status: CredentialStatus,
    documentAttachmentId: AttachmentId.nullable(),
    statusReason: z.string().min(1).max(1000).nullable(),
    createdAt: DateTime,
    updatedAt: DateTime,
  })
  .superRefine((value, ctx) => {
    if (value.expiresAt && value.expiresAt < value.issuedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'expiresAt must not precede issuedAt',
      });
    }
  });
export type OfficialCredential = z.infer<typeof OfficialCredential>;

export const SportRankAward = z
  .object({
    id: SportRankAwardId,
    athleteId: AthleteId,
    name: z.string().min(1).max(160),
    basis: z.string().min(1).max(1000),
    issuedByFederationId: FederationId.nullable(),
    issuedAt: DateTime,
    expiresAt: DateTime.nullable(),
    status: CredentialStatus,
    documentAttachmentId: AttachmentId.nullable(),
    statusReason: z.string().min(1).max(1000).nullable(),
    createdAt: DateTime,
    updatedAt: DateTime,
  })
  .superRefine((value, ctx) => {
    if (value.expiresAt && value.expiresAt < value.issuedAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'expiresAt must not precede issuedAt',
      });
    }
  });
export type SportRankAward = z.infer<typeof SportRankAward>;

/**
 * Frozen evidence of a person's factual participation in a competition.
 * It deliberately differs from RoleAssignment: access to a service never
 * implies that the person worked at a particular tournament.
 */
export const CompetitionTeamMember = z.object({
  id: CompetitionTeamMemberId,
  competitionId: CompetitionId,
  userId: UserId,
  platformId: PlatformId.nullable(),
  role: TeamMemberRole,
  status: TeamMemberStatus,
  memberNameSnapshot: z.string().min(1).max(240),
  invitedAt: DateTime.nullable(),
  confirmedAt: DateTime.nullable(),
  completedAt: DateTime.nullable(),
  judgeAssignmentId: JudgeAssignmentId.nullable(),
  correctionOfId: CompetitionTeamMemberId.nullable(),
  createdAt: DateTime,
  updatedAt: DateTime,
});
export type CompetitionTeamMember = z.infer<typeof CompetitionTeamMember>;
