import { spawnSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, writeFile, cp, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Opt in explicitly: this command creates a NEW local cluster and applies migrations.
if (!process.argv.includes('--run')) {
  console.log('Use --run to create an isolated local PostgreSQL cluster and run DB checks.');
  process.exit(0);
}
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const api = join(root, 'apps/api');
const pgBin =
  process.env.PG_BIN ?? (process.platform === 'win32' ? 'C:/Program Files/PostgreSQL/16/bin' : '');
const binary = (name) => join(pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`);
const output = join(root, 'output/personal-data-db');
await mkdir(output, { recursive: true });
const runDir = await mkdtemp(join(output, 'run-'));
const dataDir = join(runDir, 'postgres');
const password = randomBytes(32).toString('hex');
const passwordFile = join(runDir, 'postgres-password');
await writeFile(passwordFile, password, { mode: 0o600 });
async function freePort() {
  const listener = createServer();
  await new Promise((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const port = listener.address().port;
  await new Promise((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}
const port = await freePort();

// Allow only operating-system variables; no inherited DB, SMTP, telemetry, cloud or auth settings.
const env = {};
for (const [key, value] of Object.entries(process.env)) {
  if (
    /^(path|systemroot|windir|comspec|pathext|temp|tmp|home|userprofile|appdata|localappdata|programfiles|programfiles\(x86\))$/i.test(
      key,
    )
  )
    env[key] = value;
}
Object.assign(env, {
  NODE_ENV: 'test',
  PGHOST: '127.0.0.1',
  PGPORT: String(port),
  PGUSER: 'postgres',
  PGPASSWORD: password,
  PD_DB_E2E: '1',
  LOG_LEVEL: 'error',
});
const run = (command, args, cwd = root, extraEnv = {}, timeout = 300_000) => {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...env, ...extraEnv },
    stdio: 'inherit',
    windowsHide: true,
    timeout,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
};
const prisma = join(api, 'node_modules/prisma/build/index.js');
const tsx = join(api, 'node_modules/tsx/dist/cli.mjs');
const databaseUrl = (name) =>
  `postgresql://postgres:${password}@127.0.0.1:${port}/${name}?schema=public`;
const migrate = (name, schema) =>
  run(process.execPath, [prisma, 'migrate', 'deploy', '--schema', schema], runDir, {
    DATABASE_URL: databaseUrl(name),
  });
const schema = join(api, 'prisma/schema.prisma');
const newest = '20260919020000_pd_operator_and_access_acknowledgment';
let initialized = false;
try {
  run(binary('initdb'), [
    '-D',
    dataDir,
    '-U',
    'postgres',
    '--auth=scram-sha-256',
    '--pwfile',
    passwordFile,
    '--encoding=UTF8',
    '--locale=C',
  ]);
  initialized = true;
  run(binary('pg_ctl'), [
    '-D',
    dataDir,
    '-l',
    join(runDir, 'postgres.log'),
    '-o',
    `-h 127.0.0.1 -p ${port}`,
    '-w',
    'start',
  ]);
  // A separate database for both paths, never an existing local instance.
  for (const name of ['streetlifting_e2e_fresh', 'streetlifting_e2e_upgrade']) {
    run(binary('createdb'), [name]);
  }
  migrate('streetlifting_e2e_fresh', schema);
  run(process.execPath, [tsx, join(api, 'scripts/check-personal-data-db.ts')], runDir, {
    DATABASE_URL: databaseUrl('streetlifting_e2e_fresh'),
  });

  // Reconstruct the immediately preceding migration set, without modifying tracked files.
  const previous = join(runDir, 'previous');
  await mkdir(join(previous, 'migrations'), { recursive: true });
  await cp(schema, join(previous, 'schema.prisma'));
  for (const entry of await readdir(join(api, 'prisma/migrations'))) {
    if (entry !== newest)
      await cp(join(api, 'prisma/migrations', entry), join(previous, 'migrations', entry), {
        recursive: true,
      });
  }
  migrate('streetlifting_e2e_upgrade', join(previous, 'schema.prisma'));
  const legacySql = join(runDir, 'legacy.sql');
  await writeFile(
    legacySql,
    `
INSERT INTO "user" (id, email, "displayName", "updatedAt")
VALUES ('00000000-0000-4000-8000-000000000900', 'legacy@example.test', 'Legacy', NOW());
INSERT INTO role_assignment (id, "userId", role)
VALUES ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-000000000900', 'secretary');
`,
  );
  run(binary('psql'), [
    '-d',
    'streetlifting_e2e_upgrade',
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    legacySql,
  ]);
  migrate('streetlifting_e2e_upgrade', schema);
  run(process.execPath, [tsx, join(api, 'scripts/check-personal-data-db.ts')], runDir, {
    DATABASE_URL: databaseUrl('streetlifting_e2e_upgrade'),
    PD_UPGRADE_CHECK: '1',
  });
  const fullBrowserSuite = process.argv.includes('--browser-all');
  const browser = fullBrowserSuite || process.argv.includes('--browser');
  if (browser) {
    const apiPort = await freePort();
    let webPort = await freePort();
    while (webPort === apiPort) webPort = await freePort();
    const browserEnv = {
      DATABASE_URL: databaseUrl('streetlifting_e2e_fresh'),
      E2E_ISOLATED: '1',
      E2E_FULL_SUITE: fullBrowserSuite ? '1' : '0',
      E2E_WEB_URL: `http://127.0.0.1:${webPort}`,
      E2E_API_URL: `http://127.0.0.1:${apiPort}`,
      CORS_ORIGIN: `http://127.0.0.1:${webPort}`,
      E2E_OUTPUT_DIR: runDir,
      E2E_PD_FIXTURE: join(runDir, 'browser-fixture.json'),
      E2E_BROWSER_CHANNEL: process.env.E2E_BROWSER_CHANNEL ?? '',
      ROOT_EMAIL: 'root@e2e.local',
      ROOT_PASSWORD: randomBytes(24).toString('hex'),
      JWT_SECRET: randomBytes(48).toString('hex'),
      STORAGE_DRIVER: 'fs',
      STORAGE_DIR: join(runDir, 'uploads'),
      LIVE_UPDATES_WS: 'false',
      RATE_LIMIT_MAX: '600',
    };
    for (const seed of [
      'seed-disciplines',
      ...(fullBrowserSuite
        ? ['seed-countries', 'seed-rf-regions', 'seed-rf-cities', 'seed-lookup-values']
        : []),
      'seed-root',
      'seed-personal-data-browser',
    ]) {
      run(process.execPath, [tsx, join(api, `scripts/${seed}.ts`)], runDir, browserEnv);
    }
    run(
      process.execPath,
      [
        join(root, 'apps/web/node_modules/@playwright/test/cli.js'),
        'test',
        '--config',
        'playwright.isolated.config.ts',
      ],
      join(root, 'apps/web'),
      browserEnv,
      900_000,
    );
  }
  await writeFile(
    join(runDir, 'result.json'),
    JSON.stringify(
      {
        passed: true,
        checkedAt: new Date().toISOString(),
        paths: ['fresh', 'upgrade'],
        browser,
        fullBrowserSuite,
      },
      null,
      2,
    ),
  );
  console.log(`PASS fresh + upgrade DB checks. Evidence: ${join(runDir, 'result.json')}`);
} finally {
  // Stops only the cluster created in this run. Preserve files for inspection; no reset/drop/delete.
  if (initialized) run(binary('pg_ctl'), ['-D', dataDir, '-m', 'fast', '-w', 'stop']);
}
