import { PrismaClient } from '@prisma/client';
import { moduleLogger } from './logger.js';

const log = moduleLogger('db');

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * Singleton Prisma client. In dev with hot-reload (tsx watch), `global.__prisma`
 * survives module reloads so we don't open a new pool per restart. In prod,
 * a single instance is created on boot.
 */
export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: [
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  });

prisma.$on('warn', (e) => log.warn({ target: e.target }, e.message));
prisma.$on('error', (e) => log.error({ target: e.target }, e.message));

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export type { PrismaClient } from '@prisma/client';
export { Prisma } from '@prisma/client';
