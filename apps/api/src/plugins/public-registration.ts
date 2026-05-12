import { PublicCompetitionRegistrationCreate } from '@streetlifting/domain';
import type { CompetitionStatus } from '@prisma/client';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma, Prisma } from '../lib/db.js';
import { moduleLogger } from '../lib/logger.js';
import * as audit from '../lib/audit.js';
import { validateUuidParams } from '../lib/params.js';

const log = moduleLogger('public-registration');

const CLOSED_STATUSES = [
  'registration_closed',
  'finalized',
  'archived',
] satisfies CompetitionStatus[];
const CLOSED_STATUS_SET = new Set<string>(CLOSED_STATUSES);
const CONSENT_TEXT_VERSION = '2026-05-11.v1';
const CONSENT_TEXTS = {
  data_processing: 'I consent to personal data processing for participation in the competition.',
  public_results: 'I consent to publication of my competition results on public result pages.',
  photo_publication: 'I consent to publication of my athlete photo and event media materials.',
} as const;

class PublicRegistrationError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PublicRegistrationError';
  }
}

function registrationAvailability(competition: {
  status: CompetitionStatus;
  isOnlineRegistrationOpen: boolean;
  registrationDeadline: Date | null;
}): { isAvailable: boolean; reason: string | null } {
  if (!competition.isOnlineRegistrationOpen) return { isAvailable: false, reason: 'closed' };
  if (CLOSED_STATUS_SET.has(competition.status))
    return { isAvailable: false, reason: competition.status };
  if (competition.registrationDeadline && competition.registrationDeadline.getTime() < Date.now()) {
    return { isAvailable: false, reason: 'deadline_passed' };
  }
  return { isAvailable: true, reason: null };
}

function clientIp(requestIp: string | undefined): string | null {
  return requestIp ? requestIp.slice(0, 64) : null;
}

function userAgent(header: string | string[] | undefined): string | null {
  if (Array.isArray(header)) return header.join(', ').slice(0, 512);
  return header ? header.slice(0, 512) : null;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function registrationNotes(data: PublicCompetitionRegistrationCreate): string | undefined {
  const lines = [
    'public online registration',
    data.contactPhone ? `phone: ${data.contactPhone}` : null,
    data.contactEmail ? `email: ${data.contactEmail}` : null,
    data.notes ? `notes: ${data.notes}` : null,
  ].filter(Boolean);
  return lines.length > 0 ? lines.join('\n') : undefined;
}

function validateWeightClass(
  weightClass: { divisionId: string; disciplineId: string | null } | null,
  divisionId: string,
  disciplineId: string,
): boolean {
  return Boolean(
    weightClass &&
    weightClass.divisionId === divisionId &&
    (!weightClass.disciplineId || weightClass.disciplineId === disciplineId),
  );
}

export const publicRegistrationPlugin: FeaturePlugin = {
  name: 'public-registration',
  register: async (app) => {
    app.addHook('preHandler', validateUuidParams(['id']));

    app.get('/health/public-registration', async () => ({
      status: 'ok',
      module: 'public-registration',
    }));

    app.get<{ Params: { code: string } }>(
      '/public/federations/:code/registrations',
      async (req, reply) => {
        const federation = await prisma.federation.findUnique({
          where: { code: req.params.code },
          select: {
            id: true,
            code: true,
            nameRu: true,
            nameEn: true,
            competitions: {
              where: {
                isOnlineRegistrationOpen: true,
                status: { notIn: CLOSED_STATUSES },
                OR: [{ registrationDeadline: null }, { registrationDeadline: { gt: new Date() } }],
              },
              orderBy: [{ startDate: 'asc' }, { nameRu: 'asc' }],
              select: {
                id: true,
                code: true,
                nameRu: true,
                nameEn: true,
                startDate: true,
                endDate: true,
                registrationDeadline: true,
                city: true,
                venue: true,
                entryFeeKopecks: true,
                _count: { select: { nominations: true } },
              },
            },
          },
        });

        if (!federation) {
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Federation not found', requestId: req.requestId },
          });
        }

        return { federation, competitions: federation.competitions };
      },
    );

    app.get<{ Params: { id: string } }>(
      '/public/competitions/:id/registration',
      async (req, reply) => {
        const [competition, disciplines] = await Promise.all([
          prisma.competition.findUnique({
            where: { id: req.params.id },
            select: {
              id: true,
              federationId: true,
              code: true,
              nameRu: true,
              nameEn: true,
              startDate: true,
              endDate: true,
              registrationDeadline: true,
              city: true,
              venue: true,
              timezone: true,
              status: true,
              entryFeeKopecks: true,
              isOnlineRegistrationOpen: true,
              federation: {
                select: { id: true, code: true, nameRu: true, nameEn: true },
              },
              divisions: {
                orderBy: [{ gender: 'asc' }, { code: 'asc' }],
                include: { weightClasses: { orderBy: { order: 'asc' } } },
              },
            },
          }),
          prisma.discipline.findMany({
            orderBy: [{ nameRu: 'asc' }],
            select: {
              id: true,
              code: true,
              nameRu: true,
              nameEn: true,
              attemptCount: true,
              fixedWeightKg: true,
              format: true,
            },
          }),
        ]);

        if (!competition) {
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Competition not found',
              requestId: req.requestId,
            },
          });
        }

        const availability = registrationAvailability(competition);
        return { competition, disciplines, registration: availability };
      },
    );

    app.post<{ Params: { id: string } }>(
      '/public/competitions/:id/registrations',
      {
        config: {
          rateLimit: { max: 30, timeWindow: '1 minute' },
        },
      },
      async (req, reply) => {
        const parsed = PublicCompetitionRegistrationCreate.safeParse(req.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
              requestId: req.requestId,
            },
          });
        }

        const data = parsed.data;
        const competition = await prisma.competition.findUnique({
          where: { id: req.params.id },
          select: {
            id: true,
            federationId: true,
            nameRu: true,
            status: true,
            isOnlineRegistrationOpen: true,
            registrationDeadline: true,
            entryFeeKopecks: true,
          },
        });
        if (!competition) {
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Competition not found',
              requestId: req.requestId,
            },
          });
        }

        const availability = registrationAvailability(competition);
        if (!availability.isAvailable) {
          return reply.code(409).send({
            error: {
              code: 'registration_closed',
              message: 'Online registration is closed',
              requestId: req.requestId,
            },
          });
        }

        const [discipline, division, weightClass, declaredWeightClass] = await Promise.all([
          prisma.discipline.findUnique({ where: { id: data.disciplineId }, select: { id: true } }),
          prisma.division.findUnique({
            where: { id: data.divisionId },
            select: { id: true, competitionId: true, gender: true },
          }),
          prisma.weightClass.findUnique({
            where: { id: data.weightClassId },
            select: { id: true, divisionId: true, disciplineId: true },
          }),
          data.declaredWeightClassId
            ? prisma.weightClass.findUnique({
                where: { id: data.declaredWeightClassId },
                select: { id: true, divisionId: true, disciplineId: true },
              })
            : Promise.resolve(null),
        ]);

        if (!discipline) {
          return reply.code(400).send({
            error: {
              code: 'discipline_not_found',
              message: 'Discipline not found',
              requestId: req.requestId,
            },
          });
        }
        if (!division || division.competitionId !== competition.id) {
          return reply.code(400).send({
            error: {
              code: 'division_out_of_scope',
              message: 'Division is not in this competition',
              requestId: req.requestId,
            },
          });
        }
        if (division.gender !== data.athlete.gender) {
          return reply.code(400).send({
            error: {
              code: 'division_gender_mismatch',
              message: 'Division gender mismatch',
              requestId: req.requestId,
            },
          });
        }
        if (!validateWeightClass(weightClass, division.id, discipline.id)) {
          return reply.code(400).send({
            error: {
              code: 'weight_class_out_of_scope',
              message: 'Weight class is not in this division',
              requestId: req.requestId,
            },
          });
        }
        if (
          data.declaredWeightClassId &&
          !validateWeightClass(declaredWeightClass, division.id, discipline.id)
        ) {
          return reply.code(400).send({
            error: {
              code: 'declared_weight_class_out_of_scope',
              message: 'Declared weight class is not in this division',
              requestId: req.requestId,
            },
          });
        }

        try {
          const result = await prisma.$transaction(async (tx) => {
            const athleteData = {
              lastName: normalizeName(data.athlete.lastName),
              firstName: normalizeName(data.athlete.firstName),
              middleName: optionalText(data.athlete.middleName) ?? null,
              dateOfBirth: dateOnly(data.athlete.dateOfBirth),
              gender: data.athlete.gender,
              countryCode: data.athlete.countryCode.toUpperCase(),
              regionCode: optionalText(data.athlete.regionCode) ?? null,
              city: optionalText(data.athlete.city) ?? null,
              coachName: optionalText(data.athlete.coachName) ?? null,
              clubName: optionalText(data.athlete.clubName) ?? null,
              federationCardNumber: optionalText(data.athlete.federationCardNumber) ?? null,
            } satisfies Prisma.AthleteUncheckedCreateInput;

            const existingAthlete = await tx.athlete.findFirst({
              where: {
                lastName: { equals: athleteData.lastName, mode: 'insensitive' },
                firstName: { equals: athleteData.firstName, mode: 'insensitive' },
                dateOfBirth: athleteData.dateOfBirth,
                countryCode: athleteData.countryCode,
              },
              select: { id: true },
            });

            const athlete =
              existingAthlete ??
              (await tx.athlete.create({
                data: athleteData,
                select: { id: true },
              }));

            const duplicate = await tx.nomination.findFirst({
              where: {
                competitionId: competition.id,
                athleteId: athlete.id,
                disciplineId: discipline.id,
                divisionId: division.id,
              },
              select: { id: true },
            });
            if (duplicate) {
              throw new PublicRegistrationError(
                409,
                'duplicate_nomination',
                'This athlete is already registered for this discipline and division',
              );
            }

            const nomination = await tx.nomination.create({
              data: {
                competitionId: competition.id,
                athleteId: athlete.id,
                disciplineId: discipline.id,
                divisionId: division.id,
                declaredWeightClassId: data.declaredWeightClassId ?? data.weightClassId,
                weightClassId: data.weightClassId,
                status: 'draft',
                isEntryFeePaid: false,
                paymentStatus: 'unpaid',
                paidAmountKopecks: BigInt(0),
                isMandatePassed: false,
                notes: registrationNotes(data) ?? null,
              },
              select: {
                id: true,
                competitionId: true,
                athleteId: true,
                disciplineId: true,
                divisionId: true,
                weightClassId: true,
                paymentStatus: true,
                status: true,
              },
            });

            const grantedFromIp = clientIp(req.ip);
            const grantedFromUserAgent = userAgent(req.headers['user-agent']);
            await tx.consent.createMany({
              data: [
                {
                  scope: 'data_processing',
                  athleteId: athlete.id,
                  federationId: competition.federationId,
                  textShown: CONSENT_TEXTS.data_processing,
                  locale: 'ru',
                  textVersion: CONSENT_TEXT_VERSION,
                  grantedFromIp,
                  grantedFromUserAgent,
                },
                ...(data.consentPublicResults
                  ? [
                      {
                        scope: 'public_results' as const,
                        athleteId: athlete.id,
                        federationId: competition.federationId,
                        textShown: CONSENT_TEXTS.public_results,
                        locale: 'ru',
                        textVersion: CONSENT_TEXT_VERSION,
                        grantedFromIp,
                        grantedFromUserAgent,
                      },
                    ]
                  : []),
                ...(data.consentPhotoPublication
                  ? [
                      {
                        scope: 'photo_publication' as const,
                        athleteId: athlete.id,
                        federationId: competition.federationId,
                        textShown: CONSENT_TEXTS.photo_publication,
                        locale: 'ru',
                        textVersion: CONSENT_TEXT_VERSION,
                        grantedFromIp,
                        grantedFromUserAgent,
                      },
                    ]
                  : []),
              ],
            });

            await audit.record(
              {
                ...audit.fromRequest(req),
                action: 'public_registration.created',
                result: 'success',
                actorUserId: null,
                scopeFederationId: competition.federationId,
                scopeCompetitionId: competition.id,
                targetType: 'nomination',
                targetId: nomination.id,
                before: null,
                after: {
                  athleteId: athlete.id,
                  nominationId: nomination.id,
                  disciplineId: discipline.id,
                  divisionId: division.id,
                  weightClassId: data.weightClassId,
                },
              },
              tx,
            );

            return { athlete, nomination };
          });

          log.info(
            {
              competitionId: competition.id,
              nominationId: result.nomination.id,
              athleteId: result.athlete.id,
            },
            'public registration created',
          );
          return reply.code(201).send({
            registration: {
              athleteId: result.athlete.id,
              nominationId: result.nomination.id,
              status: result.nomination.status,
              paymentStatus: result.nomination.paymentStatus,
              entryFeeKopecks: competition.entryFeeKopecks,
            },
          });
        } catch (err) {
          if (err instanceof PublicRegistrationError) {
            return reply.code(err.status).send({
              error: { code: err.code, message: err.message, requestId: req.requestId },
            });
          }
          if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
            return reply.code(409).send({
              error: {
                code: 'duplicate_nomination',
                message: 'This athlete is already registered for this discipline and division',
                requestId: req.requestId,
              },
            });
          }
          throw err;
        }
      },
    );
  },
};
