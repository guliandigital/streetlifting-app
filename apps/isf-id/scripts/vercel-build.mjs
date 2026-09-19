#!/usr/bin/env node
/* global console, process */
/**
 * Vercel build for @streetlifting/isf-id. Same shape as apps/api: generate
 * the Prisma client on the build machine, migrate on production builds only
 * (direct/unpooled URL), then compile to dist/.
 */
import { spawnSync } from 'node:child_process';

function run(command, args, env = process.env) {
  console.log(`[vercel-build] ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    env,
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run('pnpm', ['exec', 'prisma', 'generate', '--schema', 'prisma/schema.prisma']);

if (process.env.VERCEL_ENV === 'production') {
  const directUrl =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!directUrl) {
    console.error('[vercel-build] DATABASE_URL is required to run migrations');
    process.exit(1);
  }
  run('pnpm', ['exec', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
    ...process.env,
    DATABASE_URL: directUrl,
  });
} else {
  console.log('[vercel-build] skipping migrations outside production');
}

run('pnpm', ['exec', 'tsc']);
