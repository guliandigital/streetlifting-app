import { prisma, Prisma } from './db.js';

export async function ledgerTotals(tx: Prisma.TransactionClient, federationId: string) {
  const [receipts, writeoffs] = await Promise.all([
    tx.receipt.aggregate({
      where: { federationId },
      _count: true,
      _sum: { nominationsCount: true, amountKopecks: true },
    }),
    tx.writeoff.aggregate({
      where: { federationId },
      _count: true,
      _sum: { nominationsCount: true },
    }),
  ]);
  const receivedNominations = receipts._sum.nominationsCount ?? 0;
  const consumedNominations = writeoffs._sum.nominationsCount ?? 0;
  return {
    receiptDocuments: receipts._count,
    writeoffDocuments: writeoffs._count,
    receivedNominations,
    consumedNominations,
    remainingNominations: receivedNominations - consumedNominations,
    receivedAmountKopecks: (receipts._sum.amountKopecks ?? 0n).toString(),
  };
}

interface Counts {
  nominations: number;
  withDecidedAttempt: number;
  finished: number;
  finishedWithoutAttempt: number;
  withdrawn: number;
  disqualified: number;
  withdrawnWithDecidedAttempt: number;
  disqualifiedWithDecidedAttempt: number;
  postedNominations: number;
  writeoffDocuments: number;
}

/** Aggregate factual alternatives. No predicate here is a billing rule. */
export async function accountingReconciliation(
  federationId: string,
  limit: number,
  offset: number,
) {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const evidence = Prisma.sql`
      WITH nomination_evidence AS (
        SELECT n.id, n.status, n."competitionId", EXISTS (SELECT 1 FROM attempt a WHERE a."nominationId"=n.id) AS has_attempt,
          EXISTS (SELECT 1 FROM attempt a WHERE a."nominationId"=n.id AND a.result IN ('good_lift','no_lift')) AS performed
        FROM nomination n JOIN competition c ON c.id=n."competitionId"
        WHERE c."federationId"=${federationId}::uuid
      ), nomination_totals AS (
        SELECT "competitionId", count(*)::int AS nominations,
          count(*) FILTER (WHERE performed)::int AS "withDecidedAttempt",
          count(*) FILTER (WHERE status='finished')::int AS finished,
          count(*) FILTER (WHERE status='finished' AND NOT has_attempt)::int AS "finishedWithoutAttempt",
          count(*) FILTER (WHERE status='withdrawn')::int AS withdrawn,
          count(*) FILTER (WHERE status='disqualified')::int AS disqualified,
          count(*) FILTER (WHERE status='withdrawn' AND performed)::int AS "withdrawnWithDecidedAttempt",
          count(*) FILTER (WHERE status='disqualified' AND performed)::int AS "disqualifiedWithDecidedAttempt"
        FROM nomination_evidence GROUP BY "competitionId"
      ), postings AS (
        SELECT "competitionId", sum("nominationsCount")::int AS "postedNominations", count(*)::int AS "writeoffDocuments"
        FROM writeoff WHERE "federationId"=${federationId}::uuid GROUP BY "competitionId"
      ), evidence AS (
        SELECT c.id, c.code, c."nameRu", c.status::text, c."startDate",
          coalesce(n.nominations,0) AS nominations,
          coalesce(n."withDecidedAttempt",0) AS "withDecidedAttempt",
          coalesce(n.finished,0) AS finished,
          coalesce(n."finishedWithoutAttempt",0) AS "finishedWithoutAttempt",
          coalesce(n.withdrawn,0) AS withdrawn,
          coalesce(n.disqualified,0) AS disqualified,
          coalesce(n."withdrawnWithDecidedAttempt",0) AS "withdrawnWithDecidedAttempt",
          coalesce(n."disqualifiedWithDecidedAttempt",0) AS "disqualifiedWithDecidedAttempt",
          coalesce(p."postedNominations",0) AS "postedNominations",
          coalesce(p."writeoffDocuments",0) AS "writeoffDocuments",
          EXISTS (SELECT 1 FROM competition_finalization_snapshot s WHERE s."competitionId"=c.id) AS "hasFinalizationSnapshot"
        FROM competition c LEFT JOIN nomination_totals n ON n."competitionId"=c.id
        LEFT JOIN postings p ON p."competitionId"=c.id
        WHERE c."federationId"=${federationId}::uuid
      )`;
      const [rows, summaryRows, ledger, unmatched] = await Promise.all([
        tx.$queryRaw<
          Array<
            Counts & {
              id: string;
              code: string;
              nameRu: string;
              status: string;
              startDate: Date;
              hasFinalizationSnapshot: boolean;
            }
          >
        >`
        ${evidence} SELECT * FROM evidence ORDER BY "startDate" DESC, id LIMIT ${limit} OFFSET ${offset}`,
        tx.$queryRaw<Array<Counts & { competitions: number }>>`${evidence}
        SELECT count(*)::int AS competitions,
          coalesce(sum(nominations),0)::int AS nominations,
          coalesce(sum("withDecidedAttempt"),0)::int AS "withDecidedAttempt",
          coalesce(sum(finished),0)::int AS finished,
          coalesce(sum("finishedWithoutAttempt"),0)::int AS "finishedWithoutAttempt",
          coalesce(sum(withdrawn),0)::int AS withdrawn,
          coalesce(sum(disqualified),0)::int AS disqualified,
          coalesce(sum("withdrawnWithDecidedAttempt"),0)::int AS "withdrawnWithDecidedAttempt",
          coalesce(sum("disqualifiedWithDecidedAttempt"),0)::int AS "disqualifiedWithDecidedAttempt",
          coalesce(sum("postedNominations"),0)::int AS "postedNominations",
          coalesce(sum("writeoffDocuments"),0)::int AS "writeoffDocuments" FROM evidence`,
        ledgerTotals(tx, federationId),
        tx.$queryRaw<Array<{ documents: number; nominations: number }>>`
        SELECT count(*)::int AS documents, coalesce(sum(w."nominationsCount"),0)::int AS nominations
        FROM writeoff w WHERE w."federationId"=${federationId}::uuid
          AND NOT EXISTS (SELECT 1 FROM competition c WHERE c.id=w."competitionId" AND c."federationId"=${federationId}::uuid)`,
      ]);
      return {
        generatedAt: new Date().toISOString(),
        ruleStatus: 'not_configured' as const,
        summary: summaryRows[0]!,
        ledger,
        unmatchedWriteoffs: unmatched[0]!,
        rows,
        limit,
        offset,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
