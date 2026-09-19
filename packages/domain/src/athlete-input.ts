import { z } from 'zod';
import { Gender } from './enums.js';

const consistentBirth = (value: {
  dateOfBirth?: string | null | undefined;
  birthYear?: number | null | undefined;
}) =>
  !value.dateOfBirth ||
  value.birthYear == null ||
  Number(value.dateOfBirth.slice(0, 4)) === value.birthYear;
const BirthDate = z
  .string()
  .date()
  .refine((value) => {
    const year = Number(value.slice(0, 4));
    return year >= 1900 && year <= 2100;
  }, 'Birth date must be between 1900 and 2100');
const birthIssue = { message: 'Birth year must match date of birth', path: ['birthYear'] };

export const CompleteAthleteCreate = z
  .object({
    lastName: z.string().min(1).max(120),
    firstName: z.string().min(1).max(120),
    middleName: z.string().min(1).max(120).optional(),
    dateOfBirth: BirthDate,
    gender: Gender,
    countryCode: z.string().length(2),
    regionCode: z.string().max(16).optional(),
    city: z.string().max(120).optional(),
    coachName: z.string().max(200).optional(),
    clubName: z.string().max(200).optional(),
    federationCardNumber: z.string().max(64).optional(),
  })
  .strict();
export const AthleteCreate = CompleteAthleteCreate.extend({
  dateOfBirth: BirthDate.nullable().optional(),
  birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
  countryCode: z.string().length(2).nullable().optional(),
}).refine(consistentBirth, birthIssue);
export type AthleteCreate = z.infer<typeof AthleteCreate>;

export const AthleteUpdate = z
  .object({
    lastName: z.string().min(1).max(120).optional(),
    firstName: z.string().min(1).max(120).optional(),
    middleName: z.string().min(1).max(120).optional(),
    dateOfBirth: BirthDate.nullable().optional(),
    birthYear: z.number().int().min(1900).max(2100).nullable().optional(),
    gender: Gender.optional(),
    countryCode: z.string().length(2).nullable().optional(),
    regionCode: z.string().max(16).optional(),
    city: z.string().max(120).optional(),
    coachName: z.string().max(200).optional(),
    clubName: z.string().max(200).optional(),
    federationCardNumber: z.string().max(64).optional(),
  })
  .strict()
  .refine(consistentBirth, birthIssue);
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
