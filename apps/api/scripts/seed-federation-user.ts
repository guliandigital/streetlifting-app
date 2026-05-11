/**
 * One-shot seed: create or update a scoped federation user.
 *
 * Reads FEDERATION_USER_* and FEDERATION_ID/FEDERATION_CODE from the API env.
 * Idempotent: re-running it refreshes only this user's password/display name
 * and ensures the requested active role assignment exists.
 *
 * Usage:
 *   FEDERATION_CODE=PWOYQ2YCE \
 *   FEDERATION_USER_EMAIL=federation@example.com \
 *   FEDERATION_USER_PASSWORD='...' \
 *   pnpm --filter=@streetlifting/api seed:federation-user
 */

import type { Role } from '@prisma/client';
import { prisma } from '../src/lib/db.js';
import { hashPassword } from '../src/lib/auth/password.js';

const allowedRoles = new Set<Role>(['federation_admin', 'secretary', 'accountant']);

const email = process.env.FEDERATION_USER_EMAIL;
const password = process.env.FEDERATION_USER_PASSWORD;
const displayName = process.env.FEDERATION_USER_DISPLAY_NAME ?? 'Federation Admin';
const federationId = process.env.FEDERATION_ID;
const federationCode = process.env.FEDERATION_CODE;
const requestedRole = (process.env.FEDERATION_USER_ROLE ?? 'federation_admin') as Role;

if (!email || !password) {
  console.error('FEDERATION_USER_EMAIL and FEDERATION_USER_PASSWORD must be set');
  process.exit(1);
}

if (!federationId && !federationCode) {
  console.error('FEDERATION_ID or FEDERATION_CODE must be set');
  process.exit(1);
}

if (!allowedRoles.has(requestedRole)) {
  console.error('FEDERATION_USER_ROLE must be one of federation_admin, secretary, accountant');
  process.exit(1);
}

const federation = await prisma.federation.findFirst({
  where: federationId ? { id: federationId } : { code: federationCode },
  select: { id: true, code: true, nameRu: true },
});

if (!federation) {
  console.error('Federation was not found by FEDERATION_ID/FEDERATION_CODE');
  process.exit(1);
}

const passwordHash = await hashPassword(password);

const user = await prisma.user.upsert({
  where: { email },
  create: { email, displayName, passwordHash, isEmailVerified: true },
  update: { passwordHash, displayName, isEmailVerified: true },
});

const existingAssignment = await prisma.roleAssignment.findFirst({
  where: {
    userId: user.id,
    role: requestedRole,
    federationId: federation.id,
    competitionId: null,
    revokedAt: null,
  },
});

if (!existingAssignment) {
  await prisma.roleAssignment.create({
    data: {
      userId: user.id,
      role: requestedRole,
      federationId: federation.id,
      competitionId: null,
    },
  });
}

console.log(
  `OK. Federation user: ${user.email} (id: ${user.id}) role: ${requestedRole} federation: ${federation.code} (${federation.id})`,
);
await prisma.$disconnect();
