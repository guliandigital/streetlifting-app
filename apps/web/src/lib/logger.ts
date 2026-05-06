/**
 * Frontend logger.
 *
 * No `console.*` directly anywhere in `apps/web` — call this. Lint will
 * enforce that at M1.
 *
 * Behaviour:
 *  - In dev: pretty console output with module tag
 *  - In production builds: console output is suppressed; errors and warnings
 *    are forwarded to Sentry (wired at M1) with PII scrubbed via Sentry's
 *    `beforeSend` hook
 *  - Every line gets a `module` field so a crash, click, or query can be
 *    attributed to its feature
 *
 * See ADR-0005.
 */

const isProd = import.meta.env.PROD;

type Level = 'debug' | 'info' | 'warn' | 'error';

export interface ModuleLogger {
  debug: (msg: string, fields?: Record<string, unknown>) => void;
  info: (msg: string, fields?: Record<string, unknown>) => void;
  warn: (msg: string, fields?: Record<string, unknown>) => void;
  error: (msg: string, fields?: Record<string, unknown>) => void;
}

function emit(level: Level, module: string, msg: string, fields?: Record<string, unknown>): void {
  const payload = { level, module, msg, ...(fields ?? {}), time: new Date().toISOString() };

  if (!isProd) {
    const line = `[${level}][${module}] ${msg}`;
    switch (level) {
      case 'debug':
        // eslint-disable-next-line no-console -- gated by !isProd
        console.debug(line, fields ?? '');
        return;
      case 'info':
        // eslint-disable-next-line no-console
        console.info(line, fields ?? '');
        return;
      case 'warn':
        // eslint-disable-next-line no-console
        console.warn(line, fields ?? '');
        return;
      case 'error':
        // eslint-disable-next-line no-console
        console.error(line, fields ?? '');
        return;
    }
  }

  if (level === 'warn' || level === 'error') {
    // M1: forward to Sentry. For now, retain a minimal trace.
    void payload;
  }
}

export function moduleLogger(module: string): ModuleLogger {
  return {
    debug: (msg, fields) => emit('debug', module, msg, fields),
    info: (msg, fields) => emit('info', module, msg, fields),
    warn: (msg, fields) => emit('warn', module, msg, fields),
    error: (msg, fields) => emit('error', module, msg, fields),
  };
}
