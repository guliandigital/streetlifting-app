import { z } from 'zod';
import { CompetitionStatus } from './enums.js';

const Timezone = z.string().min(3).max(64).regex(/^[A-Za-z_]+(?:\/[A-Za-z_+\-0-9]+)+$/);

const BaseCompetitionInput = z.object({
  federationId: z.string().uuid(),
  code: z.string().min(2).max(64),
  nameRu: z.string().min(1).max(200),
  nameEn: z.string().min(1).max(200),
  description: z.string().max(4000).optional(),
  rulebook: z.string().min(1).max(120).default('ISF v5.1'),
  startDate: z.string().date(),
  endDate: z.string().date(),
  registrationDeadline: z.string().datetime().optional(),
  city: z.string().max(120).optional(),
  venue: z.string().max(240).optional(),
  timezone: Timezone,
  status: CompetitionStatus.default('draft'),
  entryFeeKopecks: z.number().int().nonnegative().default(0),
  isOnlineRegistrationOpen: z.boolean().default(true),
});

type DateRangeInput = {
  startDate?: string | undefined;
  endDate?: string | undefined;
};

function validateDateRange(data: DateRangeInput, ctx: z.RefinementCtx): void {
  if (!data.startDate || !data.endDate) return;
  if (data.endDate < data.startDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'endDate must be on or after startDate',
    });
  }
}

export const CompetitionCreate = BaseCompetitionInput.strict().superRefine(validateDateRange);
export type CompetitionCreate = z.infer<typeof CompetitionCreate>;

export const CompetitionUpdate = BaseCompetitionInput.omit({ federationId: true, code: true })
  .partial()
  .extend({
    description: z.string().max(4000).nullable().optional(),
    city: z.string().max(120).nullable().optional(),
    venue: z.string().max(240).nullable().optional(),
    registrationDeadline: z.string().datetime().nullable().optional(),
  })
  .strict()
  .superRefine(validateDateRange);
export type CompetitionUpdate = z.infer<typeof CompetitionUpdate>;

export const CompetitionListQuery = z
  .object({
    federationId: z.string().uuid().optional(),
    status: CompetitionStatus.optional(),
    limit: z.coerce.number().int().positive().max(200).default(50),
    offset: z.coerce.number().int().nonnegative().default(0),
  })
  .strict();
export type CompetitionListQuery = z.infer<typeof CompetitionListQuery>;
