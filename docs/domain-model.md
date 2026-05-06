# Domain Model

Derived from PowerTable screenshots and operational behavior. See `packages/domain/src/*.ts` for canonical Zod schemas — this document explains intent.

## Aggregate map

```
Federation ────┬── Competition ────┬── Division ── WeightClass
               │                   ├── Discipline (catalog selection)
               │                   ├── Platform ── Flight ── Group
               │                   ├── JudgeAssignment
               │                   ├── Nomination ── Attempt
               │                   └── (Award, Certificate)
               │
               ├── Receipt (top-up)
               ├── Writeoff (consumption)
               └── User ── RoleAssignment
```

## Entities

### Federation
Tenant boundary. Every competition belongs to one federation. Federation owns:
- contact metadata (publishes on its public page)
- billing tariff (rubles per "выступившая номинация")
- security key (used to authorize API integrations and bot subscriptions)
- accountant + cashier names (for invoice templates)
- a balance of pre-paid nominations, computed as `sum(receipts) − sum(writeoffs)`

PowerTable shows this on the federation's home page: receipts list (left), writeoffs list (middle), balance (right), and a chart comparing federation activity within the region. We replicate all four.

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
- `applyVeteranCoefficient`: bool; PowerTable feedback flagged that some federations exclude veteran coefficient on ELITE-tier norms — this is the field that controls it

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

PowerTable's "Номинации спортсменов" page is the secretary's primary work surface.

### Attempt
1..N attempts per nomination. For `three_attempts_max`, exactly 3 with weights chosen by the athlete (or coach) ahead of each. For `reps_to_failure`, typically 1 attempt with a `repsCount` instead of weight progression. For multi-rep with fixed weight, weight is taken from the discipline's `fixedWeightKg`.

Three judge decisions per attempt (head + 2 sides). Result derived: 2/3 white = good lift.

### Flight + Group + Platform
Flight = a session on a platform with a defined start time. Group = a subdivision within a flight (typically by weight class or by lot range). PowerTable's "Распределение по потокам и группам" is the page that produces these.

### Judge + JudgeAssignment
Judge is a person record (separate from User — many judges don't have system accounts; secretaries enter them by name). JudgeAssignment ties a judge to a competition + platform + role.

### Receipt + Writeoff (billing)
Receipt = "federation paid for N nominations until date X at tariff T". Writeoff = "federation consumed K nominations on competition Y". The federation balance is the running sum.

PowerTable computes "выступивших номинаций за период" — nominations whose final status is `finished` or `disqualified` — and bills against that count, not against draft / withdrawn registrations. We do the same.

### Award + Certificate
Award = the place / title / rank earned. Certificate = the printed grammota (PDF). Generated lazily, cached.

### SyncEvent
The append-only log that powers offline-first. Every mutation in the desktop client writes one. Server orders by Lamport clock. See `architecture.md`.

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
- Detailed warehouse/inventory (PowerTable's "Склад") — modeled as flat InventoryItem in M5; richer SKU/serial tracking pushed to V2.1
- Multi-currency (RUB only in V1; multi-currency comes with the international ООО track per legal memory)
