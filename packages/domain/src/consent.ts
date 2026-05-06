import { z } from 'zod';
import { ConsentId, UserId, AthleteId, FederationId } from './ids.js';
import { ConsentScope } from './enums.js';

/**
 * 152-ФЗ consent record. First-class entity — every consent the platform
 * collects is one row, immutable after granting (revocation creates a new
 * row with `revokedAt`). Audit-logged on grant + on revocation.
 *
 * See ADR-0004 §"Personal data".
 */
export const Consent = z.object({
  id: ConsentId,
  scope: ConsentScope,
  /** Either userId or athleteId is required (one of the two). */
  userId: UserId.nullable(),
  athleteId: AthleteId.nullable(),
  federationId: FederationId.nullable(),
  /** Exact consent text shown to the data subject at the moment of grant. */
  textShown: z.string().min(1),
  /** Locale of the text shown — for re-displaying in subject-rights export. */
  locale: z.string().min(2).max(8),
  textVersion: z.string().min(1),
  grantedAt: z.string().datetime(),
  /** IP + user agent for evidence; truncated. */
  grantedFromIp: z.string().nullable(),
  grantedFromUserAgent: z.string().max(512).nullable(),
  revokedAt: z.string().datetime().nullable(),
  revokeReason: z.string().optional(),
});
export type Consent = z.infer<typeof Consent>;
