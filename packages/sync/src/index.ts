/**
 * Offline-first sync engine for the desktop client.
 *
 * Strategy: append-only event log per device, replicated to the server when
 * online. Server orders events by Lamport clock, broadcasts back to other
 * connected clients via WebSocket. Aggregates are rebuilt by replay; conflicts
 * resolved per-aggregate by last-writer-wins on field level (with explicit
 * tombstones for deletes). See docs/architecture.md for details.
 *
 * This module is a placeholder — implementation lands in milestone M3.
 */

import type { SyncEvent } from '@streetlifting/domain';

export type SyncStatus = 'offline' | 'syncing' | 'live' | 'error';

export interface SyncEngine {
  enqueue(event: SyncEvent): Promise<void>;
  status(): SyncStatus;
  flush(): Promise<void>;
}
