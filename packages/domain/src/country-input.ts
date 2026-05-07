import { z } from 'zod';

export const CountryCreate = z
  .object({
    codeIso2: z
      .string()
      .length(2)
      .regex(/^[A-Z]{2}$/, 'codeIso2 must be 2 uppercase ASCII letters'),
    nameRu: z.string().min(1).max(200),
    nameEn: z.string().min(1).max(200),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type CountryCreate = z.infer<typeof CountryCreate>;

export const CountryUpdate = z
  .object({
    nameRu: z.string().min(1).max(200).optional(),
    nameEn: z.string().min(1).max(200).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type CountryUpdate = z.infer<typeof CountryUpdate>;

export const CountryListQuery = z
  .object({
    activeOnly: z
      .union([z.boolean(), z.string()])
      .transform((v) => (typeof v === 'string' ? v === 'true' || v === '1' : v))
      .optional(),
  })
  .strict();
export type CountryListQuery = z.infer<typeof CountryListQuery>;
