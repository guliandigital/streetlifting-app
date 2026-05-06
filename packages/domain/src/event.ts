import { z } from 'zod';
import { EventId, UserId } from './ids.js';

export const SyncEvent = z.object({
  id: EventId,
  actorId: UserId,
  aggregateType: z.string().min(1),
  aggregateId: z.string().min(1),
  type: z.string().min(1),
  payload: z.record(z.unknown()),
  occurredAt: z.string().datetime(),
  lamportClock: z.number().int().nonnegative(),
  appliedAt: z.string().datetime().nullable(),
  originDeviceId: z.string().min(1),
});
export type SyncEvent = z.infer<typeof SyncEvent>;
