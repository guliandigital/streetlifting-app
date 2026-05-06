import { z } from 'zod';
import { FlightId, GroupId, PlatformId, CompetitionId } from './ids.js';

export const Platform = z.object({
  id: PlatformId,
  competitionId: CompetitionId,
  name: z.string().min(1),
  order: z.number().int(),
});
export type Platform = z.infer<typeof Platform>;

export const Flight = z.object({
  id: FlightId,
  competitionId: CompetitionId,
  platformId: PlatformId,
  code: z.string().min(1),
  name: z.string().min(1),
  order: z.number().int(),
  startTime: z.string().datetime().nullable(),
});
export type Flight = z.infer<typeof Flight>;

export const Group = z.object({
  id: GroupId,
  flightId: FlightId,
  name: z.string().min(1),
  order: z.number().int(),
});
export type Group = z.infer<typeof Group>;
