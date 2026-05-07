import { z } from 'zod';

export const RegionCreate = z
  .object({
    countryId: z.string().uuid(),
    codeIso: z.string().min(2).max(16),
    nameRu: z.string().min(1).max(200),
    nameEn: z.string().min(1).max(200),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type RegionCreate = z.infer<typeof RegionCreate>;

export const RegionUpdate = z
  .object({
    nameRu: z.string().min(1).max(200).optional(),
    nameEn: z.string().min(1).max(200).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type RegionUpdate = z.infer<typeof RegionUpdate>;

export const RegionListQuery = z
  .object({
    countryId: z.string().uuid().optional(),
    activeOnly: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'string' ? v === 'true' || v === '1' : v))
      .optional(),
  })
  .strict();
export type RegionListQuery = z.infer<typeof RegionListQuery>;
