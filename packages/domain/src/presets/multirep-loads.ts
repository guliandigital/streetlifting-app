/**
 * ISF v5.1 §2.2 Multirep preset loads.
 *
 * Verbatim from ISF v5.1 §2.2:
 * > All specified loads are mandatory at official ISF events. Any changes
 * > require ISF approval and must be detailed in the Competition Regulations.
 *
 * Men:
 *   PU: youth 8 / junior+masters 16 / amateur(open) 24 / pro 32
 *   DI: youth 16 / junior+masters 24 / amateur(open) 32 / pro 48
 *
 * Women:
 *   PU: youth+junior+masters 8 / amateur(open) 12
 *   DI: youth+junior+masters 12 / amateur(open) 16
 */

import type { AgeCategoryCode } from './age-categories.js';

export type MultirepDivision = 'amateur' | 'pro';
export type MultirepExercise = 'PU' | 'DI';

export interface MultirepPreset {
  sex: 'M' | 'F';
  exercise: MultirepExercise;
  division: MultirepDivision;
  ageCategoryCodes: ReadonlyArray<AgeCategoryCode>;
  loadKg: number;
}

export const ISF_V51_MULTIREP_PRESETS: ReadonlyArray<MultirepPreset> = [
  // Men, Pull-Ups
  { sex: 'M', exercise: 'PU', division: 'amateur', ageCategoryCodes: ['youth'], loadKg: 8 },
  { sex: 'M', exercise: 'PU', division: 'amateur', ageCategoryCodes: ['junior', 'masters_m1', 'masters_m2', 'masters_m3', 'masters_m4', 'masters_m5', 'masters_m6'], loadKg: 16 },
  { sex: 'M', exercise: 'PU', division: 'amateur', ageCategoryCodes: ['open'], loadKg: 24 },
  { sex: 'M', exercise: 'PU', division: 'pro', ageCategoryCodes: ['open'], loadKg: 32 },

  // Men, Dips
  { sex: 'M', exercise: 'DI', division: 'amateur', ageCategoryCodes: ['youth'], loadKg: 16 },
  { sex: 'M', exercise: 'DI', division: 'amateur', ageCategoryCodes: ['junior', 'masters_m1', 'masters_m2', 'masters_m3', 'masters_m4', 'masters_m5', 'masters_m6'], loadKg: 24 },
  { sex: 'M', exercise: 'DI', division: 'amateur', ageCategoryCodes: ['open'], loadKg: 32 },
  { sex: 'M', exercise: 'DI', division: 'pro', ageCategoryCodes: ['open'], loadKg: 48 },

  // Women, Pull-Ups
  { sex: 'F', exercise: 'PU', division: 'amateur', ageCategoryCodes: ['youth', 'junior', 'masters_m1', 'masters_m2', 'masters_m3', 'masters_m4', 'masters_m5', 'masters_m6'], loadKg: 8 },
  { sex: 'F', exercise: 'PU', division: 'amateur', ageCategoryCodes: ['open'], loadKg: 12 },

  // Women, Dips
  { sex: 'F', exercise: 'DI', division: 'amateur', ageCategoryCodes: ['youth', 'junior', 'masters_m1', 'masters_m2', 'masters_m3', 'masters_m4', 'masters_m5', 'masters_m6'], loadKg: 12 },
  { sex: 'F', exercise: 'DI', division: 'amateur', ageCategoryCodes: ['open'], loadKg: 16 },
];
