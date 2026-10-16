import { PrismaClient } from '../generated/prisma/index.js';

declare global {
  var __isfIdPrisma: PrismaClient | undefined;
}

/** Allow Neon cold starts and support transaction-mode pooled connections. */
export function normalizeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('-pooler') && !parsed.searchParams.has('pgbouncer')) {
      parsed.searchParams.set('pgbouncer', 'true');
    }
    if (parsed.hostname.endsWith('.neon.tech') && !parsed.searchParams.has('connect_timeout')) {
      parsed.searchParams.set('connect_timeout', '15');
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
