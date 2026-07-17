import type { FastifyInstance } from 'fastify';

export const LIVE_WS_PROTOCOL = 'streetlifting-live.v1';

export interface CompetitionLiveUpdate {
  type: 'competition.updated';
  competitionId: string;
  occurredAt: string;
}

export type LiveUpdatesStatus =
  | { transport: 'in-process'; status: 'ok' }
  | { transport: 'redis'; status: 'ok' | 'degraded' };

export interface CompetitionLiveUpdatesBackplane {
  publish(update: CompetitionLiveUpdate): void | Promise<void>;
  subscribe(listener: (update: CompetitionLiveUpdate) => void): () => void;
  getStatus(): LiveUpdatesStatus;
}

interface LiveSocket {
  readyState: number;
  send(data: string): void;
  on(event: 'close' | 'error', listener: () => void): unknown;
}

class CompetitionLiveHub {
  private readonly subscribers = new Map<string, Set<LiveSocket>>();
  private readonly queued = new Set<string>();

  subscribe(competitionId: string, socket: LiveSocket): void {
    const sockets = this.subscribers.get(competitionId) ?? new Set<LiveSocket>();
    sockets.add(socket);
    this.subscribers.set(competitionId, sockets);

    const remove = () => this.unsubscribe(competitionId, socket);
    socket.on('close', remove);
    socket.on('error', remove);
  }

  publish(update: CompetitionLiveUpdate): void {
    // A component-attempt route delegates to the canonical route through
    // app.inject(), so coalesce duplicated invalidations in the same tick.
    if (this.queued.has(update.competitionId)) return;
    this.queued.add(update.competitionId);
    queueMicrotask(() => {
      this.queued.delete(update.competitionId);
      const sockets = this.subscribers.get(update.competitionId);
      if (!sockets || sockets.size === 0) return;

      const encoded = JSON.stringify(update);
      for (const socket of sockets) {
        if (socket.readyState !== 1) {
          this.unsubscribe(update.competitionId, socket);
          continue;
        }
        try {
          socket.send(encoded);
        } catch {
          this.unsubscribe(update.competitionId, socket);
        }
      }
    });
  }

  private unsubscribe(competitionId: string, socket: LiveSocket): void {
    const sockets = this.subscribers.get(competitionId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.subscribers.delete(competitionId);
  }
}

interface LiveUpdatesContext {
  hub: CompetitionLiveHub;
  backplane?: CompetitionLiveUpdatesBackplane;
  unsubscribe?: () => void;
}

const contexts = new WeakMap<object, LiveUpdatesContext>();

function getContext(app: FastifyInstance): LiveUpdatesContext {
  // Feature plugins are Fastify encapsulation children. They must share a
  // single hub because connections and mutations are registered by different
  // plugins on the same underlying HTTP server.
  const key = app.server as unknown as object;
  const existing = contexts.get(key);
  if (existing) return existing;
  const context = { hub: new CompetitionLiveHub() };
  contexts.set(key, context);
  return context;
}

export function subscribeCompetitionLiveUpdates(
  app: FastifyInstance,
  competitionId: string,
  socket: LiveSocket,
): void {
  getContext(app).hub.subscribe(competitionId, socket);
}

export function publishCompetitionLiveUpdate(app: FastifyInstance, competitionId: string): void {
  const update: CompetitionLiveUpdate = {
    type: 'competition.updated',
    competitionId,
    occurredAt: new Date().toISOString(),
  };
  const context = getContext(app);
  context.hub.publish(update);
  void Promise.resolve(context.backplane?.publish(update)).catch(() => undefined);
}

export function configureCompetitionLiveUpdatesBackplane(
  app: FastifyInstance,
  backplane: CompetitionLiveUpdatesBackplane,
): void {
  const context = getContext(app);
  context.unsubscribe?.();
  context.backplane = backplane;
  context.unsubscribe = backplane.subscribe((update) => context.hub.publish(update));
}

export function getCompetitionLiveUpdatesStatus(app: FastifyInstance): LiveUpdatesStatus {
  return getContext(app).backplane?.getStatus() ?? { transport: 'in-process', status: 'ok' };
}
