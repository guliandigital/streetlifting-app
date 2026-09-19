import Fastify from 'fastify';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { publicRegistrationPlugin } from './public-registration.js';
import { buildConsentTexts } from '../lib/consent-texts.js';

const db = vi.hoisted(() => ({
  competition: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn() },
  discipline: { findUnique: vi.fn(), findMany: vi.fn() },
  division: { findUnique: vi.fn() },
  weightClass: { findUnique: vi.fn() },
  athlete: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  nomination: { findFirst: vi.fn(), create: vi.fn() },
  consent: { createMany: vi.fn() },
  $transaction: vi.fn(),
  $executeRaw: vi.fn(),
  $queryRaw: vi.fn(),
}));
vi.mock('../lib/db.js', async () => ({
  prisma: db,
  Prisma: (await vi.importActual('@prisma/client')).Prisma,
}));
vi.mock('../lib/audit.js', () => ({ fromRequest: () => ({}), record: vi.fn() }));
vi.mock('../lib/live-updates.js', () => ({ publishCompetitionLiveUpdate: vi.fn() }));

const id = '00000000-0000-4000-8000-000000000101';
const federationId = '00000000-0000-4000-8000-000000000201';
const disciplineId = '00000000-0000-4000-8000-000000000301';
const divisionId = '00000000-0000-4000-8000-000000000401';
const weightClassId = '00000000-0000-4000-8000-000000000501';
const federation = {
  id: federationId,
  nameRu: 'Федерация A',
  nameEn: 'Federation A',
  pdOperatorName: 'Оператор A',
  pdOperatorAddress: 'Адрес A',
  pdOperatorContact: 'pd@example.test',
  contactEmail: null,
  contactPhone: null,
  privacyPolicyUrl: 'https://example.test/privacy',
};
const competition = {
  id,
  federationId,
  federation,
  nameRu: 'Турнир A',
  nameEn: 'Meet A',
  status: 'draft',
  rulebook: 'ISF v5.1',
  startDate: new Date('2030-01-01'),
  endDate: new Date('2030-01-01'),
  isOnlineRegistrationOpen: true,
  registrationDeadline: null,
  entryFeeKopecks: 1000,
  teamMembers: [{ memberNameSnapshot: 'Организатор A' }],
  divisions: [],
};
const texts = buildConsentTexts({ federation, competition, organizerName: 'Организатор A' });
const payload = {
  athlete: {
    lastName: 'Иванов',
    firstName: 'Иван',
    dateOfBirth: '1990-01-01',
    gender: 'M',
    countryCode: 'RU',
  },
  disciplineId,
  divisionId,
  weightClassId,
  consentDataProcessing: true,
  consentPublicResults: false,
  consentPhotoPublication: false,
  consentSnapshotHash: texts.snapshotHash,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.competition.findUnique.mockResolvedValue(competition);
  db.competition.findUniqueOrThrow.mockResolvedValue(competition);
  db.$queryRaw.mockResolvedValue([{ status: competition.status }]);
  db.discipline.findUnique.mockResolvedValue({ id: disciplineId });
  db.discipline.findMany.mockResolvedValue([]);
  db.division.findUnique.mockResolvedValue({
    id: divisionId,
    competitionId: id,
    gender: 'M',
    ageMin: null,
    ageMax: null,
  });
  db.weightClass.findUnique.mockResolvedValue({ id: weightClassId, divisionId, disciplineId });
  db.nomination.findFirst.mockResolvedValue(null);
  db.athlete.findFirst.mockResolvedValue(null);
  db.athlete.create.mockResolvedValue({ id: 'athlete-a' });
  db.nomination.create.mockResolvedValue({
    id: 'nomination-a',
    status: 'draft',
    paymentStatus: 'unpaid',
  });
  db.$transaction.mockImplementation(async (work) => work(db));
});

async function submit(body = payload) {
  const app = Fastify();
  await app.register(publicRegistrationPlugin.register);
  try {
    return await app.inject({
      method: 'POST',
      url: `/public/competitions/${id}/registrations`,
      payload: body,
    });
  } finally {
    await app.close();
  }
}

describe('public registration consent and organizer gates', () => {
  it.each([
    { teamMembers: [] },
    { isOnlineRegistrationOpen: false },
    { registrationDeadline: new Date('2000-01-01') },
  ])('rejects unavailable registration before any writes: %j', async (patch) => {
    db.competition.findUnique.mockResolvedValue({ ...competition, ...patch });
    const result = await submit();
    expect(result.statusCode).toBe(409);
    expect(result.json().error.code).toBe('registration_closed');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects missing consent and missing snapshot', async () => {
    expect((await submit({ ...payload, consentDataProcessing: false })).statusCode).toBe(400);
    expect((await submit({ ...payload, consentSnapshotHash: '' })).statusCode).toBe(400);
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a stale operator text before any writes', async () => {
    db.competition.findUnique.mockResolvedValue({
      ...competition,
      federation: { ...federation, pdOperatorContact: 'new@example.test' },
    });
    const result = await submit();
    expect(result.statusCode).toBe(409);
    expect(result.json().error.code).toBe('consent_changed');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a division belonging to another competition', async () => {
    db.division.findUnique.mockResolvedValue({
      id: divisionId,
      competitionId: 'foreign',
      gender: 'M',
    });
    expect((await submit()).json().error.code).toBe('division_out_of_scope');
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it('stores exactly the accepted text in the correct federation, without optional consents', async () => {
    const result = await submit();
    expect(result.statusCode, result.body).toBe(201);
    expect(db.consent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          scope: 'data_processing',
          federationId,
          textShown: texts.texts.dataProcessing,
          textVersion: texts.textVersion,
          locale: 'ru',
        }),
      ],
    });
  });

  it('stores optional consents only when separately accepted', async () => {
    const result = await submit({
      ...payload,
      consentPublicResults: true,
      consentPhotoPublication: true,
    });
    expect(result.statusCode, result.body).toBe(201);
    expect(db.consent.createMany.mock.calls[0]?.[0].data).toEqual([
      expect.objectContaining({ textShown: texts.texts.dataProcessing }),
      expect.objectContaining({ scope: 'public_results', textShown: texts.texts.publicResults }),
      expect.objectContaining({
        scope: 'photo_publication',
        textShown: texts.texts.photoPublication,
      }),
    ]);
  });

  it('retains duplicate-registration protection', async () => {
    db.nomination.findFirst.mockResolvedValue({ id: 'existing' });
    const result = await submit();
    expect(result.statusCode).toBe(409);
    expect(result.json().error.code).toBe('duplicate_nomination');
    expect(db.consent.createMany).not.toHaveBeenCalled();
  });
});
