/**
 * ISF absolute-coefficient formula, ported from V1 logic/isf/points.ts where
 * it was tested across 11 cases against the published streetlifting.ru/points
 * reference.
 *
 *   ISF Coefficient = 100 / (A − B × e^(−C × bodyweightKg))
 *
 * where A, B, C are per-(sex × event) constants below.
 *
 * Source: https://streetlifting.ru/points/ (D1 in legacy).
 */

import type { Event } from '../enums.js';

interface Params {
  A: number;
  B: number;
  C: number;
}

const ISF_COEF_PARAMS: Readonly<Record<string, Params>> = {
  'M:PU': { A: 320.98, B: 281.4, C: 0.01008 },
  'M:DI': { A: 381.22, B: 733.79, C: 0.02398 },
  'M:PUDI': { A: 799.82, B: 681.45, C: 0.00614 },
  'F:PU': { A: 142.4, B: 442.53, C: 0.04724 },
  'F:DI': { A: 221.82, B: 357.0, C: 0.02937 },
  'F:PUDI': { A: 406.89, B: 697.06, C: 0.02032 },
};

/**
 * Returns the ISF absolute coefficient for the given bodyweight, event, and
 * sex. Returns 1.0 fallback if the (sex × event) combination has no curve
 * (e.g. unsupported event reserved for V2). Returns 0 if the curve denominator
 * collapses to zero or negative (shouldn't happen for sane bodyweights).
 */
export function isfAbsoluteCoefficient(
  bodyweightKg: number,
  event: Event,
  sex: 'M' | 'F',
): number {
  const params = ISF_COEF_PARAMS[`${sex}:${event}`];
  if (!params) return 1.0;
  const denom = params.A - params.B * Math.exp(-params.C * bodyweightKg);
  if (denom <= 0) return 0;
  return 100 / denom;
}
