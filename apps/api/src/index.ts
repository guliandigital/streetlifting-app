import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';

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

app.get('/health', async () => ({ status: 'ok', service: 'streetlifting-api', version: '0.1.0' }));

try {
  await app.listen({ port, host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
