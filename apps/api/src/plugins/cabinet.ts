import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth/middleware.js';

const ORGANIZER_ROLES = new Set(['platform_admin', 'federation_admin', 'secretary', 'accountant']);

function fullName(person: {
  lastName: string;
  firstName: string;
  middleName: string | null;
}): string {
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ');
}

/**
 * Personal read model. It deliberately composes data that already belongs to
 * the signed-in person; no profile is resolved by a name or e-mail match.
 */
export const cabinetPlugin: FeaturePlugin = {
  name: 'cabinet',
  register: async (app) => {
    app.get('/health/cabinet', async () => ({ status: 'ok', module: 'cabinet' }));

    app.get('/cabinet/overview', { preHandler: requireAuth() }, async (req) => {
      const user = req.user!;
      const federationIds = [
        ...new Set(
          user.roles
            .filter((assignment) => ORGANIZER_ROLES.has(assignment.role) && assignment.federationId)
            .map((assignment) => assignment.federationId!),
        ),
      ];
      const competitionIds = [
        ...new Set(
          user.roles
            .filter(
              (assignment) => ORGANIZER_ROLES.has(assignment.role) && assignment.competitionId,
            )
            .map((assignment) => assignment.competitionId!),
        ),
      ];
      const isPlatformAdmin = user.roles.some((assignment) => assignment.role === 'platform_admin');
      const canSeeOrganizerPanel =
        isPlatformAdmin || federationIds.length > 0 || competitionIds.length > 0;

      const [identity, athlete, judge, organizerCompetitions] = await Promise.all([
        prisma.user.findUnique({
          where: { id: user.id },
          select: { isfSubjectId: true },
        }),
        prisma.athlete.findUnique({
          where: { userId: user.id },
          select: {
            id: true,
            lastName: true,
            firstName: true,
            middleName: true,
            federationCardNumber: true,
            clubName: true,
            _count: { select: { nominations: true, records: true } },
            nominations: {
              orderBy: { competition: { startDate: 'desc' } },
              take: 12,
              select: {
                id: true,
                status: true,
                bestSuccessfulAttemptKg: true,
                finalScore: true,
                placeOverall: true,
                placeInDivision: true,
                placeInClass: true,
                competition: { select: { id: true, nameRu: true, startDate: true, city: true } },
                discipline: { select: { code: true, nameRu: true } },
              },
            },
            records: {
              where: { revokedAt: null },
              orderBy: { achievedOn: 'desc' },
              take: 12,
              select: {
                id: true,
                scope: true,
                result: true,
                achievedOn: true,
                ratifiedAt: true,
                discipline: { select: { code: true, nameRu: true } },
                competition: { select: { id: true, nameRu: true } },
              },
            },
          },
        }),
        prisma.judge.findUnique({
          where: { userId: user.id },
          select: {
            id: true,
            lastName: true,
            firstName: true,
            middleName: true,
            categoryRu: true,
            categoryEn: true,
            cardNumber: true,
            cityRegion: true,
            _count: { select: { assignments: true } },
            assignments: {
              orderBy: { competition: { startDate: 'desc' } },
              take: 12,
              select: {
                id: true,
                role: true,
                assignedAt: true,
                competition: { select: { id: true, nameRu: true, startDate: true, city: true } },
                platform: { select: { id: true, name: true } },
              },
            },
          },
        }),
        canSeeOrganizerPanel
          ? prisma.competition.findMany({
              where: isPlatformAdmin
                ? {}
                : {
                    OR: [
                      ...(federationIds.length ? [{ federationId: { in: federationIds } }] : []),
                      ...(competitionIds.length ? [{ id: { in: competitionIds } }] : []),
                    ],
                  },
              orderBy: { startDate: 'desc' },
              take: 20,
              select: {
                id: true,
                code: true,
                nameRu: true,
                startDate: true,
                endDate: true,
                city: true,
                status: true,
                federation: { select: { id: true, nameRu: true } },
                judgeAssignments: {
                  orderBy: [{ role: 'asc' }, { judge: { lastName: 'asc' } }],
                  select: {
                    id: true,
                    role: true,
                    platform: { select: { id: true, name: true } },
                    judge: {
                      select: { id: true, lastName: true, firstName: true, middleName: true },
                    },
                  },
                },
                roleAssignments: {
                  where: {
                    revokedAt: null,
                    role: { in: ['secretary', 'scoreboard_operator', 'speaker'] },
                  },
                  orderBy: { role: 'asc' },
                  select: {
                    id: true,
                    role: true,
                    user: { select: { id: true, displayName: true } },
                  },
                },
              },
            })
          : Promise.resolve([]),
      ]);

      return {
        identity: { isfSubjectId: identity?.isfSubjectId ?? null },
        athlete: athlete
          ? {
              id: athlete.id,
              displayName: fullName(athlete),
              federationCardNumber: athlete.federationCardNumber,
              clubName: athlete.clubName,
              appearancesTotal: athlete._count.nominations,
              recordsTotal: athlete._count.records,
              appearances: athlete.nominations.map((nomination) => ({
                id: nomination.id,
                status: nomination.status,
                bestSuccessfulAttemptKg: nomination.bestSuccessfulAttemptKg,
                finalScore: nomination.finalScore,
                placeOverall: nomination.placeOverall,
                placeInDivision: nomination.placeInDivision,
                placeInClass: nomination.placeInClass,
                competition: nomination.competition,
                discipline: nomination.discipline,
              })),
              records: athlete.records.map((record) => ({
                id: record.id,
                scope: record.scope,
                result: record.result,
                achievedOn: record.achievedOn,
                ratifiedAt: record.ratifiedAt,
                discipline: record.discipline,
                competition: record.competition,
              })),
            }
          : null,
        official: judge
          ? {
              id: judge.id,
              displayName: fullName(judge),
              categoryRu: judge.categoryRu,
              categoryEn: judge.categoryEn,
              cardNumber: judge.cardNumber,
              cityRegion: judge.cityRegion,
              assignmentsTotal: judge._count.assignments,
              assignments: judge.assignments,
            }
          : null,
        organizer: canSeeOrganizerPanel
          ? {
              competitions: organizerCompetitions.map((competition) => ({
                ...competition,
                judgeAssignments: competition.judgeAssignments.map((assignment) => ({
                  ...assignment,
                  judge: { id: assignment.judge.id, displayName: fullName(assignment.judge) },
                })),
              })),
            }
          : null,
      };
    });
  },
};
