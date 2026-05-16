import { randomBytes } from 'node:crypto';
import { prisma } from './db.js';
import type { Prisma } from './db.js';
import * as audit from './audit.js';
import { moduleLogger } from './logger.js';

const log = moduleLogger('telegram');

export interface TelegramBindInput {
  code: string;
  chatId: string;
  telegramUserId?: string | null;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  auditBase: Omit<
    audit.AuditEntryInput,
    | 'action'
    | 'scopeFederationId'
    | 'scopeCompetitionId'
    | 'targetType'
    | 'targetId'
    | 'before'
    | 'after'
    | 'result'
  >;
}

export function generateTelegramBindCode(): string {
  let value = '';
  while (value.length < 10) {
    value += randomBytes(8)
      .toString('base64url')
      .replace(/[^A-Za-z0-9]/g, '');
  }
  return value.slice(0, 10).toUpperCase();
}

export async function bindTelegramCode(input: TelegramBindInput) {
  const now = new Date();
  const token = await prisma.telegramBindToken.findUnique({
    where: { code: input.code.trim().toUpperCase() },
  });
  if (!token) return { error: 'invalid_code' as const };
  if (token.usedAt) return { error: 'code_used' as const };
  if (token.expiresAt <= now) return { error: 'code_expired' as const };

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.telegramBindToken.updateMany({
      where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
      data: {
        usedAt: now,
        usedByChatId: input.chatId,
        usedByUsername: input.username ?? null,
      },
    });
    if (claimed.count !== 1) return { error: 'code_used' as const };

    const subscription = await tx.telegramSubscription.upsert({
      where: {
        federationId_chatId: {
          federationId: token.federationId,
          chatId: input.chatId,
        },
      },
      create: {
        federationId: token.federationId,
        chatId: input.chatId,
        telegramUserId: input.telegramUserId ?? null,
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        isActive: true,
      },
      update: {
        telegramUserId: input.telegramUserId ?? null,
        username: input.username ?? null,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        isActive: true,
      },
    });

    await audit.record(
      {
        ...input.auditBase,
        actorUserId: null,
        action: 'federation.telegram.bound',
        scopeFederationId: token.federationId,
        scopeCompetitionId: null,
        targetType: 'telegram_subscription',
        targetId: subscription.id,
        before: null,
        after: {
          chatId: input.chatId,
          username: input.username ?? null,
          tokenId: token.id,
        },
        result: 'success',
      },
      tx,
    );

    return { subscription, token };
  });
}

export async function enqueueTelegramRegistrationNotifications(
  tx: Prisma.TransactionClient,
  data: {
    federationId: string;
    competitionId: string;
    competitionName: string;
    nominationId: string;
    athleteName: string;
  },
): Promise<number> {
  const federation = await tx.federation.findUnique({
    where: { id: data.federationId },
    select: { notificationsDisabled: true },
  });
  if (!federation || federation.notificationsDisabled) return 0;

  const subscriptions = await tx.telegramSubscription.findMany({
    where: { federationId: data.federationId, isActive: true },
    select: { id: true },
  });
  if (subscriptions.length === 0) return 0;

  const message = [
    `Новая заявка: ${data.athleteName}`,
    `Соревнование: ${data.competitionName}`,
    `ID номинации: ${data.nominationId}`,
  ].join('\n');

  await tx.telegramNotification.createMany({
    data: subscriptions.map((subscription) => ({
      federationId: data.federationId,
      competitionId: data.competitionId,
      nominationId: data.nominationId,
      subscriptionId: subscription.id,
      message,
      status: 'pending',
    })),
  });
  return subscriptions.length;
}

async function sendTelegramMessage(
  chatId: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: 'telegram bot token is not configured' };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text }),
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false, error: `telegram api returned ${response.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

export async function deliverPendingTelegramNotifications(federationId: string, limit = 20) {
  const pending = await prisma.telegramNotification.findMany({
    where: { federationId, status: 'pending', subscription: { isActive: true } },
    include: { subscription: true },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  let sent = 0;
  let failed = 0;
  for (const item of pending) {
    if (!item.subscription) continue;
    const result = await sendTelegramMessage(item.subscription.chatId, item.message);
    if (result.ok) {
      sent += 1;
      const sentAt = new Date();
      await prisma.$transaction([
        prisma.telegramNotification.update({
          where: { id: item.id },
          data: { status: 'sent', sentAt, error: null },
        }),
        prisma.telegramSubscription.update({
          where: { id: item.subscription.id },
          data: { lastNotificationAt: sentAt },
        }),
      ]);
    } else if (process.env.TELEGRAM_BOT_TOKEN) {
      failed += 1;
      await prisma.telegramNotification.update({
        where: { id: item.id },
        data: { status: 'failed', error: result.error.slice(0, 500) },
      });
      log.warn({ notificationId: item.id, err: result.error }, 'telegram notification failed');
    }
  }

  return { pending: pending.length, sent, failed };
}
