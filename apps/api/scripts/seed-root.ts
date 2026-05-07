/**
 * One-shot seed: create or update the platform's root user with the
 * `platform_admin` role.
 *
 * Reads ROOT_EMAIL and ROOT_PASSWORD from the API's .env. Idempotent —
 * re-running it just refreshes the password and ensures the role
 * assignment exists.
 *
 * Usage:
 *   pnpm --filter=@streetlifting/api seed:root
 */

import { prisma } from '../src/lib/db.js';
import { hashPassword } from '../src/lib/auth/password.js';

const email = process.env.ROOT_EMAIL;
const password = process.env.ROOT_PASSWORD;
const displayName = process.env.ROOT_DISPLAY_NAME ?? 'Platform Admin';

if (!email || !password) {
  console.error('ROOT_EMAIL and ROOT_PASSWORD must be set in apps/api/.env');
  process.exit(1);
}

const passwordHash = await hashPassword(password);

const user = await prisma.user.upsert({
  where: { email },
  create: { email, displayName, passwordHash, isEmailVerified: true },
  update: { passwordHash, displayName },
});

const existingAssignment = await prisma.roleAssignment.findFirst({
  where: { userId: user.id, role: 'platform_admin', revokedAt: null },
});
if (!existingAssignment) {
  await prisma.roleAssignment.create({
    data: { userId: user.id, role: 'platform_admin' },
  });
}

console.log(`OK. Root user: ${user.email}  (id: ${user.id})  role: platform_admin`);
await prisma.$disconnect();
