import { SyncEvent, type SyncEvent as DomainSyncEvent } from '@streetlifting/domain';

export type SyncStatus = 'offline' | 'syncing' | 'live' | 'error';

export interface SyncPushResult {
  acceptedIds: string[];
  pulledEvents?: DomainSyncEvent[];
  appliedAt?: string;
}

export interface SyncTransport {
  push(events: DomainSyncEvent[]): Promise<SyncPushResult>;
}

export interface SyncEventStore {
  upsert(event: DomainSyncEvent): Promise<void>;
  pending(): Promise<DomainSyncEvent[]>;
  markApplied(ids: string[], appliedAt: string): Promise<void>;
  all(): Promise<DomainSyncEvent[]>;
}

export interface SyncEngine {
  enqueue(event: DomainSyncEvent): Promise<void>;
  status(): SyncStatus;
  flush(): Promise<void>;
}

export interface SyncEngineOptions {
  store?: SyncEventStore;
  transport?: SyncTransport;
  now?: () => string;
}

function cloneEvent(event: DomainSyncEvent): DomainSyncEvent {
  return SyncEvent.parse(event);
}

function sortEvents(events: DomainSyncEvent[]): DomainSyncEvent[] {
  return [...events].sort((left, right) => {
    if (left.lamportClock !== right.lamportClock) return left.lamportClock - right.lamportClock;
    const occurredOrder = left.occurredAt.localeCompare(right.occurredAt);
    return occurredOrder === 0 ? left.id.localeCompare(right.id) : occurredOrder;
  });
}

export function createInMemorySyncStore(initialEvents: DomainSyncEvent[] = []): SyncEventStore {
  const events = new Map<string, DomainSyncEvent>();
  for (const event of initialEvents) {
    const parsed = cloneEvent(event);
    events.set(parsed.id, parsed);
  }

  return {
    async upsert(event) {
      const parsed = cloneEvent(event);
      events.set(parsed.id, parsed);
    },
    async pending() {
      return sortEvents([...events.values()].filter((event) => event.appliedAt === null)).map(cloneEvent);
    },
    async markApplied(ids, appliedAt) {
      const idSet = new Set(ids);
      for (const [id, event] of events) {
        if (idSet.has(id)) {
          events.set(id, { ...event, appliedAt });
        }
      }
    },
    async all() {
      return sortEvents([...events.values()]).map(cloneEvent);
    },
  };
}

export function createSyncEngine(options: SyncEngineOptions = {}): SyncEngine {
  const store = options.store ?? createInMemorySyncStore();
  const now = options.now ?? (() => new Date().toISOString());
  let currentStatus: SyncStatus = options.transport ? 'live' : 'offline';

  return {
    async enqueue(event) {
      await store.upsert(event);
      if (!options.transport) currentStatus = 'offline';
    },
    status() {
      return currentStatus;
    },
    async flush() {
      if (!options.transport) {
        currentStatus = 'offline';
        return;
      }

      currentStatus = 'syncing';
      try {
        const pendingEvents = await store.pending();
        if (pendingEvents.length > 0) {
          const result = await options.transport.push(pendingEvents);
          for (const event of result.pulledEvents ?? []) {
            await store.upsert(event);
          }
          if (result.acceptedIds.length > 0) {
            await store.markApplied(result.acceptedIds, result.appliedAt ?? now());
          }
        }
        currentStatus = 'live';
      } catch (error) {
        currentStatus = 'error';
        throw error;
      }
    },
  };
}
