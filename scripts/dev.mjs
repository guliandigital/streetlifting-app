#!/usr/bin/env node
/* global console, fetch, setTimeout */
import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const apiDir = path.join(root, 'apps', 'api');
const webDir = path.join(root, 'apps', 'web');
const apiEnvPath = path.join(apiDir, '.env');
const apiEnvExamplePath = path.join(apiDir, '.env.example');

const flags = new Set(process.argv.slice(2));
const skipPrepare = flags.has('--skip-prepare') || process.env.STREETLIFTING_SKIP_PREPARE === '1';
const skipSeed = flags.has('--skip-seed') || process.env.STREETLIFTING_SKIP_SEED === '1';
const exitAfterReady = flags.has('--once') || flags.has('--check');
const apiPortOverride = process.env.STREETLIFTING_API_PORT ?? process.env.PORT;
const webPort = process.env.STREETLIFTING_WEB_PORT ?? '1420';

const commands = {
  tsc: path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'),
  prisma: path.join(apiDir, 'node_modules', 'prisma', 'build', 'index.js'),
  tsx: path.join(apiDir, 'node_modules', 'tsx', 'dist', 'cli.mjs'),
  vite: path.join(webDir, 'node_modules', 'vite', 'bin', 'vite.js'),
};

function info(message) {
  console.log(`[streetlifting:dev] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

function assertFile(filePath, hint) {
  if (!fs.existsSync(filePath)) {
    fail(`${hint} is missing at ${filePath}. Run pnpm install first.`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    env: options.env ?? process.env,
    stdio: options.stdio ?? 'inherit',
    shell: false,
    timeout: options.timeoutMs,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`${command} ${args.join(' ')} failed with exit code ${result.status}`);
  }
}

function parseEnvText(text) {
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = rawLine.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    let value = match[2] ?? '';
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return parseEnvText(fs.readFileSync(filePath, 'utf8'));
}

function setEnvLine(lines, key, value) {
  const escaped = value.includes(' ') ? `"${value.replaceAll('"', '\\"')}"` : value;
  const matcher = new RegExp(`^\\s*${key}\\s*=`);
  const index = lines.findIndex((line) => matcher.test(line));
  if (index >= 0) {
    lines[index] = `${key}=${escaped}`;
  } else {
    lines.push(`${key}=${escaped}`);
  }
}

function ensureApiEnv() {
  if (!fs.existsSync(apiEnvPath)) {
    if (!fs.existsSync(apiEnvExamplePath)) {
      fail(`API env example is missing at ${apiEnvExamplePath}`);
    }
    fs.copyFileSync(apiEnvExamplePath, apiEnvPath);
    info('created apps/api/.env from .env.example');
  }

  const lines = fs.readFileSync(apiEnvPath, 'utf8').split(/\r?\n/);
  const env = parseEnvText(lines.join('\n'));
  const defaults = {
    NODE_ENV: 'development',
    PORT: '3000',
    HOST: '0.0.0.0',
    CORS_ORIGIN: 'http://localhost:1420',
    RATE_LIMIT_MAX: '600',
    RATE_LIMIT_TIME_WINDOW: '1 minute',
    ROOT_EMAIL: 'admin@streetlifting.local',
    ROOT_PASSWORD: 'StreetliftingLocal!2026',
    ROOT_DISPLAY_NAME: 'Platform Admin',
  };

  let changed = false;
  for (const [key, value] of Object.entries(defaults)) {
    if (!env[key]) {
      setEnvLine(lines, key, value);
      env[key] = value;
      changed = true;
    }
  }

  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    const jwtSecret = crypto.randomBytes(48).toString('base64');
    setEnvLine(lines, 'JWT_SECRET', jwtSecret);
    env.JWT_SECRET = jwtSecret;
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(apiEnvPath, `${lines.join('\n').replace(/\s+$/u, '')}\n`);
    info('updated apps/api/.env with local development defaults');
  }

  const apiEnv = { ...readEnvFile(apiEnvPath), ...process.env };
  if (apiPortOverride) apiEnv.PORT = apiPortOverride;

  if (!apiEnv.DATABASE_URL) {
    fail(
      [
        'DATABASE_URL is not set in apps/api/.env.',
        'Local development uses a Neon development branch (no Docker):',
        '  1. vercel link --cwd apps/api   (once, picks the streetlifting-api project)',
        '  2. vercel env pull apps/api/.env --environment=development --cwd apps/api',
        'or paste a Postgres connection string into apps/api/.env manually.',
      ].join('\n'),
    );
  }
  return apiEnv;
}

async function waitUntil(label, check, timeoutMs, intervalMs = 2_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  fail(`Timed out while waiting for ${label}`);
}

function canConnect(host, port, timeoutMs = 1_000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const finish = (ok) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function ensurePortFree(port, label) {
  if (await canConnect('127.0.0.1', port, 500)) {
    fail(`${label} port ${port} is already in use. Stop the old dev server or change the port.`);
  }
}

function node(script, args, options = {}) {
  run(process.execPath, [script, ...args], options);
}

async function prepare(apiEnv) {
  if (skipPrepare) {
    info('skipping database and seed preparation because --skip-prepare was passed');
    return;
  }

  info('building shared domain package');
  node(commands.tsc, ['-p', path.join(root, 'packages', 'domain', 'tsconfig.json')]);

  info('generating Prisma client');
  node(commands.prisma, ['generate'], { cwd: apiDir, env: apiEnv });

  info('applying database migrations');
  // Prisma Migrate needs a direct connection; prefer the unpooled URL when the
  // env came from the Neon integration.
  const migrateEnv = {
    ...apiEnv,
    DATABASE_URL: apiEnv.DATABASE_URL_UNPOOLED || apiEnv.DATABASE_URL,
  };
  node(commands.prisma, ['migrate', 'deploy'], { cwd: apiDir, env: migrateEnv });

  if (skipSeed) {
    info('skipping seed scripts because --skip-seed was passed');
    return;
  }

  const seedScripts = [
    'seed-disciplines.ts',
    'seed-countries.ts',
    'seed-rf-regions.ts',
    'seed-rf-cities.ts',
    'seed-lookup-values.ts',
    'seed-root.ts',
  ];

  for (const seedScript of seedScripts) {
    info(`running ${seedScript}`);
    node(commands.tsx, [path.join('scripts', seedScript)], { cwd: apiDir, env: apiEnv });
  }
}

function startService(name, script, args, options = {}) {
  info(`starting ${name}`);
  const child = spawn(process.execPath, [script, ...args], {
    cwd: options.cwd,
    env: options.env,
    stdio: 'inherit',
    shell: false,
  });
  child.once('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      console.error(`[streetlifting:dev] ${name} exited with code ${code}`);
    } else if (signal) {
      console.error(`[streetlifting:dev] ${name} stopped by ${signal}`);
    }
  });
  return child;
}

async function httpOk(url) {
  try {
    const response = await fetch(url, { cache: 'no-store' });
    return response.ok;
  } catch {
    return false;
  }
}

async function main() {
  for (const [name, filePath] of Object.entries(commands)) {
    assertFile(filePath, name);
  }

  const apiEnv = ensureApiEnv();
  await ensurePortFree(Number(apiEnv.PORT ?? 3000), 'API');
  await ensurePortFree(Number(webPort), 'Web');
  await prepare(apiEnv);

  const children = [];
  const api = startService('API', commands.tsx, ['watch', 'src/index.ts'], {
    cwd: apiDir,
    env: apiEnv,
  });
  children.push(api);

  await waitUntil(
    'API health',
    () => httpOk(`http://127.0.0.1:${apiEnv.PORT ?? 3000}/health`),
    60_000,
  );

  const webEnv = {
    ...process.env,
    VITE_API_PROXY_TARGET: `http://127.0.0.1:${apiEnv.PORT ?? 3000}`,
  };
  const web = startService('Web', commands.vite, ['--host', '127.0.0.1', '--port', webPort], {
    cwd: webDir,
    env: webEnv,
  });
  children.push(web);

  await waitUntil('Web app', () => httpOk(`http://127.0.0.1:${webPort}/login`), 60_000);

  const shutdown = () => {
    for (const child of children) {
      if (!child.killed) child.kill();
    }
  };

  info('');
  info('ready');
  info(`API: http://127.0.0.1:${apiEnv.PORT ?? 3000}/health`);
  info(`Web: http://127.0.0.1:${webPort}/login`);
  info(`Local root email: ${apiEnv.ROOT_EMAIL}`);
  info('Local root password is stored in apps/api/.env');

  if (exitAfterReady) {
    info('verification mode complete; stopping API and Web');
    shutdown();
    return;
  }

  info('Press Ctrl+C to stop API and Web.');
  process.once('SIGINT', () => {
    shutdown();
    process.exit(0);
  });
  process.once('SIGTERM', () => {
    shutdown();
    process.exit(0);
  });

  await new Promise((resolve) => {
    for (const child of children) child.once('exit', resolve);
  });
  shutdown();
}

main().catch((err) => {
  console.error(`[streetlifting:dev] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
