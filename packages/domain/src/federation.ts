import { z } from 'zod';
import { FederationId } from './ids.js';

export const Federation = z.object({
  id: FederationId,
  code: z.string().min(2).max(16),
  nameRu: z.string().min(1),
  nameEn: z.string().min(1),
  countryCode: z.string().length(2),
  regionCode: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
  telegramHandle: z.string().optional(),
  vkUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  chiefAccountantName: z.string().optional(),
  cashierName: z.string().optional(),
  billingTariffRubPerNomination: z.number().nonnegative(),
  securityKey: z.string().uuid(),
  isPublicResultsClosed: z.boolean().default(false),
  notificationsDisabled: z.boolean().default(false),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type Federation = z.infer<typeof Federation>;

export const FederationBalance = z.object({
  federationId: FederationId,
  remainingNominations: z.number().int().nonnegative(),
  computedAt: z.string().datetime(),
});
export type FederationBalance = z.infer<typeof FederationBalance>;
