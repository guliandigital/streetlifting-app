/**
 * Import the public PowerTable snapshot into operational reference tables.
 *
 * The importer is intentionally idempotent:
 * - federation is keyed by PowerTable federation code
 * - public PowerTable federation-like references are keyed by PTF:<code> / PTC:<code>
 * - chapters are keyed by federation + PowerTable region id
 * - athletes are keyed by federationCardNumber = PT:<sportsmanId>
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
  regionId: string;
  regionName: string;
  meetId: string;
}

interface AthleteMentionRow {
  meetId: string;
  sportsmanId: string;
  name: string;
  birthYear: string;
  team: string;
  gender: string;
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

function powerTableUrl(row: FederationRow): string | undefined {
  const href = cleanText(row.href);
  if (!href) return undefined;
  if (href.startsWith('http://') || href.startsWith('https://')) return truncate(href, 2048);
  if (href.startsWith('/')) return truncate(`https://powertable.ru${href}`, 2048);
  return truncate(`https://powertable.ru/api/hs/p/${href}`, 2048);
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
const cityCounters = await importCities(snapshot, dryRun);
const athleteCounters = await importAthletes(snapshot, dryRun);

logCounters('federation', federationResult.counters);
logCounters('powertable_federations', federationLikeCounters.federations);
logCounters('powertable_clubs', federationLikeCounters.clubs);
logCounters('federation_tags', federationTagCounters);
logCounters('federation_chapters', chapterCounters);
logCounters('cities', cityCounters);
logCounters('athletes', athleteCounters);
console.log('judges: skipped=all, reason=PowerTable public snapshot does not expose judge catalog');
console.log('OK');

await prisma.$disconnect();
