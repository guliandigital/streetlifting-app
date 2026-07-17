import type { FastifyRequest } from 'fastify';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma } from '../lib/db.js';
import { authenticateAccessToken } from '../lib/auth/middleware.js';
import {
  canAccessAuthorizationAction,
  type CompetitionScope,
} from '../lib/auth/authorization-matrix.js';
import { moduleLogger } from '../lib/logger.js';
import {
  LIVE_WS_PROTOCOL,
  configureCompetitionLiveUpdatesBackplane,
  subscribeCompetitionLiveUpdates,
} from '../lib/live-updates.js';
import { RedisLiveUpdatesBackplane } from '../lib/redis-live-updates-backplane.js';

const CLOSE_POLICY_VIOLATION = 1008;
const CLOSE_INTERNAL_ERROR = 1011;

function protocolTokens(request: FastifyRequest): string[] {
  const header = request.headers['sec-websocket-protocol'];
  if (typeof header !== 'string') return [];
  return header
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function accessTokenFromProtocol(request: FastifyRequest): string | null {
  const values = protocolTokens(request);
  if (!values.includes(LIVE_WS_PROTOCOL)) return null;
  return values.find((value) => value !== LIVE_WS_PROTOCOL) ?? null;
}

async function loadCompetitionScope(id: string): Promise<CompetitionScope | null> {
  const competition = await prisma.competition.findUnique({
    where: { id },
    select: {
      id: true,
      federationId: true,
      federation: { select: { isPublicResultsClosed: true } },
    },
  });
  if (!competition) return null;
  return {
    id: competition.id,
    federationId: competition.federationId,
    isPublicResultsClosed: competition.federation.isPublicResultsClosed,
  };
}

function closePolicy(
  socket: { close: (code?: number, data?: string) => void },
  reason: string,
): void {
  socket.close(CLOSE_POLICY_VIOLATION, reason);
}

export const liveUpdatesPlugin: FeaturePlugin = {
  name: 'live-updates',
  register: async (app) => {
    const redisUrl = process.env.REDIS_URL?.trim();
    if (redisUrl) {
      const backplane = new RedisLiveUpdatesBackplane(redisUrl, moduleLogger('live-updates'));
      configureCompetitionLiveUpdatesBackplane(app, backplane);
      await backplane.connect();
      app.addHook('onClose', () => backplane.close());
    }

    app.get<{ Params: { id: string } }>(
      '/live/competitions/:id',
      { websocket: true },
      (socket, req) => {
        // Attach an error listener before asynchronous role lookup so a failed
        // upgrade cannot become an unhandled EventEmitter error.
        socket.on('error', () => undefined);
        void (async () => {
          const user = await authenticateAccessToken(accessTokenFromProtocol(req));
          const competition = await loadCompetitionScope(req.params.id);
          if (!user || !competition) {
            closePolicy(socket, 'unauthorized');
            return;
          }
          if (!canAccessAuthorizationAction(user, 'competition.ops.readLive', { competition })) {
            closePolicy(socket, 'forbidden');
            return;
          }

          subscribeCompetitionLiveUpdates(app, competition.id, socket);
        })().catch(() => socket.close(CLOSE_INTERNAL_ERROR, 'live_update_error'));
      },
    );

    app.get<{ Params: { id: string } }>(
      '/live/public/competitions/:id',
      { websocket: true },
      (socket, req) => {
        socket.on('error', () => undefined);
        void (async () => {
          if (!protocolTokens(req).includes(LIVE_WS_PROTOCOL)) {
            closePolicy(socket, 'unsupported_protocol');
            return;
          }
          const competition = await loadCompetitionScope(req.params.id);
          if (
            !competition ||
            !canAccessAuthorizationAction(null, 'competition.publicScoreboard.read', {
              competition,
            })
          ) {
            closePolicy(socket, 'public_results_closed');
            return;
          }

          subscribeCompetitionLiveUpdates(app, competition.id, socket);
        })().catch(() => socket.close(CLOSE_INTERNAL_ERROR, 'live_update_error'));
      },
    );
  },
};
