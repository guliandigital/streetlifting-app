/**
 * ISF v5.1 §10.9.5 additional-points body-weight thresholds.
 *
 * Verbatim:
 * > Body weight limits:
 * > Men: Pull-Up — 90 kg, Dip — 100 kg, Total (2 lifts) — 95 kg
 * > Women: Pull-Up — 55 kg, Dip — 65 kg, Total (2 lifts) — 60 kg
 * > Bonus formula: Additional Points = (Bodyweight − Limit) × 0.5
 * > If Bodyweight ≤ Limit, then Additional Points = 0.
 *
 * Applies to Classic only (NOT Multirep, NOT WC).
 */

import type { Event } from '../enums.js';

export interface BodyweightLimits {
  PU: number;
  DI: number;
  PUDI: number;
}

export const ISF_V51_BW_LIMITS: Readonly<Record<'M' | 'F', BodyweightLimits>> = {
  M: { PU: 90, DI: 100, PUDI: 95 },
  F: { PU: 55, DI: 65, PUDI: 60 },
};

/** Compute additional-points bonus for Classic per ISF v5.1 §10.9.5. */
export function additionalPoints(sex: 'M' | 'F', event: Event, bodyweightKg: number): number {
  const limit = ISF_V51_BW_LIMITS[sex][event];
  return Math.max(0, (bodyweightKg - limit) * 0.5);
}
