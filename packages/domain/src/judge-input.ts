import { z } from 'zod';

export const JudgeCreate = z
  .object({
    userId: z.string().uuid().nullable().optional(),
    lastName: z.string().min(1).max(120),
    firstName: z.string().min(1).max(120),
    middleName: z.string().min(1).max(120).optional(),
    categoryRu: z.string().max(120).optional(),
    categoryEn: z.string().max(120).optional(),
    cardNumber: z.string().max(64).optional(),
    cityRegion: z.string().max(120).optional(),
  })
  .strict();
export type JudgeCreate = z.infer<typeof JudgeCreate>;

export const JudgeUpdate = z
  .object({
    userId: z.string().uuid().nullable().optional(),
    lastName: z.string().min(1).max(120).optional(),
    firstName: z.string().min(1).max(120).optional(),
    middleName: z.string().min(1).max(120).optional(),
    categoryRu: z.string().max(120).optional(),
    categoryEn: z.string().max(120).optional(),
    cardNumber: z.string().max(64).optional(),
    cityRegion: z.string().max(120).optional(),
  })
  .strict();
export type JudgeUpdate = z.infer<typeof JudgeUpdate>;

export const JudgeListQuery = z
  .object({
    search: z.string().max(120).optional(),
    limit: z.coerce.number().int().positive().max(200).default(50),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();
export type JudgeListQuery = z.infer<typeof JudgeListQuery>;
