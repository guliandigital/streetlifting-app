import * as Sentry from '@sentry/react';
import { moduleLogger } from './logger.js';

const log = moduleLogger('sentry');

const REDACT_HEADERS = ['authorization', 'cookie', 'x-csrf-token'];
const REDACT_BODY_FIELDS = ['password', 'token', 'accessToken', 'refreshToken', 'email', 'phone'];

/**
 * Initialise Sentry if `VITE_SENTRY_DSN` is configured. Without a DSN we
 * no-op — keeps dev clean and lets self-hosters opt out entirely.
 *
 * `beforeSend` performs defence-in-depth PII scrubbing on top of Sentry's
 * built-in defaultPii=false stance. See ADR-0005 §"Frontend specifics".
 */
export function initSentry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) {
    log.debug('VITE_SENTRY_DSN not set — Sentry disabled');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
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
