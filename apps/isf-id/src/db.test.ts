import { describe, expect, it } from 'vitest';
import { normalizeDatabaseUrl } from './db.js';

describe('ISF ID database connection URL', () => {
  it.each(['ep-example.neon.tech', 'ep-example-pooler.neon.tech'])(
    'allows time for a Neon cold start (%s)',
    (host) => {
      const normalized = new URL(
        normalizeDatabaseUrl(
          `postgresql://user:password@${host}/identity?sslmode=require&channel_binding=require`,
        )!,
      );
      expect(normalized.searchParams.get('connect_timeout')).toBe('15');
      expect(normalized.searchParams.get('sslmode')).toBe('require');
      expect(normalized.searchParams.get('channel_binding')).toBe('require');
      expect(normalized.searchParams.get('pgbouncer')).toBe(
        host.includes('-pooler') ? 'true' : null,
      );
    },
  );

  it.each(['0', '5', '30'])(
    'preserves an explicitly configured connection timeout (%s)',
    (timeout) => {
      const normalized = new URL(
        normalizeDatabaseUrl(
          `postgresql://user:password@ep-example-pooler.neon.tech/identity?connect_timeout=${timeout}&pgbouncer=false`,
        )!,
      );
      expect(normalized.searchParams.get('connect_timeout')).toBe(timeout);
      expect(normalized.searchParams.get('pgbouncer')).toBe('false');
    },
  );

  it.each(['localhost', 'db.example.test', 'ep-example.neon.tech.example.test'])(
    'does not add a timeout to unrelated hosts (%s)',
    (host) => {
      const normalized = new URL(
        normalizeDatabaseUrl(`postgresql://user:password@${host}/identity`)!,
      );
      expect(normalized.searchParams.has('connect_timeout')).toBe(false);
    },
  );

  it.each([undefined, '', 'not a database URL'])(
    'preserves missing or invalid input (%s)',
    (url) => {
      expect(normalizeDatabaseUrl(url)).toBe(url);
    },
  );
});
