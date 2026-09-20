# Protocol export provenance

Printed protocols and authenticated `protocol.json`, `protocol.csv` and `protocol.xlsx`
use one allowlisted projection. Existing live-protocol staff scopes apply to all three
endpoints; raw snapshot downloads retain the stricter federation-administrator scope.
Responses are private/no-store. This is not a public publication endpoint.

- `working`: mutable operational data before finalization.
- `finalization_snapshot`: stored names, categories, attempts, scores and places from
  the latest immutable finalization snapshot. Revision, capture time and SHA-256 are
  included. The hash identifies the complete source snapshot, not the rendered file.
- `legacy_unverified`: finalized/archived tournament without a snapshot. Current
  operational data is shown explicitly as unverified historical evidence.

Finalization alone carries `approvalStatus: not_recorded`. An explicit, persisted
federation-administrator decision changes the projection to `approved`. See
[protocol review workflow](protocol-review-workflow.md). No archive backfill or automatic financial posting occurs.

CSV/XLSX preserve their first 15 columns and append protocolSource, snapshotRevision,
snapshotCreatedAt, snapshotHash and approvalStatus per result. Consumers that assume
an exact column count must accept the appended metadata. Empty exports have headers
only; JSON and the print view carry provenance even without rows. New snapshots also
capture the declared weight category. Earlier schema 1 snapshots omitted that optional
field: their export cell remains empty rather than being silently filled from a current
mutable reference. Actual category is always saved.

A RepeatableRead transaction chooses the source and reads its data consistently across
concurrent finalization. Unknown snapshot versions, malformed data, scope mismatch and
hash mismatch fail closed; they never fall back to current references. The projection
omits dates of birth, contacts, payments, private notes, actor IDs and unrelated rules.
The same authorized staff could already export athlete names; no anonymous, passport
or public-scoreboard access is introduced and their consent checks are unchanged.

Verification: isolated PostgreSQL lifecycle test compares JSON/CSV/XLSX bytes before
and after changing reference/athlete names, checks legacy/working states, anonymous and
cross-federation denial, competition-scoped staff access and metadata. Browser pilot
checks working and saved print views. Unit tests cover invalid evidence and projection.

No migration, new dependency or environment change. Rollback is code-only; stored
snapshots remain intact, but older code resumes mutable protocol exports.
