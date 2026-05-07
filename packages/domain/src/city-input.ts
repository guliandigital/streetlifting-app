import { z } from 'zod';

export const CityCreate = z
  .object({
    regionId: z.string().uuid(),
    nameRu: z.string().min(1).max(200),
    nameEn: z.string().min(1).max(200),
    isActive: z.boolean().optional(),
  })
  .strict();
export type CityCreate = z.infer<typeof CityCreate>;

export const CityUpdate = z
  .object({
    regionId: z.string().uuid().optional(),
    nameRu: z.string().min(1).max(200).optional(),
    nameEn: z.string().min(1).max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type CityUpdate = z.infer<typeof CityUpdate>;

export const CityListQuery = z
  .object({
    regionId: z.string().uuid().optional(),
    countryId: z.string().uuid().optional(),
    q: z.string().min(1).max(120).optional(),
    activeOnly: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'string' ? v === 'true' || v === '1' : v))
      .optional(),
    limit: z.coerce.number().int().positive().max(200).default(50),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();
export type CityListQuery = z.infer<typeof CityListQuery>;
