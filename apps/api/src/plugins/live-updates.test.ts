import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  LIVE_WS_PROTOCOL,
  configureCompetitionLiveUpdatesBackplane,
  publishCompetitionLiveUpdate,
  type CompetitionLiveUpdate,
  type CompetitionLiveUpdatesBackplane,
  type LiveUpdatesStatus,
} from '../lib/live-updates.js';
import { liveUpdatesPlugin } from './live-updates.js';

const competitionId = '00000000-0000-4000-8000-000000000101';
const federationId = '00000000-0000-4000-8000-0000000000a1';

const prismaMock = vi.hoisted(() => ({
  competition: { findUnique: vi.fn() },
  user: { findUnique: vi.fn() },
}));

const verifyAccessToken = vi.hoisted(() => vi.fn());

vi.mock('../lib/db.js', () => ({ prisma: prismaMock }));
vi.mock('../lib/auth/tokens.js', () => ({ verifyAccessToken }));

function nextMessage(socket: { once: (event: 'message', cb: (data: Buffer) => void) => void }) {
  return new Promise<Record<string, unknown>>((resolve) => {
    socket.once('message', (data) =>
      resolve(JSON.parse(data.toString()) as Record<string, unknown>),
    );
  });
}

class TestBackplane implements CompetitionLiveUpdatesBackplane {
  private listener?: (update: CompetitionLiveUpdate) => void;

  constructor(private readonly peers: Set<TestBackplane>) {
    peers.add(this);
  }

  publish(update: CompetitionLiveUpdate): void {
    for (const peer of this.peers) {
      if (peer !== this) queueMicrotask(() => peer.listener?.(update));
    }
  }

  subscribe(listener: (update: CompetitionLiveUpdate) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) delete this.listener;
    };
  }

  getStatus(): LiveUpdatesStatus {
    return { transport: 'redis', status: 'ok' };
  }
}

async function buildApp() {
  const app = Fastify({ logger: false });
  await app.register(websocket, {
    options: {
      handleProtocols: (protocols: Set<string>) =>
        protocols.has(LIVE_WS_PROTOCOL) ? LIVE_WS_PROTOCOL : false,
    },
  });
  await app.register(liveUpdatesPlugin.register);
  await app.ready();
  return app;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('competition live updates', () => {
  it('fans out a no-PII invalidation to authorized and public subscribers', async () => {
    verifyAccessToken.mockResolvedValue({ sub: '00000000-0000-4000-8000-000000000001' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000001',
      email: 'judge@example.test',
      displayName: 'Judge',
      roleAssignments: [{ role: 'judge', federationId: null, competitionId }],
    });
    prismaMock.competition.findUnique.mockResolvedValue({
      id: competitionId,
      federationId,
      federation: { isPublicResultsClosed: false },
    });

    const app = await buildApp();
    try {
      const socket = await app.injectWS(`/live/competitions/${competitionId}`, {
        headers: { 'sec-websocket-protocol': `${LIVE_WS_PROTOCOL}, test-access-token` },
      });
      const publicSocket = await app.injectWS(`/live/public/competitions/${competitionId}`, {
        headers: { 'sec-websocket-protocol': LIVE_WS_PROTOCOL },
      });
      await vi.waitFor(() => expect(prismaMock.competition.findUnique).toHaveBeenCalledTimes(2));

      const update = nextMessage(socket);
      const publicUpdate = nextMessage(publicSocket);
      publishCompetitionLiveUpdate(app, competitionId);
      await expect(update).resolves.toMatchObject({
        type: 'competition.updated',
        competitionId,
      });
      await expect(publicUpdate).resolves.toMatchObject({
        type: 'competition.updated',
        competitionId,
      });
      socket.terminate();
      publicSocket.terminate();
    } finally {
      await app.close();
    }
  });

  it('delivers an invalidation to subscribers connected to another API instance', async () => {
    prismaMock.competition.findUnique.mockResolvedValue({
      id: competitionId,
      federationId,
      federation: { isPublicResultsClosed: false },
    });
    const peers = new Set<TestBackplane>();
    const appA = await buildApp();
    const appB = await buildApp();
    configureCompetitionLiveUpdatesBackplane(appA, new TestBackplane(peers));
    configureCompetitionLiveUpdatesBackplane(appB, new TestBackplane(peers));

    try {
      const socketA = await appA.injectWS(`/live/public/competitions/${competitionId}`, {
        headers: { 'sec-websocket-protocol': LIVE_WS_PROTOCOL },
      });
      const socketB = await appB.injectWS(`/live/public/competitions/${competitionId}`, {
        headers: { 'sec-websocket-protocol': LIVE_WS_PROTOCOL },
      });
      await vi.waitFor(() => expect(prismaMock.competition.findUnique).toHaveBeenCalledTimes(2));

      const updateA = nextMessage(socketA);
      const updateB = nextMessage(socketB);
      publishCompetitionLiveUpdate(appA, competitionId);

      await expect(updateA).resolves.toMatchObject({ type: 'competition.updated', competitionId });
      await expect(updateB).resolves.toMatchObject({ type: 'competition.updated', competitionId });
      socketA.terminate();
      socketB.terminate();
    } finally {
      await Promise.all([appA.close(), appB.close()]);
    }
  });

  it('closes an authenticated connection outside the competition scope', async () => {
    verifyAccessToken.mockResolvedValue({ sub: '00000000-0000-4000-8000-000000000002' });
    prismaMock.user.findUnique.mockResolvedValue({
      id: '00000000-0000-4000-8000-000000000002',
      email: 'other@example.test',
      displayName: 'Other judge',
      roleAssignments: [
        {
          role: 'judge',
          federationId: null,
          competitionId: '00000000-0000-4000-8000-000000000202',
        },
      ],
    });
    prismaMock.competition.findUnique.mockResolvedValue({
      id: competitionId,
      federationId,
      federation: { isPublicResultsClosed: false },
    });

    const app = await buildApp();
    try {
      const socket = await app.injectWS(`/live/competitions/${competitionId}`, {
        headers: { 'sec-websocket-protocol': `${LIVE_WS_PROTOCOL}, test-access-token` },
      });
      const closed = new Promise<{ code: number }>((resolve) => {
        socket.once('close', (code: number) => resolve({ code }));
      });
      await expect(closed).resolves.toEqual({ code: 1008 });
    } finally {
      await app.close();
    }
  });

  it('keeps the public topic closed when public results are disabled', async () => {
    prismaMock.competition.findUnique.mockResolvedValue({
      id: competitionId,
      federationId,
      federation: { isPublicResultsClosed: true },
    });

    const app = await buildApp();
    try {
      const socket = await app.injectWS(`/live/public/competitions/${competitionId}`, {
        headers: { 'sec-websocket-protocol': LIVE_WS_PROTOCOL },
      });
      const closed = new Promise<{ code: number }>((resolve) => {
        socket.once('close', (code: number) => resolve({ code }));
      });
      await expect(closed).resolves.toEqual({ code: 1008 });
    } finally {
      await app.close();
    }
  });
});
