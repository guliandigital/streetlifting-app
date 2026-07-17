import type { FeaturePlugin } from '../lib/load-plugins.js';
import { moduleLogger } from '../lib/logger.js';
import { prisma } from '../lib/db.js';
import { getCompetitionLiveUpdatesStatus } from '../lib/live-updates.js';

export const healthPlugin: FeaturePlugin = {
  name: 'health',
  register: async (app) => {
    const log = moduleLogger('health');

    app.get('/health', async (req) => {
      log.debug({ requestId: req.requestId }, 'health probe');
      return {
        status: 'ok',
        service: 'streetlifting-api',
        version: '0.1.0',
        timestamp: new Date().toISOString(),
      };
    });

    app.get('/health/api', async () => ({ status: 'ok', module: 'api' }));

    app.get('/health/live-updates', async (_req, reply) => {
      const liveUpdates = getCompetitionLiveUpdatesStatus(app);
      if (liveUpdates.status === 'degraded') {
        return reply
          .code(503)
          .send({ status: 'degraded', module: 'live-updates', transport: liveUpdates.transport });
      }
      return { status: 'ok', module: 'live-updates', transport: liveUpdates.transport };
    });

    app.get('/health/db', async (_req, reply) => {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return { status: 'ok', module: 'db' };
      } catch (err) {
        log.error({ err }, 'db health probe failed');
        return reply.code(503).send({ status: 'down', module: 'db' });
      }
    });
  },
};
