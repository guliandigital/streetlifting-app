/**
 * Seed the curated ISO 3166-1 country list. Idempotent — re-running
 * upserts each row by `codeIso2`, refreshing translations and sort
 * order to match the data file. Russia gets sortOrder 0 so it always
 * ranks first in dropdowns; everything else gets sortOrder 100 so the
 * UI falls back to alphabetical EN.
 *
 * Usage:
 *   pnpm --filter=@streetlifting/api seed:countries
 */

import { prisma } from '../src/lib/db.js';
import { COUNTRIES } from './data/countries-iso.js';

let upserted = 0;
for (const c of COUNTRIES) {
  const sortOrder = c.codeIso2 === 'RU' ? 0 : 100;
  await prisma.country.upsert({
    where: { codeIso2: c.codeIso2 },
    create: {
      codeIso2: c.codeIso2,
      nameRu: c.nameRu,
      nameEn: c.nameEn,
      sortOrder,
    },
    update: {
      nameRu: c.nameRu,
      nameEn: c.nameEn,
      sortOrder,
    },
  });
  upserted++;
}

console.log(`OK. Upserted ${upserted} countries.`);
await prisma.$disconnect();
