import { z } from 'zod';

export const Gender = z.enum(['M', 'F']);
export type Gender = z.infer<typeof Gender>;

export const Role = z.enum([
  'federation_admin',
  'secretary',
  'head_judge',
  'judge',
  'scoreboard_operator',
  'speaker',
  'athlete',
  'accountant',
  'viewer',
]);
export type Role = z.infer<typeof Role>;

export const CompetitionStatus = z.enum([
  'draft',
  'registration_open',
  'registration_closed',
  'in_progress',
  'finalized',
  'archived',
]);
export type CompetitionStatus = z.infer<typeof CompetitionStatus>;

export const NominationStatus = z.enum([
  'draft',
  'paid',
  'weighed_in',
  'on_platform',
  'finished',
  'disqualified',
  'withdrawn',
]);
export type NominationStatus = z.infer<typeof NominationStatus>;

export const AttemptResult = z.enum(['good_lift', 'no_lift', 'withdrawn', 'pending']);
export type AttemptResult = z.infer<typeof AttemptResult>;

export const DisciplineFamily = z.enum([
  'streetlifting',
  'weighted_calisthenics',
  'multi_rep',
]);
export type DisciplineFamily = z.infer<typeof DisciplineFamily>;

export const DisciplineFormat = z.enum([
  'three_attempts_max',
  'reps_to_failure',
  'reps_in_time',
  'isometric_hold',
]);
export type DisciplineFormat = z.infer<typeof DisciplineFormat>;

export const Equipment = z.enum([
  'pull_up_bar',
  'dip_bars',
  'bench',
  'squat_rack',
  'deadlift_platform',
  'parallel_bars',
  'rings',
  'ground',
]);
export type Equipment = z.infer<typeof Equipment>;

export const VeteranTier = z.enum([
  'kids',
  'youth',
  'junior',
  'open',
  'sub_master',
  'm1',
  'm2',
  'm3',
  'm4',
  'm5',
  'm6',
]);
export type VeteranTier = z.infer<typeof VeteranTier>;

export const JudgeRole = z.enum(['head', 'side_left', 'side_right', 'technical', 'jury']);
export type JudgeRole = z.infer<typeof JudgeRole>;

export const PaymentMethod = z.enum(['bank_transfer', 'card', 'sbp', 'cash', 'other']);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const NotificationChannel = z.enum(['telegram', 'email', 'webhook']);
export type NotificationChannel = z.infer<typeof NotificationChannel>;
