import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { ISF_SYNC_SCHEMA_VERSION, type IsfWebhookEnvelope } from '@streetlifting/domain';
import { prisma } from './db.js';
import type { Prisma } from './db.js';
import { stableJsonStringify } from './stable-json.js';

const RETRY_DELAYS_MS = [
  60_000,
  5 * 60_000,
  30 * 60_000,
  2 * 60 * 60_000,
  12 * 60 * 60_000,
] as const;

export function signWebhookBody(secret: string, timestamp: number, rawBody: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
}

export function formatWebhookSignature(secret: string, timestamp: number, rawBody: string): string {
  return `t=${timestamp},v1=${signWebhookBody(secret, timestamp, rawBody)}`;
}

export function verifyWebhookSignature(
  secret: string,
  rawBody: string,
  header: string,
  toleranceSeconds = 300,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  const parts = new Map(
    header.split(',').map((part) => {
      const [key, value] = part.split('=');
      return [key, value] as const;
    }),
  );
  const timestampRaw = parts.get('t');
  const signature = parts.get('v1');
  if (!timestampRaw || !signature) return false;

  const timestamp = Number(timestampRaw);
  if (!Number.isInteger(timestamp)) return false;
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false;

  const expected = signWebhookBody(secret, timestamp, rawBody);
  const expectedBuffer = Buffer.from(expected, 'hex');
  const actualBuffer = Buffer.from(signature, 'hex');
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}

export function nextWebhookAttemptAt(attemptsAfterFailure: number, now = new Date()): Date | null {
  const delay = RETRY_DELAYS_MS[attemptsAfterFailure - 1];
  if (delay === undefined) return null;
  return new Date(now.getTime() + delay);
}

export function isWebhookConfigured(): boolean {
  return Boolean(process.env.ISF_WEBHOOK_URL && process.env.ISF_WEBHOOK_SECRET);
}

export async function publishPendingSyncOutboxEvents(
  limit = 25,
): Promise<{ delivered: number; failed: number }> {
  const url = process.env.ISF_WEBHOOK_URL;
  const secret = process.env.ISF_WEBHOOK_SECRET;
  if (!url || !secret) return { delivered: 0, failed: 0 };

  const now = new Date();
  const events = await prisma.syncOutbox.findMany({
    where: {
      publishedAt: null,
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    take: limit,
  });

  let delivered = 0;
  let failed = 0;
  for (const event of events) {
    const deliveryId = randomUUID();
    const generatedAt = new Date().toISOString();
    const envelope: IsfWebhookEnvelope = {
      schemaVersion: ISF_SYNC_SCHEMA_VERSION,
      deliveryId,
      generatedAt,
      updatedAt: generatedAt,
      source: {
        system: 'streetlifting.app',
        ...(process.env.PUBLIC_BASE_URL ? { baseUrl: process.env.PUBLIC_BASE_URL } : {}),
      },
      provenance: {
        sourceSystem: 'streetlifting.app',
        sourceTable: 'sync_outbox',
        sourceId: event.id,
        exportedAt: generatedAt,
      },
      event: {
        schemaVersion: ISF_SYNC_SCHEMA_VERSION,
        id: event.id,
        eventType: event.eventType,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        tenant: event.tenant,
        payload: event.payload as Record<string, unknown>,
        payloadHash: event.payloadHash,
        occurredAt: event.occurredAt.toISOString(),
        updatedAt: event.occurredAt.toISOString(),
        source: {
          system: 'streetlifting.app',
          ...(process.env.PUBLIC_BASE_URL ? { baseUrl: process.env.PUBLIC_BASE_URL } : {}),
        },
        provenance: {
          sourceSystem: 'streetlifting.app',
          sourceTable: 'sync_outbox',
          sourceId: event.id,
          exportedAt: generatedAt,
        },
      },
    };
    const rawBody = stableJsonStringify(envelope);
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = formatWebhookSignature(secret, timestamp, rawBody);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-isf-event-id': event.id,
          'x-isf-event-type': event.eventType,
          'x-isf-delivery-id': deliveryId,
          'x-isf-schema-version': ISF_SYNC_SCHEMA_VERSION,
          'x-isf-signature': signature,
        },
        body: rawBody,
      });

      if (!response.ok) {
        throw new Error(`Webhook returned HTTP ${response.status}`);
      }

      await prisma.syncOutbox.update({
        where: { id: event.id },
        data: { publishedAt: new Date(), lastError: null },
      });
      delivered++;
    } catch (err) {
      failed++;
      const attempts = event.attempts + 1;
      const nextAttemptAt = nextWebhookAttemptAt(attempts);
      await prisma.syncOutbox.update({
        where: { id: event.id },
        data: {
          attempts,
          nextAttemptAt,
          lastError: err instanceof Error ? err.message.slice(0, 2000) : String(err).slice(0, 2000),
        } satisfies Prisma.SyncOutboxUpdateInput,
      });
    }
  }

  return { delivered, failed };
}
