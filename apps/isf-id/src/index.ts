import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildIsfIdApp } from './isf-id-app.js';
import { createIsfIdIssuer, isfIdIssuerConfigFromEnv } from './issuer.js';

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? '127.0.0.1';
const serviceToken = process.env.ISF_ID_ISSUER_SERVICE_TOKEN ?? '';

const issuer = await createIsfIdIssuer(await isfIdIssuerConfigFromEnv());
const app = buildIsfIdApp(issuer, serviceToken);

// Vercel invokes the exported handler; self-hosted processes own their listener.
if (!process.env.VERCEL) await app.listen({ port, host });

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  await app.ready();
  app.server.emit('request', req, res);
}
