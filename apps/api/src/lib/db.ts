import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client. In dev with hot-reload (tsx watch), `global.__prisma`
 * survives module reloads so we don't open a new pool per restart. In prod,
 * a single instance is created on boot.
 *
 * Logs are emitted to stdout/stderr at warn+ level by Prisma directly. Pino
 * captures them in the operational log via process.stderr piping in prod.
 */
export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export type { PrismaClient } from '@prisma/client';
export { Prisma } from '@prisma/client';
