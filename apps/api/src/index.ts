import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { loadPlugins } from './lib/load-plugins.js';
import { healthPlugin } from './plugins/health.js';

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';

const app = Fastify({
  logger: {
    transport:
      process.env.NODE_ENV !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
});

await app.register(helmet);
await app.register(cors, { origin: true, credentials: true });

const features = [
  healthPlugin,
  // Feature plugins are appended here as milestones land. Each loads
  // independently; see ADR-0003 for the isolation contract.
];

const result = await loadPlugins(app, features);
app.log.info(
  { loaded: result.loaded, failed: result.failed.map((f) => f.name) },
  'feature plugins boot complete',
);

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
