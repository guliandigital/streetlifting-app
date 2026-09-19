import { beforeEach, describe, expect, it, vi } from 'vitest';
import { snapshotHash } from './finalization-snapshot.js';

const tx = vi.hoisted(() => ({
  competition: { findUniqueOrThrow: vi.fn() },
  competitionFinalizationSnapshot: { findFirst: vi.fn() },
  nomination: { findMany: vi.fn() },
}));
vi.mock('./db.js', () => ({
  prisma: { $transaction: (fn: (client: typeof tx) => unknown) => fn(tx) },
}));
import { getCompetitionProtocol } from './competition-protocol.js';

const payload = {
  competition: { id: 'competition', code: 'cup', nameRu: 'Saved cup', federationId: 'private' },
  nominations: [
    {
      id: 'nomination',
      entryNumber: 1,
      status: 'finished',
      placeInClass: 1,
      placeInDivision: 1,
      placeOverall: 1,
      bodyWeightAtWeighIn: 75,
      bestSuccessfulAttemptKg: 50,
      finalScore: 50,
      athlete: {
        firstName: 'Saved',
        lastName: 'Name',
        middleName: null,
        dateOfBirth: '2000-01-01',
        phone: 'private',
      },
      discipline: { nameRu: 'Saved discipline', components: [] },
      division: { nameRu: 'Open' },
      weightClass: { nameRu: '80' },
      attempts: [],
      notes: 'private',
      paidAmountKopecks: '123',
    },
  ],
};
const snapshot = {
  schemaVersion: 1,
  revision: 1,
  createdAt: new Date('2030-01-01'),
  payloadHash: snapshotHash(payload),
  payload,
};

beforeEach(() => {
  vi.clearAllMocks();
  tx.competition.findUniqueOrThrow.mockResolvedValue({ id: 'competition', status: 'finalized' });
  tx.competitionFinalizationSnapshot.findFirst.mockResolvedValue(snapshot);
});

describe('protocol evidence', () => {
  it('projects saved evidence without exposing private or unrelated snapshot fields', async () => {
    const result = await getCompetitionProtocol('competition');
    expect(result.nominations[0]?.athlete.lastName).toBe('Name');
    expect(result.provenance).toMatchObject({
      source: 'finalization_snapshot',
      payloadHash: snapshot.payloadHash,
      approvalStatus: 'not_recorded',
    });
    expect(JSON.stringify(result)).not.toContain('private');
    expect(JSON.stringify(result)).not.toContain('paidAmountKopecks');
    expect(tx.nomination.findMany).not.toHaveBeenCalled();
  });

  it.each([
    { ...snapshot, payloadHash: 'corrupt' },
    { ...snapshot, schemaVersion: 2 },
    { ...snapshot, payload: {}, payloadHash: snapshotHash({}) },
  ])('fails closed on invalid evidence instead of silently rebuilding it', async (invalid) => {
    tx.competitionFinalizationSnapshot.findFirst.mockResolvedValue(invalid);
    await expect(getCompetitionProtocol('competition')).rejects.toThrow();
    expect(tx.nomination.findMany).not.toHaveBeenCalled();
  });

  it('rejects a snapshot belonging to another competition', async () => {
    await expect(getCompetitionProtocol('other')).rejects.toThrow('scope mismatch');
    expect(tx.nomination.findMany).not.toHaveBeenCalled();
  });
});
