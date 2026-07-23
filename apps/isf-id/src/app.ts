import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import { z } from 'zod';
import type { IsfIdIssuer } from './issuer.js';
import { registerIsfIdAuthentication } from './auth.js';
import { registerBrowserLogin } from './browser-login.js';
import { relyingPartiesFromEnv } from './relying-parties.js';

const LaunchBody = z
  .object({
    subjectId: z.string().uuid(),
    email: z.string().email().max(254),
    displayName: z.string().trim().min(1).max(120),
    audience: z.string().trim().min(1).max(255),
  })
  .strict();

export function buildIsfIdApp(issuer: IsfIdIssuer, serviceToken: string) {
  if (serviceToken.length < 32)
    throw new Error('ISF_ID_ISSUER_SERVICE_TOKEN must be at least 32 characters');

  const app = Fastify({
    logger: {
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.body.email'],
    },
    bodyLimit: 16 * 1024,
    trustProxy: true,
  });

  app.get('/health', async () => ({ status: 'ok', service: 'isf-id' }));
  const relyingParties = relyingPartiesFromEnv();
  registerBrowserLogin(app, relyingParties);
  registerIsfIdAuthentication(app, issuer, relyingParties);
  app.get('/.well-known/jwks.json', async (_req, reply) => {
    reply.header('cache-control', 'public, max-age=300, must-revalidate');
    return issuer.jwks();
  });

  app.post('/internal/v1/launch', async (req, reply) => {
    const authorization = req.headers.authorization;
    const provided = authorization?.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';
    if (!constantTimeMatch(provided, serviceToken)) {
      return reply.code(401).send({ error: { code: 'unauthorized', message: 'Unauthorized' } });
    }

    const parsed = LaunchBody.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: { code: 'validation_error', message: parsed.error.message } });
    }

    try {
      const token = await issuer.issueLaunchAssertion(parsed.data);
      return reply.send({ token });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to issue launch assertion';
      return reply.code(400).send({ error: { code: 'launch_rejected', message } });
    }
  });

  return app;
}

function constantTimeMatch(provided: string, expected: string): boolean {
  const actual = Buffer.from(provided);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
