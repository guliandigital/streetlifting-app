import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertNoForbiddenExportKeys } from '../src/lib/privacy-allowlist.js';
import { prisma } from '../src/lib/db.js';
import { hashPassword } from '../src/lib/auth/password.js';
import { signAccessToken } from '../src/lib/auth/tokens.js';

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
  scoreboardRows: Array<{
    nominationId: string;
    finalScore: number | null;
    placeInClass: number | null;
  }>;
  accounting: { paidEntryFeeKopecks: number; weighedInNominations: number };
}

interface ScoreboardResponse {
  nominations: Array<{ id: string }>;
  rows: Array<{ nominationId: string; finalScore: number | null; placeInClass: number | null }>;
}

interface PublicScoreboardResponse {
  nominations: Array<{
    id: string;
    paymentStatus?: unknown;
    paidAmountKopecks?: unknown;
    athlete: {
      birthYear: number | null;
      dateOfBirth?: unknown;
      federationCardNumber?: unknown;
    };
  }>;
  rows: Array<{ nominationId: string; finalScore: number | null; placeInClass: number | null }>;
}

interface LiveOpsResponse {
  nominations: PublicScoreboardResponse['nominations'];
  scoreboardRows: Array<{
    nominationId: string;
    finalScore: number | null;
    placeInClass: number | null;
  }>;
}

interface DisciplinesResponse {
  disciplines: Array<{ id: string; code: string; nameRu: string }>;
}

interface NominationResponse {
  nomination: {
    id: string;
    weightClassId: string;
    weightClass: { id: string; nameRu: string; weightMin: number | null; weightMax: number | null };
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

async function requestStatus(
  method: string,
  path: string,
  body?: unknown,
  headers: Headers = {},
): Promise<number> {
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

async function requestResult(
  method: string,
  path: string,
  body?: unknown,
  headers: Headers = {},
): Promise<{ status: number; code: string | null }> {
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
  const parsed = text ? (JSON.parse(text) as { error?: { code?: string } }) : null;
  return { status: res.status, code: parsed?.error?.code ?? null };
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

async function createScopedUser(input: {
  email: string;
  displayName: string;
  password: string;
  role: 'viewer' | 'athlete' | 'accountant' | 'head_judge' | 'judge' | 'scoreboard_operator';
  federationId: string;
}) {
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.upsert({
    where: { email: input.email },
    create: {
      email: input.email,
      displayName: input.displayName,
      passwordHash,
      isEmailVerified: true,
    },
    update: {
      displayName: input.displayName,
      passwordHash,
      isEmailVerified: true,
    },
    select: { id: true },
  });
  await prisma.roleAssignment.create({
    data: {
      userId: user.id,
      role: input.role,
      federationId: input.federationId,
      competitionId: null,
    },
  });
  return user;
}

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
const federation = (
  await requestJson<EntityResponse>(
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
  )
).federation;

const competition = (
  await requestJson<EntityResponse>(
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
  )
).competition;

const setup = await requestJson<{ setup: { divisions: number; weightClasses: number } }>(
  'POST',
  `/competitions/${competition.id}/setup/default`,
  {},
  auth,
);
assert(setup.setup.divisions >= 2, 'default setup did not create divisions');
assert(setup.setup.weightClasses > 0, 'default setup did not create weight classes');

const ops = await requestJson<OpsResponse>(
  'GET',
  `/competitions/${competition.id}/ops`,
  undefined,
  auth,
);
const division = ops.divisions.find((item) => item.gender === 'M');
assert(division, 'male division not found after default setup');
const weightClass = division.weightClasses[0];
assert(weightClass, 'weight class not found after default setup');
const platform = ops.platforms[0];
assert(platform, 'platform not found after default setup');

const viewerUser = await createScopedUser({
  email: `viewer-${suffix.toLowerCase()}@streetlifting.test`,
  displayName: `Smoke Viewer ${suffix}`,
  password: `Smoke-${suffix}-viewer-password`,
  role: 'viewer',
  federationId: federation.id,
});
const operatorUser = await createScopedUser({
  email: `operator-${suffix.toLowerCase()}@streetlifting.test`,
  displayName: `Smoke Operator ${suffix}`,
  password: `Smoke-${suffix}-operator-password`,
  role: 'scoreboard_operator',
  federationId: federation.id,
});
const headJudgeUser = await createScopedUser({
  email: `head-judge-${suffix.toLowerCase()}@streetlifting.test`,
  displayName: `Smoke Head Judge ${suffix}`,
  password: `Smoke-${suffix}-head-judge-password`,
  role: 'head_judge',
  federationId: federation.id,
});
const judgeUser = await createScopedUser({
  email: `judge-user-${suffix.toLowerCase()}@streetlifting.test`,
  displayName: `Smoke Judge User ${suffix}`,
  password: `Smoke-${suffix}-judge-password`,
  role: 'judge',
  federationId: federation.id,
});
const accountantUser = await createScopedUser({
  email: `accountant-${suffix.toLowerCase()}@streetlifting.test`,
  displayName: `Smoke Accountant ${suffix}`,
  password: `Smoke-${suffix}-accountant-password`,
  role: 'accountant',
  federationId: federation.id,
});
await prisma.$disconnect();
const viewerAuth = { authorization: `Bearer ${await signAccessToken(viewerUser.id)}` };
const operatorAuth = { authorization: `Bearer ${await signAccessToken(operatorUser.id)}` };
const headJudgeAuth = { authorization: `Bearer ${await signAccessToken(headJudgeUser.id)}` };
const judgeAuth = { authorization: `Bearer ${await signAccessToken(judgeUser.id)}` };
const accountantAuth = { authorization: `Bearer ${await signAccessToken(accountantUser.id)}` };
const viewerCompetitionStatus = await requestStatus(
  'GET',
  `/competitions/${competition.id}`,
  undefined,
  viewerAuth,
);
assert(viewerCompetitionStatus === 200, 'viewer cannot read scoped competition details');
const viewerOpsStatus = await requestStatus(
  'GET',
  `/competitions/${competition.id}/ops`,
  undefined,
  viewerAuth,
);
assert(viewerOpsStatus === 403, 'viewer can read sensitive competition ops payload');
const viewerScoreboardStatus = await requestStatus(
  'GET',
  `/competitions/${competition.id}/scoreboard`,
  undefined,
  viewerAuth,
);
assert(viewerScoreboardStatus === 403, 'viewer can read full authenticated scoreboard payload');
const viewerProtocolStatus = await requestStatus(
  'GET',
  `/competitions/${competition.id}/protocol.csv`,
  undefined,
  viewerAuth,
);
assert(viewerProtocolStatus === 403, 'viewer can export sensitive protocol');
const viewerSetupStatus = await requestStatus(
  'POST',
  `/competitions/${competition.id}/setup/default`,
  {},
  viewerAuth,
);
assert(viewerSetupStatus === 403, 'viewer can mutate competition setup');
const operatorOpsStatus = await requestStatus(
  'GET',
  `/competitions/${competition.id}/ops`,
  undefined,
  operatorAuth,
);
assert(operatorOpsStatus === 403, 'scoreboard operator can read sensitive competition ops payload');
const headJudgeOpsStatus = await requestStatus(
  'GET',
  `/competitions/${competition.id}/ops`,
  undefined,
  headJudgeAuth,
);
assert(headJudgeOpsStatus === 403, 'head judge can read sensitive competition ops payload');
const judgeOpsStatus = await requestStatus(
  'GET',
  `/competitions/${competition.id}/ops`,
  undefined,
  judgeAuth,
);
assert(judgeOpsStatus === 403, 'judge can read sensitive competition ops payload');
const accountantOpsStatus = await requestStatus(
  'GET',
  `/competitions/${competition.id}/ops`,
  undefined,
  accountantAuth,
);
assert(accountantOpsStatus === 403, 'accountant can read full sensitive competition ops payload');
const accountantLiveOpsStatus = await requestStatus(
  'GET',
  `/competitions/${competition.id}/live-ops`,
  undefined,
  accountantAuth,
);
assert(accountantLiveOpsStatus === 403, 'accountant can read live competition ops payload');
const accountantScoreboardStatus = await requestStatus(
  'GET',
  `/competitions/${competition.id}/scoreboard`,
  undefined,
  accountantAuth,
);
assert(accountantScoreboardStatus === 403, 'accountant can read competition scoreboard payload');
const accountantProtocolStatus = await requestStatus(
  'GET',
  `/competitions/${competition.id}/protocol.csv`,
  undefined,
  accountantAuth,
);
assert(accountantProtocolStatus === 403, 'accountant can export competition protocol');

const judge = (
  await requestJson<EntityResponse>(
    'POST',
    '/judges',
    {
      lastName: `Judge${suffix}`,
      firstName: 'Smoke',
      categoryRu: 'РК',
      cityRegion: 'Yerevan',
    },
    auth,
  )
).judge;

const tempJudgeAssignment = (
  await requestJson<{
    judgeAssignment: { id: string; judgeId: string; platformId: string | null; role: string };
  }>(
    'POST',
    `/competitions/${competition.id}/judge-assignments`,
    { judgeId: judge.id, platformId: null, role: 'side_left' },
    auth,
  )
).judgeAssignment;
assert(tempJudgeAssignment.role === 'side_left', 'global judge assignment was not created');
await requestJson<{ deleted: true }>(
  'DELETE',
  `/judge-assignments/${tempJudgeAssignment.id}`,
  undefined,
  auth,
);

const judgeAssignment = (
  await requestJson<{
    judgeAssignment: { id: string; judgeId: string; platformId: string | null; role: string };
  }>(
    'POST',
    `/competitions/${competition.id}/judge-assignments`,
    { judgeId: judge.id, platformId: platform.id, role: 'head' },
    auth,
  )
).judgeAssignment;
assert(
  judgeAssignment.platformId === platform.id,
  'platform judge assignment was not scoped to platform',
);
const duplicateJudgeAssignmentStatus = await requestStatus(
  'POST',
  `/competitions/${competition.id}/judge-assignments`,
  { judgeId: judge.id, platformId: platform.id, role: 'head' },
  auth,
);
assert(duplicateJudgeAssignmentStatus === 409, 'duplicate judge assignment was accepted');

const discipline = (
  await requestJson<DisciplinesResponse>('GET', '/disciplines', undefined, auth)
).disciplines.find((item) => item.code === 'classic_pu');
assert(discipline, 'classic_pu discipline not found; run release:seed first');

const publicCompetition = (
  await requestJson<EntityResponse>(
    'POST',
    '/competitions',
    {
      federationId: federation.id,
      code: `PUBDUP${suffix}`,
      nameRu: `Smoke public duplicate ${suffix}`,
      nameEn: `Smoke public duplicate ${suffix}`,
      rulebook: 'ISF v5.1',
      startDate: '2026-06-02',
      endDate: '2026-06-02',
      city: 'Yerevan',
      venue: 'Smoke Public Hall',
      timezone: 'Asia/Yerevan',
      status: 'draft',
      entryFeeKopecks: 150000,
      isOnlineRegistrationOpen: true,
    },
    auth,
  )
).competition;
await requestJson<{ setup: { divisions: number; weightClasses: number } }>(
  'POST',
  `/competitions/${publicCompetition.id}/setup/default`,
  {},
  auth,
);
const publicDetails = await requestJson<{
  competition: {
    divisions: Array<{
      id: string;
      gender: 'M' | 'F';
      weightClasses: Array<{ id: string }>;
    }>;
  };
}>('GET', `/public/competitions/${publicCompetition.id}/registration`);
const publicDivision = publicDetails.competition.divisions.find((item) => item.gender === 'M');
const publicWeightClass = publicDivision?.weightClasses[0];
assert(publicDivision, 'public duplicate male division not found');
assert(publicWeightClass, 'public duplicate weight class not found');
const publicDuplicatePayload = {
  athlete: {
    lastName: `PublicDuplicate${suffix}`,
    firstName: 'Smoke',
    dateOfBirth: '1998-02-03',
    gender: 'M',
    countryCode: 'am',
    city: 'Yerevan',
  },
  disciplineId: discipline.id,
  divisionId: publicDivision.id,
  declaredWeightClassId: publicWeightClass.id,
  weightClassId: publicWeightClass.id,
  contactEmail: `public-duplicate-${suffix.toLowerCase()}@streetlifting.test`,
  consentDataProcessing: true,
  consentPublicResults: true,
};
const publicDuplicateResults = await Promise.all(
  Array.from({ length: 8 }, (_, index) =>
    requestResult('POST', `/public/competitions/${publicCompetition.id}/registrations`, {
      ...publicDuplicatePayload,
      athlete: {
        ...publicDuplicatePayload.athlete,
        lastName:
          index % 2 === 0
            ? publicDuplicatePayload.athlete.lastName
            : `  publicduplicate${suffix.toLowerCase()}  `,
        firstName: index % 2 === 0 ? 'Smoke' : 'smoke',
        countryCode: index % 2 === 0 ? 'am' : 'AM',
      },
    }),
  ),
);
const publicDuplicateSuccesses = publicDuplicateResults.filter((item) => item.status === 201);
const publicDuplicateConflicts = publicDuplicateResults.filter(
  (item) => item.status === 409 && item.code === 'duplicate_nomination',
);
assert(publicDuplicateSuccesses.length === 1, 'public duplicate accepted multiple registrations');
assert(publicDuplicateConflicts.length === 7, 'public duplicate conflicts mismatch');
const publicDuplicateOps = await requestJson<OpsResponse>(
  'GET',
  `/competitions/${publicCompetition.id}/ops`,
  undefined,
  auth,
);
assert(publicDuplicateOps.nominations.length === 1, 'public duplicate created extra nominations');

const athlete = (
  await requestJson<EntityResponse>(
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
  )
).athlete;

const nomination = (
  await requestJson<NominationResponse>(
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
  )
).nomination;

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

const patched = (
  await requestJson<NominationResponse>(
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
  )
).nomination;
assert(patched.discipline.components[0], 'nomination response has no discipline component');
assert(
  patched.weightClassId !== weightClass.id,
  'bodyweight did not auto-assign actual weight class',
);
assert(
  (patched.weightClass.weightMin === null || 82.4 > patched.weightClass.weightMin) &&
    (patched.weightClass.weightMax === null || 82.4 <= patched.weightClass.weightMax),
  'auto-assigned weight class does not match bodyweight',
);

const plan = await requestJson<{ plan: { flights: Array<{ estimatedMinutes: number }> } }>(
  'POST',
  `/competitions/${competition.id}/flights/auto-plan`,
  { maxNominationsPerGroup: 12, minutesPerAttempt: 1, breakBetweenFlightsMinutes: 5 },
  auth,
);
assert(plan.plan.flights.length === 1, 'auto-plan did not create one flight');

const componentId = patched.discipline.components[0].id;
const headJudgePaymentMutation = await requestResult(
  'PATCH',
  `/nominations/${nomination.id}`,
  { paymentStatus: 'refunded', paidAmountKopecks: 0, paymentComment: 'forbidden head judge edit' },
  headJudgeAuth,
);
assert(
  headJudgePaymentMutation.status === 403 &&
    headJudgePaymentMutation.code === 'nomination_update_field_forbidden',
  'head judge can mutate nomination payment fields',
);
const headJudgeStatusPatch = await requestJson<NominationResponse>(
  'PATCH',
  `/nominations/${nomination.id}`,
  { status: 'on_platform' },
  headJudgeAuth,
);
assertNoForbiddenExportKeys(headJudgeStatusPatch);
assert(
  headJudgeStatusPatch.nomination.id === nomination.id,
  'head judge status patch returned wrong nomination',
);
const judgeAttemptWithNotes = await requestResult(
  'PUT',
  `/nominations/${nomination.id}/attempts/${componentId}/1`,
  {
    componentId,
    attemptNumber: 1,
    weightKg: 30,
    result: 'good_lift',
    judgeDecisions: [{ judge: 'left', decision: 'good' }],
    notes: 'forbidden judge note',
  },
  judgeAuth,
);
assert(
  judgeAttemptWithNotes.status === 403 && judgeAttemptWithNotes.code === 'attempt_notes_forbidden',
  'judge can write restricted attempt notes',
);
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
  judgeAuth,
);
assertNoForbiddenExportKeys(attempt);
assert(attempt.nomination.finalScore === 30, 'finalScore was not recalculated after attempt');
assert(attempt.nomination.placeInClass === 1, 'placeInClass was not recalculated after attempt');

const unfinishedFinalizeStatus = await requestStatus(
  'PATCH',
  `/competitions/${competition.id}`,
  { status: 'finalized' },
  auth,
);
assert(unfinishedFinalizeStatus === 409, 'unfinished competition was finalized');

for (const [attemptNumber, weightKg] of [
  [2, 32.5],
  [3, 35],
] as const) {
  await requestJson<NominationResponse>(
    'PUT',
    `/nominations/${nomination.id}/attempts/${componentId}/${attemptNumber}`,
    {
      componentId,
      attemptNumber,
      weightKg,
      result: 'good_lift',
      judgeDecisions: [
        { judge: 'left', decision: 'good' },
        { judge: 'center', decision: 'good' },
        { judge: 'right', decision: 'good' },
      ],
    },
    auth,
  );
}

const finalizedCompetition = (
  await requestJson<{ competition: { status: string } }>(
    'PATCH',
    `/competitions/${competition.id}`,
    { status: 'finalized' },
    auth,
  )
).competition;
assert(finalizedCompetition.status === 'finalized', 'finished competition was not finalized');

const scoreboard = await requestJson<ScoreboardResponse>(
  'GET',
  `/competitions/${competition.id}/scoreboard`,
  undefined,
  auth,
);
const publicScoreboard = await requestJson<PublicScoreboardResponse>(
  'GET',
  `/public/competitions/${competition.id}/scoreboard`,
);
const operatorLiveOps = await requestJson<LiveOpsResponse>(
  'GET',
  `/competitions/${competition.id}/live-ops`,
  undefined,
  operatorAuth,
);
const headJudgeLiveOps = await requestJson<LiveOpsResponse>(
  'GET',
  `/competitions/${competition.id}/live-ops`,
  undefined,
  headJudgeAuth,
);
const judgeLiveOps = await requestJson<LiveOpsResponse>(
  'GET',
  `/competitions/${competition.id}/live-ops`,
  undefined,
  judgeAuth,
);
const operatorScoreboard = await requestJson<PublicScoreboardResponse>(
  'GET',
  `/competitions/${competition.id}/scoreboard`,
  undefined,
  operatorAuth,
);
const finalOps = await requestJson<OpsResponse>(
  'GET',
  `/competitions/${competition.id}/ops`,
  undefined,
  auth,
);
assert(scoreboard.nominations.length === 1, 'scoreboard nominations count mismatch');
assert(scoreboard.rows.length === 1, 'scoreboard rows count mismatch');
assert(
  scoreboard.rows[0]?.finalScore === 35,
  'scoreboard final score mismatch after completed attempts',
);
assertNoForbiddenExportKeys(publicScoreboard);
assertNoForbiddenExportKeys(operatorLiveOps);
assertNoForbiddenExportKeys(headJudgeLiveOps);
assertNoForbiddenExportKeys(judgeLiveOps);
assertNoForbiddenExportKeys(operatorScoreboard);
assert(publicScoreboard.nominations.length === 1, 'public scoreboard nominations count mismatch');
assert(
  publicScoreboard.nominations[0]?.athlete.birthYear === 1996,
  'public scoreboard birth year mismatch',
);
assert(operatorLiveOps.nominations.length === 1, 'operator live ops nominations count mismatch');
assert(headJudgeLiveOps.nominations.length === 1, 'head judge live ops nominations count mismatch');
assert(judgeLiveOps.nominations.length === 1, 'judge live ops nominations count mismatch');
assert(
  operatorScoreboard.nominations.length === 1,
  'operator scoreboard nominations count mismatch',
);
assert(finalOps.accounting.weighedInNominations === 1, 'accounting weighed-in count mismatch');
assert(finalOps.accounting.paidEntryFeeKopecks === 150000, 'accounting paid amount mismatch');
assert(finalOps.judgeAssignments.length === 1, 'judge assignment count mismatch');
assert(finalOps.judgeAssignments[0]?.judgeId === judge.id, 'judge assignment judge mismatch');

const finalizedAttemptMutationStatus = await requestStatus(
  'PUT',
  `/nominations/${nomination.id}/attempts/${componentId}/3`,
  {
    componentId,
    attemptNumber: 3,
    weightKg: 60,
    result: 'good_lift',
    judgeDecisions: [{ judge: 'left', decision: 'good' }],
  },
  auth,
);
assert(finalizedAttemptMutationStatus === 409, 'finalized competition accepted attempt mutation');

const finalizedNominationMutationStatus = await requestStatus(
  'PATCH',
  `/nominations/${nomination.id}`,
  { bodyWeightAtWeighIn: 90.1, status: 'weighed_in' },
  auth,
);
assert(
  finalizedNominationMutationStatus === 409,
  'finalized competition accepted nomination mutation',
);

const lateAthlete = (
  await requestJson<EntityResponse>(
    'POST',
    '/athletes',
    {
      lastName: `Late${suffix}`,
      firstName: 'Smoke',
      dateOfBirth: '1999-05-06',
      gender: 'M',
      countryCode: 'AM',
      city: 'Yerevan',
    },
    auth,
  )
).athlete;
const finalizedLateNominationStatus = await requestStatus(
  'POST',
  `/competitions/${competition.id}/nominations`,
  {
    athleteId: lateAthlete.id,
    disciplineId: discipline.id,
    divisionId: division.id,
    declaredWeightClassId: weightClass.id,
    weightClassId: weightClass.id,
    status: 'draft',
  },
  auth,
);
assert(finalizedLateNominationStatus === 409, 'finalized competition accepted late nomination');

const finalizedDrawStatus = await requestStatus(
  'POST',
  `/competitions/${competition.id}/nominations/draw`,
  { overwrite: true },
  auth,
);
assert(finalizedDrawStatus === 409, 'finalized competition accepted draw mutation');

const finalizedReopenStatus = await requestStatus(
  'PATCH',
  `/competitions/${competition.id}`,
  { status: 'in_progress' },
  auth,
);
assert(finalizedReopenStatus === 409, 'finalized competition status was reopened');

const lockedScoreboard = await requestJson<ScoreboardResponse>(
  'GET',
  `/competitions/${competition.id}/scoreboard`,
  undefined,
  auth,
);
assert(lockedScoreboard.rows.length === 1, 'locked scoreboard row count changed');
assert(lockedScoreboard.rows[0]?.finalScore === 35, 'locked scoreboard final score changed');

const protocol = await requestText('GET', `/competitions/${competition.id}/protocol.csv`, auth);
const accounting = await requestText('GET', `/competitions/${competition.id}/accounting.csv`, auth);
const accountantAccounting = await requestText(
  'GET',
  `/competitions/${competition.id}/accounting.csv`,
  accountantAuth,
);
assert(protocol.includes(`Smoke${suffix}`), 'protocol export does not include athlete');
assert(accounting.includes(competitionCode), 'accounting export does not include competition code');
assert(
  accountantAccounting.includes(competitionCode),
  'accountant accounting export does not include competition code',
);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      federationCode,
      competitionCode,
      nominations: scoreboard.nominations.length,
      scoreboardRows: scoreboard.rows.length,
      finalScore: scoreboard.rows[0]?.finalScore,
      judgeAssignments: finalOps.judgeAssignments.length,
      unfinishedFinalize: 'blocked',
      finalization: 'ok',
      finalizedProtocolLock: 'ok',
      publicDuplicateRegistration: 'blocked',
      viewerOpsAccess: 'blocked',
      operatorOpsAccess: 'full_blocked_live_sanitized',
      accountantOpsAccess: 'blocked',
      accountantAccountingAccess: 'ok',
      judgeLiveOpsAccess: 'sanitized',
      headJudgePaymentMutation: 'blocked',
      judgeAttemptNotesMutation: 'blocked',
      passwordChange: 'ok',
      protocolBytes: protocol.length,
      accountingBytes: accounting.length,
    },
    null,
    2,
  ),
);
