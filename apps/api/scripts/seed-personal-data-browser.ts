import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const target = new URL(process.env.DATABASE_URL ?? 'file:///missing');
assert.equal(process.env.E2E_ISOLATED, '1');
assert.equal(target.hostname, '127.0.0.1');
assert.equal(target.pathname, '/streetlifting_e2e_fresh');
assert(process.env.ROOT_PASSWORD && process.env.E2E_PD_FIXTURE);
const { prisma } = await import('../src/lib/db.js');
const { hashPassword } = await import('../src/lib/auth/password.js');
try {
  const federation = await prisma.federation.create({
    data: {
      code: `BROWSER-${randomUUID()}`,
      nameRu: 'Браузерная федерация',
      nameEn: 'Browser Federation',
      countryCode: 'AM',
      securityKey: randomUUID(),
      billingTariffKopecksPerNomination: 0,
    },
  });
  const user = await prisma.user.create({
    data: {
      email: `browser-${randomUUID()}@example.test`,
      displayName: 'Browser Secretary',
      passwordHash: await hashPassword(process.env.ROOT_PASSWORD),
      roleAssignments: { create: { role: 'secretary', federationId: federation.id } },
    },
    include: { roleAssignments: true },
  });
  await writeFile(
    process.env.E2E_PD_FIXTURE,
    JSON.stringify({
      email: user.email,
      grantId: user.roleAssignments[0]!.id,
      federationId: federation.id,
    }),
  );
} finally {
  await prisma.$disconnect();
}
