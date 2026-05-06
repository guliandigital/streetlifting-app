/**
 * ISF v5.1 reference data, ported from the legacy V1 implementation
 * (`streetlifting-os-legacy/app/src/domain/presets/*`) where it had
 * 571 tests behind it.
 *
 * In V2 these constants are the seed for federation rule packs — a
 * federation can clone the ISF v5.1 set and override per its own rulebook
 * (audit-logged). Ported tests will land alongside features that consume them.
 */

export {
  ISF_V51_AGE_CATEGORIES,
  ISF_V51_MASTERS_MULTIPLIERS,
  type AgeCategoryCode,
  type AgeCategoryPreset,
} from './age-categories.js';

export {
  ISF_V51_WEIGHT_CATEGORIES,
  type WeightCategoryPreset,
} from './weight-categories.js';

export {
  ISF_V51_DISCIPLINES,
  type CompetitionFormatCode,
  type EventCode,
  type FormulaCode,
  type DisciplinePreset,
} from './disciplines.js';

export {
  ISF_V51_DEFAULT_PLATES,
  ISF_V51_PLATE_INCREMENT_KG,
} from './plates.js';

export {
  ISF_V51_BW_LIMITS,
  additionalPoints,
  type BodyweightLimits,
} from './bodyweight-limits.js';

export {
  ISF_V51_MULTIREP_PRESETS,
  type MultirepDivision,
  type MultirepExercise,
  type MultirepPreset,
} from './multirep-loads.js';
