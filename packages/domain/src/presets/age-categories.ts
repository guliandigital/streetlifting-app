/**
 * ISF v5.1 age categories.
 *
 * CRITICAL CORRECTNESS: M5 covers 60–69 inclusive, M6 covers 70+ — per ISF
 * v5.1 §10.9.4. Both PowerGage and PowerTable encode the pre-v5.1 single 60+
 * band → 1.125 multiplier. This codebase scores 70+ correctly with M6 → 1.150.
 *
 * Test fixtures must include boundary tests at ages 60, 69, 70, 80 to prove
 * M5/M6 split (ported from legacy `age.test.ts` at M2).
 */

export type AgeCategoryCode =
  | 'youth'
  | 'junior'
  | 'open'
  | 'masters_m1'
  | 'masters_m2'
  | 'masters_m3'
  | 'masters_m4'
  | 'masters_m5'
  | 'masters_m6';

export interface AgeCategoryPreset {
  code: AgeCategoryCode;
  labelEn: string;
  labelRu: string;
  minAge: number | null;
  maxAge: number | null;
  ratingEligible: boolean;
}

export const ISF_V51_AGE_CATEGORIES: ReadonlyArray<AgeCategoryPreset> = [
  { code: 'open', labelEn: 'Open', labelRu: 'Open', minAge: 13, maxAge: null, ratingEligible: true },
  { code: 'youth', labelEn: 'Sub-Juniors', labelRu: 'Юноши', minAge: 13, maxAge: 17, ratingEligible: true },
  { code: 'junior', labelEn: 'Juniors', labelRu: 'Юниоры', minAge: 18, maxAge: 22, ratingEligible: true },
  { code: 'masters_m1', labelEn: 'Masters M1', labelRu: 'Masters M1', minAge: 40, maxAge: 44, ratingEligible: true },
  { code: 'masters_m2', labelEn: 'Masters M2', labelRu: 'Masters M2', minAge: 45, maxAge: 49, ratingEligible: true },
  { code: 'masters_m3', labelEn: 'Masters M3', labelRu: 'Masters M3', minAge: 50, maxAge: 54, ratingEligible: true },
  { code: 'masters_m4', labelEn: 'Masters M4', labelRu: 'Masters M4', minAge: 55, maxAge: 59, ratingEligible: true },
  // CORRECT vs PowerTable (60–99) and PowerGage (60+ as single band):
  { code: 'masters_m5', labelEn: 'Masters M5', labelRu: 'Masters M5', minAge: 60, maxAge: 69, ratingEligible: true },
  // CORRECT vs PowerTable (99–99 placeholder) and PowerGage (M6 absent):
  { code: 'masters_m6', labelEn: 'Masters M6', labelRu: 'Masters M6', minAge: 70, maxAge: null, ratingEligible: true },
];

/**
 * Masters multipliers per ISF v5.1 §10.9.4. The M6 = 1.150 entry is the
 * single largest user-visible correctness differentiator vs both PowerGage
 * and PowerTable.
 */
export const ISF_V51_MASTERS_MULTIPLIERS: ReadonlyMap<AgeCategoryCode, number> = new Map([
  ['masters_m1', 1.025],
  ['masters_m2', 1.05],
  ['masters_m3', 1.075],
  ['masters_m4', 1.1],
  ['masters_m5', 1.125],
  ['masters_m6', 1.15],
]);
