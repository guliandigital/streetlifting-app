# Cross-section integrity follow-up

Source baseline: production commit `8c26123` (19 September 2026).

## Implemented safeguards

- Competition-scoped roles cannot expand through their federation ID into other tournaments or federation accounting. List filters and individual route authorization intersect both scope identifiers.
- Nomination updates validate the effective stored-plus-patched flight and group, reject missing weight classes and clearing the required class, and check measured weight against the selected interval `(min, max]`.
- Internal nomination creation checks division gender and measured weight, and does not accept an inconsistent group/flight pair.
- Scoreboard operators cannot supply final results or votes, reopen decided attempts, or modify an attempt after voting starts. Operator writes now use serializable transactions with the existing retry mechanism.
- Nomination completion is derived from exactly one decided attempt in every required component slot; duplicate/excess slots cannot substitute for missing components. Normal nomination create/update cannot force `finished`.
- Finalization checks completed protocols as well as nomination statuses. Archiving requires prior finalization.
- Award printing is disabled for unfinished tournaments; browser printing displays a preliminary-results warning.

Regression coverage includes API route injection, domain protocol validation, cross-competition authorization and the printable browser scenario. No historical results are recalculated and no schema migration is introduced.

## Remaining decisions and verification limits

- Age eligibility needs an explicit rulebook convention (age on event date versus age in calendar year). Do not infer this from a date of birth or change archived categories automatically.
- Writeoffs remain a separate accounting operation. Automatic reconciliation, adjustments and repeat-finalization behavior need an agreed accounting contract.
- Record candidacy, ratification and immutable issued-document revisions remain separate product work; an archived status alone is not evidence of official ratification.
- Full immutable rulebook versions and an offline tournament workflow remain unimplemented.
- Concurrent finalization versus nomination/attempt mutation still needs a shared transactional lifecycle guard and a real multi-client test. Serializable attempt updates alone do not establish this guarantee.
- Production authenticated ISF smoke requires its missing service-token configuration. Do not manufacture a token or weaken the check to mark it passed.

These limits are not evidence that no earlier manual or external workflow exists.
