import { timingSafeEqual } from 'node:crypto';
import Fastify from 'fastify';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/index.js';
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

  app.setErrorHandler((error, request, reply) => {
    if (isDatabaseUnavailable(error)) {
      request.log.error({ err: error }, 'ISF ID database unavailable');
      reply.code(503).header('cache-control', 'no-store').header('retry-after', '30');
      const message = 'Sign-in is temporarily unavailable. Please try again shortly.';
      // Authorization validates the client before querying the session or issuing a code.
      if (request.method === 'GET' && request.routeOptions.url === '/oauth/authorize') {
        return reply
          .header('referrer-policy', 'no-referrer')
          .header('x-content-type-options', 'nosniff')
          .type('text/plain; charset=utf-8')
          .send(message);
      }
      return reply.send({ error: { code: 'identity_unavailable', message } });
    }

    if (
      typeof error === 'object' &&
      error !== null &&
      'statusCode' in error &&
      typeof error.statusCode === 'number' &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      return reply.send(error);
    }

    request.log.error({ err: error }, 'ISF ID request failed');
    return reply.code(500).header('cache-control', 'no-store').send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'Internal Server Error',
    });
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

function isDatabaseUnavailable(error: unknown): boolean {
  const code =
    error instanceof Prisma.PrismaClientKnownRequestError
      ? error.code
      : error instanceof Prisma.PrismaClientInitializationError
        ? error.errorCode
        : undefined;
  return code === 'P1001' || code === 'P1002' || code === 'P1017';
}

function constantTimeMatch(provided: string, expected: string): boolean {
  const actual = Buffer.from(provided);
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}
