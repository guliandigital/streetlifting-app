import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { initSentry } from './lib/sentry.js';
import { rootLogger, moduleLogger } from './lib/logger.js';

// BigInt JSON serialization. Prisma returns BigInt for *Kopecks columns;
// JSON.stringify would throw without this. Serialised as a string so JS
// number's 53-bit precision can never silently truncate (ADR-0006).
(BigInt.prototype as { toJSON?: () => string }).toJSON = function (): string {
  return this.toString();
};

initSentry();
import { registerRequestContext } from './lib/request-context.js';
import { attachUser } from './lib/auth/middleware.js';
import { loadPlugins } from './lib/load-plugins.js';
import { healthPlugin } from './plugins/health.js';
import { authPlugin } from './plugins/auth.js';
import { federationsPlugin } from './plugins/federations.js';
import { athletesPlugin } from './plugins/athletes.js';
import rateLimit from '@fastify/rate-limit';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
const isProd = process.env.NODE_ENV === 'production';

const corsOrigins = (process.env.CORS_ORIGIN ?? 'http://localhost:1420')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const app = Fastify({
  loggerInstance: rootLogger,
  disableRequestLogging: false,
  trustProxy: isProd,
  bodyLimit: 1 * 1024 * 1024,
});

const boot = moduleLogger('boot');

await registerRequestContext(app);

// Attach req.user globally so every plugin can use requireAuth/requireRole.
app.addHook('preHandler', attachUser);

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      objectSrc: ["'none'"],
    },
  },
  strictTransportSecurity: isProd
    ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
    : false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

await app.register(cors, {
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  exposedHeaders: ['x-request-id'],
});

// Global rate limit; per-route stricter limits applied inside plugins.
await app.register(rateLimit, {
  max: 60,
  timeWindow: '1 minute',
});

const features = [
  healthPlugin,
  authPlugin,
  federationsPlugin,
  athletesPlugin,
  // Feature plugins are appended here as milestones land. Each loads
  // independently; see ADR-0003 for the isolation contract.
];

const result = await loadPlugins(app, features);
boot.info(
  { loaded: result.loaded, failed: result.failed.map((f) => f.name) },
  'feature plugins boot complete',
);

app.setErrorHandler((err: FastifyError, req, reply) => {
  const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
  req.log.error({ err, status }, 'request failed');
  reply.code(status).send({
    error: {
      code: err.code ?? (status >= 500 ? 'internal_error' : 'bad_request'),
      message: status >= 500 ? 'Internal error' : err.message,
      requestId: req.requestId,
    },
  });
});

try {
  await app.listen({ port, host });
} catch (err) {
  boot.fatal({ err }, 'server failed to start');
  process.exit(1);
}
