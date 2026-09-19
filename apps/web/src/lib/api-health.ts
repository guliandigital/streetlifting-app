/** A successful HTTP exchange alone does not establish API availability. */
export async function probeApiHealth(signal: AbortSignal): Promise<void> {
  const response = await fetch('/api/health', {
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
  });
  if (!response.ok) throw new Error('API unavailable');
  const body: unknown = await response.json();
  if (!body || typeof body !== 'object' || !('status' in body) || body.status !== 'ok') {
    throw new Error('API unhealthy');
  }
}
