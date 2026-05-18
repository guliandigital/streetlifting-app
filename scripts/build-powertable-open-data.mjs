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

async function readJsonIfExists(filePath, fallback) {
  try {
    return await readJson(filePath);
  } catch (error) {
    if (error && error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function parseCsvLine(line) {
  const cells = [];
  let value = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (char === ',' && !quoted) {
      cells.push(value);
      value = '';
      continue;
    }
    value += char;
  }
  cells.push(value);
  return cells;
}

function parseCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  return lines
    .slice(1)
    .map((line) =>
      cleanObject(
        Object.fromEntries(
          headers.map((header, index) => [header, parseCsvLine(line)[index] ?? '']),
        ),
      ),
    );
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
    federationCode: nonEmptyString(row.federationCode),
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

function uniqueStrings(values) {
  return Array.from(new Set(values.map(nonEmptyString).filter(Boolean)));
}

function competitionKey(row) {
  const fed = nonEmptyString(row.fed);
  const meetId = nonEmptyString(String(row.meetId ?? ''));
  return fed && meetId ? `${fed}:${meetId}` : null;
}

function isoDate(year, month, day) {
  const yyyy = Number(year);
  const mm = Number(month);
  const dd = Number(day);
  if (yyyy < 2000 || yyyy > 2100 || mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
  return `${String(yyyy).padStart(4, '0')}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function inferDateRange(text) {
  const source = String(text ?? '');
  const fullRange = source.match(
    /(\d{1,2})[.-](\d{1,2})\s*[-–—]\s*(\d{1,2})[.-](\d{1,2})[.-](\d{4})/,
  );
  if (fullRange) {
    return {
      startDate: isoDate(fullRange[5], fullRange[2], fullRange[1]),
      endDate: isoDate(fullRange[5], fullRange[4], fullRange[3]),
      index: fullRange.index ?? -1,
    };
  }

  const sameMonthRange = source.match(/(\d{1,2})\s*[-–—]\s*(\d{1,2})[.-](\d{1,2})[.-](\d{4})/);
  if (sameMonthRange) {
    return {
      startDate: isoDate(sameMonthRange[4], sameMonthRange[3], sameMonthRange[1]),
      endDate: isoDate(sameMonthRange[4], sameMonthRange[3], sameMonthRange[2]),
      index: sameMonthRange.index ?? -1,
    };
  }

  const singleDate = source.match(/(\d{1,2})[.-](\d{1,2})[.-](\d{4})/);
  if (singleDate) {
    const date = isoDate(singleDate[3], singleDate[2], singleDate[1]);
    return { startDate: date, endDate: date, index: singleDate.index ?? -1 };
  }

  return { startDate: null, endDate: null, index: -1 };
}

function inferCityBeforeDate(text, dateIndex) {
  if (dateIndex <= 0) return null;
  const beforeDate = String(text ?? '')
    .slice(0, dateIndex)
    .replace(/\s+/g, ' ')
    .replace(/[,/\s]+$/g, '')
    .trim();
  const parts = beforeDate
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const city = parts
    .at(-1)
    ?.replace(/^.*\/\s*/, '')
    .trim();
  if (!city || /\b(россия|республика|область|край|округ)\b/i.test(city)) return null;
  return city;
}

async function readCompetitionRows(inputDir, federationCodes, fallbackRows) {
  const explicitRows = await readJsonIfExists(
    path.join(inputDir, 'powertable-public-competitions.json'),
    null,
  );
  const rows =
    explicitRows?.length > 0
      ? explicitRows
      : (
          await Promise.all(
            federationCodes.map(async (fed) => {
              const text = await readTextIfExists(path.join(inputDir, `fed-${fed}-all_sorev.csv`));
              return text ? parseCsv(text) : [];
            }),
          )
        ).flat();
  if (rows.length === 0) return fallbackRows;

  const fallbackByKey = new Map(fallbackRows.map((row) => [competitionKey(row), row]));
  const fallbackByMeetId = new Map(
    fallbackRows.map((row) => [String(row.meetId ?? ''), row]).filter(([meetId]) => meetId),
  );
  const mergedByKey = new Map(
    fallbackRows.map((row) => [competitionKey(row), row]).filter(([key]) => key),
  );

  for (const row of rows) {
    const meetId = String(row.meetId ?? '');
    const fallback = fallbackByMeetId.get(meetId);
    const fed = nonEmptyString(row.fed) ?? fallback?.fed ?? federationCodes[0];
    const name = row.name || row.title || fallback?.name;
    const inferredDateRange = inferDateRange(name);
    const normalized = cleanObject({
      ...fallback,
      ...row,
      fed,
      meetId,
      name,
      href: row.href || fallback?.href || `sorev?nom=${meetId}`,
      city: row.city || fallback?.city || inferCityBeforeDate(name, inferredDateRange.index ?? -1),
      startDate: row.startDate || fallback?.startDate || inferredDateRange.startDate,
      endDate: row.endDate || fallback?.endDate || inferredDateRange.endDate,
    });
    const key = competitionKey(normalized);
    if (!key) continue;
    mergedByKey.set(key, {
      ...(fallbackByKey.get(key) ?? {}),
      ...normalized,
    });
  }

  return Array.from(mergedByKey.values());
}

function referenceEndpoint(endpoint) {
  return cleanObject({
    federationCode: endpoint.federationCode,
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
const federationCodes = uniqueStrings([
  ...(baseSnapshot.source?.federationCodes ?? []),
  baseSnapshot.source?.federationCode,
  ...(Array.isArray(manifest.feds) && manifest.feds.length > 0 ? manifest.feds : ['0010']),
]);
const loadedPublicResults = await readJsonIfExists(
  path.join(inputDir, 'powertable-public-results.json'),
  null,
);
const loadedResultMeetIds = new Set(
  (loadedPublicResults ?? []).map((entry) => String(entry.meetId ?? '')).filter(Boolean),
);
const publicResults =
  loadedPublicResults?.length > 0
    ? [
        ...(baseSnapshot.athleteMentions ?? []).filter(
          (row) => !loadedResultMeetIds.has(String(row.meetId ?? '')),
        ),
        ...loadedPublicResults,
      ]
    : (baseSnapshot.athleteMentions ?? []);
const competitions = await readCompetitionRows(
  inputDir,
  federationCodes,
  baseSnapshot.competitions ?? [],
);
const referenceSnapshots = (
  await Promise.all(
    federationCodes.map(async (fed) => ({
      fed,
      references: await readJsonIfExists(
        path.join(inputDir, `fed-${fed}-public-references.json`),
        null,
      ),
    })),
  )
).filter((entry) => entry.references);

function rowsWithFederationCode(rows, fed) {
  return (rows ?? []).map((row) => ({ federationCode: fed, ...row }));
}

function endpointsWithFederationCode(endpoints, fed) {
  return (endpoints ?? []).map((endpoint) => ({ federationCode: fed, ...endpoint }));
}

const mergedReferences = {
  generatedAt: referenceSnapshots[0]?.references.generatedAt ?? manifest.generatedAt,
  federationCodes,
  endpoints: referenceSnapshots.flatMap((entry) =>
    endpointsWithFederationCode(entry.references.endpoints, entry.fed),
  ),
  options: {
    normDisciplines: referenceSnapshots.flatMap(
      (entry) => entry.references.options?.normDisciplines ?? [],
    ),
    recordDisciplines: referenceSnapshots.flatMap(
      (entry) => entry.references.options?.recordDisciplines ?? [],
    ),
    ratingDisciplines: referenceSnapshots.flatMap(
      (entry) => entry.references.options?.ratingDisciplines ?? [],
    ),
    recordLevels: referenceSnapshots.flatMap(
      (entry) => entry.references.options?.recordLevels ?? [],
    ),
  },
  normRows: referenceSnapshots.flatMap((entry) =>
    rowsWithFederationCode(entry.references.normRows, entry.fed),
  ),
  recordRows: referenceSnapshots.flatMap((entry) =>
    rowsWithFederationCode(entry.references.recordRows, entry.fed),
  ),
  athleteRatingRows: referenceSnapshots.flatMap((entry) =>
    rowsWithFederationCode(entry.references.athleteRatingRows, entry.fed),
  ),
  coachRatingRows: referenceSnapshots.flatMap((entry) =>
    rowsWithFederationCode(entry.references.coachRatingRows, entry.fed),
  ),
};

const athleteMentions = publicResults.map(normalizeAthleteMention);
const publicReferences =
  referenceSnapshots.length > 0
    ? {
        generatedAt: mergedReferences.generatedAt,
        federationCode: federationCodes[0],
        federationCodes,
        endpoints: mergedReferences.endpoints.map(referenceEndpoint),
        disciplines: buildDisciplines(baseSnapshot, mergedReferences),
        recordLevels: mergedReferences.options.recordLevels.map(optionToPlain),
        normRows: mergedReferences.normRows.map(normalizeReferenceRow),
        recordRows: mergedReferences.recordRows.map(normalizeReferenceRow),
        athleteRatingRows: mergedReferences.athleteRatingRows.map(normalizeReferenceRow),
        coachRatingRows: mergedReferences.coachRatingRows.map(normalizeReferenceRow),
      }
    : {
        ...(baseSnapshot.publicReferences ?? {}),
        federationCode: federationCodes[0],
        federationCodes,
      };

const snapshot = {
  generatedAt: manifest.generatedAt,
  source: {
    system: 'PowerTable public API',
    federation: federationCodes.length === 1 ? 'ISF' : 'Streetlifting federations',
    federationCode: federationCodes[0],
    federationCodes,
    collectedAt: manifest.generatedAt,
    mode: manifest.mode,
  },
  counts: {
    federations: baseSnapshot.federations.length,
    clubs: baseSnapshot.clubs.length,
    cities: baseSnapshot.cities.length,
    competitions: competitions.length,
    athleteMentions: athleteMentions.length,
    uniquePublicAthletes: countUniqueAthletes(athleteMentions),
    judges: 0,
    resultRows: athleteMentions.filter((row) => row.resultValue !== undefined).length,
    attempts: athleteMentions.reduce((total, row) => total + (row.attempts?.length ?? 0), 0),
    disciplines: countDisciplines(athleteMentions),
    disciplinePages: Math.max(
      manifest.summary.publicDisciplinePageCount || 0,
      baseSnapshot.counts?.disciplinePages || 0,
    ),
    normRows: publicReferences.normRows.length,
    recordRows: publicReferences.recordRows.length,
    athleteRatingRows: publicReferences.athleteRatingRows.length,
    coachRatingRows: publicReferences.coachRatingRows.length,
    publicReferenceEndpoints: publicReferences.endpoints.length,
  },
  notes: [
    'Это публичная read-only выгрузка PowerTable. Закрытые персональные поля и каталог судей без federation sk не доступны.',
    'Собраны открытые wt-вкладки PowerTable по streetlifting-федерациям: classic total, single-lift, multirep и доступные WC/weighted-calisthenics строки.',
    'Исторические попытки импортируются из открытого протокола; явные no-lift берутся из разметки PowerTable, итоговые места и суммы сохраняются как справочные значения.',
    'PowerTable norm_in/rec_in/rating_in/rating_coach_in собраны как read-only публичные справочные строки; рейтинги и рекорды показываются отдельно и не записываются в операционную БД без ручной ратификации.',
  ],
  federations: baseSnapshot.federations,
  clubs: baseSnapshot.clubs,
  cities: baseSnapshot.cities,
  competitions,
  athleteMentions,
  publicReferences,
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');

console.log(`PowerTable open data snapshot written: ${outputPath}`);
console.log(JSON.stringify(snapshot.counts, null, 2));
