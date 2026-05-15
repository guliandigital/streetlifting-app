import { describe, expect, it } from 'vitest';
import {
  isfPoints,
  isfPointsS,
  mapEventToISFClassicDiscipline,
  ISFPOINTS_CURVE_VERSION,
  ISFPOINTS_K_PARAMS,
} from './isfpoints.js';

/**
 * 20 golden cases from the federation's official_public_release pack,
 * `apps/android-isfpoints/app/src/main/assets/golden_test_set.csv` in
 * C:\PROJECTS\streetlifting. These are evaluated in `open_absolute` mode
 * (AgeFactor=1.0) regardless of `age_group`, matching the public release
 * policy (ADR-0001).
 */
interface GoldenCase {
  caseId: number;
  sex: 'M' | 'F';
  ageGroup: 'Sub-Juniors' | 'Juniors' | 'Open' | 'Masters';
  bwKg: number;
  discipline: 'Pull' | 'Dip' | 'Total';
  result: number;
  pointsRaw: number;
  pointsPub: number;
}

const GOLDEN_CASES: GoldenCase[] = [
  {
    caseId: 1,
    sex: 'M',
    ageGroup: 'Juniors',
    bwKg: 56.0,
    discipline: 'Pull',
    result: 62.5,
    pointsRaw: 151.0495125892405,
    pointsPub: 151.05,
  },
  {
    caseId: 2,
    sex: 'M',
    ageGroup: 'Sub-Juniors',
    bwKg: 60.15,
    discipline: 'Pull',
    result: 32.5,
    pointsRaw: 46.5205471561798,
    pointsPub: 46.52,
  },
  {
    caseId: 3,
    sex: 'M',
    ageGroup: 'Open',
    bwKg: 80.5,
    discipline: 'Pull',
    result: 72.5,
    pointsRaw: 111.5560062967859,
    pointsPub: 111.56,
  },
  {
    caseId: 4,
    sex: 'M',
    ageGroup: 'Open',
    bwKg: 101.0,
    discipline: 'Pull',
    result: 70.0,
    pointsRaw: 81.9292067011507,
    pointsPub: 81.93,
  },
  {
    caseId: 5,
    sex: 'M',
    ageGroup: 'Open',
    bwKg: 59.8,
    discipline: 'Dip',
    result: 85.0,
    pointsRaw: 121.2712643232327,
    pointsPub: 121.27,
  },
  {
    caseId: 6,
    sex: 'M',
    ageGroup: 'Open',
    bwKg: 82.5,
    discipline: 'Dip',
    result: 115.0,
    pointsRaw: 116.1270432577781,
    pointsPub: 116.13,
  },
  {
    caseId: 7,
    sex: 'M',
    ageGroup: 'Juniors',
    bwKg: 89.9,
    discipline: 'Dip',
    result: 115.0,
    pointsRaw: 99.9412136925121,
    pointsPub: 99.94,
  },
  {
    caseId: 8,
    sex: 'M',
    ageGroup: 'Open',
    bwKg: 108.4,
    discipline: 'Dip',
    result: 77.5,
    pointsRaw: 39.8692824110654,
    pointsPub: 39.87,
  },
  {
    caseId: 9,
    sex: 'M',
    ageGroup: 'Open',
    bwKg: 60.0,
    discipline: 'Total',
    result: 97.5,
    pointsRaw: 61.3398733379921,
    pointsPub: 61.34,
  },
  {
    caseId: 10,
    sex: 'M',
    ageGroup: 'Open',
    bwKg: 80.2,
    discipline: 'Total',
    result: 102.5,
    pointsRaw: 41.725889125116,
    pointsPub: 41.73,
  },
  {
    caseId: 11,
    sex: 'M',
    ageGroup: 'Open',
    bwKg: 98.9,
    discipline: 'Total',
    result: 115.0,
    pointsRaw: 37.9588992381049,
    pointsPub: 37.96,
  },
  {
    caseId: 12,
    sex: 'F',
    ageGroup: 'Open',
    bwKg: 44.0,
    discipline: 'Pull',
    result: 28.75,
    pointsRaw: 139.812113179407,
    pointsPub: 139.81,
  },
  {
    caseId: 13,
    sex: 'F',
    ageGroup: 'Open',
    bwKg: 52.0,
    discipline: 'Pull',
    result: 17.5,
    pointsRaw: 59.904166420211,
    pointsPub: 59.9,
  },
  {
    caseId: 14,
    sex: 'F',
    ageGroup: 'Sub-Juniors',
    bwKg: 64.7,
    discipline: 'Pull',
    result: 32.5,
    pointsRaw: 140.1553677820833,
    pointsPub: 140.16,
  },
  {
    caseId: 15,
    sex: 'F',
    ageGroup: 'Open',
    bwKg: 45.45,
    discipline: 'Dip',
    result: 35.0,
    pointsRaw: 119.1081437531033,
    pointsPub: 119.11,
  },
  {
    caseId: 16,
    sex: 'F',
    ageGroup: 'Open',
    bwKg: 51.52,
    discipline: 'Dip',
    result: 32.5,
    pointsRaw: 95.9472040687799,
    pointsPub: 95.95,
  },
  {
    caseId: 17,
    sex: 'F',
    ageGroup: 'Sub-Juniors',
    bwKg: 64.7,
    discipline: 'Dip',
    result: 37.5,
    pointsRaw: 106.1908333323897,
    pointsPub: 106.19,
  },
  {
    caseId: 18,
    sex: 'F',
    ageGroup: 'Open',
    bwKg: 43.4,
    discipline: 'Total',
    result: 40.0,
    pointsRaw: 73.8818530070035,
    pointsPub: 73.88,
  },
  {
    caseId: 19,
    sex: 'F',
    ageGroup: 'Open',
    bwKg: 51.52,
    discipline: 'Total',
    result: 45.0,
    pointsRaw: 64.5227037992031,
    pointsPub: 64.52,
  },
  {
    caseId: 20,
    sex: 'F',
    ageGroup: 'Sub-Juniors',
    bwKg: 64.7,
    discipline: 'Total',
    result: 70.0,
    pointsRaw: 102.9971101290655,
    pointsPub: 103.0,
  },
];

describe('isfPoints (vNext-K, open_absolute)', () => {
  it.each(GOLDEN_CASES)(
    'case $caseId: $sex/$discipline bw=$bwKg result=$result → $pointsPub',
    (gc) => {
      const result = isfPoints({
        result: gc.result,
        bodyWeightKg: gc.bwKg,
        sex: gc.sex,
        discipline: gc.discipline,
        ageGroup: gc.ageGroup,
        // Default rankingMode='open_absolute' → AgeFactor=1.0 regardless of ageGroup
      });
      expect(result).not.toBeNull();
      // Within ±0.01 of golden raw (golden CSV tolerance is 0.01)
      expect(result!.pointsRaw).toBeCloseTo(gc.pointsRaw, 2);
      expect(result!.pointsPub).toBeCloseTo(gc.pointsPub, 2);
      expect(result!.ageFactor).toBe(1.0);
      expect(result!.rankingMode).toBe('open_absolute');
      expect(result!.curveVersion).toBe(ISFPOINTS_CURVE_VERSION);
    },
  );

  it('returns null for non-positive result', () => {
    expect(isfPoints({ result: 0, bodyWeightKg: 80, sex: 'M', discipline: 'Pull' })).toBeNull();
    expect(isfPoints({ result: -1, bodyWeightKg: 80, sex: 'M', discipline: 'Pull' })).toBeNull();
  });

  it('returns null for non-positive bodyweight', () => {
    expect(isfPoints({ result: 100, bodyWeightKg: 0, sex: 'M', discipline: 'Pull' })).toBeNull();
  });

  it('flags out-of-domain bodyweights', () => {
    // M Pull domain is [36.94, 101.0]. 110 kg is above — should still compute
    // (right branch extrapolation), but outOfDomain=true.
    const r = isfPoints({ result: 70, bodyWeightKg: 110, sex: 'M', discipline: 'Pull' });
    expect(r).not.toBeNull();
    expect(r!.outOfDomain).toBe(true);
  });

  it('age_corrected mode applies the age multiplier', () => {
    const open = isfPoints({
      result: 62.5,
      bodyWeightKg: 56.0,
      sex: 'M',
      discipline: 'Pull',
      ageGroup: 'Juniors',
      rankingMode: 'age_corrected',
    });
    const absolute = isfPoints({
      result: 62.5,
      bodyWeightKg: 56.0,
      sex: 'M',
      discipline: 'Pull',
      ageGroup: 'Juniors',
      // default rankingMode='open_absolute'
    });
    expect(open).not.toBeNull();
    expect(absolute).not.toBeNull();
    // Juniors multiplier < 1.0, so age_corrected Points > open_absolute Points
    expect(open!.pointsRaw).toBeGreaterThan(absolute!.pointsRaw);
    expect(open!.ageFactor).toBeCloseTo(0.9014966817010024, 10);
    expect(absolute!.ageFactor).toBe(1.0);
  });
});

describe('isfPointsS continuity at bw_opt', () => {
  it.each([
    ['M', 'Pull'],
    ['M', 'Dip'],
    ['M', 'Total'],
    ['F', 'Pull'],
    ['F', 'Dip'],
    ['F', 'Total'],
  ] as const)(
    '%s/%s: left and right branch values agree at bw_opt within 1e-8',
    (sex, discipline) => {
      // Continuity is mathematically guaranteed by `c = a + (b-d)·ln(bw_opt)`;
      // this guards against parameter typos. Probe just below and just above
      // bw_opt — the difference should vanish as ε → 0.
      const params = ISFPOINTS_K_PARAMS[`${sex}:${discipline}`];
      const eps = 1e-10;
      const left = isfPointsS(params.bw_opt - eps, sex, discipline);
      const right = isfPointsS(params.bw_opt + eps, sex, discipline);
      // Relative error should be tiny — both branches evaluate to nearly the same S.
      expect(Math.abs(left - right) / Math.max(left, right)).toBeLessThan(1e-8);
    },
  );
});

describe('mapEventToISFClassicDiscipline', () => {
  it('maps Classic events', () => {
    expect(mapEventToISFClassicDiscipline('PU')).toBe('Pull');
    expect(mapEventToISFClassicDiscipline('DI')).toBe('Dip');
    expect(mapEventToISFClassicDiscipline('PUDI')).toBe('Total');
  });

  it('returns null for non-Classic events', () => {
    expect(mapEventToISFClassicDiscipline('MU_BAR')).toBeNull();
    expect(mapEventToISFClassicDiscipline('MU_RING')).toBeNull();
    expect(mapEventToISFClassicDiscipline('SQ')).toBeNull();
    expect(mapEventToISFClassicDiscipline('PUDIMUSQ')).toBeNull();
    expect(mapEventToISFClassicDiscipline('whatever')).toBeNull();
  });
});
