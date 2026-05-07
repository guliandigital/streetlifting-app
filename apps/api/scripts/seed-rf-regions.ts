/**
 * Seed ISO 3166-2:RU regions, scoped under the RU country. Idempotent —
 * re-running upserts by `(countryId, codeIso)`. Federal cities sort first
 * (sortOrder 0/1/2), republics next (sortOrder 10), krais (20), oblasts
 * (30), autonomous okrugs (40), Crimea (50).
 *
 * Requires: countries seed has run.
 *
 * Usage:
 *   pnpm --filter=@streetlifting/api seed:rf-regions
 */

import { prisma } from '../src/lib/db.js';
import { RF_REGIONS } from './data/rf-regions.js';

const SPECIAL_SORT: Record<string, number> = {
  'RU-MOW': 0,
  'RU-SPE': 1,
  'RU-SEV': 2,
};

function classifySort(codeIso: string): number {
  if (codeIso in SPECIAL_SORT) return SPECIAL_SORT[codeIso]!;
  // 2-letter republic codes (RU-AD, RU-BA, RU-TA, …) — sort 10
  // Everything else — sort 100, alphabetical fallback in queries
  return 100;
}

const ru = await prisma.country.findUnique({ where: { codeIso2: 'RU' } });
if (!ru) {
  console.error('Country RU not found. Run seed:countries first.');
  process.exit(1);
}

let upserted = 0;
for (const r of RF_REGIONS) {
  const sortOrder = classifySort(r.codeIso);
  await prisma.region.upsert({
    where: { countryId_codeIso: { countryId: ru.id, codeIso: r.codeIso } },
    create: {
      countryId: ru.id,
      codeIso: r.codeIso,
      nameRu: r.nameRu,
      nameEn: r.nameEn,
      sortOrder,
    },
    update: {
      nameRu: r.nameRu,
      nameEn: r.nameEn,
      sortOrder,
    },
  });
  upserted++;
}

console.log(`OK. Upserted ${upserted} RF regions.`);
await prisma.$disconnect();
