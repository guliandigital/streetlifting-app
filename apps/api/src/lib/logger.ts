import { pino, type Logger, type LoggerOptions } from 'pino';

/**
 * Centralised PII redact list. Every new field that may carry a secret or
 * direct PII must be added here BEFORE it can flow into a log line.
 *
 * See ADR-0005 §"PII scrubbing".
 */
export const REDACT_PATHS: readonly string[] = [
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'set-cookie',
  '*.password',
  '*.token',
  '*.secret',
  '*.accessToken',
  '*.refreshToken',
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
  'body.password',
  'body.email',
  'body.phone',
  'body.dateOfBirth',
  'user.email',
  'user.phone',
  'user.dateOfBirth',
  'athlete.email',
  'athlete.phone',
  'athlete.dateOfBirth',
];

const isProd = process.env.NODE_ENV === 'production';

const baseOptions: LoggerOptions = {
  level: process.env.LOG_LEVEL ?? (isProd ? 'info' : 'debug'),
  redact: {
    paths: [...REDACT_PATHS],
    censor: '[redacted]',
  },
  base: {
    service: 'streetlifting-api',
    env: process.env.NODE_ENV ?? 'development',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label: string) => ({ level: label }),
  },
};

const transport = isProd
  ? undefined
  : { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l' } };

export const rootLogger: Logger = pino({
  ...baseOptions,
  ...(transport ? { transport } : {}),
});

/**
 * Build a module-scoped child logger. Every plugin/feature gets its own.
 * The `module` field is preserved across child bindings.
 */
export function moduleLogger(module: string): Logger {
  return rootLogger.child({ module });
}
