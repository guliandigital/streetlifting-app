import type { FeaturePlugin } from '../lib/load-plugins.js';
import { moduleLogger } from '../lib/logger.js';

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
        modules: { api: 'ok' },
        timestamp: new Date().toISOString(),
      };
    });

    app.get('/health/api', async () => ({ status: 'ok', module: 'api' }));
  },
};
