import type { FeaturePlugin } from '../lib/load-plugins.js';
import { moduleLogger } from '../lib/logger.js';
import { prisma } from '../lib/db.js';

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
