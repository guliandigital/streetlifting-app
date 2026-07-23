export interface IsfIdRelyingParty {
  audience: string;
  returnTo: string;
}

/**
 * Parses the small, explicit allow-list used by the browser login endpoint.
 * A launch assertion is never redirected to a URL supplied by a caller.
 *
 * Format: `audience=https://service.example/isf-id,audience2=https://...`.
 */
export function relyingPartiesFromEnv(
  value = process.env.ISF_ID_RELYING_PARTIES,
): IsfIdRelyingParty[] {
  if (!value?.trim()) return [];

  const seenAudiences = new Set<string>();
  const seenReturns = new Set<string>();
  return value.split(',').map((entry) => {
    const separator = entry.indexOf('=');
    const audience = separator === -1 ? '' : entry.slice(0, separator).trim();
    const returnTo = separator === -1 ? '' : entry.slice(separator + 1).trim();
    if (!audience || !returnTo) {
      throw new Error('ISF_ID_RELYING_PARTIES entries must be audience=https://host/path');
    }
    if (seenAudiences.has(audience)) {
      throw new Error(`ISF_ID_RELYING_PARTIES has duplicate audience: ${audience}`);
    }

    const normalized = normalizeReturnUrl(returnTo);
    if (seenReturns.has(normalized)) {
      throw new Error(`ISF_ID_RELYING_PARTIES has duplicate return URL: ${normalized}`);
    }
    seenAudiences.add(audience);
    seenReturns.add(normalized);
    return { audience, returnTo: normalized };
  });
}

export function findRelyingParty(
  relyingParties: readonly IsfIdRelyingParty[],
  audience: string,
  returnTo: string,
): IsfIdRelyingParty | null {
  let normalized: string;
  try {
    normalized = normalizeReturnUrl(returnTo);
  } catch {
    return null;
  }
  return (
    relyingParties.find((party) => party.audience === audience && party.returnTo === normalized) ??
    null
  );
}

function normalizeReturnUrl(value: string): string {
  const url = new URL(value);
  const isLocalHttp =
    url.protocol === 'http:' && ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !isLocalHttp) {
    throw new Error('ISF ID relying-party return URL must use HTTPS outside local development');
  }
  if (url.username || url.password || url.hash) {
    throw new Error('ISF ID relying-party return URL must not contain credentials or fragment');
  }
  return url.toString();
}
