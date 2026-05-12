import { describe, expect, it } from 'vitest';
import { SyncEvent as SyncEventSchema, type SyncEvent } from '@streetlifting/domain';
import { createInMemorySyncStore, createSyncEngine, type SyncTransport } from './index.js';

function event(overrides: Record<string, unknown> = {}): SyncEvent {
  return SyncEventSchema.parse({
    id: crypto.randomUUID(),
    actorId: crypto.randomUUID(),
    aggregateType: 'federation',
    aggregateId: crypto.randomUUID(),
    type: 'federation.updated',
    payload: { field: 'contactEmail' },
    occurredAt: '2026-05-13T00:00:00.000Z',
    lamportClock: 1,
    appliedAt: null,
    originDeviceId: 'device-1',
    ...overrides,
  });
}

describe('sync engine', () => {
  it('stores pending events while offline', async () => {
    const store = createInMemorySyncStore();
    const engine = createSyncEngine({ store });
    const first = event();

    await engine.enqueue(first);

    await expect(store.pending()).resolves.toEqual([first]);
    expect(engine.status()).toBe('offline');
  });

  it('pushes pending events and marks accepted events as applied', async () => {
    const store = createInMemorySyncStore();
    const first = event({ id: crypto.randomUUID(), lamportClock: 2 });
    const second = event({ id: crypto.randomUUID(), lamportClock: 1 });
    const pushedIds: string[] = [];
    const transport: SyncTransport = {
      async push(events) {
        pushedIds.push(...events.map((item) => item.id));
        return {
          acceptedIds: events.map((item) => item.id),
          appliedAt: '2026-05-13T00:00:05.000Z',
        };
      },
    };
    const engine = createSyncEngine({ store, transport });

    await engine.enqueue(first);
    await engine.enqueue(second);
    await engine.flush();

    expect(pushedIds).toEqual([second.id, first.id]);
    await expect(store.pending()).resolves.toEqual([]);
    await expect(store.all()).resolves.toEqual([
      { ...second, appliedAt: '2026-05-13T00:00:05.000Z' },
      { ...first, appliedAt: '2026-05-13T00:00:05.000Z' },
    ]);
    expect(engine.status()).toBe('live');
  });
});
