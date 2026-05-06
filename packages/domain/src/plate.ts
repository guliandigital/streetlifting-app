import { z } from 'zod';
import { PlateSetId, FederationId, CompetitionId } from './ids.js';
import { PlateColor } from './enums.js';

/**
 * Single plate in a set — its mass, how many pairs are physically available,
 * and ISF §6.6 colour. `recordOnly` plates count for record attempts but NOT
 * for the §7 1.25 kg increment validation.
 */
export const Plate = z.object({
  weightKg: z.number().positive(),
  pairCount: z.number().int().nonnegative(),
  color: PlateColor,
  recordOnly: z.boolean().default(false),
});
export type Plate = z.infer<typeof Plate>;

/**
 * A named plate set. Defaults ship as ISF v5.1 in `presets/plates.ts`; a
 * federation may register its own (e.g., gym-specific inventory) that overrides
 * the default for a competition.
 */
export const PlateSet = z.object({
  id: PlateSetId,
  federationId: FederationId.nullable(),
  competitionId: CompetitionId.nullable(),
  name: z.string().min(1),
  /** Total weight must be a multiple of this kg (ISF v5.1 §7) unless record. */
  incrementKg: z.number().positive().default(1.25),
  barWeightKg: z.number().nonnegative().default(20),
  collarWeightKg: z.number().nonnegative().default(2.5),
  plates: z.array(Plate).default([]),
});
export type PlateSet = z.infer<typeof PlateSet>;
