# Approval, corrections, records and issued documents

Owner decision, 2026-09-20: the federation administrator takes the final decision.
Federation-wide acknowledged `federation_admin` and existing platform administrators
may use this workflow. Tournament-scoped administrators, judges, secretaries, other
federations and pending/revoked roles cannot approve, correct, ratify or issue.

## Protocol decisions

`GET/POST /competitions/:id/protocol-review` is private/no-store. Every mutation takes
an expected revision and a substantive reason. A competition row lock, serializable
retry and transactional audit fence concurrent decisions and finalization. The API
rejects missing snapshots, unsupported calculators, broken hashes and stale versions.
Existing imports are not backfilled or promoted to approved evidence.

- `approve` stores an immutable approval for the exact snapshot. A repeated identical
  approval returns the same decision. An approval does not overwrite the snapshot's
  original `approvalStatus`; read projections derive the current decision separately.
- `correct` changes one existing attempt's weight, repetitions/time and decision in a
  **new** revision, with reason and previous revision. It uses captured rules and
  the captured calculator version, never today's edited directories. It cannot add attempts,
  change identity/admission/category, invent a rulebook or reopen a tournament.
- A draft correction does not change operational rows. Explicit approval updates only
  changed attempts/results/places and refuses unexpected drift against the previous
  approved source. Earlier snapshots and approvals remain immutable.
- Approval of a correction supersedes earlier active record reviews and revokes their
  linked records until rechecked; rejected reviews stay in history. The same transaction
  queues the existing `competition.protocol.corrected` event exactly once. No external
  access, credentials or new event contract is created.

Print and exports label approved/unapproved evidence. The competition panel provides
revision history and downloads of every retained snapshot.

## Records and passport

`candidates` idempotently queues completed positive results from an approved revision.
These are **candidates for manual review**, not automatically eligible records. The
administrator must verify sporting rules and the relevant register, record a reason
with evidence, then use a separate `ratify` action. A rejected candidate is retained.
The actual performance date must be explicitly supplied within the tournament dates.

This workflow ratifies **federation records** only. It does not grant authority over
national/continental/world registries or guess equivalence between competition-specific
divisions. Existing conflicting record entries are not silently replaced. A previously
superseded record from this same nomination can be re-ratified from the corrected
revision; its audit and source review history remain available.

Ratified records enter the existing athlete passport. The passport includes only
non-revoked records with both a ratification time and an identified decision-maker;
imported rows without evidence remain unverified. The staff athlete view shows explicit
ratified/unverified/revoked states. Old data is not rewritten during deployment.

## Issued documents

`issue` persists an immutable, hashed result extract from an approved protocol. A
snapshot/nomination pair issues only once; after a correction, a new document gets the
next document version and links its predecessor. It is an issued result extract, not
a sport-rank award or a claim of an electronic signature.

The administrator downloads documents from revision history; athletes see their own
documents in the passport. `GET /my/issued-result-documents` and
`GET /issued-result-documents/:id/download` require authentication. Downloads also allow
the scoped secretariat. Other accounts receive 404. HTML downloads escape stored text,
block scripts, include source/document hashes and support browser printing to PDF.
No PDF engine, blob storage, dependency or email delivery is introduced.

Original contents never change. Downloads of documents whose protocol has been
superseded by a newer **approved** revision show a prominent historical-version notice.
A merely drafted correction does not invalidate the last approved document.

## Accounting boundary

The owner has not selected a billable-nomination rule. Automatic deductions and bulk
financial corrections remain disabled; the reconciliation report remains read-only.
Existing manual writeoff creation now treats `(federation, document number)` as its
durable idempotency key: identical retries return the saved posting, differing data
returns 409, and concurrent retries create one posting and one audit entry.
No financial operations are executed on production as part of this release.

## Migration, verification and rollback

Additive migration `20260920010000_protocol_review_documents` creates protocol approvals,
record reviews and issued result documents with restrictive FKs, uniqueness constraints
and immutable approval/document triggers. It changes no existing sporting/financial
rows. Validate fresh and upgrade databases and Prisma schema parity before release.

Real PostgreSQL tests cover administrator scope, absent/archive evidence, racing approval,
candidate preparation, review-before-ratification, document replay, owner isolation,
SQL immutability, corrections, reapproval, record withdrawal/re-ratification, document
history and outbox/audit deduplication. Unit tests cover captured-rule calculations and
invalid corrections. Browser tests exercise approval, review, ratification and download.

Rollback is code-only while retaining all tables, decisions and documents. Older code
will not expose the review workflow and may not display approval status correctly;
it must not be used to issue replacement documents. Do not drop tables, undo applied
migrations, delete decisions or replay financial operations. If migration fails, inspect
its transaction state before retrying. Compare production archive/ledger fingerprints,
verify exact deployment SHA and authenticated/anonymous guards without creating live
tournaments, approvals, records or financial fixtures. Full ISF smoke remains unavailable
without the pre-existing service token; do not create one just to pass the check.

## Authoritative sporting sources

The owner designated the local Russian and English ISF Technical Rules v5.1,
dated 2025-08-01, as the primary rule sources on 2026-09-20:

- `C:/Users/arara/Downloads/isf-technical-rules-v5-1-ru.pdf`, SHA256 `e2afee2a25baf94e421ef5acedaa056e4faebcf4556de5f74a8064cd62f51b25`.
- `C:/Users/arara/Downloads/isf-technical-rules-v5-1-en.pdf`, SHA256 `ac740c70b88f21ec7d0d28496fc47d5e9d4bb85b7488b8bedec5e90ade830266`.

Section 9.4 (PDF page 44, printed 43) requires certification by the flight head
judge and chief secretary. Approval requires both attestations and a reference to
the signed protocol, saved with the immutable approval. Administrator authorization
is not a replacement for those sporting signatures. References are evidence locators;
the application does not authenticate handwritten signatures or inspect external files.

Sections 7.7 and 10 require sanctioning, eligible referees/category/attempts,
weight/equipment evidence, frontal video and registry review. Verification saves
structured references and the previous record (null explicitly means first record
in that category). Section 10.3 minimum improvements are 1.25 kg or one repetition;
unsupported isometric records are blocked. The reviewer also checks first performance
priority under 7.7.6. This release does not silently resolve archive category identity.

Section 7.10 (PDF 39, printed 38) uses lighter bodyweight and, when equal,
additional weighing. New snapshots use `competition-scoring-v2`: final equal weights
share a place, leaving the following place vacant. `reweigh` appends the measured
weights and source reference in a new revision; original weigh-in/category remain
unchanged. Approval blocks unresolved equal-result/equal-weight ties. V1 calculation
is retained for historical corrections, with no archive-wide recalculation.

Corrections require a certified source and explicit clerical-error attestation.
They must not be used to reverse judicial decisions: section 7.9.6 preserves the
original decision after an appeal. Additional appeal attempts and the special fourth
Classic record-only attempt (10.6) are not implemented by this workflow. They must
not be entered as ordinary scoring attempts or included in totals.

Central ISF recognition remains a separate external verification (7.7.5, 10.4).
The rules mention submission within five working days in 7.7.5 and seven days in
10.4; no automatic deadline or central ratification is fabricated. Appeal deposits
in 7.9.4 are not the application's commercial nomination billing policy and do not
resolve the pending owner decision for automatic ledger deductions.
