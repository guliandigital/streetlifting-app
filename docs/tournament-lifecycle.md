# Tournament lifecycle serialization

Code baseline: PR #43, production merge `d5bc55560ccf871e2c23dd4f01a0ef7fa98326eb`.

Protocol mutations acquire a transaction-scoped competition row lock before nomination,
attempt, voting and placement writes. The no-op row UPDATE fences old serializable
snapshots without changing timestamps. The same guard covers default setup, draw,
autoplanning, internal/public registrations and judge assignments. Finalization
re-reads status and validates the complete protocol under this lock. All changes,
audit records and outbox events commit together. Repeated finalization does not emit
another finalization/correction event.

Serialization retries include Prisma P2034 and PostgreSQL 40001/40P01 wrapped as
P2010 by raw queries. Retries rerun the whole transaction, up to five attempts.
Identical judge-vote retries return the saved outcome without duplicate votes or
successful audit records. A late third vote can complete the panel but cannot change
a result already decided by a majority. A changed vote after completion is rejected.

Nomination updates reject a stale nomination snapshot and repeat reference/profile
validation inside the transaction. Attempts re-read current mandate/profile state.

## Verification

`apps/api/scripts/check-competition-concurrency-db.ts` uses a disposable PostgreSQL
database and authenticated Fastify routes. It checks three concurrent judges, vote
replays, rejection of changed decided votes, actual PostgreSQL lock waiting,
finalization after an uncommitted protocol change, concurrent attempt/finalization,
locked writes and repeated finalization. It runs in the isolated fresh/upgrade runner
and in the PostgreSQL-backed CI job. No production tournament fixtures are created.

## Scope and rollback

No migration, dependency or archive rewrite. Roll back by deploying the preceding
code release; database schema is unchanged. Competition-level serialization trades
some throughput within one tournament for consistent protocol state; different
competitions do not share the row lock.

This does not implement rulebook snapshots, immutable issued protocols/documents,
record ratification, billing settlement or offline synchronization. Athlete identity
edits and immutable historical calculations require the subsequent admission/versioning
work. The source rulebook is https://streetlifting.pro/docs/isf-rules/ and its linked
Russian v5.1 PDF; no sporting categories are changed by this patch.
