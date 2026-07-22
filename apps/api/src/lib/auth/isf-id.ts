import { createRemoteJWKSet, jwtVerify, type JWSHeaderParameters, type JWTPayload } from 'jose';
import { z } from 'zod';

const ASSERTION_TYPE = 'isf_id.module_launch';
const DEFAULT_AUDIENCE = 'streetlifting-api';
const JWKS_TIMEOUT_MS = 5_000;

const IsfIdPayload = z
  .object({
    sub: z.string().uuid(),
    iss: z.string().url(),
    aud: z.union([z.string(), z.array(z.string())]),
    exp: z.number().int().positive(),
    jti: z.string().min(16).max(256),
    email: z.string().email().max(254),
    email_verified: z.literal(true),
    name: z.string().trim().min(1).max(120),
  })
  .passthrough();

export interface IsfIdConfiguration {
  issuer: string;
  audience: string;
  jwksUrl: URL;
}

export interface VerifiedIsfIdAssertion {
  subjectId: string;
  issuer: string;
  audience: string;
  jti: string;
  expiresAt: Date;
  email: string;
  displayName: string;
}

export class IsfIdConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IsfIdConfigurationError';
  }
}

let cachedJwks: { url: string; keySet: ReturnType<typeof createRemoteJWKSet> } | null = null;

export function isIsfIdEnabled(): boolean {
  return process.env.ISF_ID_ENABLED === 'true';
}

export function isfIdConfigurationFromEnv(): IsfIdConfiguration {
  const issuer = normalizeUrl(process.env.ISF_ID_ISSUER, 'ISF_ID_ISSUER');
  const audience = (process.env.ISF_ID_AUDIENCE ?? DEFAULT_AUDIENCE).trim();
  if (!audience) throw new IsfIdConfigurationError('ISF_ID_AUDIENCE must not be empty');

  const jwksUrl = process.env.ISF_ID_JWKS_URL?.trim()
    ? normalizeUrl(process.env.ISF_ID_JWKS_URL, 'ISF_ID_JWKS_URL')
    : new URL('/.well-known/jwks.json', issuer);

  return { issuer: issuer.toString().replace(/\/$/, ''), audience, jwksUrl };
}

function normalizeUrl(value: string | undefined, variable: string): URL {
  if (!value?.trim())
    throw new IsfIdConfigurationError(`${variable} must be configured when ISF ID is enabled`);

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IsfIdConfigurationError(`${variable} must be an absolute URL`);
  }

  const isLocalHttp =
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw new IsfIdConfigurationError(`${variable} must use HTTPS outside local development`);
  }
  return url;
}

function remoteJwks(config: IsfIdConfiguration): ReturnType<typeof createRemoteJWKSet> {
  const url = config.jwksUrl.toString();
  if (!cachedJwks || cachedJwks.url !== url) {
    cachedJwks = {
      url,
      keySet: createRemoteJWKSet(config.jwksUrl, { timeoutDuration: JWKS_TIMEOUT_MS }),
    };
  }
  return cachedJwks.keySet;
}

/**
 * Verifies an ISF ID signed launch assertion. This accepts only the dedicated
 * form-post assertion type; it deliberately does not accept API access tokens
 * or arbitrary identity JWTs issued by the same key.
 */
export async function verifyIsfIdAssertion(token: string): Promise<VerifiedIsfIdAssertion> {
  if (!isIsfIdEnabled()) throw new IsfIdConfigurationError('ISF ID SSO is disabled');

  const config = isfIdConfigurationFromEnv();
  const { payload, protectedHeader } = await jwtVerify(token, remoteJwks(config), {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: ['RS256'],
  });
  return assertionFromPayload(payload, protectedHeader, config);
}

export function assertionFromPayload(
  payload: JWTPayload,
  protectedHeader: JWSHeaderParameters,
  config: Pick<IsfIdConfiguration, 'issuer' | 'audience'>,
): VerifiedIsfIdAssertion {
  if (protectedHeader.typ !== ASSERTION_TYPE) {
    throw new Error('Unexpected ISF ID assertion type');
  }

  const parsed = IsfIdPayload.safeParse(payload);
  if (!parsed.success) throw new Error('Invalid ISF ID assertion claims');
  if (parsed.data.iss.replace(/\/$/, '') !== config.issuer.replace(/\/$/, '')) {
    throw new Error('Unexpected ISF ID assertion issuer');
  }

  const audiences = Array.isArray(parsed.data.aud) ? parsed.data.aud : [parsed.data.aud];
  if (!audiences.includes(config.audience)) throw new Error('Unexpected ISF ID assertion audience');

  const expiresAt = new Date(parsed.data.exp * 1000);
  if (expiresAt.getTime() <= Date.now()) throw new Error('Expired ISF ID assertion');

  return {
    subjectId: parsed.data.sub,
    issuer: parsed.data.iss.replace(/\/$/, ''),
    audience: config.audience,
    jti: parsed.data.jti,
    expiresAt,
    email: parsed.data.email.toLowerCase(),
    displayName: parsed.data.name,
  };
}
