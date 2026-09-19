# Archive review and recovery verification — 2026-09-20

The production review was executed in a read-only transaction after PR #43 deployed.
Source: current Neon API database behind `streetlifting.app`, not the stopped legacy
server. Query: `scripts/archive-reconciliation.sql`. Full evidence (IDs only, no
names/date values) is in the ignored `output/release/archive-review-20260920.json`.

| Review candidate                                           | Current count | Required source and proposed resolution                                                                                                          |
| ---------------------------------------------------------- | ------------: | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Nomination discipline differs from weight-class discipline |         4,751 | Original nomination/category table and signed protocol; review and map the historical category only with evidence                                |
| Attempt number exceeds today's component limit             |           288 | Original attempt sheet, applicable rulebook and record-attempt designation; distinguish allowed extra record attempts before correcting anything |
| Record discipline differs from weight-class discipline     |           579 | Federation record register and corresponding protocol; review historical mapping                                                                 |
| January 1 date of birth                                    |         3,716 | Identity evidence or source precision; January 1 can be genuine, so never automatically replace it                                               |
| Final result without persisted attempts                    |         5,263 | Original paper/file protocol; preserve source total and mark attempt history unavailable rather than reconstructing it                           |
| Possible duplicate identity by normalized name/date        |   270 records | Identity claim, federation confirmation and source IDs; this is not a count of confirmed duplicate people                                        |
| Record lacks ratification timestamp or ratifying user      |         1,411 | Federation ratification decision; missing application metadata does not prove the record was never ratified externally                           |
| Unverified, unrejected external identity links             |             0 | No matching rows under this exact predicate                                                                                                      |

Inventory: 19 federations, 511 competitions, 3,859 athletes, 8,907 nominations,
9,133 attempts, 1,411 records, 21 applied migrations. All six table row hashes and
counts match the snapshot taken before release #43. No archive rows were modified,
recalculated, deleted or merged by this review.

ISF v5.1 sections 7 and 10 distinguish normal competition attempts from additional
record attempts. Source: https://streetlifting.pro/docs/isf-rules/ and the linked
Russian PDF https://streetlifting.pro/wp-content/uploads/isf-documents/isf-technical-rules-v5-1-ru.pdf.
This review intentionally does not treat a current attempt-count mismatch as proof
that an old attempt is invalid.

## Backup recovery evidence

The actual pre-cutover backups under
`/var/backups/streetlifting/release-20260919-final-1317` were restored into a new,
loopback-only PostgreSQL 16 cluster with no connection to production services.
`pg_restore --exit-on-error --single-transaction --no-owner --no-privileges`
succeeded for both databases. Counts of every restored table matched the backup's
`fingerprints-utc.json`: 49 API tables and 5 ISF ID tables. The cluster was stopped
after validation. Evidence: `output/personal-data-db/run-Me3wKh/restore-result.json`.

This proves restoration and table-count agreement for those dated backups. It does
not prove that they contain later production writes, an operational backup schedule,
row-hash equivalence after restore, or a production recovery time objective. The
backup files and production data were not altered.

## Accounting boundary

The existing ledger counts purchased nominations from receipts and consumed
nominations from manual writeoffs. `POST /federations/:id/writeoffs` accepts a
caller-supplied count and only deduplicates the federation/document number. It does
not establish which withdrawn/disqualified nominations are billable or a
correction policy. Automatic financial posting must wait for that business rule;
read-only reconciliation can be built without posting adjustments.

Production ledger check on the same date: **0 writeoff documents, 0 posted
nominations** in this application. Candidate counting bases are materially different:
8,759 nominations with measured weight, 8,522 marked finished, and 3,312 with at least
one stored good/no-lift attempt. None is automatically declared billable. Archived
results without attempts and any accounting performed outside this application must
be reconciled before treating a difference as debt or an adjustment.

## Presentation evidence

Current city values include `Ростов-на-Дону 11.06.2020 -` and
`сельский посёлок Буревестник 06.07.2025 -`. The display helper removes this exact
trailer only when its date matches the competition start date; raw stored values
remain available in the edit form and database. Source classification uses explicit
import statements retained in the descriptions, not `archived` alone or an ID/name
heuristic. Existing external-identity-link rows are absent, so missing provenance is
shown as not recorded rather than guessed. Zero/default entry fees are displayed as
requiring organizer confirmation, with no ledger or stored amount changes.

## Remaining release boundaries

The released lifecycle lock and admission checks do not constitute official protocol
approval. Local rulebook snapshots, immutable approved-protocol revisions, document
issuance/version history and the candidate/review/ratification workflow remain
unimplemented. The authorized federation role or commission for approval, correction
and ratification has been requested from the owner; it must not be inferred from
technical administrator access. The existing signed external protocol-import envelope
is not local approval and must not be repurposed as such.

Automatic writeoffs and correction postings also remain pending the owner's definition
of a billable performed nomination, including withdrawn/disqualified entries. Neither
the audit nor these code releases post financial adjustments. No production migrations
were introduced in these releases.

Full authenticated ISF production smoke remains blocked by the missing
`ISF_SMOKE_SERVICE_TOKEN`. Anonymous rejection and application/database health checks
are useful but do not replace that integration test. No service access was created.

The fresh/upgrade PostgreSQL and nine browser scenarios passed in the isolated runner
(`output/personal-data-db/run-ER3evo/result.json`). The secretary scenario commits an
attempt, deliberately drops its HTTP response, retries through the UI and verifies the
same single persisted attempt ID. This covers response loss/retry, not full offline
synchronization or process termination during every tournament stage.
