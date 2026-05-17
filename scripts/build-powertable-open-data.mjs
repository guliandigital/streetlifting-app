import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

function readArg(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'));
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function finiteNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return undefined;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeAttempt(row) {
  return cleanObject({
    componentCode: row.componentCode,
    attemptNumber: finiteNumber(row.attemptNumber),
    weightKg: finiteNumber(row.weightKg),
    result: row.result,
    repsCount: finiteNumber(row.repsCount),
  });
}

function normalizeAthleteMention(row) {
  const attempts = Array.isArray(row.attempts)
    ? row.attempts.map(normalizeAttempt).filter((attempt) => attempt.weightKg !== undefined)
    : [];
  const coefficient = finiteNumber(row.coefficient);
  const resultValue = finiteNumber(row.resultValue);
  const hasMeaningfulResult =
    resultValue !== undefined || coefficient !== undefined || attempts.length > 0;

  return cleanObject({
    meetId: String(row.meetId ?? ''),
    sportsmanId: String(row.sportsmanId ?? ''),
    name: row.name ?? '',
    birthYear: row.birthYear ?? '',
    team: row.team ?? '',
    className: row.className ?? '',
    division: row.division ?? '',
    gender: row.gender ?? '',
    category: row.category ?? '',
    href: row.href ?? '',
    dsp: nonEmptyString(row.dsp),
    disciplineCode: nonEmptyString(row.disciplineCode),
    disciplineLabel: nonEmptyString(row.disciplineLabel),
    bodyWeightKg: finiteNumber(row.bodyWeightKg),
    bestPullUpKg: finiteNumber(row.bestPullUpKg),
    bestDipKg: finiteNumber(row.bestDipKg),
    bestMuscleUpKg: finiteNumber(row.bestMuscleUpKg),
    resultValue: resultValue ?? (hasMeaningfulResult ? null : undefined),
    coefficient,
    placeInClass: finiteNumber(row.placeInClass),
    placeOverall: finiteNumber(row.placeOverall),
    attempts: attempts.length > 0 ? attempts : undefined,
  });
}

function normalizeReferenceRow(row) {
  return cleanObject({
    dsp: nonEmptyString(row.dsp),
    disciplineCode: nonEmptyString(row.disciplineCode),
    disciplineLabel: nonEmptyString(row.disciplineLabel),
    levelCode: nonEmptyString(row.levelCode),
    levelLabel: nonEmptyString(row.levelLabel),
    countryCode: nonEmptyString(row.countryCode),
    countryLabel: nonEmptyString(row.countryLabel),
    regionCode: nonEmptyString(row.regionCode),
    regionLabel: nonEmptyString(row.regionLabel),
    year: nonEmptyString(row.year),
    federationFilter: nonEmptyString(row.federationFilter),
    federationFilterLabel: nonEmptyString(row.federationFilterLabel),
    dataDate: nonEmptyString(row.dataDate),
    cells: Array.isArray(row.cells) ? row.cells : [],
  });
}

function optionToPlain(option) {
  return cleanObject({
    value: option.value,
    label: option.label,
    selected: Boolean(option.selected),
  });
}

function buildDisciplines(baseSnapshot, references) {
  const byDsp = new Map();
  for (const discipline of baseSnapshot.publicReferences?.disciplines ?? []) {
    byDsp.set(discipline.dsp, discipline);
  }

  const referenceRows = [
    ...(references.normRows ?? []),
    ...(references.recordRows ?? []),
    ...(references.athleteRatingRows ?? []),
  ];
  for (const row of referenceRows) {
    if (!row.dsp) continue;
    byDsp.set(row.dsp, {
      dsp: row.dsp,
      disciplineCode:
        row.disciplineCode ?? byDsp.get(row.dsp)?.disciplineCode ?? `powertable_${row.dsp}`,
      disciplineLabel: row.disciplineLabel ?? byDsp.get(row.dsp)?.disciplineLabel ?? row.dsp,
    });
  }

  const optionGroups = [
    ...(references.options?.normDisciplines ?? []),
    ...(references.options?.recordDisciplines ?? []),
    ...(references.options?.ratingDisciplines ?? []),
  ];
  for (const option of optionGroups) {
    if (!option.value || byDsp.has(option.value)) continue;
    byDsp.set(option.value, {
      dsp: option.value,
      disciplineCode: `powertable_${option.value}`,
      disciplineLabel: option.label || option.value,
    });
  }

  return Array.from(byDsp.values()).sort((left, right) => left.dsp.localeCompare(right.dsp));
}

function countUniqueAthletes(rows) {
  return new Set(rows.map((row) => row.sportsmanId).filter(Boolean)).size;
}

function countDisciplines(rows) {
  return new Set(rows.map((row) => row.disciplineCode).filter(Boolean)).size;
}

function referenceEndpoint(endpoint) {
  return cleanObject({
    key: endpoint.key,
    url: endpoint.url,
    status: endpoint.status,
    rowCount: finiteNumber(endpoint.rowCount),
  });
}

const repoRoot = process.cwd();
const inputDir = path.resolve(
  readArg('--input') ??
    path.join(repoRoot, '..', 'streetlifting-os', 'migration-output', 'powertable'),
);
const outputPath = path.resolve(
  readArg('--out') ??
    path.join(repoRoot, 'apps', 'web', 'public', 'data', 'powertable', 'open-data.json'),
);
const basePath = path.resolve(readArg('--base') ?? outputPath);

const baseSnapshot = await readJson(basePath);
const manifest = await readJson(path.join(inputDir, 'manifest.json'));
const publicResults = await readJson(path.join(inputDir, 'powertable-public-results.json'));
const references = await readJson(
  path.join(inputDir, `fed-${manifest.feds[0]}-public-references.json`),
);

const athleteMentions = publicResults.map(normalizeAthleteMention);
const publicReferences = {
  generatedAt: references.generatedAt,
  federationCode: references.federationCode,
  endpoints: (references.endpoints ?? []).map(referenceEndpoint),
  disciplines: buildDisciplines(baseSnapshot, references),
  recordLevels: (references.options?.recordLevels ?? []).map(optionToPlain),
  normRows: (references.normRows ?? []).map(normalizeReferenceRow),
  recordRows: (references.recordRows ?? []).map(normalizeReferenceRow),
  athleteRatingRows: (references.athleteRatingRows ?? []).map(normalizeReferenceRow),
  coachRatingRows: (references.coachRatingRows ?? []).map(normalizeReferenceRow),
};

const snapshot = {
  generatedAt: manifest.generatedAt,
  source: {
    system: 'PowerTable public API',
    federation: 'ISF',
    federationCode: manifest.feds[0],
    collectedAt: manifest.generatedAt,
    mode: manifest.mode,
  },
  counts: {
    federations: baseSnapshot.federations.length,
    clubs: baseSnapshot.clubs.length,
    cities: baseSnapshot.cities.length,
    competitions: baseSnapshot.competitions.length,
    athleteMentions: athleteMentions.length,
    uniquePublicAthletes: countUniqueAthletes(athleteMentions),
    judges: 0,
    resultRows: athleteMentions.filter((row) => row.resultValue !== undefined).length,
    attempts: athleteMentions.reduce((total, row) => total + (row.attempts?.length ?? 0), 0),
    disciplines: countDisciplines(athleteMentions),
    disciplinePages: manifest.summary.publicDisciplinePageCount,
    normRows: publicReferences.normRows.length,
    recordRows: publicReferences.recordRows.length,
    athleteRatingRows: publicReferences.athleteRatingRows.length,
    coachRatingRows: publicReferences.coachRatingRows.length,
    publicReferenceEndpoints: publicReferences.endpoints.length,
  },
  notes: [
    'Это публичная read-only выгрузка PowerTable. Закрытые персональные поля и каталог судей без federation sk не доступны.',
    'Собраны все открытые wt-вкладки PowerTable по ISF: classic total, single-lift, multirep и доступные WC/weighted-calisthenics строки.',
    'Исторические попытки импортируются из открытого протокола; явные no-lift берутся из разметки PowerTable, итоговые места и суммы сохраняются как справочные значения.',
    'PowerTable norm_in/rec_in/rating_in/rating_coach_in собраны как read-only публичные справочные строки; рейтинги и рекорды показываются отдельно и не записываются в операционную БД без ручной ратификации.',
  ],
  federations: baseSnapshot.federations,
  clubs: baseSnapshot.clubs,
  cities: baseSnapshot.cities,
  competitions: baseSnapshot.competitions,
  athleteMentions,
  publicReferences,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

console.log(`PowerTable open data snapshot written: ${outputPath}`);
console.log(JSON.stringify(snapshot.counts, null, 2));
