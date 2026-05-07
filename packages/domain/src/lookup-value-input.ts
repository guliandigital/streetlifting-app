import { z } from 'zod';
import { LookupKind } from './enums.js';

export const LookupValueCreate = z
  .object({
    kind: LookupKind,
    code: z
      .string()
      .min(1)
      .max(64)
      .regex(/^[a-z][a-z0-9_]*$/, 'code must be lowercase snake_case'),
    nameRu: z.string().min(1).max(200),
    nameEn: z.string().min(1).max(200),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
export type LookupValueCreate = z.infer<typeof LookupValueCreate>;

export const LookupValueUpdate = z
  .object({
    nameRu: z.string().min(1).max(200).optional(),
    nameEn: z.string().min(1).max(200).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .strict();
export type LookupValueUpdate = z.infer<typeof LookupValueUpdate>;

export const LookupValueListQuery = z
  .object({
    kind: LookupKind.optional(),
    activeOnly: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'string' ? v === 'true' || v === '1' : v))
      .optional(),
  })
  .strict();
export type LookupValueListQuery = z.infer<typeof LookupValueListQuery>;
