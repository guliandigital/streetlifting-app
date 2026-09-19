# Admission checks — ISF v5.1

Sources inspected on 2026-09-20:

- https://streetlifting.pro/docs/isf-rules/ (age on competition date).
- https://streetlifting.pro/wp-content/uploads/isf-documents/isf-technical-rules-v5-1-ru.pdf, sections 3.1, 3.3, 7.1 and 7.2 (minimum age, categories, admission and mandatory weigh-in).

Age is the full age on the competition date, not the age reached during its calendar
year. Existing configured division age bounds are enforced with the ISF minimum of 13. If a birthday crosses the eligibility boundary during a multi-day event, the
API reports `admission_event_date_required`; the current schema does not identify
the athlete's actual participation day, so the code does not guess one. Other
rulebooks require an explicit supported admission policy.

Public preliminary registration checks profile, gender and age, but does not demand
an already-completed weigh-in. Mandate approval, attempts and finalization validate
profile, gender, configured age bounds and the measured weight against the actual
class. Attempts require an in-progress competition and a weighed-in/on-platform/
finished nomination; withdrawn/disqualified/draft/paid nominations cannot write them.

Athlete identity edits take an exclusive row lock; admission/attempt validation takes
a shared lock in the same transaction as the write. An identity change is rejected
while approved nominations exist. Operators can revoke an active mandate first;
finalized historical identity corrections need the separate protocol-revision flow.
Unchanged values and non-identity fields do not revoke admission. Competition dates,
rulebook and category setup cannot change under existing approved nominations.

This patch introduces no migration and never revokes or rewrites historical rows in
bulk. It does not certify the authenticity of previously entered birth dates, signed
parental consent, declarations or medical documents. The existing manual mandate
approval remains a staff attestation; structured evidence capture/verification and
historical correction revisions are follow-up work, not implied by a Boolean flag.

Regression coverage includes birthday/minimum-age boundaries, multi-day ambiguity,
unknown rulebook, gender and weight bounds, preliminary registration versus weigh-in,
real PostgreSQL admission-versus-identity-edit races, stage restrictions and finalization.
