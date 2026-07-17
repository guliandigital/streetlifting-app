import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import type { Logger } from 'pino';
import type {
  CompetitionLiveUpdate,
  CompetitionLiveUpdatesBackplane,
  LiveUpdatesStatus,
} from './live-updates.js';

const CHANNEL = 'streetlifting:competition-live-updates:v1';

interface RedisLiveUpdateMessage {
  version: 1;
  origin: string;
  update: CompetitionLiveUpdate;
}

function isLiveUpdateMessage(value: unknown): value is RedisLiveUpdateMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<RedisLiveUpdateMessage>;
  return (
    message.version === 1 &&
    typeof message.origin === 'string' &&
    message.update?.type === 'competition.updated' &&
    typeof message.update.competitionId === 'string' &&
    typeof message.update.occurredAt === 'string'
  );
}

/**
 * Optional Redis Pub/Sub transport. HTTP and WebSocket routes continue to
 * operate on a single process when REDIS_URL is not configured.
 */
export class RedisLiveUpdatesBackplane implements CompetitionLiveUpdatesBackplane {
  private readonly publisher;
  private readonly subscriber;
  private readonly origin = randomUUID();
  private listener?: (update: CompetitionLiveUpdate) => void;
  private status: LiveUpdatesStatus = { transport: 'redis', status: 'degraded' };

  constructor(
    redisUrl: string,
    private readonly log: Logger,
  ) {
    const socket = { connectTimeout: 1_000, reconnectStrategy: false as const };
    this.publisher = createClient({ url: redisUrl, socket });
    this.subscriber = this.publisher.duplicate();
    this.publisher.on('error', (err) => this.markDegraded(err));
    this.subscriber.on('error', (err) => this.markDegraded(err));
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([this.publisher.connect(), this.subscriber.connect()]);
      await this.subscriber.subscribe(CHANNEL, (rawMessage) => this.receive(rawMessage));
      this.status = { transport: 'redis', status: 'ok' };
      this.log.info({ channel: CHANNEL }, 'redis live updates backplane connected');
    } catch (err) {
      this.markDegraded(err);
      await this.close();
    }
  }

  subscribe(listener: (update: CompetitionLiveUpdate) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) delete this.listener;
    };
  }

  async publish(update: CompetitionLiveUpdate): Promise<void> {
    if (this.status.status !== 'ok') return;
    try {
      await this.publisher.publish(
        CHANNEL,
        JSON.stringify({
          version: 1,
          origin: this.origin,
          update,
        } satisfies RedisLiveUpdateMessage),
      );
    } catch (err) {
      this.markDegraded(err);
    }
  }

  getStatus(): LiveUpdatesStatus {
    return this.status;
  }

  async close(): Promise<void> {
    await Promise.all([this.closeClient(this.subscriber), this.closeClient(this.publisher)]);
  }

  private receive(rawMessage: string): void {
    try {
      const message: unknown = JSON.parse(rawMessage);
      if (!isLiveUpdateMessage(message) || message.origin === this.origin) return;
      this.listener?.(message.update);
    } catch {
      this.log.warn('discarded invalid redis live update message');
    }
  }

  private markDegraded(err: unknown): void {
    if (this.status.status === 'ok') {
      this.log.error({ err }, 'redis live updates backplane became unavailable');
    } else {
      this.log.warn({ err }, 'redis live updates backplane unavailable; using in-process delivery');
    }
    this.status = { transport: 'redis', status: 'degraded' };
  }

  private async closeClient(client: {
    isOpen: boolean;
    quit(): Promise<string>;
    disconnect(): void;
  }) {
    if (!client.isOpen) return;
    try {
      await client.quit();
    } catch {
      client.disconnect();
    }
  }
}
