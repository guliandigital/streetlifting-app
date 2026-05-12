import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerRequestContext } from './request-context.js';
import { validateUuidParams } from './params.js';

describe('validateUuidParams', () => {
  it('rejects invalid uuid route params before handlers run', async () => {
    const app = Fastify();
    await registerRequestContext(app);
    app.addHook('preHandler', validateUuidParams(['fedId', 'id']));
    app.get('/federations/:fedId/chapters/:id', async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/federations/not-a-uuid/chapters/also-not-a-uuid',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      error: { code: 'invalid_id', message: 'Invalid fedId' },
    });
    await app.close();
  });

  it('allows valid uuid route params through', async () => {
    const app = Fastify();
    await registerRequestContext(app);
    app.addHook('preHandler', validateUuidParams(['id']));
    app.get('/athletes/:id', async () => ({ ok: true }));

    const response = await app.inject({
      method: 'GET',
      url: '/athletes/00000000-0000-4000-8000-000000000000',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    await app.close();
  });
});
