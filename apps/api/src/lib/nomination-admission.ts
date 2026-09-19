import { admissionIssue } from '@streetlifting/domain';
import type { Prisma } from './db.js';
import { CompetitionConflict } from './competition-lifecycle.js';

export async function assertNominationAdmission(
  tx: Prisma.TransactionClient,
  competitionId: string,
  nomination: {
    athleteId: string;
    divisionId: string;
    disciplineId: string;
    weightClassId: string;
    bodyWeightAtWeighIn?: number | null | undefined;
  },
) {
  // Athlete edits take an exclusive lock, so an approval cannot race a change
  // to the identity data being checked. Lock order: competition -> athlete.
  await tx.$queryRaw`SELECT id FROM athlete WHERE id = ${nomination.athleteId}::uuid FOR SHARE`;
  const [competition, athlete, division, weightClass] = await Promise.all([
    tx.competition.findUniqueOrThrow({ where: { id: competitionId } }),
    tx.athlete.findUniqueOrThrow({ where: { id: nomination.athleteId } }),
    tx.division.findUniqueOrThrow({ where: { id: nomination.divisionId } }),
    tx.weightClass.findUniqueOrThrow({ where: { id: nomination.weightClassId } }),
  ]);
  if (
    division.competitionId !== competitionId ||
    weightClass.divisionId !== division.id ||
    (weightClass.disciplineId && weightClass.disciplineId !== nomination.disciplineId)
  ) {
    throw new CompetitionConflict(
      'admission_category_mismatch',
      'Nomination categories do not match the competition and discipline',
    );
  }
  const issue = admissionIssue({
    rulebook: competition.rulebook,
    startDate: competition.startDate.toISOString(),
    endDate: competition.endDate.toISOString(),
    athlete: { ...athlete, dateOfBirth: athlete.dateOfBirth?.toISOString() ?? null },
    division,
    bodyWeight: nomination.bodyWeightAtWeighIn ?? null,
    weightClass,
    requireWeighIn: true,
  });
  if (issue) throw new CompetitionConflict(issue, 'Admission requirements are not satisfied');
  return competition;
}
