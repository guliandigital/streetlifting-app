import { z } from 'zod';

export const FederationChapterCreate = z
  .object({
    code: z
      .string()
      .min(1)
      .max(32)
      .regex(/^[a-zA-Z0-9_-]+$/, 'code must be alphanumeric, underscore, or dash'),
    nameRu: z.string().min(1).max(200),
    nameEn: z.string().min(1).max(200),
    countryCode: z.string().length(2).optional(),
    regionCode: z.string().max(16).optional(),
    city: z.string().max(120).optional(),
    contactPhone: z.string().max(64).optional(),
    contactEmail: z.string().email().max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type FederationChapterCreate = z.infer<typeof FederationChapterCreate>;

export const FederationChapterUpdate = z
  .object({
    nameRu: z.string().min(1).max(200).optional(),
    nameEn: z.string().min(1).max(200).optional(),
    countryCode: z.string().length(2).optional(),
    regionCode: z.string().max(16).optional(),
    city: z.string().max(120).optional(),
    contactPhone: z.string().max(64).optional(),
    contactEmail: z.string().email().max(200).optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type FederationChapterUpdate = z.infer<typeof FederationChapterUpdate>;
