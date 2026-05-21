import { describe, expect, it } from 'vitest';
import {
  ISF_EXPORT_SCHEMA_VERSION,
  ISF_SYNC_SCHEMA_VERSION,
  IsfApiMeta,
  IsfPublicAthleteRef,
  IsfSyncEvent,
} from './isf-export.js';

const exportedAt = '2026-05-20T00:00:00.000Z';
const source = { system: 'streetlifting.app' as const };
const provenance = {
  sourceSystem: 'streetlifting.app' as const,
  sourceTable: 'test',
  sourceId: '00000000-0000-0000-0000-000000000001',
  exportedAt,
};

describe('ISF export contracts', () => {
  it('validates versioned API metadata with provenance', () => {
    const parsed = IsfApiMeta.parse({
      schemaVersion: ISF_EXPORT_SCHEMA_VERSION,
      generatedAt: exportedAt,
      updatedAt: exportedAt,
      source,
      provenance,
      capabilities: {
        changedSince: true,
        cursorPagination: true,
        competitionSnapshot: true,
        records: true,
        webhooks: true,
      },
    });

    expect(parsed.schemaVersion).toBe('isf.export.v1');
  });

  it('allows birth year while keeping full birth date out of athlete refs', () => {
    const parsed = IsfPublicAthleteRef.parse({
      schemaVersion: ISF_EXPORT_SCHEMA_VERSION,
      updatedAt: exportedAt,
      source,
      provenance: { ...provenance, sourceTable: 'athlete' },
      id: '00000000-0000-0000-0000-000000000002',
      isfPersonId: null,
      publicProfileSlug: 'ivan-ivanov',
      displayName: 'Ivan Ivanov',
      birthYear: 1998,
      ageGroup: null,
      sex: 'M',
      countryCode: 'RU',
      regionCode: null,
      city: null,
      clubName: null,
    });

    expect(parsed).not.toHaveProperty('dateOfBirth');
  });

  it('validates sync events separately from export snapshots', () => {
    const parsed = IsfSyncEvent.parse({
      schemaVersion: ISF_SYNC_SCHEMA_VERSION,
      id: '00000000-0000-0000-0000-000000000003',
      eventType: 'competition.finalized',
      aggregateType: 'competition',
      aggregateId: '00000000-0000-0000-0000-000000000004',
      tenant: 'ru',
      payload: { competitionId: '00000000-0000-0000-0000-000000000004' },
      payloadHash: 'sha256-test',
      occurredAt: exportedAt,
      updatedAt: exportedAt,
      source,
      provenance,
    });

    expect(parsed.schemaVersion).toBe('isf.sync.v1');
  });
});
