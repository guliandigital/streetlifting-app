import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma } from '../lib/db.js';
import type { Prisma } from '@prisma/client';
import * as audit from '../lib/audit.js';
import { requireAuth } from '../lib/auth/middleware.js';

const uuid = z.string().uuid();
const credentialInput = z.object({
  kind: z.enum(['category', 'attestation', 'certificate']),
  name: z.string().trim().min(1).max(160),
  credentialNumber: z.string().trim().min(1).max(120).nullable().optional(),
  issuedByFederationId: uuid,
  issuedAt: z.coerce.date(),
  expiresAt: z.coerce.date().nullable().optional(),
  documentAttachmentId: uuid.nullable().optional(),
});
const rankInput = credentialInput.omit({ kind: true, credentialNumber: true }).extend({
  basis: z.string().trim().min(1).max(1000),
});
const teamMemberInput = z.object({
  userId: uuid,
  role: z.enum([
    'organizer',
    'head_judge',
    'judge',
    'secretary',
    'assistant',
    'scoreboard_operator',
    'speaker',
    'technical_official',
    'medical_official',
  ]),
  platformId: uuid.nullable().optional(),
  judgeAssignmentId: uuid.nullable().optional(),
});

function defined(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function isFederationManager(
  req: { user: NonNullable<FastifyRequest['user']> },
  federationId: string,
  competitionId?: string,
): boolean {
  return req.user.roles.some(
    (role) =>
      role.role === 'platform_admin' ||
      ((role.role === 'federation_admin' || role.role === 'secretary') &&
        (role.federationId === federationId ||
          (competitionId && role.competitionId === competitionId))),
  );
}

function invalid(reply: FastifyReply, requestId: string, message: string) {
  return reply.code(400).send({ error: { code: 'validation_error', message, requestId } });
}

/** Federation-only finalization paths for Passport evidence. There is
 * deliberately no owner update endpoint for credentials, ranks or team facts. */
export const passportManagementPlugin: FeaturePlugin = {
  name: 'passport-management',
  register: async (app) => {
    app.post<{ Params: { id: string } }>(
      '/passport/official-profiles/:id/credentials',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const parsed = credentialInput.safeParse(req.body);
        if (!parsed.success) return invalid(reply, req.requestId, parsed.error.message);
        if (parsed.data.expiresAt && parsed.data.expiresAt < parsed.data.issuedAt)
          return invalid(reply, req.requestId, 'expiresAt must not precede issuedAt');
        if (!isFederationManager(req as never, parsed.data.issuedByFederationId))
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'Federation approval required',
              requestId: req.requestId,
            },
          });
        const profile = await prisma.officialProfile.findUnique({
          where: { id: req.params.id },
          select: { id: true },
        });
        if (!profile)
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Official profile not found',
              requestId: req.requestId,
            },
          });
        const credential = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'passport.official_credential.issued',
            scopeFederationId: parsed.data.issuedByFederationId,
            scopeCompetitionId: null,
            targetType: 'official_credential',
            targetId: 'pending',
            before: null,
            after: parsed.data,
          },
          (tx) =>
            tx.officialCredential.create({
              data: defined({
                ...parsed.data,
                officialProfileId: profile.id,
              }) as Prisma.OfficialCredentialUncheckedCreateInput,
            }),
        );
        return reply.code(201).send({ credential });
      },
    );

    app.post<{ Params: { id: string } }>(
      '/passport/athletes/:id/ranks',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const parsed = rankInput.safeParse(req.body);
        if (!parsed.success) return invalid(reply, req.requestId, parsed.error.message);
        if (parsed.data.expiresAt && parsed.data.expiresAt < parsed.data.issuedAt)
          return invalid(reply, req.requestId, 'expiresAt must not precede issuedAt');
        if (!isFederationManager(req as never, parsed.data.issuedByFederationId))
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'Federation approval required',
              requestId: req.requestId,
            },
          });
        const athlete = await prisma.athlete.findUnique({
          where: { id: req.params.id },
          select: { id: true },
        });
        if (!athlete)
          return reply.code(404).send({
            error: { code: 'not_found', message: 'Athlete not found', requestId: req.requestId },
          });
        const rank = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'passport.sport_rank.issued',
            scopeFederationId: parsed.data.issuedByFederationId,
            scopeCompetitionId: null,
            targetType: 'sport_rank_award',
            targetId: 'pending',
            before: null,
            after: parsed.data,
          },
          (tx) =>
            tx.sportRankAward.create({
              data: defined({
                ...parsed.data,
                athleteId: athlete.id,
              }) as Prisma.SportRankAwardUncheckedCreateInput,
            }),
        );
        return reply.code(201).send({ rank });
      },
    );

    app.post<{ Params: { id: string } }>(
      '/competitions/:id/team-members',
      { preHandler: requireAuth() },
      async (req, reply) => {
        const parsed = teamMemberInput.safeParse(req.body);
        if (!parsed.success) return invalid(reply, req.requestId, parsed.error.message);
        const competition = await prisma.competition.findUnique({
          where: { id: req.params.id },
          select: { id: true, federationId: true, status: true },
        });
        if (!competition)
          return reply.code(404).send({
            error: {
              code: 'not_found',
              message: 'Competition not found',
              requestId: req.requestId,
            },
          });
        if (!isFederationManager(req as never, competition.federationId, competition.id))
          return reply.code(403).send({
            error: {
              code: 'forbidden',
              message: 'Competition team management required',
              requestId: req.requestId,
            },
          });
        if (competition.status === 'finalized' || competition.status === 'archived')
          return reply.code(409).send({
            error: {
              code: 'competition_team_frozen',
              message: 'Create a correction instead of changing a finalized team',
              requestId: req.requestId,
            },
          });
        const memberUser = await prisma.user.findUnique({
          where: { id: parsed.data.userId },
          select: { displayName: true },
        });
        if (!memberUser)
          return reply.code(400).send({
            error: {
              code: 'user_not_found',
              message: 'User not found',
              requestId: req.requestId,
            },
          });
        const teamMember = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'passport.team_member.invited',
            scopeFederationId: competition.federationId,
            scopeCompetitionId: competition.id,
            targetType: 'competition_team_member',
            targetId: 'pending',
            before: null,
            after: parsed.data,
          },
          (tx) =>
            tx.competitionTeamMember.create({
              data: defined({
                ...parsed.data,
                competitionId: competition.id,
                memberNameSnapshot: memberUser.displayName,
                status: 'invited',
                invitedAt: new Date(),
              }) as Prisma.CompetitionTeamMemberUncheckedCreateInput,
            }),
        );
        return reply.code(201).send({ teamMember });
      },
    );
  },
};
