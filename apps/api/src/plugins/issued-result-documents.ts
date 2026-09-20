import { protocolDataSchema, protocolAttemptSummary } from '@streetlifting/domain';
import type { FeaturePlugin } from '../lib/load-plugins.js';
import { prisma } from '../lib/db.js';
import { requireAuth } from '../lib/auth/middleware.js';
import { FULL_OPS_READ_ROLES, matchesCompetitionScope } from '../lib/auth/authorization-matrix.js';
import { validateUuidParams } from '../lib/params.js';
import { snapshotHash } from '../lib/finalization-snapshot.js';

const escape = (value: unknown) =>
  String(value ?? '—').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  );

export const issuedResultDocumentsPlugin: FeaturePlugin = {
  name: 'issued-result-documents',
  register: async (app) => {
    app.addHook('preValidation', validateUuidParams(['id']));
    app.get('/my/issued-result-documents', { preHandler: requireAuth() }, async (req, reply) => {
      reply.header('Cache-Control', 'private, no-store');
      const documents = await prisma.issuedResultDocument.findMany({
        where: { athlete: { userId: req.user!.id } },
        orderBy: { issuedAt: 'desc' },
        take: 100,
        select: {
          id: true,
          version: true,
          issuedAt: true,
          previousDocumentId: true,
          snapshot: {
            select: { revision: true, competition: { select: { id: true, nameRu: true } } },
          },
        },
      });
      return { documents };
    });
    app.get<{ Params: { id: string } }>(
      '/issued-result-documents/:id/download',
      { preHandler: requireAuth() },
      async (req, reply) => {
        reply.header('Cache-Control', 'private, no-store');
        const doc = await prisma.issuedResultDocument.findUnique({
          where: { id: req.params.id },
          include: {
            athlete: { select: { userId: true } },
            snapshot: {
              include: {
                competition: { select: { id: true, federationId: true } },
                approval: true,
              },
            },
          },
        });
        if (
          !doc ||
          !(
            doc.athlete.userId === req.user!.id ||
            req.user!.roles.some(
              (r) =>
                r.role === 'platform_admin' ||
                (FULL_OPS_READ_ROLES.some((role) => role === r.role) &&
                  matchesCompetitionScope(r, doc.snapshot.competition)),
            )
          )
        )
          return reply
            .code(404)
            .send({ error: { code: 'not_found', message: 'Document not found' } });
        if (
          !doc.snapshot.approval ||
          snapshotHash(doc.payload) !== doc.payloadHash ||
          snapshotHash(doc.snapshot.payload) !== doc.snapshot.payloadHash
        )
          throw new Error('Issued document integrity check failed');
        const payload = doc.payload as {
          competition: unknown;
          nomination: unknown;
          federationName: string;
          protocolRevision: number;
          snapshotHash: string;
        };
        const data = protocolDataSchema.parse({
          competition: payload.competition,
          nominations: [payload.nomination],
        });
        const nomination = data.nominations[0]!;
        const newer = await prisma.protocolApproval.count({
          where: {
            snapshot: {
              competitionId: doc.snapshot.competitionId,
              revision: { gt: doc.snapshot.revision },
            },
          },
        });
        reply.header(
          'Content-Disposition',
          `attachment; filename="result-${doc.id}-v${doc.version}.html"`,
        );
        reply.header(
          'Content-Security-Policy',
          "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; sandbox",
        );
        reply.type('text/html; charset=utf-8');
        return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Выписка из протокола</title>
      <style>body{font:16px/1.6 system-ui;max-width:900px;margin:40px auto;padding:20px;color:#111}h1{font-size:26px}dt{font-weight:600}dd{margin:0 0 12px}footer{font-size:12px;overflow-wrap:anywhere}aside{border:1px solid;padding:12px}@media print{body{margin:0}}</style>
      <h1>Выписка из утверждённого протокола</h1><p>${escape(payload.federationName)}</p><h2>${escape(data.competition.nameRu)}</h2>
      ${newer ? '<aside>Историческая версия: утверждён более поздний протокол. Эта выписка не подтверждает актуальный результат.</aside>' : '<p>Выдано на основании утверждённого протокола.</p>'}
      <dl><dt>Спортсмен</dt><dd>${escape([nomination.athlete.lastName, nomination.athlete.firstName, nomination.athlete.middleName].filter(Boolean).join(' '))}</dd>
      <dt>Дисциплина / дивизион / категория</dt><dd>${escape(nomination.discipline.nameRu)} / ${escape(nomination.division.nameRu)} / ${escape(nomination.weightClass.nameRu)}</dd>
      <dt>Результат / место в категории</dt><dd>${escape(nomination.finalScore)} / ${escape(nomination.placeInClass)}</dd><dt>Попытки</dt><dd>${escape(protocolAttemptSummary(nomination))}</dd></dl>
      <footer>Номер: ${escape(doc.id)} · версия документа ${doc.version} · версия протокола ${escape(payload.protocolRevision)}<br>
      Выдано: ${escape(doc.issuedAt.toISOString())}<br>Основание: ${escape(doc.reason)}<br>Предыдущий документ: ${escape(doc.previousDocumentId)}<br>
      SHA-256 содержимого документа: ${escape(doc.payloadHash)}<br>SHA-256 исходного протокола: ${escape(payload.snapshotHash)}</footer></html>`;
      },
    );
  },
};
