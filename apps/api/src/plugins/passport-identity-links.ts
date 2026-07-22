import { z } from 'zod';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma } from '../lib/db.js';
import * as audit from '../lib/audit.js';
import { requireAuth, requireRole } from '../lib/auth/middleware.js';

const input = z.object({
  system: z.literal('openstreetlifting'),
  externalId: z.string().trim().min(1).max(160),
});

/** Explicit historical identity confirmation. No name/email matching exists in
 * this path: a link only becomes verified by a privileged reviewer. */
export const passportIdentityLinksPlugin: FeaturePlugin = {
  name: 'passport-identity-links',
  register: async (app) => {
    app.get('/passport/external-links', { preHandler: requireAuth() }, async (req) => {
      const athlete = await prisma.athlete.findUnique({
        where: { userId: req.user!.id },
        select: { id: true },
      });
      if (!athlete) return { links: [] };
      const links = await prisma.externalIdentityLink.findMany({
        where: { entityType: 'athlete', localEntityId: athlete.id, status: 'verified' },
        select: { id: true, system: true, externalId: true, status: true, verifiedAt: true },
        orderBy: { verifiedAt: 'desc' },
      });
      return { links };
    });

    app.post<{ Params: { id: string } }>(
      '/passport/athletes/:id/external-links',
      { preHandler: requireRole('platform_admin') },
      async (req, reply) => {
        const parsed = input.safeParse(req.body);
        if (!parsed.success)
          return reply.code(400).send({
            error: {
              code: 'validation_error',
              message: parsed.error.message,
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
        const link = await audit.withAudit(
          {
            ...audit.fromRequest(req),
            actorUserId: req.user!.id,
            action: 'passport.external_identity.verified',
            scopeFederationId: null,
            scopeCompetitionId: null,
            targetType: 'external_identity_link',
            targetId: 'pending',
            before: null,
            after: parsed.data,
          },
          (tx) =>
            tx.externalIdentityLink.upsert({
              where: {
                system_entityType_externalId: {
                  system: parsed.data.system,
                  entityType: 'athlete',
                  externalId: parsed.data.externalId,
                },
              },
              create: {
                system: parsed.data.system,
                entityType: 'athlete',
                localEntityId: athlete.id,
                externalId: parsed.data.externalId,
                confidence: 1,
                status: 'verified',
                verifiedAt: new Date(),
              },
              update: {
                localEntityId: athlete.id,
                confidence: 1,
                status: 'verified',
                verifiedAt: new Date(),
                rejectedAt: null,
              },
            }),
        );
        return reply.code(201).send({ link });
      },
    );
  },
};
