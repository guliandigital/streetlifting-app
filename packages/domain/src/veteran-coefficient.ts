import { z } from 'zod';
import { VeteranCoefficientId, FederationId } from './ids.js';
import { VeteranTier } from './enums.js';

/**
 * Veteran (Masters) multiplier used in scoring. Per ISF v5.1 §10.9.4 the
 * default values are:
 *
 *   M1 (40–44) = 1.025
 *   M2 (45–49) = 1.050
 *   M3 (50–54) = 1.075
 *   M4 (55–59) = 1.100
 *   M5 (60–69) = 1.125
 *   M6 (70+)   = 1.150
 *
 * The M5/M6 split at 70+ → 1.150 is the single most important correctness
 * differentiator vs PowerTable / PowerGage, which encode the pre-v5.1
 * single 60+ band → 1.125. Verified by legacy test suite.
 *
 * Federations can override per-tier values for their own ranking systems
 * (audit-logged).
 */
export const VeteranCoefficient = z.object({
  id: VeteranCoefficientId,
  federationId: FederationId.nullable(),
  tier: VeteranTier,
  multiplier: z.number().positive(),
  rulebook: z.string().default('ISF v5.1'),
  effectiveFrom: z.string().date(),
  effectiveTo: z.string().date().nullable(),
});
export type VeteranCoefficient = z.infer<typeof VeteranCoefficient>;
