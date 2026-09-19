import { z } from 'zod';
import { CompleteAthleteCreate } from './athlete-input.js';

const Uuid = z.string().uuid();
const OptionalContact = z.string().trim().min(3).max(120).optional();

export const PublicCompetitionRegistrationCreate = z
  .object({
    athlete: CompleteAthleteCreate,
    disciplineId: Uuid,
    divisionId: Uuid,
    declaredWeightClassId: Uuid.optional(),
    weightClassId: Uuid,
    contactPhone: OptionalContact,
    contactEmail: z.string().trim().email().max(160).optional(),
    consentDataProcessing: z.literal(true),
    consentSnapshotHash: z.string().regex(/^[a-f0-9]{64}$/),
    consentPublicResults: z.boolean().default(false),
    consentPhotoPublication: z.boolean().default(false),
    notes: z.string().trim().max(1000).optional(),
  })
  .strict();

export type PublicCompetitionRegistrationCreate = z.infer<
  typeof PublicCompetitionRegistrationCreate
>;
