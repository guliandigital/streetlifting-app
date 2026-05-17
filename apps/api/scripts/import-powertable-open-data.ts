/**
 * Import the public PowerTable snapshot into operational reference tables.
 *
 * The importer is intentionally idempotent:
 * - federation is keyed by PowerTable federation code
 * - public PowerTable federation-like references are keyed by PTF:<code> / PTC:<code>
 * - chapters are keyed by federation + PowerTable region id
 * - competitions are keyed by federation + PT-<meetId>
 * - athletes are keyed by federationCardNumber = PT:<sportsmanId>
 * - nominations are keyed by competition + athlete + classic_total + PowerTable division
 * - cities are inserted only when no city with the same country/name exists
 *
 * Usage:
 *   pnpm --filter=@streetlifting/api import:powertable-open-data -- --dry-run
 *   pnpm --filter=@streetlifting/api import:powertable-open-data
 */

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from '../src/lib/db.js';

interface FederationRow {
  code: string;
  shortName: string;
  name: string;
  eventCount: number | null;
  href?: string;
}

interface CityRow {
  countryCode: string;
  countryName: string;
  city: string;
  eventCount: number | null;
}

interface CompetitionRow {
  fed: string;
  regionId: string;
  regionName: string;
  meetId: string;
  name: string;
  leadingDate: string;
  href: string;
  city?: string;
  startDate?: string;
  endDate?: string;
}

interface AthleteMentionRow {
  meetId: string;
  sportsmanId: string;
  name: string;
  birthYear: string;
  team: string;
  division: string;
  gender: string;
  category: string;
  href: string;
  bodyWeightKg?: number;
}

interface PowerTableOpenData {
  source: {
    federation: string;
    federationCode: string;
    collectedAt: string;
  };
  federations: FederationRow[];
  clubs: FederationRow[];
  cities: CityRow[];
  competitions: CompetitionRow[];
  athleteMentions: AthleteMentionRow[];
}

interface Counters {
  created: number;
  updated: number;
  skipped: number;
}

type Gender = 'M' | 'F';
type VeteranTier = 'youth' | 'junior' | 'open' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5';

const ISO3_TO_ISO2: Record<string, string> = {
  BLR: 'BY',
  CHN: 'CN',
  GBR: 'GB',
  HUN: 'HU',
  KAZ: 'KZ',
  KGZ: 'KG',
  MDA: 'MD',
  RUS: 'RU',
};

const COUNTRY_EN: Record<string, string> = {
  BY: 'Belarus',
  CN: 'China',
  GB: 'United Kingdom',
  HU: 'Hungary',
  KZ: 'Kazakhstan',
  KG: 'Kyrgyzstan',
  MD: 'Moldova',
  RU: 'Russia',
};

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function readArg(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function cleanText(value: string | null | undefined): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function truncate(value: string | undefined, max: number): string | undefined {
  if (!value) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseIsoDate(value: string | null | undefined): string | null {
  const trimmed = cleanText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : null;
}

function parseBirthYear(value: string): string | null {
  const trimmed = cleanText(value);
  if (/^\d{4}$/.test(trimmed)) return `${trimmed}-01-01`;
  if (!/^\d{2}$/.test(trimmed)) return null;
  const yearPart = Number(trimmed);
  const currentTwoDigitYear = new Date().getFullYear() % 100;
  const fullYear = yearPart <= currentTwoDigitYear ? 2000 + yearPart : 1900 + yearPart;
  return `${fullYear}-01-01`;
}

function genderFromPowerTable(value: string): 'M' | 'F' | null {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === 'man' || normalized === 'm') return 'M';
  if (normalized === 'woman' || normalized === 'f') return 'F';
  return null;
}

function parseNumber(value: string | number | null | undefined): number | null {
  const normalized = String(value ?? '')
    .trim()
    .replace(',', '.');
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

function splitName(fullName: string): { lastName: string; firstName: string; middleName?: string } {
  const parts = cleanText(fullName).split(' ').filter(Boolean);
  return {
    lastName: parts[0] ?? 'Unknown',
    firstName: parts[1] ?? 'Unknown',
    middleName: truncate(parts.slice(2).join(' ') || undefined, 120),
  };
}

function isSelfTeam(team: string): boolean {
  const normalized = cleanText(team).toLowerCase();
  return !normalized || normalized === '-' || normalized === 'self' || normalized === 'личник';
}

function athleteClubName(rows: AthleteMentionRow[]): string | undefined {
  const teams = Array.from(
    new Set(rows.map((row) => cleanText(row.team)).filter((team) => !isSelfTeam(team))),
  );
  return truncate(teams.slice(0, 3).join('; ') || undefined, 200);
}

function validPowerTableCity(row: CityRow): boolean {
  return (
    Boolean(ISO3_TO_ISO2[cleanText(row.countryCode)]) &&
    cleanText(row.city).length > 0 &&
    (row.eventCount ?? 0) > 0
  );
}

function countryCodeForCompetition(row: CompetitionRow | undefined): string {
  if (row?.regionName.toLowerCase().includes('казахстан')) return 'KZ';
  return 'RU';
}

function powerTableHrefUrl(href: string | null | undefined): string | undefined {
  const cleanHref = cleanText(href);
  if (!cleanHref) return undefined;
  if (cleanHref.startsWith('http://') || cleanHref.startsWith('https://')) {
    return truncate(cleanHref, 2048);
  }
  if (cleanHref.startsWith('/')) return truncate(`https://powertable.ru${cleanHref}`, 2048);
  return truncate(`https://powertable.ru/api/hs/p/${cleanHref}`, 2048);
}

function powerTableUrl(row: FederationRow): string | undefined {
  return powerTableHrefUrl(row.href);
}

function federationDisplayName(row: FederationRow): string {
  return cleanText(row.name) || cleanText(row.shortName) || `PowerTable ${cleanText(row.code)}`;
}

function federationReferenceCode(prefix: 'PTF' | 'PTC', row: FederationRow): string {
  return `${prefix}-${cleanText(row.code)}`.slice(0, 16);
}

function inferCountryCodeFromFederation(row: FederationRow): string {
  const text = `${row.shortName} ${row.name}`.toLowerCase();
  if (text.includes('belarus') || text.includes('беларус')) return 'BY';
  if (text.includes('казахстан') || text.includes('kazakhstan')) return 'KZ';
  if (text.includes('kyrgyz') || text.includes('киргиз') || text.includes('кыргыз')) return 'KG';
  if (text.includes('приднестров') || text.includes('moldova') || text.includes('молдов'))
    return 'MD';
  if (text.includes('spain') || text.includes('испан')) return 'ES';
  if (text.includes('poland') || text.includes('польш')) return 'PL';
  if (text.includes('lithuania') || text.includes('литв')) return 'LT';
  if (text.includes('france') || text.includes('франц')) return 'FR';
  if (text.includes('germany') || text.includes('герман')) return 'DE';
  if (text.includes('latvia') || text.includes('латви')) return 'LV';
  if (text.includes('iran') || text.includes('иран')) return 'IR';
  if (text.includes('serbia') || text.includes('серб')) return 'RS';
  if (text.includes('uzbekistan') || text.includes('узбек')) return 'UZ';
  if (text.includes('egypt') || text.includes('егип')) return 'EG';
  if (text.includes('india') || text.includes('индия')) return 'IN';
  if (text.includes('армения') || text.includes('armenia')) return 'AM';
  return 'RU';
}

function defaultInputPath(): string {
  return path.resolve(process.cwd(), '../../apps/web/public/data/powertable/open-data.json');
}

async function loadSnapshot(inputPath: string): Promise<PowerTableOpenData> {
  const content = await readFile(inputPath, 'utf8');
  return JSON.parse(content) as PowerTableOpenData;
}

async function ensureSourceFederation(
  data: PowerTableOpenData,
  dryRun: boolean,
): Promise<{
  id: string | null;
  counters: Counters;
}> {
  const counters: Counters = { created: 0, updated: 0, skipped: 0 };
  const source = data.federations.find((row) => row.code === data.source.federationCode);
  if (!source) {
    counters.skipped++;
    return { id: null, counters };
  }

  const existing = await prisma.federation.findUnique({ where: { code: source.code } });
  const nameRu = source.name || source.shortName || data.source.federation;
  const nameEn = source.name || source.shortName || data.source.federation;
  const sourceUrl = powerTableUrl(source);

  if (dryRun) {
    if (existing) counters.updated++;
    else counters.created++;
    return { id: existing?.id ?? null, counters };
  }

  const federation = existing
    ? await prisma.federation.update({
        where: { id: existing.id },
        data: {
          nameRu,
          nameEn,
          countryCode: existing.countryCode,
          billingTariffKopecksPerNomination: existing.billingTariffKopecksPerNomination,
          websiteUrl: existing.websiteUrl ?? sourceUrl,
        },
      })
    : await prisma.federation.create({
        data: {
          code: source.code,
          nameRu,
          nameEn,
          countryCode: 'RU',
          billingTariffKopecksPerNomination: 0n,
          securityKey: randomUUID(),
          websiteUrl: sourceUrl,
        },
      });

  if (existing) counters.updated++;
  else counters.created++;
  return { id: federation.id, counters };
}

async function importFederationLikeRows(
  rows: FederationRow[],
  prefix: 'PTF' | 'PTC',
  dryRun: boolean,
): Promise<Counters> {
  const counters: Counters = { created: 0, updated: 0, skipped: 0 };
  const uniqueRows = new Map<string, FederationRow>();
  for (const row of rows) {
    const code = cleanText(row.code);
    if (!code) {
      counters.skipped++;
      continue;
    }
    uniqueRows.set(code, row);
  }

  for (const row of uniqueRows.values()) {
    const code = federationReferenceCode(prefix, row);
    const name = federationDisplayName(row);
    const existing = await prisma.federation.findUnique({ where: { code } });
    const websiteUrl = powerTableUrl(row);

    if (dryRun) {
      if (existing) counters.updated++;
      else counters.created++;
      continue;
    }

    if (existing) {
      await prisma.federation.update({
        where: { id: existing.id },
        data: {
          nameRu: name,
          nameEn: name,
          countryCode: inferCountryCodeFromFederation(row),
          websiteUrl: existing.websiteUrl ?? websiteUrl,
          billingTariffKopecksPerNomination: existing.billingTariffKopecksPerNomination,
        },
      });
      counters.updated++;
    } else {
      await prisma.federation.create({
        data: {
          code,
          nameRu: name,
          nameEn: name,
          countryCode: inferCountryCodeFromFederation(row),
          billingTariffKopecksPerNomination: 0n,
          securityKey: randomUUID(),
          websiteUrl,
        },
      });
      counters.created++;
    }
  }

  return counters;
}

async function importFederationLikeReferences(
  data: PowerTableOpenData,
  dryRun: boolean,
): Promise<{
  federations: Counters;
  clubs: Counters;
}> {
  const federationRows = data.federations.filter(
    (row) => cleanText(row.code) !== data.source.federationCode,
  );
  const clubRows = data.clubs ?? [];

  return {
    federations: await importFederationLikeRows(federationRows, 'PTF', dryRun),
    clubs: await importFederationLikeRows(clubRows, 'PTC', dryRun),
  };
}

async function ensureFederationTags(dryRun: boolean): Promise<Counters> {
  const counters: Counters = { created: 0, updated: 0, skipped: 0 };
  const tags = [
    {
      code: 'powertable_public',
      nameRu: 'PowerTable public import',
      nameEn: 'PowerTable public import',
      sortOrder: 900,
    },
    {
      code: 'powertable_federation',
      nameRu: 'PowerTable federation reference',
      nameEn: 'PowerTable federation reference',
      sortOrder: 901,
    },
    {
      code: 'powertable_club',
      nameRu: 'PowerTable club reference',
      nameEn: 'PowerTable club reference',
      sortOrder: 902,
    },
  ];

  for (const tag of tags) {
    const existing = await prisma.lookupValue.findUnique({
      where: { kind_code: { kind: 'federation_tag', code: tag.code } },
    });

    if (dryRun) {
      if (existing) counters.updated++;
      else counters.created++;
      continue;
    }

    await prisma.lookupValue.upsert({
      where: { kind_code: { kind: 'federation_tag', code: tag.code } },
      create: {
        kind: 'federation_tag',
        code: tag.code,
        nameRu: tag.nameRu,
        nameEn: tag.nameEn,
        sortOrder: tag.sortOrder,
      },
      update: {
        nameRu: tag.nameRu,
        nameEn: tag.nameEn,
        sortOrder: tag.sortOrder,
        isActive: true,
      },
    });

    if (existing) counters.updated++;
    else counters.created++;
  }

  return counters;
}

async function importChapters(
  data: PowerTableOpenData,
  federationId: string | null,
  dryRun: boolean,
): Promise<Counters> {
  const counters: Counters = { created: 0, updated: 0, skipped: 0 };
  const regions = new Map<string, CompetitionRow>();
  for (const competition of data.competitions) {
    if (!competition.regionId || !competition.regionName) continue;
    regions.set(competition.regionId, competition);
  }

  if (!federationId) {
    if (dryRun) counters.created = regions.size;
    else counters.skipped = regions.size;
    return counters;
  }

  for (const region of regions.values()) {
    const code = `PT-${region.regionId}`.slice(0, 16);
    const existing = await prisma.federationChapter.findUnique({
      where: { federationId_code: { federationId, code } },
    });
    if (dryRun) {
      if (existing) counters.updated++;
      else counters.created++;
      continue;
    }

    await prisma.federationChapter.upsert({
      where: { federationId_code: { federationId, code } },
      create: {
        federationId,
        code,
        nameRu: region.regionName,
        nameEn: region.regionName,
        countryCode: countryCodeForCompetition(region),
      },
      update: {
        nameRu: region.regionName,
        nameEn: region.regionName,
        countryCode: countryCodeForCompetition(region),
        isActive: true,
      },
    });

    if (existing) counters.updated++;
    else counters.created++;
  }

  return counters;
}

function competitionCode(row: CompetitionRow): string {
  return `PT-${cleanText(row.meetId)}`.slice(0, 64);
}

function competitionStatus(startDate: string): 'draft' | 'archived' {
  return startDate < todayIsoDate() ? 'archived' : 'draft';
}

function competitionDescription(row: CompetitionRow): string {
  const sourceUrl = powerTableHrefUrl(row.href);
  const parts = [
    'Imported from PowerTable public snapshot.',
    sourceUrl ? `Source: ${sourceUrl}` : undefined,
    cleanText(row.regionName) ? `Region: ${cleanText(row.regionName)}` : undefined,
  ].filter(Boolean);
  return parts.join('\n');
}

function veteranCoefficient(tier: VeteranTier): number {
  const coefficients: Record<VeteranTier, number> = {
    youth: 1,
    junior: 1,
    open: 1,
    m1: 1.025,
    m2: 1.05,
    m3: 1.075,
    m4: 1.1,
    m5: 1.125,
  };
  return coefficients[tier];
}

function divisionSpec(row: AthleteMentionRow): {
  code: string;
  name: string;
  veteranTier: VeteranTier;
  ageMin: number | null;
  ageMax: number | null;
} {
  const text = cleanText(row.division);
  const normalized = text.toLowerCase();

  if (normalized.includes('sub-juniors')) {
    return {
      code: 'YOUTH',
      name: text || 'Sub-Juniors [13-17]',
      veteranTier: 'youth',
      ageMin: 13,
      ageMax: 17,
    };
  }
  if (normalized.includes('juniors')) {
    return {
      code: 'JUNIOR',
      name: text || 'Juniors [18-22]',
      veteranTier: 'junior',
      ageMin: 18,
      ageMax: 22,
    };
  }
  if (normalized.includes('masters m1')) {
    return {
      code: 'M1',
      name: text || 'Masters M1 [40-44]',
      veteranTier: 'm1',
      ageMin: 40,
      ageMax: 44,
    };
  }
  if (normalized.includes('masters m2')) {
    return {
      code: 'M2',
      name: text || 'Masters M2 [45-49]',
      veteranTier: 'm2',
      ageMin: 45,
      ageMax: 49,
    };
  }
  if (normalized.includes('masters m3')) {
    return {
      code: 'M3',
      name: text || 'Masters M3 [50-54]',
      veteranTier: 'm3',
      ageMin: 50,
      ageMax: 54,
    };
  }
  if (normalized.includes('masters m4')) {
    return {
      code: 'M4',
      name: text || 'Masters M4 [55-59]',
      veteranTier: 'm4',
      ageMin: 55,
      ageMax: 59,
    };
  }
  if (normalized.includes('masters m5')) {
    return {
      code: 'M5',
      name: text || 'Masters M5 [60-99]',
      veteranTier: 'm5',
      ageMin: 60,
      ageMax: 99,
    };
  }

  return {
    code: 'OPEN',
    name: text || 'Open [13-99]',
    veteranTier: 'open',
    ageMin: 13,
    ageMax: 99,
  };
}

function divisionCode(row: AthleteMentionRow, gender: Gender): string {
  return `PT_${gender}_${divisionSpec(row).code}`.slice(0, 32);
}

function divisionName(row: AthleteMentionRow, gender: Gender): string {
  const prefix = gender === 'M' ? 'Men' : 'Women';
  return `${prefix}, ${divisionSpec(row).name}`;
}

function normalizeWeightCode(value: number): string {
  return String(value).replace('.', '_');
}

function weightClassSpec(row: AthleteMentionRow): {
  code: string;
  nameRu: string;
  nameEn: string;
  weightMin: number | null;
  weightMax: number | null;
  order: number;
} {
  const raw = cleanText(row.category).replace(/^-\s*/, '');
  if (!raw || raw === '-') {
    return {
      code: 'PT_UNSPECIFIED',
      nameRu: 'PowerTable: без весовой категории',
      nameEn: 'PowerTable: unspecified weight class',
      weightMin: null,
      weightMax: null,
      order: 999,
    };
  }

  const plus = raw.match(/^\+?(\d+(?:[,.]\d+)?)\s*kg$/i);
  if (plus && raw.startsWith('+')) {
    const min = parseNumber(plus[1]);
    if (min !== null) {
      return {
        code: `PT_${normalizeWeightCode(min)}_PLUS`.slice(0, 32),
        nameRu: `свыше ${min} кг`,
        nameEn: `over ${min} kg`,
        weightMin: min,
        weightMax: null,
        order: Math.round(min * 10) + 10000,
      };
    }
  }

  const max = parseNumber(raw.replace(/\s*kg$/i, ''));
  if (max !== null) {
    return {
      code: `PT_${normalizeWeightCode(max)}`.slice(0, 32),
      nameRu: `до ${max} кг`,
      nameEn: `up to ${max} kg`,
      weightMin: null,
      weightMax: max,
      order: Math.round(max * 10),
    };
  }

  return {
    code: `PT_${raw.toUpperCase().replace(/[^A-ZА-ЯЁ0-9]+/gi, '_')}`.slice(0, 32),
    nameRu: raw,
    nameEn: raw,
    weightMin: null,
    weightMax: null,
    order: 998,
  };
}

async function ensurePowerTableDivision(
  competitionId: string,
  row: AthleteMentionRow,
  gender: Gender,
  dryRun: boolean,
  counters: Counters,
  cache: Map<string, string>,
): Promise<string | null> {
  const code = divisionCode(row, gender);
  const cacheKey = `${competitionId}:${code}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const spec = divisionSpec(row);
  const existing = await prisma.division.findUnique({
    where: { competitionId_code: { competitionId, code } },
  });

  if (dryRun) {
    if (existing) counters.updated++;
    else counters.created++;
    const id = existing?.id ?? `dry-division:${cacheKey}`;
    cache.set(cacheKey, id);
    return id;
  }

  const data = {
    nameRu: divisionName(row, gender),
    nameEn: divisionName(row, gender),
    gender,
    veteranTier: spec.veteranTier,
    ageMin: spec.ageMin,
    ageMax: spec.ageMax,
    veteranCoefficient: veteranCoefficient(spec.veteranTier),
  };

  const division = await prisma.division.upsert({
    where: { competitionId_code: { competitionId, code } },
    create: { competitionId, code, ...data },
    update: data,
  });

  if (existing) counters.updated++;
  else counters.created++;
  cache.set(cacheKey, division.id);
  return division.id;
}

async function ensurePowerTableWeightClass(
  divisionId: string,
  disciplineId: string,
  row: AthleteMentionRow,
  dryRun: boolean,
  counters: Counters,
  cache: Map<string, string>,
): Promise<string | null> {
  const spec = weightClassSpec(row);
  const cacheKey = `${divisionId}:${disciplineId}:${spec.code}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const canQuery = !divisionId.startsWith('dry-division:');
  const existing = canQuery
    ? await prisma.weightClass.findFirst({ where: { divisionId, code: spec.code } })
    : null;

  if (dryRun) {
    if (existing) counters.updated++;
    else counters.created++;
    const id = existing?.id ?? `dry-weight-class:${cacheKey}`;
    cache.set(cacheKey, id);
    return id;
  }

  if (existing) {
    await prisma.weightClass.update({
      where: { id: existing.id },
      data: {
        disciplineId,
        nameRu: spec.nameRu,
        nameEn: spec.nameEn,
        weightMin: spec.weightMin,
        weightMax: spec.weightMax,
        order: spec.order,
      },
    });
    counters.updated++;
    cache.set(cacheKey, existing.id);
    return existing.id;
  }

  const weightClass = await prisma.weightClass.create({
    data: {
      divisionId,
      disciplineId,
      code: spec.code,
      nameRu: spec.nameRu,
      nameEn: spec.nameEn,
      weightMin: spec.weightMin,
      weightMax: spec.weightMax,
      order: spec.order,
    },
  });
  counters.created++;
  cache.set(cacheKey, weightClass.id);
  return weightClass.id;
}

async function importCompetitions(
  data: PowerTableOpenData,
  federationId: string | null,
  dryRun: boolean,
): Promise<Counters> {
  const counters: Counters = { created: 0, updated: 0, skipped: 0 };
  const rows = new Map<string, CompetitionRow>();
  for (const row of data.competitions) {
    const meetId = cleanText(row.meetId);
    const startDate = parseIsoDate(row.startDate);
    const endDate = parseIsoDate(row.endDate) ?? startDate;
    if (!meetId || !startDate || !endDate || endDate < startDate) {
      counters.skipped++;
      continue;
    }
    rows.set(meetId, row);
  }

  if (!federationId) {
    counters.skipped += rows.size;
    return counters;
  }

  for (const row of rows.values()) {
    const code = competitionCode(row);
    const startDate = parseIsoDate(row.startDate);
    const endDate = parseIsoDate(row.endDate) ?? startDate;
    if (!startDate || !endDate) {
      counters.skipped++;
      continue;
    }

    const existing = await prisma.competition.findUnique({
      where: { federationId_code: { federationId, code } },
    });

    if (dryRun) {
      if (existing) counters.updated++;
      else counters.created++;
      continue;
    }

    const competitionData = {
      nameRu: truncate(cleanText(row.name), 200) ?? `PowerTable ${cleanText(row.meetId)}`,
      nameEn: truncate(cleanText(row.name), 200) ?? `PowerTable ${cleanText(row.meetId)}`,
      description: truncate(competitionDescription(row), 4000),
      rulebook: 'ISF v5.1',
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      city: truncate(cleanText(row.city), 120),
      timezone: 'Europe/Moscow',
      status: competitionStatus(startDate),
      entryFeeKopecks: 0n,
      isOnlineRegistrationOpen: false,
    };

    if (existing) {
      await prisma.competition.update({
        where: { id: existing.id },
        data: competitionData,
      });
      counters.updated++;
    } else {
      await prisma.competition.create({
        data: {
          federationId,
          code,
          ...competitionData,
        },
      });
      counters.created++;
    }
  }

  return counters;
}

async function importNominations(
  data: PowerTableOpenData,
  federationId: string | null,
  dryRun: boolean,
): Promise<{
  divisions: Counters;
  weightClasses: Counters;
  nominations: Counters;
}> {
  const divisions: Counters = { created: 0, updated: 0, skipped: 0 };
  const weightClasses: Counters = { created: 0, updated: 0, skipped: 0 };
  const nominations: Counters = { created: 0, updated: 0, skipped: 0 };

  if (!federationId) {
    nominations.skipped = data.athleteMentions.length;
    return { divisions, weightClasses, nominations };
  }

  const discipline = await prisma.discipline.findUnique({ where: { code: 'classic_total' } });
  if (!discipline) {
    nominations.skipped = data.athleteMentions.length;
    return { divisions, weightClasses, nominations };
  }

  const competitions = await prisma.competition.findMany({
    where: { federationId, code: { startsWith: 'PT-' } },
    select: { id: true, code: true },
  });
  const competitionsByMeetId = new Map(
    competitions.map((competition) => [competition.code.replace(/^PT-/, ''), competition.id]),
  );

  const divisionCache = new Map<string, string>();
  const weightClassCache = new Map<string, string>();

  for (const row of data.athleteMentions) {
    const sportsmanId = cleanText(row.sportsmanId);
    const competitionId = competitionsByMeetId.get(cleanText(row.meetId));
    const gender = genderFromPowerTable(row.gender);
    if (!sportsmanId || !competitionId || !gender) {
      nominations.skipped++;
      continue;
    }

    const athlete = await prisma.athlete.findFirst({
      where: { federationCardNumber: `PT:${sportsmanId}` },
      select: { id: true },
    });
    if (!athlete) {
      nominations.skipped++;
      continue;
    }

    const divisionId = await ensurePowerTableDivision(
      competitionId,
      row,
      gender,
      dryRun,
      divisions,
      divisionCache,
    );
    if (!divisionId) {
      nominations.skipped++;
      continue;
    }

    const weightClassId = await ensurePowerTableWeightClass(
      divisionId,
      discipline.id,
      row,
      dryRun,
      weightClasses,
      weightClassCache,
    );
    if (!weightClassId) {
      nominations.skipped++;
      continue;
    }

    const existing =
      divisionId.startsWith('dry-division:') || weightClassId.startsWith('dry-weight-class:')
        ? null
        : await prisma.nomination.findFirst({
            where: {
              competitionId,
              athleteId: athlete.id,
              disciplineId: discipline.id,
              divisionId,
            },
          });

    if (dryRun) {
      if (existing) nominations.updated++;
      else nominations.created++;
      continue;
    }

    const bodyWeightAtWeighIn = parseNumber(row.bodyWeightKg);
    const notes = truncate(
      [
        'Imported from PowerTable public snapshot as classic_total nomination.',
        powerTableHrefUrl(row.href) ? `Source: ${powerTableHrefUrl(row.href)}` : undefined,
        cleanText(row.category) ? `PowerTable category: ${cleanText(row.category)}` : undefined,
      ]
        .filter(Boolean)
        .join('\n'),
      2000,
    );

    const nominationData = {
      weightClassId,
      declaredWeightClassId: weightClassId,
      bodyWeightAtWeighIn,
      status: 'draft' as const,
      isEntryFeePaid: false,
      paymentStatus: 'unpaid' as const,
      paidAmountKopecks: 0n,
      isMandatePassed: false,
      notes,
    };

    if (existing) {
      await prisma.nomination.update({
        where: { id: existing.id },
        data: nominationData,
      });
      nominations.updated++;
    } else {
      await prisma.nomination.create({
        data: {
          competitionId,
          athleteId: athlete.id,
          disciplineId: discipline.id,
          divisionId,
          ...nominationData,
        },
      });
      nominations.created++;
    }
  }

  return { divisions, weightClasses, nominations };
}

async function ensurePowerTableRegion(countryCode: string, countryName: string, dryRun: boolean) {
  const country = await prisma.country.findUnique({ where: { codeIso2: countryCode } });
  if (!country) {
    if (dryRun) return null;
    const createdCountry = await prisma.country.create({
      data: {
        codeIso2: countryCode,
        nameRu: countryName,
        nameEn: COUNTRY_EN[countryCode] ?? countryName,
        sortOrder: 100,
      },
    });
    return prisma.region.create({
      data: {
        countryId: createdCountry.id,
        codeIso: `PT-${countryCode}`,
        nameRu: `PowerTable ${countryName}`,
        nameEn: `PowerTable ${COUNTRY_EN[countryCode] ?? countryName}`,
        sortOrder: 1000,
      },
    });
  }

  const existingRegion = await prisma.region.findUnique({
    where: { countryId_codeIso: { countryId: country.id, codeIso: `PT-${countryCode}` } },
  });
  if (existingRegion || dryRun) return existingRegion;

  return prisma.region.create({
    data: {
      countryId: country.id,
      codeIso: `PT-${countryCode}`,
      nameRu: `PowerTable ${countryName}`,
      nameEn: `PowerTable ${COUNTRY_EN[countryCode] ?? countryName}`,
      sortOrder: 1000,
    },
  });
}

async function importCities(data: PowerTableOpenData, dryRun: boolean): Promise<Counters> {
  const counters: Counters = { created: 0, updated: 0, skipped: 0 };
  const rows = new Map<string, CityRow>();
  for (const row of data.cities.filter(validPowerTableCity)) {
    const countryCode = ISO3_TO_ISO2[cleanText(row.countryCode)]!;
    rows.set(`${countryCode}:${cleanText(row.city).toLowerCase()}`, row);
  }

  for (const row of rows.values()) {
    const countryCode = ISO3_TO_ISO2[cleanText(row.countryCode)]!;
    const cityName = cleanText(row.city);
    const country = await prisma.country.findUnique({ where: { codeIso2: countryCode } });
    const existing = country
      ? await prisma.city.findFirst({
          where: {
            nameRu: { equals: cityName, mode: 'insensitive' },
            region: { countryId: country.id },
          },
        })
      : null;

    if (existing) {
      counters.skipped++;
      continue;
    }

    const region = await ensurePowerTableRegion(countryCode, cleanText(row.countryName), dryRun);
    if (!region) {
      counters.created++;
      continue;
    }

    if (!dryRun) {
      await prisma.city.create({
        data: {
          regionId: region.id,
          nameRu: cityName,
          nameEn: cityName,
        },
      });
    }
    counters.created++;
  }

  return counters;
}

async function importAthletes(data: PowerTableOpenData, dryRun: boolean): Promise<Counters> {
  const counters: Counters = { created: 0, updated: 0, skipped: 0 };
  const competitionsByMeetId = new Map(data.competitions.map((row) => [row.meetId, row]));
  const grouped = new Map<string, AthleteMentionRow[]>();

  for (const row of data.athleteMentions) {
    const sportsmanId = cleanText(row.sportsmanId);
    if (!sportsmanId) continue;
    grouped.set(sportsmanId, [...(grouped.get(sportsmanId) ?? []), row]);
  }

  for (const [sportsmanId, rows] of grouped) {
    const row = rows[0]!;
    const dateOfBirth = parseBirthYear(row.birthYear);
    const gender = genderFromPowerTable(row.gender);
    if (!dateOfBirth || !gender) {
      counters.skipped++;
      continue;
    }

    const { lastName, firstName, middleName } = splitName(row.name);
    const cardNumber = `PT:${sportsmanId}`;
    const duplicateByCard = await prisma.athlete.findMany({
      where: { federationCardNumber: cardNumber },
      take: 2,
    });

    if (duplicateByCard.length > 1) {
      counters.skipped++;
      continue;
    }

    const existing =
      duplicateByCard[0] ??
      (await prisma.athlete.findFirst({
        where: {
          lastName,
          firstName,
          middleName: middleName ?? null,
          dateOfBirth: new Date(dateOfBirth),
          gender,
        },
      }));

    const countryCode = countryCodeForCompetition(competitionsByMeetId.get(row.meetId));
    const clubName = athleteClubName(rows);
    const athleteData = {
      lastName,
      firstName,
      ...(middleName ? { middleName } : {}),
      dateOfBirth: new Date(dateOfBirth),
      gender,
      countryCode,
      ...(clubName ? { clubName } : {}),
      federationCardNumber: cardNumber,
    };

    if (dryRun) {
      if (existing) counters.updated++;
      else counters.created++;
      continue;
    }

    if (existing) {
      await prisma.athlete.update({
        where: { id: existing.id },
        data: athleteData,
      });
      counters.updated++;
    } else {
      await prisma.athlete.create({ data: athleteData });
      counters.created++;
    }
  }

  return counters;
}

function logCounters(label: string, counters: Counters): void {
  console.log(
    `${label}: created=${counters.created}, updated=${counters.updated}, skipped=${counters.skipped}`,
  );
}

const dryRun = hasFlag('--dry-run');
const inputPath = path.resolve(readArg('--input') ?? defaultInputPath());

const snapshot = await loadSnapshot(inputPath);
console.log(`PowerTable snapshot: ${inputPath}`);
console.log(
  `Source federation: ${snapshot.source.federation} (${snapshot.source.federationCode}), collected ${snapshot.source.collectedAt}`,
);
if (dryRun) console.log('Mode: dry-run, no database writes');

const federationResult = await ensureSourceFederation(snapshot, dryRun);
const federationLikeCounters = await importFederationLikeReferences(snapshot, dryRun);
const federationTagCounters = await ensureFederationTags(dryRun);
const chapterCounters = await importChapters(snapshot, federationResult.id, dryRun);
const competitionCounters = await importCompetitions(snapshot, federationResult.id, dryRun);
const cityCounters = await importCities(snapshot, dryRun);
const athleteCounters = await importAthletes(snapshot, dryRun);
const nominationCounters = await importNominations(snapshot, federationResult.id, dryRun);

logCounters('federation', federationResult.counters);
logCounters('powertable_federations', federationLikeCounters.federations);
logCounters('powertable_clubs', federationLikeCounters.clubs);
logCounters('federation_tags', federationTagCounters);
logCounters('federation_chapters', chapterCounters);
logCounters('competitions', competitionCounters);
logCounters('competition_divisions', nominationCounters.divisions);
logCounters('competition_weight_classes', nominationCounters.weightClasses);
logCounters('nominations', nominationCounters.nominations);
logCounters('cities', cityCounters);
logCounters('athletes', athleteCounters);
console.log('judges: skipped=all, reason=PowerTable public snapshot does not expose judge catalog');
console.log('OK');

await prisma.$disconnect();
