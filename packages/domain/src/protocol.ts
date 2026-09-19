import { z } from 'zod';

// Explicit projection: never expose the raw historical payload through staff exports.
export const protocolDataSchema = z.object({
  competition: z.object({ id: z.string(), code: z.string(), nameRu: z.string() }),
  nominations: z.array(
    z.object({
      id: z.string(),
      entryNumber: z.number().nullable(),
      status: z.string(),
      placeInClass: z.number().nullable(),
      placeInDivision: z.number().nullable(),
      placeOverall: z.number().nullable(),
      bodyWeightAtWeighIn: z.number().nullable(),
      bestSuccessfulAttemptKg: z.number().nullable(),
      finalScore: z.number().nullable(),
      athlete: z.object({
        firstName: z.string(),
        lastName: z.string(),
        middleName: z.string().nullable(),
      }),
      discipline: z.object({
        nameRu: z.string(),
        components: z.array(z.object({ id: z.string(), code: z.string() })),
      }),
      division: z.object({ nameRu: z.string() }),
      weightClass: z.object({ nameRu: z.string() }),
      declaredWeightClass: z.object({ nameRu: z.string() }).nullable().optional(),
      attempts: z.array(
        z.object({
          id: z.string(),
          componentId: z.string().nullable(),
          attemptNumber: z.number(),
          weightKg: z.number(),
          repsCount: z.number().nullable(),
          result: z.string(),
        }),
      ),
    }),
  ),
});

export type ProtocolData = z.infer<typeof protocolDataSchema>;
export interface CompetitionProtocol extends ProtocolData {
  provenance: {
    source: 'working' | 'finalization_snapshot' | 'legacy_unverified';
    approvalStatus: 'not_recorded';
    revision: number | null;
    createdAt: string | null;
    payloadHash: string | null;
  };
}

export function protocolAttemptSummary(nomination: ProtocolData['nominations'][number]): string {
  return nomination.attempts
    .map((attempt) =>
      [
        nomination.discipline.components.find((component) => component.id === attempt.componentId)
          ?.code ?? 'default',
        attempt.attemptNumber,
        attempt.weightKg,
        attempt.repsCount ?? '',
        attempt.result,
      ].join(':'),
    )
    .join(' | ');
}
