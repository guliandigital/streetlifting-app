/**
 * Seed Russian cities mapped to ISO 3166-2 region codes. Idempotent —
 * re-running upserts by `(regionId, nameRu)`. Skips cities whose
 * region was not seeded (logged once, non-fatal).
 *
 * Requires: countries + RF regions seeds have run.
 *
 * Usage:
 *   pnpm --filter=@streetlifting/api seed:rf-cities
 */

import { prisma } from '../src/lib/db.js';
import { RF_CITIES } from './data/rf-cities.js';

const ru = await prisma.country.findUnique({ where: { codeIso2: 'RU' } });
if (!ru) {
  console.error('Country RU not found. Run seed:countries first.');
  process.exit(1);
}

const regions = await prisma.region.findMany({
  where: { countryId: ru.id },
  select: { id: true, codeIso: true },
});
const regionByCode = new Map(regions.map((r) => [r.codeIso, r.id]));

let upserted = 0;
let skipped = 0;
const skippedCodes = new Set<string>();

for (const c of RF_CITIES) {
  const regionId = regionByCode.get(c.regionCode);
  if (!regionId) {
    skipped++;
    skippedCodes.add(c.regionCode);
    continue;
  }
  await prisma.city.upsert({
    where: { regionId_nameRu: { regionId, nameRu: c.nameRu } },
    create: {
      regionId,
      nameRu: c.nameRu,
      nameEn: c.nameEn,
    },
    update: {
      nameEn: c.nameEn,
    },
  });
  upserted++;
}

console.log(`OK. Upserted ${upserted} RF cities.`);
if (skipped > 0) {
  console.warn(
    `Skipped ${skipped} cities — missing regions: ${[...skippedCodes].join(', ')}. ` +
      `Run seed:rf-regions first to fix.`,
  );
}
await prisma.$disconnect();
