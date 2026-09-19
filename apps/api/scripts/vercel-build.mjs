#!/usr/bin/env node
/* global console, process */
/**
 * Vercel build for @streetlifting/api.
 *
 * 1. Build the shared domain package (the API compiles against its dist).
 * 2. Generate the Prisma client on the build machine (same platform as the
 *    function runtime, so no explicit binaryTargets are needed).
 * 3. Apply migrations — production builds only. A failed migration fails the
 *    build, so the previous deployment stays live. Uses the unpooled Neon URL
 *    because Prisma Migrate needs a direct (non-pgbouncer) connection.
 * 4. Compile TypeScript to dist/, which package.json `main` points at.
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

run('pnpm', ['--filter=@streetlifting/domain', 'build']);
run('pnpm', ['exec', 'prisma', 'generate']);

if (process.env.VERCEL_ENV === 'production') {
  const directUrl =
    process.env.DATABASE_URL_UNPOOLED ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!directUrl) {
    console.error('[vercel-build] DATABASE_URL is required to run migrations');
    process.exit(1);
  }
  run('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { ...process.env, DATABASE_URL: directUrl });
} else {
  console.log('[vercel-build] skipping migrations outside production');
}

run('pnpm', ['exec', 'tsc']);
