# Read-only federation accounting reconciliation

`GET /federations/:id/accounting-reconciliation?limit=25&offset=0` is available to
active, acknowledged federation-wide `accountant`/`federation_admin` roles and
platform administrators. A tournament-scoped assignment cannot grant this access.
The response is `private, no-store`; it contains aggregate counts and tournament
names, not athlete identities, payment notes or personal profiles.
Federation read scope also excludes tournament-bound assignments, closing the old
dashboard read bypass; tournament context continues to provide its own federation
label through competition responses.

The federation page displays the report next to writeoff documents. Receipt/writeoff
mutations invalidate its query through the existing dashboard query-key prefix;
manual refresh is also available. Tournament rows are paginated (1–100 per page),
while summary and ledger totals always cover the entire federation. Ordering is
stable by event date and UUID. Invalid/unknown query fields are rejected.

## Definitions

- `withDecidedAttempt`: distinct nominations with at least one stored `good_lift`
  or `no_lift` attempt, regardless of nomination status. Pending/withdrawn attempts
  alone do not qualify. Multiple attempts/judge votes never multiply this count.
- `finished`, `withdrawn`, `disqualified`: persisted nomination statuses, not a
  derived assertion of sporting approval or billability.
- `finishedWithoutAttempt`: finished nominations with no stored attempts at all.
  An imported total is not reconstructed and does not prove no performance occurred.
- `withdrawnWithDecidedAttempt` / `disqualifiedWithDecidedAttempt`: explicit subsets
  needed to compare future billing-rule alternatives. Categories overlap and must
  not be summed as separate billed units.
- `postedNominations`: quantities already written to this federation's writeoff
  documents linked to its tournament. This is a quantity, not a mapping of each
  specific athlete/nomination to a payment.
- `unmatchedWriteoffs`: this federation's writeoffs with no competition or a legacy
  link outside its own competitions. They remain in the federation ledger total,
  but are not attributed to an unrelated tournament and expose no other tenant name.
- `hasFinalizationSnapshot`: operational capture exists; it does not certify official
  federation approval, payment, ratification or a billable nomination.

`ruleStatus: not_configured` deliberately leaves billability undecided. The report
does not calculate debt, post adjustments, revoke entries, rewrite archive results
or interpret unknown history as non-performance. Financial operations and the
definition of a billable nomination remain pending owner direction.

## Full ledger totals

The existing dashboard incorrectly reduced its latest 50 receipt/writeoff records
to compute balances. It now aggregates **all** federation documents. Its displayed
document lists remain limited to 50. The arithmetic remains received nominations
minus consumed nominations, and received amounts remain integer kopecks serialized
as a string. This fix does not introduce expiry allocation, FIFO or entitlement
rules; an expired receipt is not silently removed from the accounting history.

Reconciliation queries run in a read-only, repeatable-read transaction so page,
summary and ledger use one database snapshot. Scoped aggregate queries avoid N+1
athlete/attempt fetches. All request values are parameterized. The dashboard's
ledger aggregate also uses a repeatable-read transaction.

## Validation and rollout

The isolated PostgreSQL test covers 55 receipts and 57 writeoffs, duplicate attempts,
unfinished/withdrawn/disqualified nominations, missing archive attempts, an empty
tournament, pagination, legacy cross-links, confidentiality acknowledgment, role
revocation and cross-federation/tournament-role denials. It verifies that reads do
not create financial documents and that the latest-50 list does not truncate balances.
The browser secretary flow verifies the federation report after tournament closure.

No migrations, dependencies, env changes, financial postings or archive backfill.
Rollback is an application-code redeployment; no data reversal is needed. After
release, verify exact deployment SHA, live authorized report and unchanged archive
and ledger fingerprints. Existing external/offline accounting is not inferred from
an empty in-application ledger.
