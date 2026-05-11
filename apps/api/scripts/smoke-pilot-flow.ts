import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Headers = Record<string, string>;

interface LoginResponse {
  accessToken: string;
}

interface EntityResponse {
  [key: string]: { id: string; code?: string; nameRu?: string };
}

interface OpsResponse {
  divisions: Array<{
    id: string;
    gender: 'M' | 'F';
    weightClasses: Array<{ id: string; nameRu: string }>;
  }>;
  platforms: Array<{ id: string; name: string }>;
  judgeAssignments: Array<{ id: string; judgeId: string; platformId: string | null; role: string }>;
  nominations: Array<{ id: string }>;
  scoreboardRows: Array<{ nominationId: string; finalScore: number | null; placeInClass: number | null }>;
  accounting: { paidEntryFeeKopecks: number; weighedInNominations: number };
}

interface ScoreboardResponse {
  nominations: Array<{ id: string }>;
  rows: Array<{ nominationId: string; finalScore: number | null; placeInClass: number | null }>;
}

interface DisciplinesResponse {
  disciplines: Array<{ id: string; code: string; nameRu: string }>;
}

interface NominationResponse {
  nomination: {
    id: string;
    discipline: { components: Array<{ id: string }> };
    finalScore: number | null;
    placeInClass: number | null;
  };
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly method: string,
    readonly path: string,
    body: string,
  ) {
    super(`${method} ${path} failed with ${status}: ${body}`);
  }
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(scriptDir, '..');

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    if (!line || line.trimStart().startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for pilot smoke`);
  return value;
}

async function requestJson<T>(
  method: string,
  path: string,
  body?: unknown,
  headers: Headers = {},
): Promise<T> {
  const baseUrl = process.env.PILOT_SMOKE_API_URL ?? process.env.API_URL ?? 'http://127.0.0.1:3000';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, method, path, text);
  return (text ? JSON.parse(text) : null) as T;
}

async function requestText(method: string, path: string, headers: Headers): Promise<string> {
  const baseUrl = process.env.PILOT_SMOKE_API_URL ?? process.env.API_URL ?? 'http://127.0.0.1:3000';
  const res = await fetch(`${baseUrl}${path}`, { method, headers });
  const text = await res.text();
  if (!res.ok) throw new HttpError(res.status, method, path, text);
  return text;
}

async function requestStatus(method: string, path: string, body?: unknown, headers: Headers = {}): Promise<number> {
  const baseUrl = process.env.PILOT_SMOKE_API_URL ?? process.env.API_URL ?? 'http://127.0.0.1:3000';
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  await res.arrayBuffer();
  return res.status;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

loadEnvFile(resolve(apiDir, '.env'));

const rootEmail = process.env.PILOT_SMOKE_EMAIL ?? requireEnv('ROOT_EMAIL');
const rootPassword = process.env.PILOT_SMOKE_PASSWORD ?? requireEnv('ROOT_PASSWORD');
const suffix = Date.now().toString(36).slice(-8).toUpperCase();

const passwordSmokeEmail = `smoke-password-${suffix.toLowerCase()}@streetlifting.test`;
const passwordSmokeOld = `Smoke-${suffix}-old-password`;
const passwordSmokeNext = `Smoke-${suffix}-new-password`;

await requestJson<{ user: { id: string } }>('POST', '/auth/register', {
  email: passwordSmokeEmail,
  displayName: `Smoke Password ${suffix}`,
  password: passwordSmokeOld,
});
const passwordSmokeLogin = await requestJson<LoginResponse>('POST', '/auth/login', {
  email: passwordSmokeEmail,
  password: passwordSmokeOld,
});
await requestJson<{ status: 'ok'; revokedRefreshTokens: number }>(
  'PATCH',
  '/auth/password',
  { currentPassword: passwordSmokeOld, newPassword: passwordSmokeNext },
  { authorization: `Bearer ${passwordSmokeLogin.accessToken}` },
);
const oldPasswordStatus = await requestStatus('POST', '/auth/login', {
  email: passwordSmokeEmail,
  password: passwordSmokeOld,
});
assert(oldPasswordStatus === 401, 'old password still works after change');
await requestJson<LoginResponse>('POST', '/auth/login', {
  email: passwordSmokeEmail,
  password: passwordSmokeNext,
});

const login = await requestJson<LoginResponse>('POST', '/auth/login', {
  email: rootEmail,
  password: rootPassword,
});
const auth = { authorization: `Bearer ${login.accessToken}` };

const federationCode = `SMK${suffix}`;
const competitionCode = `PILOT${suffix}`;
const federation = (await requestJson<EntityResponse>(
  'POST',
  '/federations',
  {
    code: federationCode,
    nameRu: `Smoke федерация ${suffix}`,
    nameEn: `Smoke Federation ${suffix}`,
    countryCode: 'AM',
    billingTariffKopecksPerNomination: 5000,
  },
  auth,
)).federation;

const competition = (await requestJson<EntityResponse>(
  'POST',
  '/competitions',
  {
    federationId: federation.id,
    code: competitionCode,
    nameRu: `Smoke пилот ${suffix}`,
    nameEn: `Smoke Pilot ${suffix}`,
    rulebook: 'ISF v5.1',
    startDate: '2026-06-01',
    endDate: '2026-06-01',
    city: 'Yerevan',
    venue: 'Smoke Hall',
    timezone: 'Asia/Yerevan',
    status: 'draft',
    entryFeeKopecks: 150000,
    isOnlineRegistrationOpen: false,
  },
  auth,
)).competition;

const setup = await requestJson<{ setup: { divisions: number; weightClasses: number } }>(
  'POST',
  `/competitions/${competition.id}/setup/default`,
  {},
  auth,
);
assert(setup.setup.divisions >= 2, 'default setup did not create divisions');
assert(setup.setup.weightClasses > 0, 'default setup did not create weight classes');

const ops = await requestJson<OpsResponse>('GET', `/competitions/${competition.id}/ops`, undefined, auth);
const division = ops.divisions.find((item) => item.gender === 'M');
assert(division, 'male division not found after default setup');
const weightClass = division.weightClasses[0];
assert(weightClass, 'weight class not found after default setup');
const platform = ops.platforms[0];
assert(platform, 'platform not found after default setup');

const judge = (await requestJson<EntityResponse>(
  'POST',
  '/judges',
  {
    lastName: `Judge${suffix}`,
    firstName: 'Smoke',
    categoryRu: 'РК',
    cityRegion: 'Yerevan',
  },
  auth,
)).judge;

const tempJudgeAssignment = (await requestJson<{
  judgeAssignment: { id: string; judgeId: string; platformId: string | null; role: string };
}>(
  'POST',
  `/competitions/${competition.id}/judge-assignments`,
  { judgeId: judge.id, platformId: null, role: 'side_left' },
  auth,
)).judgeAssignment;
assert(tempJudgeAssignment.role === 'side_left', 'global judge assignment was not created');
await requestJson<{ deleted: true }>('DELETE', `/judge-assignments/${tempJudgeAssignment.id}`, undefined, auth);

const judgeAssignment = (await requestJson<{
  judgeAssignment: { id: string; judgeId: string; platformId: string | null; role: string };
}>(
  'POST',
  `/competitions/${competition.id}/judge-assignments`,
  { judgeId: judge.id, platformId: platform.id, role: 'head' },
  auth,
)).judgeAssignment;
assert(judgeAssignment.platformId === platform.id, 'platform judge assignment was not scoped to platform');
const duplicateJudgeAssignmentStatus = await requestStatus(
  'POST',
  `/competitions/${competition.id}/judge-assignments`,
  { judgeId: judge.id, platformId: platform.id, role: 'head' },
  auth,
);
assert(duplicateJudgeAssignmentStatus === 409, 'duplicate judge assignment was accepted');

const discipline = (await requestJson<DisciplinesResponse>('GET', '/disciplines', undefined, auth)).disciplines.find(
  (item) => item.code === 'classic_pu',
);
assert(discipline, 'classic_pu discipline not found; run release:seed first');

const athlete = (await requestJson<EntityResponse>(
  'POST',
  '/athletes',
  {
    lastName: `Smoke${suffix}`,
    firstName: 'Pilot',
    dateOfBirth: '1996-01-01',
    gender: 'M',
    countryCode: 'AM',
    city: 'Yerevan',
    clubName: 'Smoke Club',
  },
  auth,
)).athlete;

const nomination = (await requestJson<NominationResponse>(
  'POST',
  `/competitions/${competition.id}/nominations`,
  {
    athleteId: athlete.id,
    disciplineId: discipline.id,
    divisionId: division.id,
    declaredWeightClassId: weightClass.id,
    weightClassId: weightClass.id,
    status: 'draft',
    paymentStatus: 'unpaid',
    paidAmountKopecks: 0,
    isMandatePassed: false,
  },
  auth,
)).nomination;

try {
  await requestJson(
    'POST',
    `/competitions/${competition.id}/nominations`,
    {
      athleteId: athlete.id,
      disciplineId: discipline.id,
      divisionId: division.id,
      declaredWeightClassId: weightClass.id,
      weightClassId: weightClass.id,
    },
    auth,
  );
  throw new Error('duplicate nomination was accepted');
} catch (err) {
  if (!(err instanceof HttpError) || err.status !== 409) throw err;
}

const draw = await requestJson<{ draw: { assigned: number } }>(
  'POST',
  `/competitions/${competition.id}/nominations/draw`,
  { overwrite: true },
  auth,
);
assert(draw.draw.assigned === 1, 'draw did not assign exactly one nomination');

const patched = (await requestJson<NominationResponse>(
  'PATCH',
  `/nominations/${nomination.id}`,
  {
    bodyWeightAtWeighIn: 82.4,
    paymentStatus: 'paid',
    paidAmountKopecks: 150000,
    paymentMethod: 'cash',
    isMandatePassed: true,
  },
  auth,
)).nomination;
assert(patched.discipline.components[0], 'nomination response has no discipline component');

const plan = await requestJson<{ plan: { flights: Array<{ estimatedMinutes: number }> } }>(
  'POST',
  `/competitions/${competition.id}/flights/auto-plan`,
  { maxNominationsPerGroup: 12, minutesPerAttempt: 1, breakBetweenFlightsMinutes: 5 },
  auth,
);
assert(plan.plan.flights.length === 1, 'auto-plan did not create one flight');

const componentId = patched.discipline.components[0].id;
const attempt = await requestJson<NominationResponse>(
  'PUT',
  `/nominations/${nomination.id}/attempts/${componentId}/1`,
  {
    componentId,
    attemptNumber: 1,
    weightKg: 30,
    result: 'good_lift',
    judgeDecisions: [
      { judge: 'left', decision: 'good' },
      { judge: 'center', decision: 'good' },
      { judge: 'right', decision: 'good' },
    ],
  },
  auth,
);
assert(attempt.nomination.finalScore === 30, 'finalScore was not recalculated after attempt');
assert(attempt.nomination.placeInClass === 1, 'placeInClass was not recalculated after attempt');

const scoreboard = await requestJson<ScoreboardResponse>('GET', `/competitions/${competition.id}/scoreboard`, undefined, auth);
const finalOps = await requestJson<OpsResponse>('GET', `/competitions/${competition.id}/ops`, undefined, auth);
assert(scoreboard.nominations.length === 1, 'scoreboard nominations count mismatch');
assert(scoreboard.rows.length === 1, 'scoreboard rows count mismatch');
assert(finalOps.accounting.weighedInNominations === 1, 'accounting weighed-in count mismatch');
assert(finalOps.accounting.paidEntryFeeKopecks === 150000, 'accounting paid amount mismatch');
assert(finalOps.judgeAssignments.length === 1, 'judge assignment count mismatch');
assert(finalOps.judgeAssignments[0]?.judgeId === judge.id, 'judge assignment judge mismatch');

const protocol = await requestText('GET', `/competitions/${competition.id}/protocol.csv`, auth);
const accounting = await requestText('GET', `/competitions/${competition.id}/accounting.csv`, auth);
assert(protocol.includes(`Smoke${suffix}`), 'protocol export does not include athlete');
assert(accounting.includes(competitionCode), 'accounting export does not include competition code');

console.log(
  JSON.stringify(
    {
      status: 'ok',
      federationCode,
      competitionCode,
      nominations: scoreboard.nominations.length,
      scoreboardRows: scoreboard.rows.length,
      finalScore: attempt.nomination.finalScore,
      judgeAssignments: finalOps.judgeAssignments.length,
      passwordChange: 'ok',
      protocolBytes: protocol.length,
      accountingBytes: accounting.length,
    },
    null,
    2,
  ),
);
