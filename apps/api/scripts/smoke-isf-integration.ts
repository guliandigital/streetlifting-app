type Headers = Record<string, string>;

interface RequestOptions {
  headers?: Headers;
  expectedStatus?: number;
}

interface ListResponse {
  schemaVersion?: unknown;
  items?: unknown;
  nextCursor?: unknown;
  checksum?: unknown;
}

class SmokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SmokeError';
  }
}

const baseUrl = stripTrailingSlash(
  process.env.ISF_SMOKE_API_URL ?? process.env.API_URL ?? 'http://127.0.0.1:3000',
);
const serviceToken = process.env.ISF_SMOKE_SERVICE_TOKEN;
const tenant = process.env.ISF_SMOKE_TENANT ?? 'ru';
const allowMissingToken = process.env.ISF_SMOKE_ALLOW_MISSING_TOKEN === '1';

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

function urlFor(path: string): string {
  return `${baseUrl}${path}`;
}

function bearerHeaders(token: string): Headers {
  return { authorization: `Bearer ${token}` };
}

async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const response = await fetch(urlFor(path), {
    method: 'GET',
    headers: options.headers,
  });
  const expectedStatus = options.expectedStatus ?? 200;
  if (response.status !== expectedStatus) {
    const text = await response.text();
    throw new SmokeError(
      `GET ${path} expected ${expectedStatus}, got ${response.status}: ${text.slice(0, 500)}`,
    );
  }
  return response;
}

async function requestJson<T>(path: string, headers: Headers): Promise<T> {
  const response = await request(path, { headers });
  return (await response.json()) as T;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new SmokeError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertString(value: unknown, label: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throw new SmokeError(`${label} must be a non-empty string`);
  }
}

function assertListResponse(value: ListResponse, label: string): void {
  assertString(value.schemaVersion, `${label}.schemaVersion`);
  if (!Array.isArray(value.items)) throw new SmokeError(`${label}.items must be an array`);
  if (value.nextCursor !== null && value.nextCursor !== undefined) {
    assertString(value.nextCursor, `${label}.nextCursor`);
  }
  assertString(value.checksum, `${label}.checksum`);
}

async function smoke(): Promise<void> {
  await request('/isf/v1/meta', { expectedStatus: 401 });

  if (!serviceToken) {
    if (allowMissingToken) {
      console.log(
        `OK: ${baseUrl}/isf/v1/meta rejects anonymous access; set ISF_SMOKE_SERVICE_TOKEN for authenticated ISF smoke`,
      );
      return;
    }
    throw new SmokeError(
      'ISF_SMOKE_SERVICE_TOKEN is required for authenticated ISF smoke. Set ISF_SMOKE_ALLOW_MISSING_TOKEN=1 to run only the anonymous guard check.',
    );
  }

  await request('/isf/v1/meta', {
    headers: {
      ...bearerHeaders(serviceToken),
      origin: 'https://streetlifting.app',
    },
    expectedStatus: 403,
  });

  const headers = bearerHeaders(serviceToken);
  const meta = asRecord(await requestJson('/isf/v1/meta', headers), 'meta');
  const capabilities = asRecord(meta.capabilities, 'meta.capabilities');
  if (capabilities.cursorPagination !== true || capabilities.competitionSnapshot !== true) {
    throw new SmokeError('meta.capabilities does not include expected ISF export features');
  }

  const standards = asRecord(
    await requestJson('/isf/v1/standards?rulebook=ISF-v5.1', headers),
    'standards',
  );
  if (standards.rulebook !== 'ISF-v5.1') throw new SmokeError('standards.rulebook mismatch');
  if (!Array.isArray(standards.disciplines) || standards.disciplines.length === 0) {
    throw new SmokeError('standards.disciplines must be a non-empty array');
  }
  assertString(standards.checksum, 'standards.checksum');

  const tenantQuery = encodeURIComponent(tenant);
  assertListResponse(
    await requestJson(`/isf/v1/competitions?tenant=${tenantQuery}&limit=1`, headers),
    'competitions',
  );
  assertListResponse(
    await requestJson(`/isf/v1/records?tenant=${tenantQuery}&limit=1`, headers),
    'records',
  );

  console.log(`OK: ISF authenticated smoke passed for ${baseUrl} tenant=${tenant}`);
}

smoke().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`ISF smoke failed: ${message}`);
  process.exitCode = 1;
});
