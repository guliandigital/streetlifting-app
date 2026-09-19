import { createPublicKey } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { SignJWT, exportJWK, importPKCS8, importSPKI, type JWK } from 'jose';
import { z } from 'zod';

const ASSERTION_TYPE = 'isf_id.module_launch';

const LaunchInput = z
  .object({
    subjectId: z.string().uuid(),
    email: z.string().email().max(254),
    displayName: z.string().trim().min(1).max(120),
    audience: z.string().trim().min(1).max(255),
  })
  .strict();

export interface IsfIdIssuerConfig {
  issuer: string;
  keyId: string;
  privateKeyPem: string;
  allowedAudiences: readonly string[];
  assertionTtlSeconds: number;
}

export interface IsfIdIssuer {
  readonly assertionTtlSeconds: number;
  jwks(): { keys: JWK[] };
  issueLaunchAssertion(input: z.input<typeof LaunchInput>): Promise<string>;
}

export async function isfIdIssuerConfigFromEnv(): Promise<IsfIdIssuerConfig> {
  const issuer = normalizeIssuer(process.env.ISF_ID_ISSUER);
  const keyId = (process.env.ISF_ID_KEY_ID ?? '').trim();
  if (!keyId) throw new Error('ISF_ID_KEY_ID must be configured');

  const audiences = (process.env.ISF_ID_ALLOWED_AUDIENCES ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (audiences.length === 0)
    throw new Error('ISF_ID_ALLOWED_AUDIENCES must contain at least one audience');

  const assertionTtlSeconds = Number(process.env.ISF_ID_ASSERTION_TTL_SECONDS ?? 120);
  if (
    !Number.isInteger(assertionTtlSeconds) ||
    assertionTtlSeconds < 30 ||
    assertionTtlSeconds > 300
  ) {
    throw new Error('ISF_ID_ASSERTION_TTL_SECONDS must be an integer between 30 and 300');
  }

  return {
    issuer,
    keyId,
    privateKeyPem: await privateKeyFromEnv(),
    allowedAudiences: audiences,
    assertionTtlSeconds,
  };
}

export async function createIsfIdIssuer(config: IsfIdIssuerConfig): Promise<IsfIdIssuer> {
  const privateKey = await importPKCS8(config.privateKeyPem, 'RS256');
  const publicPem = createPublicKey(config.privateKeyPem)
    .export({ type: 'spki', format: 'pem' })
    .toString();
  const publicKey = await importSPKI(publicPem, 'RS256');
  const publicJwk = await exportJWK(publicKey);
  const jwk: JWK = { ...publicJwk, kid: config.keyId, use: 'sig', alg: 'RS256' };

  return {
    assertionTtlSeconds: config.assertionTtlSeconds,
    jwks: () => ({ keys: [jwk] }),
    issueLaunchAssertion: async (input) => {
      const parsed = LaunchInput.parse(input);
      if (!config.allowedAudiences.includes(parsed.audience)) {
        throw new Error('Requested audience is not registered for ISF ID');
      }

      return new SignJWT({
        email: parsed.email.toLowerCase(),
        email_verified: true,
        name: parsed.displayName,
      })
        .setProtectedHeader({ alg: 'RS256', kid: config.keyId, typ: ASSERTION_TYPE })
        .setIssuer(config.issuer)
        .setSubject(parsed.subjectId)
        .setAudience(parsed.audience)
        .setJti(crypto.randomUUID())
        .setIssuedAt()
        .setNotBefore(0)
        .setExpirationTime(`${config.assertionTtlSeconds}s`)
        .sign(privateKey);
    },
  };
}

async function privateKeyFromEnv(): Promise<string> {
  const direct = process.env.ISF_ID_PRIVATE_KEY?.trim();
  if (direct) return direct.replace(/\\n/g, '\n');

  const path = process.env.ISF_ID_PRIVATE_KEY_PATH?.trim();
  if (path) return readFile(path, 'utf8');

  throw new Error('ISF_ID_PRIVATE_KEY or ISF_ID_PRIVATE_KEY_PATH must be configured');
}

function normalizeIssuer(value: string | undefined): string {
  if (!value?.trim()) throw new Error('ISF_ID_ISSUER must be configured');
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('ISF_ID_ISSUER must be an absolute URL');
  }

  const isLocalHttp =
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('ISF_ID_ISSUER must use HTTPS outside local development');
  }
  return url.toString().replace(/\/$/, '');
}
