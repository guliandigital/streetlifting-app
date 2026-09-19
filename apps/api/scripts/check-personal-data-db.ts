import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Never load .env: this check writes fixtures and must only target a disposable DB.
const target = new URL(process.env.DATABASE_URL ?? 'file:///missing');
assert.equal(process.env.PD_DB_E2E, '1', 'Use the isolated DB runner');
assert(['postgresql:', 'postgres:'].includes(target.protocol));
assert(['127.0.0.1', 'localhost'].includes(target.hostname));
assert(/^\/streetlifting_e2e_[a-z0-9_]+$/.test(target.pathname));
process.env.JWT_SECRET = randomBytes(48).toString('hex');
process.env.STORAGE_DRIVER = 'fs';
process.env.STORAGE_DIR = await mkdtemp(join(tmpdir(), 'streetlifting-e2e-files-'));
process.env.LOG_LEVEL = 'error';

const { default: Fastify } = await import('fastify');
const { prisma } = await import('../src/lib/db.js');
const { signAccessToken } = await import('../src/lib/auth/tokens.js');
const { attachUser } = await import('../src/lib/auth/middleware.js');
const { registerRequestContext } = await import('../src/lib/request-context.js');
const { authPlugin } = await import('../src/plugins/auth.js');
const { athletesPlugin } = await import('../src/plugins/athletes.js');
const { publicRegistrationPlugin } = await import('../src/plugins/public-registration.js');
const { passportManagementPlugin } = await import('../src/plugins/passport-management.js');
const { passportIdentityLinksPlugin } = await import('../src/plugins/passport-identity-links.js');
const { ACCESS_ACKNOWLEDGMENT_VERSION } = await import('../src/lib/access-acknowledgment.js');

(BigInt.prototype as { toJSON?: () => string }).toJSON = function () {
  return this.toString();
};
const app = Fastify();
await registerRequestContext(app);
app.addHook('preHandler', attachUser);
for (const plugin of [
  authPlugin,
  athletesPlugin,
  publicRegistrationPlugin,
  passportManagementPlugin,
  passportIdentityLinksPlugin,
]) {
  await app.register(plugin.register);
}

try {
  if (process.env.PD_UPGRADE_CHECK === '1') {
    const legacy = await prisma.roleAssignment.findUniqueOrThrow({
      where: { id: '00000000-0000-4000-8000-000000000901' },
    });
    assert.equal(legacy.acknowledgedAt, null);
    assert.equal(legacy.acknowledgedTextVersion, null);
    assert.equal(legacy.role, 'secretary');
  }
  const suffix = randomUUID();
  const user = await prisma.user.create({
    data: { email: `${suffix}@example.test`, displayName: 'DB Test' },
  });
  const other = await prisma.user.create({
    data: { email: `other-${suffix}@example.test`, displayName: 'Other' },
  });
  const admin = await prisma.user.create({
    data: {
      email: `admin-${suffix}@example.test`,
      displayName: 'Admin',
      roleAssignments: { create: { role: 'platform_admin' } },
    },
  });
  const federation = await prisma.federation.create({
    data: {
      code: suffix,
      nameRu: 'Тестовая федерация',
      nameEn: 'Test Federation',
      countryCode: 'AM',
      billingTariffKopecksPerNomination: 0,
      securityKey: randomUUID(),
      pdOperatorName: 'Test Operator',
    },
  });
  const competition = await prisma.competition.create({
    data: {
      federationId: federation.id,
      code: suffix,
      nameRu: 'Тест',
      nameEn: 'Test',
      startDate: new Date('2030-01-01'),
      endDate: new Date('2030-01-01'),
      timezone: 'Asia/Yerevan',
      status: 'draft',
    },
  });
  const discipline = await prisma.discipline.create({
    data: {
      code: suffix,
      nameRu: 'Тест',
      nameEn: 'Test',
      family: 'streetlifting',
      format: 'three_attempts_max',
      equipment: 'pull_up_bar',
    },
  });
  const division = await prisma.division.create({
    data: {
      competitionId: competition.id,
      code: suffix,
      nameRu: 'Тест',
      nameEn: 'Test',
      gender: 'M',
      veteranTier: 'open',
    },
  });
  const weight = await prisma.weightClass.create({
    data: {
      divisionId: division.id,
      disciplineId: discipline.id,
      code: suffix,
      nameRu: 'Тест',
      nameEn: 'Test',
      order: 1,
    },
  });
  const headers = {
    'authorization': `Bearer ${await signAccessToken(user.id)}`,
    'user-agent': 'PD-DB-E2E',
  };
  const otherHeaders = { authorization: `Bearer ${await signAccessToken(other.id)}` };
  const adminHeaders = { authorization: `Bearer ${await signAccessToken(admin.id)}` };
  const url = `/public/competitions/${competition.id}/registrations`;
  const getTexts = async () => {
    const result = await app.inject(`/public/competitions/${competition.id}/registration`);
    assert.equal(result.statusCode, 200, result.body);
    return result.json().consents as {
      snapshotHash: string;
      textVersion: string;
      texts: Record<string, string>;
    };
  };
  let texts = await getTexts();
  const payload = {
    athlete: {
      lastName: `Test${suffix}`,
      firstName: 'Participant',
      dateOfBirth: '1990-01-01',
      gender: 'M',
      countryCode: 'AM',
    },
    disciplineId: discipline.id,
    divisionId: division.id,
    weightClassId: weight.id,
    consentDataProcessing: true,
    consentPublicResults: false,
    consentPhotoPublication: true,
    consentSnapshotHash: texts.snapshotHash,
  };
  const submit = () => app.inject({ method: 'POST', url, payload });
  assert.equal((await submit()).json().error.code, 'registration_closed');
  assert.equal(await prisma.athlete.count({ where: { lastName: payload.athlete.lastName } }), 0);
  await prisma.competitionTeamMember.create({
    data: {
      competitionId: competition.id,
      userId: admin.id,
      role: 'organizer',
      status: 'confirmed',
      memberNameSnapshot: 'Test Organizer',
      confirmedAt: new Date(),
    },
  });
  texts = await getTexts();
  payload.consentSnapshotHash = texts.snapshotHash;
  await prisma.federation.update({
    where: { id: federation.id },
    data: { pdOperatorName: 'Changed Operator' },
  });
  const stale = await submit();
  assert.equal(stale.statusCode, 409);
  assert.equal(stale.json().error.code, 'consent_changed');
  assert.equal(await prisma.athlete.count({ where: { lastName: payload.athlete.lastName } }), 0);
  texts = await getTexts();
  payload.consentSnapshotHash = texts.snapshotHash;
  const responses = await Promise.all([submit(), submit()]);
  assert.deepEqual(responses.map((response) => response.statusCode).sort(), [201, 409]);
  const athlete = await prisma.athlete.findFirstOrThrow({
    where: { lastName: payload.athlete.lastName },
  });
  assert.equal(await prisma.nomination.count({ where: { athleteId: athlete.id } }), 1);
  const consents = await prisma.consent.findMany({ where: { athleteId: athlete.id } });
  assert.equal(consents.length, 2);
  for (const [scope, key] of [
    ['data_processing', 'dataProcessing'],
    ['photo_publication', 'photoPublication'],
  ]) {
    const consent = consents.find((item) => item.scope === scope)!;
    assert.equal(consent.textShown, texts.texts[key!]);
    assert.equal(consent.textVersion, texts.textVersion);
    assert.equal(consent.federationId, federation.id);
  }
  console.log('PASS registration: organizer, stale text, concurrent duplicate, persisted consent');

  const grant = await prisma.roleAssignment.create({
    data: { userId: user.id, federationId: federation.id, role: 'secretary' },
  });
  const me = () => app.inject({ url: '/auth/me', headers });
  assert.equal((await me()).json().user.roles.length, 0);
  assert.equal((await me()).json().user.pendingAcknowledgments[0].roleAssignmentId, grant.id);
  const ackUrl = `/auth/role-assignments/${grant.id}/acknowledge`;
  const acknowledgment = { textVersion: ACCESS_ACKNOWLEDGMENT_VERSION };
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: ackUrl,
        headers: otherHeaders,
        payload: acknowledgment,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: ackUrl,
        headers,
        payload: { ...acknowledgment, textVersion: 'old' },
      })
    ).statusCode,
    409,
  );
  const accept = () =>
    app.inject({ method: 'POST', url: ackUrl, headers, payload: acknowledgment });
  const accepted = await accept();
  assert.equal(accepted.statusCode, 200, accepted.body);
  const evidence = await prisma.roleAssignment.findUniqueOrThrow({ where: { id: grant.id } });
  assert(evidence.acknowledgedAt);
  assert.equal(evidence.acknowledgedFromUserAgent, 'PD-DB-E2E');
  assert.equal((await accept()).statusCode, 200);
  assert.equal(
    (
      await prisma.roleAssignment.findUniqueOrThrow({ where: { id: grant.id } })
    ).acknowledgedAt?.getTime(),
    evidence.acknowledgedAt.getTime(),
  );
  assert.equal(
    await prisma.auditLog.count({
      where: { action: 'role.access_acknowledged', targetId: grant.id },
    }),
    1,
  );
  assert.equal((await me()).json().user.roles[0].federationId, federation.id);
  console.log('PASS acknowledgment: owner, version, activation, immutable evidence and audit');

  const png =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSioAAAAASUVORK5CYII=';
  const photoUrl = `/athletes/${athlete.id}/photo`;
  const uploaded = await app.inject({
    method: 'POST',
    url: photoUrl,
    headers: adminHeaders,
    payload: { filename: 'test.png', mimeType: 'image/png', contentBase64: png },
  });
  assert.equal(uploaded.statusCode, 201, uploaded.body);
  const publicUrl = `${photoUrl}?federationId=${federation.id}`;
  const photo = await app.inject(publicUrl);
  assert.equal(photo.statusCode, 200, photo.body);
  assert.deepEqual(photo.rawPayload, Buffer.from(png, 'base64'));
  assert.equal(photo.headers['cache-control'], 'private, no-store');
  assert.equal((await app.inject(photoUrl)).statusCode, 404);
  assert.equal((await app.inject(`${photoUrl}?federationId=${randomUUID()}`)).statusCode, 404);
  const attachment = await prisma.attachment.findFirstOrThrow({
    where: { athleteId: athlete.id, kind: 'athlete_photo' },
  });
  assert.equal(
    (
      await app.inject({
        url: `/athletes/${athlete.id}/attachments/${attachment.id}/download`,
        headers,
      })
    ).statusCode,
    404,
  );
  await prisma.athlete.update({ where: { id: athlete.id }, data: { privacyMode: 'hidden' } });
  assert.equal((await app.inject(publicUrl)).statusCode, 404);
  assert.equal((await app.inject({ url: photoUrl, headers })).statusCode, 200);
  assert.equal((await app.inject({ url: photoUrl, headers: otherHeaders })).statusCode, 404);
  await prisma.roleAssignment.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
  assert.equal((await app.inject({ url: photoUrl, headers })).statusCode, 404);
  assert.equal((await accept()).statusCode, 404);
  await prisma.athlete.update({
    where: { id: athlete.id },
    data: { userId: user.id, privacyMode: 'public_results' },
  });
  const consentId = consents.find((item) => item.scope === 'photo_publication')!.id;
  assert.equal(
    (
      await app.inject({
        method: 'POST',
        url: `/passport/consents/${consentId}/revoke`,
        headers: otherHeaders,
      })
    ).statusCode,
    404,
  );
  assert.equal(
    (await app.inject({ method: 'POST', url: `/passport/consents/${consentId}/revoke`, headers }))
      .statusCode,
    200,
  );
  assert((await prisma.consent.findUniqueOrThrow({ where: { id: consentId } })).revokedAt);
  assert.equal((await app.inject(publicUrl)).statusCode, 404);
  assert.equal((await app.inject({ url: photoUrl, headers })).statusCode, 200);
  assert.equal(
    await prisma.auditLog.count({
      where: { action: 'passport.consent.revoked', targetId: consentId },
    }),
    1,
  );
  console.log(
    'PASS photo: real storage, scope, hidden, role revocation, consent revocation and audit',
  );

  // Exercise real UUID constraints and transactional audit writes for all
  // passport creation paths that previously used a literal "pending" target.
  const post = async (url: string, payload: object, privileged = false) => {
    const response = await app.inject({
      method: 'POST',
      url,
      payload,
      headers: privileged ? adminHeaders : headers,
    });
    assert.equal(response.statusCode, 201, response.body);
    return response.json();
  };
  const assertAudit = async (action: string, targetId: string, count = 1) => {
    assert.match(
      targetId,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    assert.equal(
      await prisma.auditLog.count({ where: { action, targetId, result: 'success' } }),
      count,
    );
  };
  const document = (
    await post('/passport/attachments', {
      filename: 'evidence.txt',
      mimeType: 'text/plain',
      contentBase64: Buffer.from('synthetic evidence').toString('base64'),
      kind: 'misc',
    })
  ).attachment;
  const savedDocument = await prisma.attachment.findUniqueOrThrow({ where: { id: document.id } });
  assert.equal(savedDocument.uploadedByUserId, user.id);
  await assertAudit('passport.attachment.uploaded', document.id);

  await prisma.federation.update({
    where: { id: federation.id },
    data: { affiliationStatus: 'national_member', affiliationBody: 'isf' },
  });
  const review = (
    await post('/passport/requests', {
      federationId: federation.id,
      kind: 'official_profile',
      payload: { message: 'Synthetic request' },
      supportingAttachmentId: document.id,
    })
  ).request;
  assert.equal(
    (await prisma.passportReviewRequest.findUniqueOrThrow({ where: { id: review.id } }))
      .applicantUserId,
    user.id,
  );
  await assertAudit('passport.review_request.submitted', review.id);

  const profile = await prisma.officialProfile.create({
    data: { userId: user.id, functions: ['judge'] },
  });
  const credentialBody = {
    kind: 'certificate',
    name: 'Synthetic certificate',
    issuedByFederationId: federation.id,
    issuedAt: '2026-01-01',
    documentAttachmentId: document.id,
  };
  const credentialUrl = `/passport/official-profiles/${profile.id}/credentials`;
  assert.equal(
    (await app.inject({ method: 'POST', url: credentialUrl, headers, payload: credentialBody }))
      .statusCode,
    403,
  );
  const credential = (await post(credentialUrl, credentialBody, true)).credential;
  assert.equal(
    (await prisma.officialCredential.findUniqueOrThrow({ where: { id: credential.id } }))
      .officialProfileId,
    profile.id,
  );
  await assertAudit('passport.official_credential.issued', credential.id);

  const rankBody = {
    name: 'Synthetic rank',
    basis: 'Synthetic protocol',
    issuedByFederationId: federation.id,
    issuedAt: '2026-01-01',
  };
  const rankUrl = `/passport/athletes/${athlete.id}/ranks`;
  assert.equal(
    (await app.inject({ method: 'POST', url: rankUrl, headers, payload: rankBody })).statusCode,
    403,
  );
  const rank = (await post(rankUrl, rankBody, true)).rank;
  assert.equal(
    (await prisma.sportRankAward.findUniqueOrThrow({ where: { id: rank.id } })).athleteId,
    athlete.id,
  );
  await assertAudit('passport.sport_rank.issued', rank.id);

  const linkUrl = `/passport/athletes/${athlete.id}/external-links`;
  const linkBody = { system: 'openstreetlifting', externalId: `db-e2e-${suffix}` };
  assert.equal(
    (await app.inject({ method: 'POST', url: linkUrl, headers, payload: linkBody })).statusCode,
    403,
  );
  const link = (await post(linkUrl, linkBody, true)).link;
  await assertAudit('passport.external_identity.verified', link.id);
  const repeated = (await post(linkUrl, linkBody, true)).link;
  assert.equal(repeated.id, link.id);
  assert.equal(
    (await prisma.externalIdentityLink.findUniqueOrThrow({ where: { id: link.id } })).localEntityId,
    athlete.id,
  );
  assert.equal(
    await prisma.externalIdentityLink.count({
      where: {
        system: 'openstreetlifting',
        entityType: 'athlete',
        externalId: linkBody.externalId,
      },
    }),
    1,
  );
  await assertAudit('passport.external_identity.verified', link.id, 2);
  console.log(
    'PASS passport audit: attachment, review, credential, rank, identity create/update, role restrictions',
  );
} finally {
  await app.close();
  await prisma.$disconnect();
}
