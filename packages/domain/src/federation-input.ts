import { z } from 'zod';

/**
 * Input shape for POST /federations. Same fields as Federation but without
 * server-managed ones (id, createdAt, updatedAt, securityKey is auto-rolled
 * server-side on create).
 */
export const FederationCreate = z
  .object({
    code: z.string().min(2).max(16),
    nameRu: z.string().min(1).max(200),
    nameEn: z.string().min(1).max(200),
    countryCode: z.string().length(2),
    regionCode: z.string().max(16).optional(),
    contactPhone: z.string().max(40).optional(),
    contactEmail: z.string().email().max(254).optional(),
    telegramHandle: z.string().max(64).optional(),
    vkUrl: z.string().url().max(2048).optional(),
    websiteUrl: z.string().url().max(2048).optional(),
    chiefAccountantName: z.string().max(200).optional(),
    cashierName: z.string().max(200).optional(),
    billingTariffKopecksPerNomination: z.number().int().nonnegative(),
  })
  .strict();
export type FederationCreate = z.infer<typeof FederationCreate>;

/**
 * Input shape for PATCH /federations/:id. Every field optional. Code and
 * countryCode are immutable post-create (changing them would orphan
 * historical references).
 */
export const FederationUpdate = z
  .object({
    nameRu: z.string().min(1).max(200).optional(),
    nameEn: z.string().min(1).max(200).optional(),
    regionCode: z.string().max(16).nullable().optional(),
    contactPhone: z.string().max(40).nullable().optional(),
    contactEmail: z.string().email().max(254).nullable().optional(),
    telegramHandle: z.string().max(64).nullable().optional(),
    vkUrl: z.string().url().max(2048).nullable().optional(),
    websiteUrl: z.string().url().max(2048).nullable().optional(),
    chiefAccountantName: z.string().max(200).nullable().optional(),
    cashierName: z.string().max(200).nullable().optional(),
    billingTariffKopecksPerNomination: z.number().int().nonnegative().optional(),
    isPublicResultsClosed: z.boolean().optional(),
    notificationsDisabled: z.boolean().optional(),
  })
  .strict();
export type FederationUpdate = z.infer<typeof FederationUpdate>;
