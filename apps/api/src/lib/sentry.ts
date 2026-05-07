import * as Sentry from '@sentry/node';
import { moduleLogger } from './logger.js';

const log = moduleLogger('sentry');

const REDACT_HEADERS = ['authorization', 'cookie', 'x-csrf-token'];
const REDACT_BODY_FIELDS = ['password', 'token', 'accessToken', 'refreshToken', 'email', 'phone'];

/**
 * Initialise Sentry if `SENTRY_DSN` is set. Otherwise no-op.
 *
 * Defence-in-depth: even though pino's redact list strips PII from the
 * operational log, anything Sentry pulls from a Fastify request directly
 * goes through `beforeSend` first. See ADR-0005.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    log.debug('SENTRY_DSN not set — Sentry disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request?.headers) {
        for (const h of REDACT_HEADERS) {
          if (h in event.request.headers) event.request.headers[h] = '[redacted]';
        }
      }
      if (event.request?.cookies) {
        for (const k of Object.keys(event.request.cookies)) {
          event.request.cookies[k] = '[redacted]';
        }
      }
      if (event.user) {
        delete event.user.email;
        delete event.user.ip_address;
      }
      if (typeof event.request?.data === 'object' && event.request.data !== null) {
        const data = event.request.data as Record<string, unknown>;
        for (const f of REDACT_BODY_FIELDS) {
          if (f in data) data[f] = '[redacted]';
        }
      }
      return event;
    },
  });
  log.info('Sentry initialised');
}
