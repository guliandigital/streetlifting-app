/**
 * ISF v5.1 default plate set with §6.6 colours.
 *
 * Standard set: 25 / 20 / 15 / 10 / 5 kg (canonical colours), plus 2.5 kg
 * (smallest standard) and 1.25 kg (smallest required for §7 increment).
 *
 * Record-only plates (50, 2, 1.5, 1, 0.75, 0.5, 0.25 kg) count for record
 * attempts but NOT for the increment validation.
 */

import type { Plate } from '../plate.js';

export const ISF_V51_DEFAULT_PLATES: ReadonlyArray<Plate> = [
  // Record-only top-end:
  { weightKg: 50, pairCount: 0, color: 'green', recordOnly: true },

  // Standard ISF v5.1 §6.6:
  { weightKg: 25, pairCount: 4, color: 'red', recordOnly: false },
  { weightKg: 20, pairCount: 2, color: 'blue', recordOnly: false },
  { weightKg: 15, pairCount: 2, color: 'yellow', recordOnly: false },
  { weightKg: 10, pairCount: 2, color: 'green', recordOnly: false },
  { weightKg: 5, pairCount: 2, color: 'white', recordOnly: false },
  { weightKg: 2.5, pairCount: 2, color: 'black', recordOnly: false },

  // Smallest plate required for the 1.25 kg increment rule:
  { weightKg: 1.25, pairCount: 2, color: 'gray', recordOnly: false },

  // Record-only fractional plates:
  { weightKg: 2, pairCount: 1, color: 'gray', recordOnly: true },
  { weightKg: 1.5, pairCount: 1, color: 'gray', recordOnly: true },
  { weightKg: 1, pairCount: 1, color: 'gray', recordOnly: true },
  { weightKg: 0.75, pairCount: 1, color: 'gray', recordOnly: true },
  { weightKg: 0.5, pairCount: 1, color: 'gray', recordOnly: true },
  { weightKg: 0.25, pairCount: 1, color: 'gray', recordOnly: true },
];

/** ISF v5.1 §7: total weight must be a multiple of this kg unless record. */
export const ISF_V51_PLATE_INCREMENT_KG = 1.25;
