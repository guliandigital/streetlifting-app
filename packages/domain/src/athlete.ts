import { z } from 'zod';
import { AthleteId } from './ids.js';
import { Gender } from './enums.js';

export const Athlete = z.object({
  id: AthleteId,
  userId: z.string().uuid().optional().nullable(),
  lastName: z.string().min(1),
  firstName: z.string().min(1),
  middleName: z.string().optional(),
  isfPersonId: z.string().optional().nullable(),
  publicProfileSlug: z.string().optional().nullable(),
  privacyMode: z.string().default('public_results'),
  dateOfBirth: z.string().date(),
  gender: Gender,
  countryCode: z.string().length(2),
  regionCode: z.string().optional(),
  city: z.string().optional(),
  coachName: z.string().optional(),
  clubName: z.string().optional(),
  federationCardNumber: z.string().optional(),
  photoUrl: z.string().url().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Athlete = z.infer<typeof Athlete>;
