import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerRequestContext } from '../lib/request-context.js';
import { isfIdAuthPlugin } from './isf-id-auth.js';

describe('federation Passport bridge', () => {
  it('rejects a relying-party action without a signed ISF ID assertion', async () => {
    const app = Fastify({ logger: false });
    await registerRequestContext(app);
    await app.register(isfIdAuthPlugin.register);

    const response = await app.inject({
      method: 'POST',
      url: '/federation/passport/action',
      payload: { action: 'profile.update', displayName: 'ISF User' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('unauthorized');
    await app.close();
  });
});
