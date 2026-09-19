import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const target = new URL(process.env.DATABASE_URL ?? 'file:///missing');
assert.equal(process.env.PD_DB_E2E, '1', 'Use the isolated DB runner');
assert(['127.0.0.1', 'localhost'].includes(target.hostname));
assert(/^\/streetlifting_e2e_[a-z0-9_]+$/.test(target.pathname));
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.LOG_LEVEL = 'error';
const { default: Fastify } = await import('fastify');
const { PrismaClient } = await import('@prisma/client');
const { prisma: db } = await import('../src/lib/db.js');
const observer = new PrismaClient();
const { lockCompetition } = await import('../src/lib/competition-lifecycle.js');
const { snapshotHash, captureFinalizationSnapshot } =
  await import('../src/lib/finalization-snapshot.js');
const { ACCESS_ACKNOWLEDGMENT_VERSION } = await import('../src/lib/access-acknowledgment.js');
const { signAccessToken } = await import('../src/lib/auth/tokens.js');
const { attachUser } = await import('../src/lib/auth/middleware.js');
const { registerRequestContext } = await import('../src/lib/request-context.js');
const { competitionOpsPlugin } = await import('../src/plugins/competition-ops.js');
const { competitionsPlugin } = await import('../src/plugins/competitions.js');
(BigInt.prototype as { toJSON?: () => string }).toJSON = function () {
  return this.toString();
};
const app = Fastify();
await registerRequestContext(app);
app.addHook('preHandler', attachUser);
app.setErrorHandler((err: Error & { statusCode?: number; code?: string }, req, reply) => {
  reply
    .code(err.statusCode ?? 500)
    .send({ error: { code: err.code, message: err.message, requestId: req.requestId } });
});
await app.register(competitionOpsPlugin.register);
await app.register(competitionsPlugin.register);
const { athletesPlugin } = await import('../src/plugins/athletes.js');
await app.register(athletesPlugin.register);
const suffix = randomUUID();
try {
  const federation = await db.federation.create({
    data: {
      code: suffix,
      nameRu: 'Concurrency',
      nameEn: 'Concurrency',
      countryCode: 'AM',
      securityKey: randomUUID(),
      billingTariffKopecksPerNomination: 0,
    },
  });
  const competition = await db.competition.create({
    data: {
      federationId: federation.id,
      code: suffix,
      nameRu: 'Concurrency',
      nameEn: 'Concurrency',
      startDate: new Date('2030-01-01'),
      endDate: new Date('2030-01-01'),
      timezone: 'UTC',
      status: 'in_progress',
    },
  });
  const discipline = await db.discipline.create({
    data: {
      code: suffix,
      nameRu: 'Test',
      nameEn: 'Test',
      family: 'streetlifting',
      format: 'three_attempts_max',
      equipment: 'pull_up_bar',
      attemptCount: 1,
    },
  });
  const division = await db.division.create({
    data: {
      competitionId: competition.id,
      code: suffix,
      nameRu: 'Test',
      nameEn: 'Test',
      gender: 'M',
      veteranTier: 'open',
    },
  });
  const weightClass = await db.weightClass.create({
    data: {
      divisionId: division.id,
      disciplineId: discipline.id,
      code: suffix,
      nameRu: 'Test',
      nameEn: 'Test',
      order: 1,
    },
  });
  const platform = await db.platform.create({
    data: { competitionId: competition.id, name: 'Test', order: 1 },
  });
  const flight = await db.flight.create({
    data: {
      competitionId: competition.id,
      platformId: platform.id,
      code: 'A',
      name: 'A',
      order: 1,
    },
  });
  const athlete = await db.athlete.create({
    data: {
      firstName: 'Test',
      lastName: suffix,
      gender: 'M',
      dateOfBirth: new Date('2000-02-03'),
      countryCode: 'AM',
    },
  });
  const nomination = await db.nomination.create({
    data: {
      competitionId: competition.id,
      athleteId: athlete.id,
      disciplineId: discipline.id,
      divisionId: division.id,
      weightClassId: weightClass.id,
      flightId: flight.id,
      status: 'on_platform',
      isMandatePassed: true,
      bodyWeightAtWeighIn: 75,
    },
  });
  const headers: Array<{ authorization: string }> = [];
  for (const role of ['head', 'side_left', 'side_right'] as const) {
    const user = await db.user.create({
      data: {
        email: `${role}-${suffix}@example.test`,
        displayName: role,
        roleAssignments: { create: { role: 'platform_admin' } },
      },
    });
    const judge = await db.judge.create({
      data: { userId: user.id, firstName: role, lastName: suffix },
    });
    await db.judgeAssignment.create({
      data: { competitionId: competition.id, platformId: platform.id, judgeId: judge.id, role },
    });
    headers.push({ authorization: `Bearer ${await signAccessToken(user.id)}` });
  }
  const attemptUrl = `/nominations/${nomination.id}/attempts/1`;
  const write = (result = 'pending') =>
    app.inject({
      method: 'PUT',
      url: attemptUrl,
      headers: headers[0]!,
      payload: { weightKg: 50, result },
    });
  const finalize = () =>
    app.inject({
      method: 'PATCH',
      url: `/competitions/${competition.id}`,
      headers: headers[0]!,
      payload: { status: 'finalized' },
    });
  const vote = (index: number, call = 'white') =>
    app.inject({
      method: 'PUT',
      url: `${attemptUrl}/judge-decision`,
      headers: headers[index]!,
      payload: { call },
    });
  // These assertions use the real admission checks, not mocked athlete data.
  await db.nomination.update({ where: { id: nomination.id }, data: { bodyWeightAtWeighIn: null } });
  assert.equal((await write()).json().error.code, 'weigh_in_required');
  await db.nomination.update({ where: { id: nomination.id }, data: { bodyWeightAtWeighIn: 75 } });
  await db.division.update({ where: { id: division.id }, data: { gender: 'F' } });
  assert.equal((await write()).json().error.code, 'division_gender_mismatch');
  await db.division.update({ where: { id: division.id }, data: { gender: 'M', ageMin: 40 } });
  assert.equal((await write()).json().error.code, 'division_age_mismatch');
  await db.division.update({ where: { id: division.id }, data: { ageMin: null } });
  await db.competition.update({
    where: { id: competition.id },
    data: { status: 'registration_closed' },
  });
  assert.equal((await write()).json().error.code, 'competition_not_in_progress');
  await db.competition.update({ where: { id: competition.id }, data: { status: 'in_progress' } });
  await db.nomination.update({ where: { id: nomination.id }, data: { status: 'withdrawn' } });
  assert.equal((await write()).json().error.code, 'nomination_not_ready');
  await db.nomination.update({ where: { id: nomination.id }, data: { status: 'weighed_in' } });
  const identityEdit = await app.inject({
    method: 'PATCH',
    url: `/athletes/${athlete.id}`,
    headers: headers[0]!,
    payload: { gender: 'F' },
  });
  assert.equal(identityEdit.statusCode, 409, identityEdit.body);
  assert.equal(identityEdit.json().error.code, 'athlete_has_approved_nominations');
  assert.equal((await db.athlete.findUniqueOrThrow({ where: { id: athlete.id } })).gender, 'M');
  // Either the profile edit wins or approval wins, never an approval for changed identity.
  await db.nomination.update({ where: { id: nomination.id }, data: { isMandatePassed: false } });
  const admissionRace = await Promise.all([
    app.inject({
      method: 'PATCH',
      url: `/nominations/${nomination.id}`,
      headers: headers[0]!,
      payload: { isMandatePassed: true },
    }),
    app.inject({
      method: 'PATCH',
      url: `/athletes/${athlete.id}`,
      headers: headers[0]!,
      payload: { gender: 'F' },
    }),
  ]);
  for (const response of admissionRace)
    assert([200, 409].includes(response.statusCode), response.body);
  const racedAthlete = await db.athlete.findUniqueOrThrow({ where: { id: athlete.id } });
  const racedNomination = await db.nomination.findUniqueOrThrow({ where: { id: nomination.id } });
  assert(!(racedNomination.isMandatePassed && racedAthlete.gender === 'F'));
  await db.athlete.update({ where: { id: athlete.id }, data: { gender: 'M' } });
  await db.nomination.update({ where: { id: nomination.id }, data: { isMandatePassed: true } });
  const called = await write();
  assert.equal(called.statusCode, 200, called.body);
  // Different authenticated users on concurrent real DB connections; the third vote must survive majority completion.
  const votes = await Promise.all([vote(0), vote(1), vote(2)]);
  for (const response of votes) assert.equal(response.statusCode, 200, response.body);
  const attempt = await db.attempt.findFirstOrThrow({ where: { nominationId: nomination.id } });
  assert.equal(attempt.result, 'good_lift');
  assert.equal(await db.attemptJudgeDecision.count({ where: { attemptId: attempt.id } }), 3);
  const auditBeforeReplay = await db.auditLog.count({
    where: { targetId: attempt.id, action: 'attempt.judge_decision_submitted' },
  });
  const replays = await Promise.all([vote(0), vote(1), vote(2)]);
  for (const response of replays) assert.equal(response.statusCode, 200, response.body);
  assert.equal(
    await db.auditLog.count({
      where: { targetId: attempt.id, action: 'attempt.judge_decision_submitted' },
    }),
    auditBeforeReplay,
  );
  assert.equal((await vote(0, 'red')).statusCode, 409);
  assert.equal(await db.attempt.count({ where: { nominationId: nomination.id } }), 1);

  // Hold an uncommitted protocol change while the actual finalization HTTP route
  // reads the formerly-finished nomination. Confirm it really waits in PostgreSQL.
  let release!: () => void;
  let locked!: () => void;
  const ready = new Promise<void>((resolve) => {
    locked = resolve;
  });
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const writer = observer.$transaction(
    async (tx) => {
      await lockCompetition(tx, competition.id);
      await tx.attempt.update({ where: { id: attempt.id }, data: { result: 'pending' } });
      await tx.nomination.update({ where: { id: nomination.id }, data: { status: 'on_platform' } });
      locked();
      await gate;
    },
    { timeout: 20000 },
  );
  await ready;
  const finishing = Promise.resolve(finalize());
  try {
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      const rows = await db.$queryRaw<
        Array<{ count: bigint }>
      >`SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%UPDATE competition SET%'`;
      if (Number(rows[0]!.count) > 0) {
        waiting = true;
        break;
      }
      await delay(20);
    }
    assert(waiting, 'Finalization did not wait for the concurrent writer');
  } finally {
    release();
    await writer;
  }
  const rejected = await finishing;
  assert.equal(rejected.statusCode, 409, rejected.body);
  assert.equal(rejected.json().error.code, 'competition_has_unfinished_nominations');
  assert.equal(
    await db.competitionFinalizationSnapshot.count({ where: { competitionId: competition.id } }),
    0,
  );
  assert.equal(
    (await db.competition.findUniqueOrThrow({ where: { id: competition.id } })).status,
    'in_progress',
  );
  assert.equal(
    await db.syncOutbox.count({
      where: { aggregateId: competition.id, eventType: 'competition.finalized' },
    }),
    0,
  );

  // Repair the disposable fixture through the real API, then race both routes.
  assert.equal((await write('good_lift')).statusCode, 200);
  await db.nomination.update({ where: { id: nomination.id }, data: { finalScore: 999 } });
  const staleScore = await finalize();
  assert.equal(staleScore.statusCode, 409, staleScore.body);
  assert.equal(staleScore.json().error.code, 'protocol_calculation_stale');
  assert.equal(
    (await db.competition.findUniqueOrThrow({ where: { id: competition.id } })).status,
    'in_progress',
  );
  assert.equal(
    await db.competitionFinalizationSnapshot.count({ where: { competitionId: competition.id } }),
    0,
  );
  assert.equal((await write('good_lift')).statusCode, 200);
  const racing = await Promise.all([finalize(), write('good_lift')]);
  assert.equal(racing[0].statusCode, 200, racing[0].body);
  assert([200, 409].includes(racing[1].statusCode), racing[1].body);
  assert.equal(
    (await db.competition.findUniqueOrThrow({ where: { id: competition.id } })).status,
    'finalized',
  );
  assert.equal((await write()).statusCode, 409);
  assert.equal((await vote(0)).statusCode, 409);
  assert.equal(
    (
      await app.inject({
        method: 'PATCH',
        url: `/nominations/${nomination.id}`,
        headers: headers[0]!,
        payload: { notes: 'blocked' },
      })
    ).statusCode,
    409,
  );
  assert.equal((await finalize()).statusCode, 200);
  const snapshot = await db.competitionFinalizationSnapshot.findUniqueOrThrow({
    where: { competitionId_revision: { competitionId: competition.id, revision: 1 } },
  });
  assert.equal(snapshotHash(snapshot.payload), snapshot.payloadHash);
  const snapshotPayload = snapshot.payload as {
    approvalStatus: string;
    nominations: Array<{ finalScore: number; attempts: Array<{ id: string; result: string }> }>;
  };
  assert.equal(snapshotPayload.approvalStatus, 'not_recorded');
  assert.equal(snapshotPayload.nominations[0]!.attempts[0]!.id, attempt.id);
  assert.equal(snapshotPayload.nominations[0]!.attempts[0]!.result, 'good_lift');
  assert.equal(
    await db.competitionFinalizationSnapshot.count({ where: { competitionId: competition.id } }),
    1,
  );
  // SQL immutability, not merely an absent update endpoint.
  await assert.rejects(
    db.competitionFinalizationSnapshot.update({
      where: { id: snapshot.id },
      data: { payloadHash: '0'.repeat(64) },
    }),
    /immutable/,
  );
  await assert.rejects(
    db.competitionFinalizationSnapshot.delete({ where: { id: snapshot.id } }),
    /immutable/,
  );
  // A failed snapshot write rolls back preceding changes in the same transaction.
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.competition.update({
        where: { id: competition.id },
        data: { nameEn: 'Must roll back' },
      });
      await captureFinalizationSnapshot(tx, competition.id, snapshot.createdByUserId);
    }),
  );
  assert.equal(
    (await db.competition.findUniqueOrThrow({ where: { id: competition.id } })).nameEn,
    competition.nameEn,
  );
  // Mutable reference edits must never recalculate or rename historical evidence.
  await db.discipline.update({
    where: { id: discipline.id },
    data: { nameEn: 'Changed catalog', attemptCount: 5 },
  });
  await db.division.update({ where: { id: division.id }, data: { veteranCoefficient: 2 } });
  assert.deepEqual(
    (await db.competitionFinalizationSnapshot.findUniqueOrThrow({ where: { id: snapshot.id } }))
      .payload,
    snapshot.payload,
  );
  const snapshotUrl = `/competitions/${competition.id}/finalization-snapshot`;
  const readSnapshot = await app.inject({ url: snapshotUrl, headers: headers[0]! });
  assert.equal(readSnapshot.statusCode, 200, readSnapshot.body);
  assert.equal(readSnapshot.headers['cache-control'], 'private, no-store');
  assert.equal(readSnapshot.json().snapshot.payloadHash, snapshot.payloadHash);
  assert.equal((await app.inject({ url: snapshotUrl })).statusCode, 401);
  const otherFederation = await db.federation.create({
    data: {
      code: randomUUID(),
      nameRu: 'Other',
      nameEn: 'Other',
      countryCode: 'AM',
      securityKey: randomUUID(),
      billingTariffKopecksPerNomination: 0,
    },
  });
  for (const scope of [
    { federationId: otherFederation.id },
    { federationId: federation.id, competitionId: competition.id },
  ]) {
    const outsider = await db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        displayName: 'Scoped user',
        roleAssignments: {
          create: {
            role: 'federation_admin',
            ...scope,
            acknowledgedAt: new Date(),
            acknowledgedTextVersion: ACCESS_ACKNOWLEDGMENT_VERSION,
          },
        },
      },
    });
    const denied = await app.inject({
      url: snapshotUrl,
      headers: { authorization: `Bearer ${await signAccessToken(outsider.id)}` },
    });
    assert.equal(denied.statusCode, 403, denied.body);
    assert.equal(denied.body.includes(snapshot.payloadHash), false);
  }
  assert.equal(
    await db.syncOutbox.count({
      where: { aggregateId: competition.id, eventType: 'competition.finalized' },
    }),
    1,
  );
  assert.equal(
    await db.syncOutbox.count({
      where: { aggregateId: competition.id, eventType: 'competition.protocol.corrected' },
    }),
    0,
  );
  assert.equal(
    (await db.attempt.findUniqueOrThrow({ where: { id: attempt.id } })).result,
    'good_lift',
  );
  console.log(
    JSON.stringify({
      concurrentJudges: 3,
      replayedVotes: 3,
      duplicateVotes: 0,
      staleFinalizationRejected: true,
      finalizationAttemptRace: true,
      finalizedWritesBlocked: true,
      immutableFinalizationSnapshot: true,
      snapshotScopeIsolation: true,
    }),
  );
} finally {
  await app.close();
  await observer.$disconnect();
  await db.$disconnect();
}
