import { buildIsfIdApp } from './app.js';
import { createIsfIdIssuer, isfIdIssuerConfigFromEnv } from './issuer.js';

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? '127.0.0.1';
const serviceToken = process.env.ISF_ID_ISSUER_SERVICE_TOKEN ?? '';

const issuer = await createIsfIdIssuer(await isfIdIssuerConfigFromEnv());
const app = buildIsfIdApp(issuer, serviceToken);

await app.listen({ port, host });
