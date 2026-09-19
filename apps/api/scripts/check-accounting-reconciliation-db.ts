import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
const target = new URL(process.env.DATABASE_URL ?? 'file:///missing');
assert.equal(process.env.PD_DB_E2E, '1', 'Use the isolated DB runner');
assert(['127.0.0.1', 'localhost'].includes(target.hostname));
assert(/^\/streetlifting_e2e_[a-z0-9_]+$/.test(target.pathname));
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.LOG_LEVEL = 'error';
const { default: Fastify } = await import('fastify');
const { prisma: db } = await import('../src/lib/db.js');
const { attachUser } = await import('../src/lib/auth/middleware.js');
const { signAccessToken } = await import('../src/lib/auth/tokens.js');
const { ACCESS_ACKNOWLEDGMENT_VERSION } = await import('../src/lib/access-acknowledgment.js');
const { registerRequestContext } = await import('../src/lib/request-context.js');
const { federationsPlugin } = await import('../src/plugins/federations.js');
(BigInt.prototype as { toJSON?: () => string }).toJSON = function () {
  return this.toString();
};
const app = Fastify();
await registerRequestContext(app);
app.addHook('preHandler', attachUser);
await app.register(federationsPlugin.register);
try {
  const makeFederation = () =>
    db.federation.create({
      data: {
        code: randomUUID(),
        nameRu: 'Accounting',
        nameEn: 'Accounting',
        countryCode: 'AM',
        securityKey: randomUUID(),
        billingTariffKopecksPerNomination: 0,
      },
    });
  const own = await makeFederation();
  const other = await makeFederation();
  const makeCompetition = (federationId: string, name: string, year: number) =>
    db.competition.create({
      data: {
        federationId,
        code: randomUUID(),
        nameRu: name,
        nameEn: name,
        startDate: new Date(`${year}-01-01`),
        endDate: new Date(`${year}-01-01`),
        timezone: 'UTC',
        status: 'archived',
      },
    });
  const competition = await makeCompetition(own.id, 'Own tournament', 2030);
  await makeCompetition(own.id, 'Empty tournament', 2029);
  const foreignCompetition = await makeCompetition(other.id, 'OTHER-FED-PRIVATE', 2031);
  const discipline = await db.discipline.create({
    data: {
      code: randomUUID(),
      nameRu: 'Test',
      nameEn: 'Test',
      family: 'streetlifting',
      format: 'three_attempts_max',
      equipment: 'pull_up_bar',
    },
  });
  const division = await db.division.create({
    data: {
      competitionId: competition.id,
      code: randomUUID(),
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
      code: 'open',
      nameRu: 'Open',
      nameEn: 'Open',
      order: 1,
    },
  });
  const statuses = [
    'finished',
    'finished',
    'withdrawn',
    'disqualified',
    'draft',
    'withdrawn',
  ] as const;
  for (const [index, status] of statuses.entries()) {
    const athlete = await db.athlete.create({
      data: { firstName: 'PRIVATE-ATHLETE', lastName: randomUUID(), gender: 'M' },
    });
    const nomination = await db.nomination.create({
      data: {
        competitionId: competition.id,
        athleteId: athlete.id,
        disciplineId: discipline.id,
        divisionId: division.id,
        weightClassId: weightClass.id,
        status,
        finalScore: status === 'finished' ? 50 : null,
      },
    });
    if (index !== 1)
      await db.attempt.create({
        data: {
          nominationId: nomination.id,
          attemptNumber: 1,
          weightKg: 50,
          result: index === 4 ? 'pending' : index === 5 ? 'withdrawn' : 'good_lift',
        },
      });
    if (index === 0)
      await db.attempt.create({
        data: { nominationId: nomination.id, attemptNumber: 2, weightKg: 60, result: 'no_lift' },
      });
  }
  await db.receipt.createMany({
    data: Array.from({ length: 55 }, (_, i) => ({
      federationId: own.id,
      number: `R-${i}`,
      date: new Date(),
      expiresAt: new Date('2035-01-01'),
      nominationsCount: 2,
      amountKopecks: 100n,
      paymentMethod: 'cash' as const,
    })),
  });
  await db.writeoff.createMany({
    data: [
      ...Array.from({ length: 55 }, (_, i) => ({
        federationId: own.id,
        number: `W-${i}`,
        date: new Date(),
        nominationsCount: 1,
        competitionId: competition.id,
      })),
      {
        federationId: own.id,
        number: 'unlinked',
        date: new Date(),
        nominationsCount: 7,
        competitionId: null,
      },
      {
        federationId: own.id,
        number: 'legacy-cross-link',
        date: new Date(),
        nominationsCount: 3,
        competitionId: foreignCompetition.id,
      },
      {
        federationId: other.id,
        number: 'foreign',
        date: new Date(),
        nominationsCount: 1000,
        competitionId: competition.id,
      },
    ],
  });
  const makeUser = async (
    federationId: string,
    competitionId: string | null = null,
    acknowledged = true,
  ) => {
    const user = await db.user.create({
      data: {
        email: `${randomUUID()}@example.test`,
        displayName: 'Accountant',
        roleAssignments: {
          create: {
            role: 'accountant',
            federationId,
            competitionId,
            acknowledgedAt: acknowledged ? new Date() : null,
            acknowledgedTextVersion: acknowledged ? ACCESS_ACKNOWLEDGMENT_VERSION : null,
          },
        },
      },
    });
    return { user, headers: { authorization: `Bearer ${await signAccessToken(user.id)}` } };
  };
  const accountant = await makeUser(own.id);
  const url = `/federations/${own.id}/accounting-reconciliation`;
  const read = await app.inject({ url: `${url}?limit=1`, headers: accountant.headers });
  assert.equal(read.statusCode, 200, read.body);
  assert.equal(read.headers['cache-control'], 'private, no-store');
  const report = read.json();
  assert.equal(report.ruleStatus, 'not_configured');
  assert.deepEqual(report.summary, {
    competitions: 2,
    nominations: 6,
    withDecidedAttempt: 3,
    finished: 2,
    finishedWithoutAttempt: 1,
    withdrawn: 2,
    disqualified: 1,
    withdrawnWithDecidedAttempt: 1,
    disqualifiedWithDecidedAttempt: 1,
    postedNominations: 55,
    writeoffDocuments: 55,
  });
  assert.equal(report.rows.length, 1);
  assert.equal(report.rows[0].id, competition.id);
  assert.equal(report.rows[0].hasFinalizationSnapshot, false);
  assert.deepEqual(report.unmatchedWriteoffs, { documents: 2, nominations: 10 });
  assert.deepEqual(report.ledger, {
    receiptDocuments: 55,
    writeoffDocuments: 57,
    receivedNominations: 110,
    consumedNominations: 65,
    remainingNominations: 45,
    receivedAmountKopecks: '5500',
  });
  assert(!read.body.includes('PRIVATE-ATHLETE'));
  assert(!read.body.includes('OTHER-FED-PRIVATE'));
  const second = await app.inject({ url: `${url}?limit=1&offset=1`, headers: accountant.headers });
  assert.equal(second.statusCode, 200);
  assert.equal(second.json().rows[0].nominations, 0);
  assert.deepEqual(second.json().summary, report.summary);
  const dashboard = await app.inject({
    url: `/federations/${own.id}/dashboard`,
    headers: accountant.headers,
  });
  assert.equal(dashboard.statusCode, 200, dashboard.body);
  assert.equal(dashboard.json().receipts.length, 50);
  assert.equal(dashboard.json().writeoffs.length, 50);
  assert.equal(dashboard.json().balance.remainingNominations, 45);
  assert.equal(dashboard.json().balance.receivedAmountKopecks, '5500');
  for (const query of ['limit=101', 'offset=-1', 'limit=NaN', 'competitionId=unexpected']) {
    assert.equal(
      (await app.inject({ url: `${url}?${query}`, headers: accountant.headers })).statusCode,
      400,
    );
  }
  assert.equal((await app.inject({ url })).statusCode, 401);
  for (const denied of [
    await makeUser(other.id),
    await makeUser(own.id, competition.id),
    await makeUser(own.id, null, false),
  ]) {
    assert.equal((await app.inject({ url, headers: denied.headers })).statusCode, 403);
    assert.equal(
      (await app.inject({ url: `/federations/${own.id}/dashboard`, headers: denied.headers }))
        .statusCode,
      403,
    );
  }
  await db.roleAssignment.updateMany({
    where: { userId: accountant.user.id },
    data: { revokedAt: new Date() },
  });
  assert.equal((await app.inject({ url, headers: accountant.headers })).statusCode, 403);
  assert.equal(await db.writeoff.count({ where: { federationId: own.id } }), 57);
  assert.equal(await db.receipt.count({ where: { federationId: own.id } }), 55);
  console.log(
    'PASS accounting: full-ledger totals beyond 50, distinct nominations, historical gaps, pagination, unmatched postings, tenant/role isolation, revocation, read-only',
  );
} finally {
  await app.close();
  await db.$disconnect();
}
