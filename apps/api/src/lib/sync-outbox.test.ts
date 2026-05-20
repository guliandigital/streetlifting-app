import { describe, expect, it, vi } from 'vitest';
import { ISF_SYNC_SCHEMA_VERSION } from '@streetlifting/domain';
import { createSyncOutboxEvent, outboxPayload } from './sync-outbox.js';
import { stableSha256 } from './stable-json.js';

describe('sync outbox helper', () => {
  it('creates a versioned event through the provided transaction client', async () => {
    const create = vi.fn().mockResolvedValue({ id: 'outbox-id' });
    const tx = { syncOutbox: { create } };
    const payload = outboxPayload({
      competitionId: '00000000-0000-0000-0000-000000000001',
      status: 'finalized',
    });

    await createSyncOutboxEvent(tx as never, {
      eventType: 'competition.finalized',
      aggregateType: 'competition',
      aggregateId: '00000000-0000-0000-0000-000000000001',
      tenant: 'ru',
      payload,
    });

    expect(create).toHaveBeenCalledWith({
      data: {
        eventType: 'competition.finalized',
        aggregateType: 'competition',
        aggregateId: '00000000-0000-0000-0000-000000000001',
        tenant: 'ru',
        schemaVersion: ISF_SYNC_SCHEMA_VERSION,
        payload,
        payloadHash: stableSha256(payload),
      },
    });
  });
});
