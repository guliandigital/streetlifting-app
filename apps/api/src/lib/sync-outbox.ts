import { ISF_SYNC_SCHEMA_VERSION } from '@streetlifting/domain';
import type { Prisma, PrismaClient } from './db.js';
import { stableJsonStringify, stableSha256 } from './stable-json.js';

type Tx = Prisma.TransactionClient | PrismaClient;

export interface SyncOutboxInput {
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  tenant?: string | null;
  payload: Prisma.InputJsonValue;
  occurredAt?: Date;
}

export async function createSyncOutboxEvent(tx: Tx, input: SyncOutboxInput) {
  return tx.syncOutbox.create({
    data: {
      eventType: input.eventType,
      aggregateType: input.aggregateType,
      aggregateId: input.aggregateId,
      tenant: input.tenant ?? null,
      schemaVersion: ISF_SYNC_SCHEMA_VERSION,
      payload: input.payload,
      payloadHash: stableSha256(input.payload),
      ...(input.occurredAt ? { occurredAt: input.occurredAt } : {}),
    },
  });
}

export function outboxPayload<T extends Record<string, unknown>>(
  payload: T,
): Prisma.InputJsonObject {
  return JSON.parse(stableJsonStringify(payload)) as Prisma.InputJsonObject;
}
