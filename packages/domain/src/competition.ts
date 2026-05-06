import { z } from 'zod';
import { CompetitionId, FederationId, DisciplineId } from './ids.js';
import { CompetitionStatus } from './enums.js';

/**
 * IANA time zone identifier of the venue, e.g. "Europe/Moscow",
 * "Europe/Kaliningrad", "Asia/Yekaterinburg". REQUIRED — every competition
 * has one timezone, used for all wall-clock displays during operation
 * (schedule, attempt clocks, announcements). See ADR-0006 §"Timezones".
 *
 * All timestamps elsewhere in the system are UTC ISO 8601; this is the
 * single field that controls how they render to operators on the platform.
 */
const Timezone = z.string().min(3).max(64).regex(/^[A-Za-z_]+(?:\/[A-Za-z_+\-0-9]+)+$/);

export const Competition = z.object({
  id: CompetitionId,
  federationId: FederationId,
  code: z.string().min(1),
  nameRu: z.string().min(1),
  nameEn: z.string().min(1),
  description: z.string().optional(),
  rulebook: z.string().default('ISF v5.1'),
  startDate: z.string().date(),
  endDate: z.string().date(),
  registrationDeadline: z.string().datetime().optional(),
  city: z.string().optional(),
  venue: z.string().optional(),
  /** IANA TZ of the venue. */
  timezone: Timezone,
  status: CompetitionStatus,
  /** Entry fee in kopecks (see ADR-0006). */
  entryFeeKopecks: z.number().int().nonnegative().default(0),
  disciplineIds: z.array(DisciplineId).default([]),
  isOnlineRegistrationOpen: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Competition = z.infer<typeof Competition>;
