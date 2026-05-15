import { z } from 'zod';
import { Gender } from './enums.js';

export const AthleteCreate = z
  .object({
    lastName: z.string().min(1).max(120),
    firstName: z.string().min(1).max(120),
    middleName: z.string().min(1).max(120).optional(),
    dateOfBirth: z.string().date(),
    gender: Gender,
    countryCode: z.string().length(2),
    regionCode: z.string().max(16).optional(),
    city: z.string().max(120).optional(),
    coachName: z.string().max(200).optional(),
    clubName: z.string().max(200).optional(),
    federationCardNumber: z.string().max(64).optional(),
  })
  .strict();
export type AthleteCreate = z.infer<typeof AthleteCreate>;

export const AthleteUpdate = z
  .object({
    lastName: z.string().min(1).max(120).optional(),
    firstName: z.string().min(1).max(120).optional(),
    middleName: z.string().min(1).max(120).optional(),
    dateOfBirth: z.string().date().optional(),
    gender: Gender.optional(),
    countryCode: z.string().length(2).optional(),
    regionCode: z.string().max(16).optional(),
    city: z.string().max(120).optional(),
    coachName: z.string().max(200).optional(),
    clubName: z.string().max(200).optional(),
    federationCardNumber: z.string().max(64).optional(),
  })
  .strict();
export type AthleteUpdate = z.infer<typeof AthleteUpdate>;

export const AthleteListQuery = z
  .object({
    search: z.string().max(120).optional(),
    gender: Gender.optional(),
    countryCode: z.string().length(2).optional(),
    cardNumberContains: z.string().min(1).max(64).optional(),
    bornFrom: z.string().date().optional(),
    bornTo: z.string().date().optional(),
    limit: z.coerce.number().int().positive().max(200).default(50),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();
export type AthleteListQuery = z.infer<typeof AthleteListQuery>;
