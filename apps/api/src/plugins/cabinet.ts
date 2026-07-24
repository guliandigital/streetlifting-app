import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth/middleware.js';

function fullName(person: {
  lastName: string;
  firstName: string;
  middleName: string | null;
}): string {
  return [person.lastName, person.firstName, person.middleName].filter(Boolean).join(' ');
}

export interface CabinetOverviewActor {
  id: string;
  email: string;
  displayName: string;
}

/**
 * Canonical personal read model. Relying parties call this only after their
 * subject-bound ISF ID grant is consumed; no profile is searched by name or
 * unverified e-mail.
 */
export async function readCabinetOverview(user: CabinetOverviewActor) {
  const now = new Date();
  const [
    identity,
    athlete,
    judge,
    officialProfile,
    officialHistory,
    officialUpcoming,
    organizerHistory,
    reviewRequests,
    attachments,
    federations,
    roleAssignments,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        displayName: true,
        email: true,
        isEmailVerified: true,
        isfSubjectId: true,
        isfPersonId: true,
        phone: true,
        telegramHandle: true,
        consents: {
          where: { revokedAt: null },
          orderBy: { grantedAt: 'desc' },
          select: { id: true, scope: true, textVersion: true, grantedAt: true },
        },
      },
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
        privacyMode: true,
        _count: {
          select: {
            nominations: { where: { status: 'finished' } },
            records: { where: { revokedAt: null, ratifiedAt: { not: null } } },
          },
        },
        nominations: {
          where: { status: 'finished' },
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
          where: { revokedAt: null, ratifiedAt: { not: null } },
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
        sportRankAwards: {
          orderBy: { issuedAt: 'desc' },
          take: 12,
          select: {
            id: true,
            name: true,
            basis: true,
            issuedAt: true,
            expiresAt: true,
            status: true,
            statusReason: true,
            documentAttachmentId: true,
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
        _count: {
          select: {
            assignments: {
              where: { competition: { status: { in: ['finalized', 'archived'] } } },
            },
          },
        },
        assignments: {
          where: { competition: { status: { in: ['finalized', 'archived'] } } },
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
    prisma.officialProfile.findUnique({
      where: { userId: user.id },
      select: {
        id: true,
        functions: true,
        credentials: {
          orderBy: { issuedAt: 'desc' },
          take: 12,
          select: {
            id: true,
            kind: true,
            name: true,
            credentialNumber: true,
            issuedAt: true,
            expiresAt: true,
            status: true,
            statusReason: true,
            documentAttachmentId: true,
          },
        },
      },
    }),
    prisma.competitionTeamMember.findMany({
      where: {
        userId: user.id,
        status: 'completed',
        corrections: { none: {} },
        competition: { status: { in: ['finalized', 'archived'] } },
      },
      orderBy: { competition: { startDate: 'desc' } },
      take: 12,
      select: {
        id: true,
        role: true,
        status: true,
        completedAt: true,
        competition: { select: { id: true, nameRu: true, startDate: true, city: true } },
        platform: { select: { id: true, name: true } },
      },
    }),
    prisma.competitionTeamMember.findMany({
      where: {
        userId: user.id,
        status: { in: ['invited', 'confirmed'] },
        competition: {
          startDate: { gte: now },
          status: { in: ['registration_open', 'registration_closed', 'in_progress'] },
        },
      },
      orderBy: { competition: { startDate: 'asc' } },
      take: 8,
      select: {
        id: true,
        role: true,
        status: true,
        invitedAt: true,
        confirmedAt: true,
        competition: { select: { id: true, nameRu: true, startDate: true, city: true } },
        platform: { select: { id: true, name: true } },
      },
    }),
    prisma.competitionTeamMember.findMany({
      where: {
        userId: user.id,
        role: 'organizer',
        status: 'completed',
        corrections: { none: {} },
        competition: { status: { in: ['finalized', 'archived'] } },
      },
      orderBy: { competition: { startDate: 'desc' } },
      take: 12,
      select: {
        id: true,
        completedAt: true,
        competition: {
          select: {
            id: true,
            nameRu: true,
            startDate: true,
            city: true,
            teamMembers: {
              orderBy: { createdAt: 'asc' },
              select: {
                id: true,
                role: true,
                status: true,
                memberNameSnapshot: true,
                completedAt: true,
                platform: { select: { id: true, name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.passportReviewRequest.findMany({
      where: { applicantUserId: user.id },
      orderBy: { submittedAt: 'desc' },
      take: 24,
      select: {
        id: true,
        federationId: true,
        kind: true,
        status: true,
        payload: true,
        supportingAttachmentId: true,
        submittedAt: true,
        resolvedAt: true,
        reviewNote: true,
      },
    }),
    prisma.attachment.findMany({
      where: {
        deletedAt: null,
        OR: [
          { uploadedByUserId: user.id },
          { passportReviewRequests: { some: { applicantUserId: user.id } } },
          { officialCredentialDocuments: { some: { officialProfile: { userId: user.id } } } },
          { sportRankAwardDocuments: { some: { athlete: { userId: user.id } } } },
        ],
      },
      orderBy: { uploadedAt: 'desc' },
      take: 24,
      select: {
        id: true,
        kind: true,
        filename: true,
        mimeType: true,
        sizeBytes: true,
        uploadedAt: true,
      },
    }),
    prisma.federation.findMany({
      where: {
        affiliationStatus: 'national_member',
        affiliationBody: { in: ['isf', 'eusf'] },
      },
      orderBy: { nameRu: 'asc' },
      select: {
        id: true,
        code: true,
        nameRu: true,
        nameEn: true,
        countryCode: true,
        affiliationBody: true,
      },
    }),
    prisma.roleAssignment.findMany({
      where: { userId: user.id, revokedAt: null },
      select: { role: true, federationId: true },
    }),
  ]);

  const isPlatformAdmin = roleAssignments.some(
    (assignment) => assignment.role === 'platform_admin',
  );
  const managedFederationIds = new Set(
    isPlatformAdmin
      ? federations.map((federation) => federation.id)
      : roleAssignments
          .filter(
            (assignment) =>
              (assignment.role === 'federation_admin' || assignment.role === 'secretary') &&
              assignment.federationId,
          )
          .map((assignment) => assignment.federationId as string),
  );
  const managedFederations = federations.filter((federation) =>
    managedFederationIds.has(federation.id),
  );
  const managementRequests = managedFederationIds.size
    ? await prisma.passportReviewRequest.findMany({
        where: { federationId: { in: [...managedFederationIds] }, status: 'pending' },
        orderBy: { submittedAt: 'asc' },
        take: 100,
        select: {
          id: true,
          federationId: true,
          kind: true,
          payload: true,
          submittedAt: true,
          supportingAttachment: {
            select: { id: true, filename: true, mimeType: true, sizeBytes: true, uploadedAt: true },
          },
          applicant: { select: { displayName: true, email: true } },
        },
      })
    : [];

  return {
    identity: {
      displayName: identity?.displayName ?? user.displayName,
      email: identity?.email ?? user.email,
      isEmailVerified: identity?.isEmailVerified ?? false,
      isfSubjectId: identity?.isfSubjectId ?? null,
      isfPersonId: identity?.isfPersonId ?? null,
      phone: identity?.phone ?? null,
      telegramHandle: identity?.telegramHandle ?? null,
      consents: identity?.consents ?? [],
    },
    athlete: athlete
      ? {
          id: athlete.id,
          displayName: fullName(athlete),
          federationCardNumber: athlete.federationCardNumber,
          clubName: athlete.clubName,
          privacyMode: athlete.privacyMode,
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
          ranks: athlete.sportRankAwards,
        }
      : null,
    official:
      judge || officialProfile
        ? {
            id: officialProfile?.id ?? judge!.id,
            displayName: judge ? fullName(judge) : (identity?.displayName ?? user.displayName),
            categoryRu: judge?.categoryRu ?? null,
            categoryEn: judge?.categoryEn ?? null,
            cardNumber: judge?.cardNumber ?? null,
            cityRegion: judge?.cityRegion ?? null,
            functions: officialProfile?.functions ?? [],
            credentials: officialProfile?.credentials ?? [],
            assignmentsTotal: officialHistory.length,
            assignments: officialHistory,
            upcomingAssignments: officialUpcoming,
          }
        : null,
    organizer: organizerHistory.length
      ? {
          tournamentsTotal: organizerHistory.length,
          tournaments: organizerHistory.map((membership) => ({
            id: membership.id,
            completedAt: membership.completedAt,
            competition: membership.competition,
          })),
        }
      : null,
    requests: reviewRequests.map((request) => ({
      ...request,
      submittedAt: request.submittedAt.toISOString(),
      resolvedAt: request.resolvedAt?.toISOString() ?? null,
    })),
    attachments: attachments.map((attachment) => ({
      ...attachment,
      sizeBytes: attachment.sizeBytes.toString(),
      uploadedAt: attachment.uploadedAt.toISOString(),
    })),
    federations,
    management: managedFederations.length
      ? {
          federations: managedFederations,
          requests: managementRequests.map((request) => ({
            ...request,
            submittedAt: request.submittedAt.toISOString(),
            supportingAttachment: request.supportingAttachment
              ? {
                  ...request.supportingAttachment,
                  sizeBytes: request.supportingAttachment.sizeBytes.toString(),
                  uploadedAt: request.supportingAttachment.uploadedAt.toISOString(),
                }
              : null,
          })),
        }
      : null,
  };
}

/**
 * Personal read model. It deliberately composes data that already belongs to
 * the signed-in person; no profile is resolved by a name or e-mail match.
 */
const _legacyCabinetPlugin: FeaturePlugin = {
  name: 'cabinet-legacy',
  register: async (app) => {
    app.get('/health/cabinet', async () => ({ status: 'ok', module: 'cabinet' }));

    app.get('/cabinet/overview', { preHandler: requireAuth() }, async (req) => {
      const user = req.user!;
      const now = new Date();
      const [
        identity,
        athlete,
        judge,
        officialProfile,
        officialHistory,
        officialUpcoming,
        organizerHistory,
      ] = await Promise.all([
        prisma.user.findUnique({
          where: { id: user.id },
          select: {
            displayName: true,
            email: true,
            isEmailVerified: true,
            isfSubjectId: true,
            isfPersonId: true,
            phone: true,
            telegramHandle: true,
            consents: {
              where: { revokedAt: null },
              orderBy: { grantedAt: 'desc' },
              select: { id: true, scope: true, textVersion: true, grantedAt: true },
            },
          },
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
            privacyMode: true,
            _count: {
              select: {
                nominations: { where: { status: 'finished' } },
                records: { where: { revokedAt: null, ratifiedAt: { not: null } } },
              },
            },
            nominations: {
              where: { status: 'finished' },
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
              where: { revokedAt: null, ratifiedAt: { not: null } },
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
            sportRankAwards: {
              orderBy: { issuedAt: 'desc' },
              take: 12,
              select: {
                id: true,
                name: true,
                basis: true,
                issuedAt: true,
                expiresAt: true,
                status: true,
                statusReason: true,
                documentAttachmentId: true,
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
            _count: {
              select: {
                assignments: {
                  where: { competition: { status: { in: ['finalized', 'archived'] } } },
                },
              },
            },
            assignments: {
              where: { competition: { status: { in: ['finalized', 'archived'] } } },
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
        prisma.officialProfile.findUnique({
          where: { userId: user.id },
          select: {
            id: true,
            functions: true,
            credentials: {
              orderBy: { issuedAt: 'desc' },
              take: 12,
              select: {
                id: true,
                kind: true,
                name: true,
                credentialNumber: true,
                issuedAt: true,
                expiresAt: true,
                status: true,
                statusReason: true,
                documentAttachmentId: true,
              },
            },
          },
        }),
        prisma.competitionTeamMember.findMany({
          where: {
            userId: user.id,
            status: 'completed',
            corrections: { none: {} },
            competition: { status: { in: ['finalized', 'archived'] } },
          },
          orderBy: { competition: { startDate: 'desc' } },
          take: 12,
          select: {
            id: true,
            role: true,
            status: true,
            completedAt: true,
            competition: { select: { id: true, nameRu: true, startDate: true, city: true } },
            platform: { select: { id: true, name: true } },
          },
        }),
        prisma.competitionTeamMember.findMany({
          where: {
            userId: user.id,
            status: { in: ['invited', 'confirmed'] },
            competition: {
              startDate: { gte: now },
              status: { in: ['registration_open', 'registration_closed', 'in_progress'] },
            },
          },
          orderBy: { competition: { startDate: 'asc' } },
          take: 8,
          select: {
            id: true,
            role: true,
            status: true,
            invitedAt: true,
            confirmedAt: true,
            competition: { select: { id: true, nameRu: true, startDate: true, city: true } },
            platform: { select: { id: true, name: true } },
          },
        }),
        prisma.competitionTeamMember.findMany({
          where: {
            userId: user.id,
            role: 'organizer',
            status: 'completed',
            corrections: { none: {} },
            competition: { status: { in: ['finalized', 'archived'] } },
          },
          orderBy: { competition: { startDate: 'desc' } },
          take: 12,
          select: {
            id: true,
            completedAt: true,
            competition: {
              select: {
                id: true,
                nameRu: true,
                startDate: true,
                city: true,
                teamMembers: {
                  orderBy: { createdAt: 'asc' },
                  select: {
                    id: true,
                    role: true,
                    status: true,
                    memberNameSnapshot: true,
                    completedAt: true,
                    platform: { select: { id: true, name: true } },
                  },
                },
              },
            },
          },
        }),
      ]);

      return {
        identity: {
          displayName: identity?.displayName ?? user.displayName,
          email: identity?.email ?? user.email,
          isEmailVerified: identity?.isEmailVerified ?? false,
          isfSubjectId: identity?.isfSubjectId ?? null,
          isfPersonId: identity?.isfPersonId ?? null,
          phone: identity?.phone ?? null,
          telegramHandle: identity?.telegramHandle ?? null,
          consents: identity?.consents ?? [],
        },
        athlete: athlete
          ? {
              id: athlete.id,
              displayName: fullName(athlete),
              federationCardNumber: athlete.federationCardNumber,
              clubName: athlete.clubName,
              privacyMode: athlete.privacyMode,
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
              ranks: athlete.sportRankAwards,
            }
          : null,
        official:
          judge || officialProfile
            ? {
                id: officialProfile?.id ?? judge!.id,
                displayName: judge ? fullName(judge) : (identity?.displayName ?? user.displayName),
                categoryRu: judge?.categoryRu ?? null,
                categoryEn: judge?.categoryEn ?? null,
                cardNumber: judge?.cardNumber ?? null,
                cityRegion: judge?.cityRegion ?? null,
                functions: officialProfile?.functions ?? [],
                credentials: officialProfile?.credentials ?? [],
                assignmentsTotal: officialHistory.length,
                assignments: officialHistory,
                upcomingAssignments: officialUpcoming,
              }
            : null,
        organizer: organizerHistory.length
          ? {
              tournamentsTotal: organizerHistory.length,
              tournaments: organizerHistory.map((membership) => ({
                id: membership.id,
                completedAt: membership.completedAt,
                competition: membership.competition,
              })),
            }
          : null,
      };
    });
  },
};

export const cabinetPlugin: FeaturePlugin = {
  name: 'cabinet',
  register: async (app) => {
    app.get('/health/cabinet', async () => ({ status: 'ok', module: 'cabinet' }));
    app.get('/cabinet/overview', { preHandler: requireAuth() }, async (req) =>
      readCabinetOverview(req.user!),
    );
  },
};
