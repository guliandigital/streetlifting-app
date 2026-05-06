import { z } from 'zod';
import { ReceiptId, WriteoffId, FederationId, CompetitionId } from './ids.js';
import { PaymentMethod } from './enums.js';

export const Receipt = z.object({
  id: ReceiptId,
  federationId: FederationId,
  number: z.string().min(1),
  date: z.string().date(),
  nominationsCount: z.number().int().positive(),
  amountRub: z.number().nonnegative(),
  paymentMethod: PaymentMethod,
  expiresAt: z.string().date(),
  externalReference: z.string().optional(),
  createdAt: z.string().datetime(),
});
export type Receipt = z.infer<typeof Receipt>;

export const Writeoff = z.object({
  id: WriteoffId,
  federationId: FederationId,
  number: z.string().min(1),
  date: z.string().date(),
  nominationsCount: z.number().int().positive(),
  competitionId: CompetitionId.nullable(),
  linkedReceiptId: ReceiptId.nullable(),
  createdAt: z.string().datetime(),
});
export type Writeoff = z.infer<typeof Writeoff>;
