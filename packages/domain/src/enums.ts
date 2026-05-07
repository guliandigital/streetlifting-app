import { z } from 'zod';

export const Gender = z.enum(['M', 'F']);
export type Gender = z.infer<typeof Gender>;

export const Role = z.enum([
  /**
   * Platform-wide root. Sees and can administer every federation, every
   * competition, every audit log entry. Typically a single account
   * belonging to the maintainer / SaaS owner. Has implicit access to ALL
   * scopes regardless of federationId / competitionId on the assignment.
   * Use sparingly — most operations should be scoped via federation_admin.
   */
  'platform_admin',
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

export const ConsentScope = z.enum([
  'data_processing',
  'marketing_email',
  'marketing_telegram',
  'public_results',
  'photo_publication',
]);
export type ConsentScope = z.infer<typeof ConsentScope>;

export const AttachmentKind = z.enum([
  'athlete_photo',
  'federation_file',
  'competition_file',
  'certificate_pdf',
  'protocol_pdf',
  'misc',
]);
export type AttachmentKind = z.infer<typeof AttachmentKind>;

export const CompetitionFormat = z.enum(['classic', 'multirep']);
export type CompetitionFormat = z.infer<typeof CompetitionFormat>;

export const Event = z.enum(['PU', 'DI', 'PUDI']);
export type Event = z.infer<typeof Event>;

export const LookupKind = z.enum([
  /** Judge categories (head judge, 1st cat, 2nd cat, side judge, …). */
  'judge_category',
  /** Sport ranks (МСМК, МС, КМС, 1р, 1ю, …). */
  'sport_rank',
  /** Club types (gym, section, school, amateur club, …). */
  'club_type',
  /** Free-form federation tags / pomechki (partner, sponsor, …). */
  'federation_tag',
]);
export type LookupKind = z.infer<typeof LookupKind>;

export const PlateColor = z.enum([
  'red',
  'blue',
  'yellow',
  'green',
  'white',
  'black',
  'gray',
]);
export type PlateColor = z.infer<typeof PlateColor>;
