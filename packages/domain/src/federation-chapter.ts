import { z } from 'zod';
import { FederationChapterId, FederationId } from './ids.js';

/**
 * Regional branch ("отделение") of a federation. Federations may have any
 * number of chapters across regions/cities. Used to attribute competitions
 * to a specific local organising arm and to scope role assignments later.
 */
export const FederationChapter = z.object({
  id: FederationChapterId,
  federationId: FederationId,
  code: z.string().min(1),
  nameRu: z.string().min(1),
  nameEn: z.string().min(1),
  countryCode: z.string().length(2).nullable(),
  regionCode: z.string().nullable(),
  city: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type FederationChapter = z.infer<typeof FederationChapter>;
