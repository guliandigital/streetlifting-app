# Immutable operational finalization snapshots

Every new transition to `finalized` captures revision 1 in
`competition_finalization_snapshot` under the same competition lock and transaction
as status, audit and outbox writes. Repeated finalization returns without creating
another snapshot. Failure rolls back the whole transaction. Direct creation/import
of a finalized or archived card does not establish a verified protocol and is not
backfilled.

Finalization uses serializable isolation so validation and capture observe one
consistent reference-catalog state. Serialization/deadlock failures retry the entire
audited transaction, using the same bounded retry helper as attempt/vote writes.
Before sealing, current scoring/placement functions must agree with stored finished
results and placements; disagreement returns `409 protocol_calculation_stale` and
rolls back finalization. This comparison does not rewrite or repair historical data.

The payload captures event dates/rulebook, discipline formats and component limits,
division age/gender/veteran coefficients, actual weight categories, admitted weights,
attempt results, scores and placements. Historical reads return stored values;
later reference-catalog edits never rerun the scoring engine for this evidence.
`calculationVersion: competition-scoring-v2` identifies the current algorithm in
`packages/domain/src/competition-scoring.ts`; any future semantic change must use
a new version. Production additionally records the Vercel Git commit.

JSON schema version and a SHA-256 hash with recursively sorted object keys allow
verification after PostgreSQL JSONB serialization. Attempt and nomination ordering
is deterministic. SQL triggers prohibit UPDATE, DELETE and TRUNCATE. A restricted
foreign key prevents deleting its tournament. Database owners can still alter the
schema; this is not a cryptographic signature or protection against a database
administrator.

## Read contract and boundaries

`GET /competitions/:id/finalization-snapshot` returns `{ snapshot, approvalStatus }`.
Only the existing platform administrator or federation-wide administrator can read
it; tournament-scoped roles and administrators of another federation cannot. Active
role/acknowledgment checks remain in effect. Responses use `private, no-store`.
The competition page exposes an authenticated JSON download for those same roles
after finalization/archival, with a clear missing-evidence state for older events.
No anonymous/public download is introduced. The payload omits DOB, contact data,
fees, private notes and tokens, but includes historical athlete names and sporting
results, so it is not a public export.

`snapshot: null` means no captured evidence exists. It must not trigger reconstruction
from current catalog values. `approvalStatus: not_recorded` is intentional: service
finalization is not federation approval, record ratification or document issuance.
The owner subsequently selected the federation administrator as approval/correction
authority. [Protocol review](protocol-review-workflow.md) adds explicit approvals,
correction revisions, record review and issued documents. This endpoint now returns
the latest revision and derives approvalStatus from the separate immutable decision.
The payload itself remains unchanged. Automatic billing rules still await owner direction.

## Migration and recovery

`20260920000000_finalization_snapshots` adds one initially empty table, unique index,
foreign key and immutability triggers. It neither modifies nor recalculates archive
rows. Test against fresh and upgraded isolated PostgreSQL before deployment; verify
Prisma schema parity in CI. Vercel applies the additive migration during production
build before the new API is promoted.
The SQL migration is enclosed in an explicit transaction.

Rollback deploys the preceding API/web release and **retains** the additive table
and captured evidence. Do not drop the table or remove migration history to roll
back application code. A later re-release must account for tournaments finalized
during rollback: those remain without snapshots, never fabricated after the fact.
If the migration fails, inspect its transaction state before retrying; the previous
deployment remains available. Existing archive fingerprints must remain unchanged.

## Verification

The real PostgreSQL concurrency script checks rejected finalization creates no
snapshot, successful concurrent finalization captures exactly one correct result,
repeat finalization deduplicates, SQL mutations fail, a failed snapshot insert rolls
back preceding changes, reference edits preserve the payload, and authenticated
cross-federation/tournament-role reads are denied. Unit tests check JSONB-stable
hashing and detection of changed data/order.
