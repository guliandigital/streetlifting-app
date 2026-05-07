import { z } from 'zod';
import { CountryId, RegionId } from './ids.js';

export const Region = z.object({
  id: RegionId,
  countryId: CountryId,
  codeIso: z.string().min(1),
  nameRu: z.string().min(1),
  nameEn: z.string().min(1),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Region = z.infer<typeof Region>;
