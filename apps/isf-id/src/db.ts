import { PrismaClient } from '../generated/prisma/index.js';

declare global {
  var __isfIdPrisma: PrismaClient | undefined;
}

/** Neon pooled endpoints need `pgbouncer=true` for Prisma (transaction-mode PgBouncer). */
function normalizeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('-pooler') && !parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

const datasourceUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);

export const prisma =
  global.__isfIdPrisma ??
  new PrismaClient({
    log: ['warn', 'error'],
    ...(datasourceUrl ? { datasourceUrl } : {}),
  });

if (process.env.NODE_ENV !== 'production') global.__isfIdPrisma = prisma;
