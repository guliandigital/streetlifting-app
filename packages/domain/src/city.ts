import { z } from 'zod';
import { CityId, RegionId } from './ids.js';

export const City = z.object({
  id: CityId,
  regionId: RegionId,
  nameRu: z.string().min(1),
  nameEn: z.string().min(1),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type City = z.infer<typeof City>;
