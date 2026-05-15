/**
 * ISFpoints — Absolute Standard for Classic Streetlifting (vNext_K_RC1.1_full_refit).
 *
 * Official public release `2026-05-15`, signed off by the ISF International
 * Streetlifting Federation. Replaces the prior exponential-decay coefficient.
 *
 * Formula:
 *
 *   Points_raw = 100 × (Result / (S(BW) × AgeFactor)) ^ 1.5
 *
 * Where:
 *   k         = 1.5 (global, fixed)
 *   AgeFactor = 1.0 for ranking_mode='open_absolute' (the only official mode)
 *   S(BW)     = piecewise_logallom_cont per segment (6 segments: M/F × Pull/Dip/Total)
 *
 * S(BW):
 *   ln_S = a + b·ln(BW)         if BW <= bw_opt
 *   ln_S = c + d·ln(BW)         otherwise
 *   S    = exp(ln_S)
 *
 * Continuity at bw_opt: c = a + (b − d)·ln(bw_opt). The published parameters
 * already satisfy this — we keep all four (a, b, c, d) as provided rather than
 * recompute c, to stay byte-identical to the federation pack.
 *
 * Source: C:\PROJECTS\streetlifting\federation_takeout\.../ISFpoints_vNext_candidate_K.json
 * Curve version: vNext_K_RC1.1_full_refit
 * Release status: official_public_release (release_contract v2.1)
 */

export type ISFSex = 'M' | 'F';
export type ISFClassicDiscipline = 'Pull' | 'Dip' | 'Total';
export type ISFAgeGroup = 'Sub-Juniors' | 'Juniors' | 'Open' | 'Masters';
export type ISFRankingMode = 'open_absolute' | 'age_corrected';

interface SegmentParams {
  readonly param_a: number;
  readonly param_b: number;
  readonly param_c: number;
  readonly param_d: number;
  readonly bw_opt: number;
  readonly bw_domain_kg: readonly [number, number];
}

type SegmentKey = `${ISFSex}:${ISFClassicDiscipline}`;

/**
 * Candidate K parameters (composite). Frozen on release `2026-05-15`.
 * Refit provenance is recorded per-segment in the source JSON's
 * `meta.composite_provenance`; reproducing the fit is out of scope here.
 */
export const ISFPOINTS_K_PARAMS: Readonly<Record<SegmentKey, SegmentParams>> = Object.freeze({
  'M:Pull': {
    param_a: -4.323536630854744,
    param_b: 2.033050895010818,
    param_c: 0.9090053744768216,
    param_d: 0.7523890837917322,
    bw_opt: 59.4901595957986,
    bw_domain_kg: [36.94, 101.0],
  },
  'M:Dip': {
    param_a: 1.0240622219809563,
    param_b: 0.8042071243505172,
    param_c: -0.49541479809452293,
    param_d: 1.164945728428382,
    bw_opt: 67.49999816980723,
    bw_domain_kg: [49.6, 112.5],
  },
  'M:Total': {
    param_a: -0.20638181724251187,
    param_b: 1.2485663689768396,
    param_c: 1.4857167492683867,
    param_d: 0.85,
    bw_opt: 69.7880284643068,
    bw_domain_kg: [52.55, 98.9],
  },
  'F:Pull': {
    param_a: -0.20328255424470507,
    param_b: 0.8822234401782423,
    param_c: 2.2568806471363776,
    param_d: 0.23965525437498533,
    bw_opt: 46.00000323203141,
    bw_domain_kg: [41.4, 55.92],
  },
  'F:Dip': {
    param_a: 1.306104073125799,
    param_b: 0.5587859300763097,
    param_c: 2.7503436233704557,
    param_d: 0.2,
    bw_opt: 56.0,
    bw_domain_kg: [43.4, 55.92],
  },
  'F:Total': {
    param_a: -0.6837801881061837,
    param_b: 1.2132371876994696,
    param_c: 3.3948558385156042,
    param_d: 0.2,
    bw_opt: 56.0,
    bw_domain_kg: [43.4, 55.92],
  },
});

/**
 * Age multipliers from the candidate K JSON `age_correction` block.
 * Only applied when `ranking_mode='age_corrected'`. The official public
 * release uses `open_absolute` (AgeFactor=1.0 always) per ADR-0001.
 */
export const ISFPOINTS_AGE_FACTORS: Readonly<Record<ISFAgeGroup, number>> = Object.freeze({
  'Sub-Juniors': 0.6901765269550446,
  'Juniors': 0.9014966817010024,
  'Open': 1.0,
  'Masters': 0.8295066799802596,
});

export const ISFPOINTS_K = 1.5;
export const ISFPOINTS_CURVE_VERSION = 'vNext_K_RC1.1_full_refit';
export const ISFPOINTS_RELEASE_STATUS = 'official_public_release';
export const ISFPOINTS_RELEASE_DATE = '2026-05-15';

export interface ISFPointsInput {
  /** Best successful result in kg (best single attempt for PU/DI, sum for PUDI total). */
  result: number;
  /** Weighed-in bodyweight in kg. */
  bodyWeightKg: number;
  sex: ISFSex;
  discipline: ISFClassicDiscipline;
  /** Defaults to 'Open'. Only consulted when rankingMode='age_corrected'. */
  ageGroup?: ISFAgeGroup;
  /** Defaults to 'open_absolute' (the only official public release mode). */
  rankingMode?: ISFRankingMode;
}

export interface ISFPointsResult {
  pointsRaw: number;
  pointsPub: number;
  /** S(BW) used in denominator (before multiplying by AgeFactor). */
  sValue: number;
  ageFactor: number;
  /** True if bodyweight is outside the segment's training domain — value is an extrapolation. */
  outOfDomain: boolean;
  rankingMode: ISFRankingMode;
  curveVersion: string;
}

/**
 * S(BW) for a (sex × Classic discipline) segment. Throws if the segment is
 * unknown (caller should map non-Classic events to null upstream).
 */
export function isfPointsS(bw: number, sex: ISFSex, discipline: ISFClassicDiscipline): number {
  const params = ISFPOINTS_K_PARAMS[`${sex}:${discipline}`];
  const lnBw = Math.log(bw);
  const lnS =
    bw <= params.bw_opt
      ? params.param_a + params.param_b * lnBw
      : params.param_c + params.param_d * lnBw;
  return Math.exp(lnS);
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Compute ISFpoints (raw + publication-rounded) for a Classic streetlifting
 * performance. Returns null when result or bodyweight is non-positive.
 *
 * Defaults match the official public release: `open_absolute` ranking mode,
 * AgeFactor=1.0 regardless of `ageGroup`. To opt into age-corrected scoring
 * (internal use only — not part of the public release), pass
 * `rankingMode='age_corrected'`.
 */
export function isfPoints(input: ISFPointsInput): ISFPointsResult | null {
  if (!Number.isFinite(input.result) || input.result <= 0) return null;
  if (!Number.isFinite(input.bodyWeightKg) || input.bodyWeightKg <= 0) return null;

  const params = ISFPOINTS_K_PARAMS[`${input.sex}:${input.discipline}`];
  const rankingMode: ISFRankingMode = input.rankingMode ?? 'open_absolute';
  const ageGroup: ISFAgeGroup = input.ageGroup ?? 'Open';
  const ageFactor =
    rankingMode === 'open_absolute' ? 1.0 : (ISFPOINTS_AGE_FACTORS[ageGroup] ?? 1.0);

  const sValue = isfPointsS(input.bodyWeightKg, input.sex, input.discipline);
  const pointsRaw = 100 * (input.result / (sValue * ageFactor)) ** ISFPOINTS_K;
  const pointsPub = roundTo(pointsRaw, 2);

  const [domainMin, domainMax] = params.bw_domain_kg;
  const outOfDomain = input.bodyWeightKg < domainMin || input.bodyWeightKg > domainMax;

  return {
    pointsRaw,
    pointsPub,
    sValue,
    ageFactor,
    outOfDomain,
    rankingMode,
    curveVersion: ISFPOINTS_CURVE_VERSION,
  };
}

/**
 * Map a discipline `event` code (the catalog uses `PU`/`DI`/`PUDI`/...) to
 * the Classic K segment name (`Pull`/`Dip`/`Total`). Returns null for
 * non-Classic events (MU_BAR, MU_RING, SQ, PUDIMUSQ, multi-rep variants)
 * which have no K curve.
 */
export function mapEventToISFClassicDiscipline(event: string): ISFClassicDiscipline | null {
  switch (event) {
    case 'PU':
      return 'Pull';
    case 'DI':
      return 'Dip';
    case 'PUDI':
      return 'Total';
    default:
      return null;
  }
}
