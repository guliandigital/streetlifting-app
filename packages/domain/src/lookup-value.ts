import { z } from 'zod';
import { LookupValueId } from './ids.js';
import { LookupKind } from './enums.js';

export const LookupValue = z.object({
  id: LookupValueId,
  kind: LookupKind,
  code: z.string().min(1),
  nameRu: z.string().min(1),
  nameEn: z.string().min(1),
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  metadata: z.record(z.unknown()).nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type LookupValue = z.infer<typeof LookupValue>;
