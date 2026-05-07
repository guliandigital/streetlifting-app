import { z } from 'zod';
import { CountryId } from './ids.js';

export const Country = z.object({
  id: CountryId,
  codeIso2: z.string().length(2),
  nameRu: z.string().min(1),
  nameEn: z.string().min(1),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Country = z.infer<typeof Country>;
