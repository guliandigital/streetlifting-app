import nodemailer from 'nodemailer';
import { moduleLogger } from './logger.js';

const log = moduleLogger('mailer');

export type MailProvider = 'endpoint' | 'smtp';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface MailDeliveryResult {
  provider: MailProvider;
  messageId: string | null;
}

export class MailerNotConfiguredError extends Error {
  constructor() {
    super('Mail delivery is not configured');
    this.name = 'MailerNotConfiguredError';
  }
}

export class MailerDeliveryError extends Error {
  constructor(message: string, public readonly provider: MailProvider) {
    super(message);
    this.name = 'MailerDeliveryError';
  }
}

function configuredFrom(): string {
  return process.env.MAILER_FROM ?? process.env.SMTP_FROM ?? process.env.SMTP_USER ?? 'Streetlifting App <no-reply@streetlifting.app>';
}

function mailerTimeoutMs(): number {
  const value = Number(process.env.MAILER_TIMEOUT_MS ?? 10_000);
  return Number.isFinite(value) && value > 0 ? value : 10_000;
}

function envBool(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes((value ?? '').trim().toLowerCase());
}

export function mailerConfigured(): boolean {
  return Boolean(process.env.MAILER_ENDPOINT || process.env.SMTP_HOST);
}

async function sendViaEndpoint(message: MailMessage): Promise<MailDeliveryResult> {
  const endpoint = process.env.MAILER_ENDPOINT;
  if (!endpoint) throw new MailerNotConfiguredError();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), mailerTimeoutMs());
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(process.env.MAILER_ENDPOINT_TOKEN
          ? { authorization: `Bearer ${process.env.MAILER_ENDPOINT_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        from: configuredFrom(),
        to: message.to,
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
      signal: controller.signal,
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new MailerDeliveryError(`Mailer endpoint returned ${response.status}`, 'endpoint');
    }

    let messageId: string | null = null;
    try {
      const parsed = JSON.parse(responseText) as { id?: unknown; messageId?: unknown };
      messageId = typeof parsed.messageId === 'string'
        ? parsed.messageId
        : typeof parsed.id === 'string'
          ? parsed.id
          : null;
    } catch {
      messageId = null;
    }

    return { provider: 'endpoint', messageId };
  } finally {
    clearTimeout(timeout);
  }
}

async function sendViaSmtp(message: MailMessage): Promise<MailDeliveryResult> {
  const host = process.env.SMTP_HOST;
  if (!host) throw new MailerNotConfiguredError();

  const secure = envBool(process.env.SMTP_SECURE);
  const port = Number(process.env.SMTP_PORT ?? (secure ? 465 : 587));
  const timeoutMs = mailerTimeoutMs();
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  const transporter = nodemailer.createTransport({
    host,
    port: Number.isFinite(port) && port > 0 ? port : (secure ? 465 : 587),
    secure,
    ...(user && pass ? { auth: { user, pass } } : {}),
    connectionTimeout: timeoutMs,
    greetingTimeout: timeoutMs,
    socketTimeout: timeoutMs,
  });

  const result = await transporter.sendMail({
    from: configuredFrom(),
    to: message.to,
    subject: message.subject,
    text: message.text,
    ...(message.html ? { html: message.html } : {}),
  });

  return { provider: 'smtp', messageId: result.messageId ?? null };
}

export async function sendMail(message: MailMessage): Promise<MailDeliveryResult> {
  if (process.env.MAILER_ENDPOINT) {
    try {
      return await sendViaEndpoint(message);
    } catch (err) {
      if (process.env.SMTP_HOST) {
        log.warn({ err }, 'mailer endpoint failed, falling back to smtp');
        return sendViaSmtp(message);
      }
      throw err;
    }
  }

  if (process.env.SMTP_HOST) return sendViaSmtp(message);
  throw new MailerNotConfiguredError();
}
