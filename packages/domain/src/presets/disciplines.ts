/**
 * ISF v5.1 discipline catalog — 25 disciplines.
 *
 *    3 Classic streetlifting (PU / DI / PUDI total)              — formula = isf_points
 *   16 Multirep streetlifting (6 total + 5 PU singles + 5 DI)    — formula = result_x_coefficient
 *    6 Weighted Calisthenics (PU / DI / MU bar / MU ring / SQ /
 *      4-event total)                                            — formula = isf_points
 *
 * Source: PowerTable «Дисциплины» tab + ISF v5.1 §§2, 4.
 *
 * WC notes per ISF v5.1 §4.3–4.4:
 * - Bar Muscle-Up: men's default; women may opt-in by request before start
 * - Ring Muscle-Up: women's default
 * - Barbell Squat: hip below knee level depth requirement
 * - WC Total = sum of best successful Pull-Up + Dip + Muscle-Up + Squat
 *
 * ISF Coefficients are tabulated only for Classic (§10.9.3); WC singles
 * use formula='isf_points' but the coefficient lookup falls back to 1.0
 * (raw kg) until ISF publishes WC parameters.
 */

export type CompetitionFormatCode = 'classic' | 'multirep';
export type EventCode = 'PU' | 'DI' | 'PUDI' | 'MU_BAR' | 'MU_RING' | 'SQ' | 'PUDIMUSQ';
export type FormulaCode = 'isf_points' | 'result_x_coefficient';
export type DisciplineFamilyCode = 'streetlifting' | 'weighted_calisthenics' | 'multi_rep';

export interface DisciplinePreset {
  code: string;
  labelRu: string;
  labelEn: string;
  /** Defaults to 'streetlifting' for the classic + multirep entries. */
  family?: DisciplineFamilyCode;
  competitionFormat: CompetitionFormatCode;
  event: EventCode;
  formula: FormulaCode;
  presetLoadKg?: { PU?: number; DI?: number };
}

export const ISF_V51_DISCIPLINES: ReadonlyArray<DisciplinePreset> = [
  // ─── Classic ────────────────────────────────────────────────────────────
  { code: 'classic_total', labelRu: 'Классический стритлифтинг (total)', labelEn: 'Classic Streetlifting (total)', competitionFormat: 'classic', event: 'PUDI', formula: 'isf_points' },
  { code: 'classic_pu', labelRu: 'Классическое подтягивание', labelEn: 'Classic Pull-Up Single-Lift', competitionFormat: 'classic', event: 'PU', formula: 'isf_points' },
  { code: 'classic_di', labelRu: 'Классическое отжимание на брусьях', labelEn: 'Classic Dip Single-Lift', competitionFormat: 'classic', event: 'DI', formula: 'isf_points' },

  // ─── Multirep total (two-lift) ──────────────────────────────────────────
  { code: 'multirep_total_8_12', labelRu: 'Многоповторный стритлифтинг 8/12 (total)', labelEn: 'Multirep Streetlifting 8/12 (total)', competitionFormat: 'multirep', event: 'PUDI', formula: 'result_x_coefficient', presetLoadKg: { PU: 8, DI: 12 } },
  { code: 'multirep_total_8_16', labelRu: 'Многоповторный стритлифтинг 8/16 (total)', labelEn: 'Multirep Streetlifting 8/16 (total)', competitionFormat: 'multirep', event: 'PUDI', formula: 'result_x_coefficient', presetLoadKg: { PU: 8, DI: 16 } },
  { code: 'multirep_total_12_16', labelRu: 'Многоповторный стритлифтинг 12/16 (total)', labelEn: 'Multirep Streetlifting 12/16 (total)', competitionFormat: 'multirep', event: 'PUDI', formula: 'result_x_coefficient', presetLoadKg: { PU: 12, DI: 16 } },
  { code: 'multirep_total_16_24', labelRu: 'Многоповторный стритлифтинг 16/24 (total)', labelEn: 'Multirep Streetlifting 16/24 (total)', competitionFormat: 'multirep', event: 'PUDI', formula: 'result_x_coefficient', presetLoadKg: { PU: 16, DI: 24 } },
  { code: 'multirep_total_24_32', labelRu: 'Многоповторный стритлифтинг 24/32 (total)', labelEn: 'Multirep Streetlifting 24/32 (total)', competitionFormat: 'multirep', event: 'PUDI', formula: 'result_x_coefficient', presetLoadKg: { PU: 24, DI: 32 } },
  { code: 'multirep_total_32_48', labelRu: 'Многоповторный стритлифтинг 32/48 (total)', labelEn: 'Multirep Streetlifting 32/48 (total)', competitionFormat: 'multirep', event: 'PUDI', formula: 'result_x_coefficient', presetLoadKg: { PU: 32, DI: 48 } },

  // ─── Multirep single-lift PU ─────────────────────────────────────────────
  { code: 'multirep_pu_8', labelRu: 'Подтягивания с 8 кг', labelEn: 'Pull-Ups with 8 kg', competitionFormat: 'multirep', event: 'PU', formula: 'result_x_coefficient', presetLoadKg: { PU: 8 } },
  { code: 'multirep_pu_12', labelRu: 'Подтягивания с 12 кг', labelEn: 'Pull-Ups with 12 kg', competitionFormat: 'multirep', event: 'PU', formula: 'result_x_coefficient', presetLoadKg: { PU: 12 } },
  { code: 'multirep_pu_16', labelRu: 'Подтягивания с 16 кг', labelEn: 'Pull-Ups with 16 kg', competitionFormat: 'multirep', event: 'PU', formula: 'result_x_coefficient', presetLoadKg: { PU: 16 } },
  { code: 'multirep_pu_24', labelRu: 'Подтягивания с 24 кг', labelEn: 'Pull-Ups with 24 kg', competitionFormat: 'multirep', event: 'PU', formula: 'result_x_coefficient', presetLoadKg: { PU: 24 } },
  { code: 'multirep_pu_32', labelRu: 'Подтягивания с 32 кг', labelEn: 'Pull-Ups with 32 kg', competitionFormat: 'multirep', event: 'PU', formula: 'result_x_coefficient', presetLoadKg: { PU: 32 } },

  // ─── Multirep single-lift DI ─────────────────────────────────────────────
  { code: 'multirep_di_12', labelRu: 'Отжимания с 12 кг', labelEn: 'Dips with 12 kg', competitionFormat: 'multirep', event: 'DI', formula: 'result_x_coefficient', presetLoadKg: { DI: 12 } },
  { code: 'multirep_di_16', labelRu: 'Отжимания с 16 кг', labelEn: 'Dips with 16 kg', competitionFormat: 'multirep', event: 'DI', formula: 'result_x_coefficient', presetLoadKg: { DI: 16 } },
  { code: 'multirep_di_24', labelRu: 'Отжимания с 24 кг', labelEn: 'Dips with 24 kg', competitionFormat: 'multirep', event: 'DI', formula: 'result_x_coefficient', presetLoadKg: { DI: 24 } },
  { code: 'multirep_di_32', labelRu: 'Отжимания с 32 кг', labelEn: 'Dips with 32 kg', competitionFormat: 'multirep', event: 'DI', formula: 'result_x_coefficient', presetLoadKg: { DI: 32 } },
  { code: 'multirep_di_48', labelRu: 'Отжимания с 48 кг', labelEn: 'Dips with 48 kg', competitionFormat: 'multirep', event: 'DI', formula: 'result_x_coefficient', presetLoadKg: { DI: 48 } },

  // ─── Weighted Calisthenics — singles + 4-event total (ISF v5.1 §§4.3–4.4) ─
  { code: 'wc_pu',      labelRu: 'WC: подтягивания',                labelEn: 'WC: Pull-Up',           family: 'weighted_calisthenics', competitionFormat: 'classic', event: 'PU',         formula: 'isf_points' },
  { code: 'wc_di',      labelRu: 'WC: отжимания на брусьях',        labelEn: 'WC: Dip',               family: 'weighted_calisthenics', competitionFormat: 'classic', event: 'DI',         formula: 'isf_points' },
  { code: 'wc_mu_bar',  labelRu: 'WC: выход силой на перекладине',  labelEn: 'WC: Bar Muscle-Up',     family: 'weighted_calisthenics', competitionFormat: 'classic', event: 'MU_BAR',     formula: 'isf_points' },
  { code: 'wc_mu_ring', labelRu: 'WC: выход силой на кольцах',      labelEn: 'WC: Ring Muscle-Up',    family: 'weighted_calisthenics', competitionFormat: 'classic', event: 'MU_RING',    formula: 'isf_points' },
  { code: 'wc_squat',   labelRu: 'WC: приседания со штангой',       labelEn: 'WC: Barbell Squat',     family: 'weighted_calisthenics', competitionFormat: 'classic', event: 'SQ',         formula: 'isf_points' },
  { code: 'wc_total',   labelRu: 'WC: четырёхборье (total)',        labelEn: 'WC: Four-Event (total)', family: 'weighted_calisthenics', competitionFormat: 'classic', event: 'PUDIMUSQ',   formula: 'isf_points' },
];
