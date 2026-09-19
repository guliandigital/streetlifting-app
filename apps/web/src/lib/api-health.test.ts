import { afterEach, expect, it, vi } from 'vitest';
import { probeApiHealth } from './api-health.js';

afterEach(() => vi.unstubAllGlobals());
it.each([404, 500, 503])('rejects HTTP %s even when it responds quickly', async (status) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('{}', { status })),
  );
  await expect(probeApiHealth(new AbortController().signal)).rejects.toThrow('API unavailable');
});
it.each(['{"status":"down"}', '{}', 'null', '<html>login</html>'])(
  'rejects an unhealthy or non-API body: %s',
  async (body) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(body)),
    );
    await expect(probeApiHealth(new AbortController().signal)).rejects.toThrow();
  },
);
it('accepts the API health endpoint and bypasses cache', async () => {
  const fetchMock = vi.fn(async () => new Response('{"status":"ok"}'));
  vi.stubGlobal('fetch', fetchMock);
  await expect(probeApiHealth(new AbortController().signal)).resolves.toBeUndefined();
  expect(fetchMock).toHaveBeenCalledWith(
    '/api/health',
    expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }),
  );
});
it('propagates network errors', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      throw new TypeError('network');
    }),
  );
  await expect(probeApiHealth(new AbortController().signal)).rejects.toThrow('network');
});
