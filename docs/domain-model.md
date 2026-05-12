# Domain Model

Derived from legacy reference system screenshots and operational behavior. See `packages/domain/src/*.ts` for canonical Zod schemas — this document explains intent.

## Aggregate map

```
Federation ────┬── Competition ────┬── Division ── WeightClass
               │                   ├── Discipline (catalog selection)
               │                   ├── Platform ── Flight ── Group
               │                   ├── JudgeAssignment
               │                   ├── Nomination ── Attempt
               │                   ├── PlateSet (per-comp override; default ISF v5.1)
               │                   └── (Award, Certificate)
               │
               ├── Receipt (top-up)         ── all amounts in integer kopecks (ADR-0006)
               ├── Writeoff (consumption)
               ├── PlateSet (federation default)
               ├── VeteranCoefficient (federation override; default ISF v5.1 §10.9.4)
               ├── Attachment (athlete photos, federation page files, certificate PDFs)
               ├── Consent (152-ФЗ, first-class entity, audit-logged on grant + revoke)
               ├── Record (best-ever per discipline × division × class × scope)
               └── User ── RoleAssignment
```

## Reference data (presets/)

`packages/domain/src/presets/` ships ISF v5.1 reference data ported from V1 (where 571 tests verified it):

- 9 age categories with **M5 60–69 / M6 70+** split (the §10.9.4 correctness differentiator vs older imported coefficient tables)
- 7 women's + 12 men's weight categories, M_52 men restricted to youth/junior
- 19 disciplines (3 Classic + 16 Multirep variants)
- ISF §6.6 plate set with canonical colours + 1.25 kg increment rule
- §10.9.5 bodyweight-limit additional-points formula
- §2.2 Multirep mandatory loads

Federations clone these into their own `VeteranCoefficient` / `PlateSet` / discipline catalogue records and may override per their own rulebook (every override is audit-logged).

`packages/domain/src/calculations/isfAbsoluteCoefficient` ports the published streetlifting.ru/points absolute-coefficient formula with all six (sex × event) curves.

## Money

Every monetary field is **integer kopecks** (1/100 RUB). Field names end in `...Kopecks`. See ADR-0006 for the full rationale.

- `Federation.billingTariffKopecksPerNomination`
- `Receipt.amountKopecks`
- `Competition.entryFeeKopecks`

Display conversion happens at the leaf component via the `formatRub(kopecks)` helper. Intermediate calculations stay in integer kopecks.

## Time

All timestamps in storage and on the wire are **UTC ISO 8601**. Each `Competition` carries a required IANA `timezone` (e.g. `"Europe/Moscow"`, `"Europe/Kaliningrad"`, `"Asia/Yekaterinburg"`) — that field is the _only_ knob controlling how operator-facing surfaces render local time. See ADR-0006.

## Entities

### Federation

Tenant boundary. Every competition belongs to one federation. Federation owns:

- contact metadata (publishes on its public page)
- billing tariff (rubles per "выступившая номинация")
- security key (used to authorize API integrations and bot subscriptions)
- accountant + cashier names (for invoice templates)
- a balance of pre-paid nominations, computed as `sum(receipts) − sum(writeoffs)`

legacy reference system shows this on the federation's home page: receipts list (left), writeoffs list (middle), balance (right), and a chart comparing federation activity within the region. We replicate all four.

### User + RoleAssignment

Identity is centralized. A single user can be `secretary` for federation A and `athlete` registered in federation B. Roles are scoped to (federation | competition | global) and time-bound (granted/revoked).

### Competition

The unit of work. Has its own lifecycle (`draft → registration_open → registration_closed → in_progress → finalized → archived`). Selecting disciplines from the catalog is a per-competition decision; the same federation can run a streetlifting cup one weekend and a calisthenics meet the next.

### Discipline (catalog)

Global reference data, not federation-scoped — the rule book is shared. Each discipline has:

- `family`: streetlifting | weighted_calisthenics | multi_rep
- `format`: three_attempts_max | reps_to_failure | reps_in_time | isometric_hold
- `equipment`: pull_up_bar | dip_bars | bench | etc.
- `attemptCount`: 3 by default; multi-rep disciplines often 1
- `fixedWeightKg`: nullable; for "русский жим" style fixed-load events
- `applyVeteranCoefficient`: bool; legacy reference system feedback flagged that some federations exclude veteran coefficient on ELITE-tier norms — this is the field that controls it

### Division + WeightClass

Division = (gender, veteran tier, age range). WeightClass = a band within a division, possibly per-discipline (some federations have different weight breakdowns for pull-ups vs dips).

Veteran coefficient lives on the division (per ISF rules, e.g., M5/M6 split at 70+ → 1.150 from legacy memory).

### Athlete

Person record, federation-agnostic. Same athlete competes across federations; we don't duplicate. Federation card numbers are an array (not modeled in skeleton — added at M2).

### Nomination

**Central operating entity.** A nomination = "this athlete is registered to compete in this discipline + division + weight class at this competition". It's the unit billed (1 nomination = 1 writeoff in the federation balance). It carries:

- payment + mandate state
- weigh-in body weight (locked at weigh-in time, not the athlete's profile weight)
- entry number / lot
- flight + group assignment
- final result + place

legacy reference system's "Номинации спортсменов" page is the secretary's primary work surface.

### Attempt

1..N attempts per nomination. For `three_attempts_max`, exactly 3 with weights chosen by the athlete (or coach) ahead of each. For `reps_to_failure`, typically 1 attempt with a `repsCount` instead of weight progression. For multi-rep with fixed weight, weight is taken from the discipline's `fixedWeightKg`.

Three judge decisions per attempt (head + 2 sides). Result derived: 2/3 white = good lift.

### Flight + Group + Platform

Flight = a session on a platform with a defined start time. Group = a subdivision within a flight (typically by weight class or by lot range). legacy reference system's "Распределение по потокам и группам" is the page that produces these.

### Judge + JudgeAssignment

Judge is a person record (separate from User — many judges don't have system accounts; secretaries enter them by name). JudgeAssignment ties a judge to a competition + platform + role.

### Receipt + Writeoff (billing)

Receipt = "federation paid for N nominations until date X at tariff T". Writeoff = "federation consumed K nominations on competition Y". The federation balance is the running sum.

legacy reference system computes "выступивших номинаций за период" — nominations whose final status is `finished` or `disqualified` — and bills against that count, not against draft / withdrawn registrations. We do the same.

### Award + Certificate

Award = the place / title / rank earned. Certificate = the printed grammota (PDF). Generated lazily, cached.

### SyncEvent

The append-only log that powers offline-first. Every mutation in the desktop client writes one. Server orders by Lamport clock. See `architecture.md`.

### Record

Best-ever performance per (discipline × division × weight class × scope). Scope is one of `federation`, `national`, `continental`, `world`. Updated when an attempt qualifies; ratification is a separate step done by jury. Updates are audit-logged.

### PlateSet

Named collection of plates with bar + collar weight and increment rule. Default ISF v5.1 set lives in `presets/plates.ts`; a federation may register its own (e.g. gym-specific inventory) and override per competition.

### VeteranCoefficient

Multiplier per Masters tier. Defaults from ISF v5.1 §10.9.4 (M1=1.025, M2=1.05, M3=1.075, M4=1.1, M5=1.125, M6=1.15) live as a preset. Federations may override per tier with effective-from / effective-to dates; every change is audit-logged.

### Consent

First-class 152-ФЗ consent record. One row per consent grant; revocation creates a new row with `revokedAt`. Captures the exact text shown to the data subject + locale + version + IP/user-agent of grant. Audit-logged on grant and revocation. See ADR-0004 §"Personal data".

### Attachment

Generic file attachment. Stores metadata + sha256 for integrity; bytes live on disk under a sandboxed path. MIME validated by magic bytes (not extension), size capped per endpoint, images re-encoded server-side. See ADR-0004 §"Input validation".

## Status lifecycles

### Competition

```
draft → registration_open ⇄ registration_closed → in_progress → finalized → archived
```

### Nomination

```
draft → paid → weighed_in → on_platform → finished
                   │              │
                   │              └→ disqualified
                   └→ withdrawn
```

### Attempt result

```
pending → good_lift | no_lift | withdrawn
```

## Out-of-scope for V1 schema

- Sponsors / sponsor placements per competition
- Live commentator notes / speaker scripts
- Drug-test sample tracking
- Detailed warehouse/inventory (legacy reference system's "Склад") — modeled as flat InventoryItem in M5; richer SKU/serial tracking pushed to V2.1
- Multi-currency (RUB only in V1; multi-currency comes with the international ООО track per legal memory)
