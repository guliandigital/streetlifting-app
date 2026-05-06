import type { FeaturePlugin } from '../lib/load-plugins.js';

export const healthPlugin: FeaturePlugin = {
  name: 'health',
  register: async (app) => {
    app.get('/health', async () => ({
      status: 'ok',
      service: 'streetlifting-api',
      version: '0.1.0',
      modules: {
        api: 'ok',
      },
      timestamp: new Date().toISOString(),
    }));

    app.get('/health/api', async () => ({ status: 'ok', module: 'api' }));
  },
};
