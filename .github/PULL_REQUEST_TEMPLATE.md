## Summary

<!-- 1–3 bullets: what changed and why. -->

## Architecture gates

- [ ] **Modular isolation** (ADR-0003) — added/changed module is wrapped in its own boundary/plugin; verified that breaking it does not affect other modules. Features did not import from each other.
- [ ] **Security baseline** (ADR-0004) — relevant items from `docs/security-checklist.md` are checked: input validated via Zod-strict, role enforced server-side, secrets not in source, no PII to logs, no token in localStorage.
- [ ] **Logging + audit** (ADR-0005) — used `moduleLogger(...)` (no direct `console.*`); new PII fields added to `REDACT_PATHS`; sensitive writes call `audit.record(...)` inside their transaction.
- [ ] **Domain shapes** — any new entity or field is defined in `packages/domain` and reused, not duplicated in `apps/*`.
- [ ] **Money** — money fields are `*Kopecks: number` integers (ADR-0006).
- [ ] **Time** — timestamps are UTC ISO 8601; rendered via the competition's `timezone`.

## Tests

- [ ] Unit tests added or updated
- [ ] Manual verification described below

<!-- Steps to verify locally. -->

## Notes for reviewers

<!-- Anything risky, surprising, or that needs context. -->
