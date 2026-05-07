/**
 * Seed initial reference values into the `lookup_value` table.
 * Idempotent — re-running upserts by `(kind, code)` and refreshes
 * translations + sortOrder to match the data file.
 *
 * Usage:
 *   pnpm --filter=@streetlifting/api seed:lookup-values
 */

import { prisma } from '../src/lib/db.js';
import { LOOKUP_VALUES } from './data/lookup-values.js';

let upserted = 0;
for (const v of LOOKUP_VALUES) {
  await prisma.lookupValue.upsert({
    where: { kind_code: { kind: v.kind, code: v.code } },
    create: {
      kind: v.kind,
      code: v.code,
      nameRu: v.nameRu,
      nameEn: v.nameEn,
      sortOrder: v.sortOrder,
    },
    update: {
      nameRu: v.nameRu,
      nameEn: v.nameEn,
      sortOrder: v.sortOrder,
    },
  });
  upserted++;
}

console.log(`OK. Upserted ${upserted} lookup values.`);
await prisma.$disconnect();
