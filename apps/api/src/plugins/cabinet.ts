import type { FeaturePlugin } from '../lib/load-plugins.js';
import { requireAuth } from '../lib/auth/middleware.js';
import { readCabinetOverview } from '../lib/cabinet-overview.js';

export const cabinetPlugin: FeaturePlugin = {
  name: 'cabinet',
  register: async (app) => {
    app.get('/health/cabinet', async () => ({ status: 'ok', module: 'cabinet' }));
    app.get('/cabinet/overview', { preHandler: requireAuth() }, async (req) =>
      readCabinetOverview(req.user!),
    );
  },
};
