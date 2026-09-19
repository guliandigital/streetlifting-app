import { PrismaClient } from '@prisma/client';

declare global {
  var __prisma: PrismaClient | undefined;
}

/**
 * Neon's pooled endpoints run PgBouncer in transaction mode. Prisma must be
 * told (`pgbouncer=true`) so it does not rely on prepared statements. The
 * Vercel/Neon integration hands us the pooled URL without that flag, so add
 * it here rather than depending on how the env var was typed.
 */
export function normalizeDatabaseUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const pooled = parsed.hostname.includes('-pooler') || parsed.searchParams.has('pgbouncer');
    if (pooled && !parsed.searchParams.has('pgbouncer'))
      parsed.searchParams.set('pgbouncer', 'true');
    if (pooled && !parsed.searchParams.has('connection_limit')) {
      // One function instance ↔ a handful of connections; the pooler multiplexes.
      parsed.searchParams.set('connection_limit', '5');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Singleton Prisma client. In dev with hot-reload (tsx watch), `global.__prisma`
 * survives module reloads so we don't open a new pool per restart. In prod,
 * a single instance is created on boot (per function instance on Vercel).
 *
 * Logs are emitted to stdout/stderr at warn+ level by Prisma directly. Pino
 * captures them in the operational log via process.stderr piping in prod.
 */
const datasourceUrl = normalizeDatabaseUrl(process.env.DATABASE_URL);

export const prisma: PrismaClient =
  global.__prisma ??
  new PrismaClient({
    log: ['warn', 'error'],
    ...(datasourceUrl ? { datasourceUrl } : {}),
  });

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

export type { PrismaClient } from '@prisma/client';
export { Prisma } from '@prisma/client';
