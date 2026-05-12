# ADR-0006: Money in integer kopecks, timezone per competition

**Status**: Accepted (2026-05-07)
**Decision-makers**: Ararat Gulyan + Claude

## Decision

### Money

All monetary fields in the domain are stored and transported as **integer kopecks** (1/100 RUB). Field names end in `...Kopecks`. Conversion to display strings happens at the UI layer.

Examples in `packages/domain`:

- `Federation.billingTariffKopecksPerNomination: number` (integer)
- `Receipt.amountKopecks: number` (integer)
- `Competition.entryFeeKopecks: number` (integer)

### Timezone

Every `Competition` carries a required **IANA timezone identifier** (`timezone: string`, e.g. `"Europe/Moscow"`, `"Europe/Kaliningrad"`, `"Asia/Yekaterinburg"`). This is the wall-clock the venue operates in.

All timestamps elsewhere in the system are **UTC ISO 8601** in storage and on the wire. The competition's `timezone` is the _only_ knob that controls how those timestamps render in operator-facing surfaces (schedule, attempt clocks, broadcast).

## Why money in kopecks

JavaScript `number` is IEEE-754 double. Operations on currency-as-float silently lose cents:

```
0.1 + 0.2 === 0.30000000000000004
```

Multiplying a float tariff (e.g. 0.41 RUB) by a writeoff count of 1000 nominations and rounding back can drift by full rubles over a federation's history. legacy reference system's billing reconciliation already operates on integer "tariff × count" arithmetic for exactly this reason.

Storing as integer kopecks gives:

- Exact addition + subtraction (no rounding artifacts)
- Trivial Postgres `bigint` mapping (`@db.BigInt` in Prisma, fits 9.2 × 10^18 kopecks ≈ 9 × 10^16 RUB)
- Trivial JSON serialization (no `BigInt` JSON-stringify problem until amounts exceed 2^53 kopecks ≈ 90 trillion RUB — out of scope)
- Trivial conversion at display: `kopecks => (kopecks / 100).toLocaleString('ru-RU', { style: 'currency', currency: 'RUB' })`

## Why kopecks rather than RUB-decimal-string or JS BigInt

- **Decimal string** (`"41.00"`) requires a decimal-arithmetic library or string parsing for every comparison/sum. We do enough billing math that this drag adds up.
- **BigInt**: serialization to JSON requires custom handling everywhere; ORM mapping is messier; not needed at our scale.

Integer kopecks is simple, correct, and fits everywhere.

## Why timezone per competition (not per federation)

- Russian federations run tournaments across the country. A Moscow-based federation may host events in Kaliningrad (UTC+2), Krasnodar (UTC+3), Yekaterinburg (UTC+5), Vladivostok (UTC+10).
- The wall-clock that matters during operation is the **venue's** time, not the organizer's. Athletes show up at 09:00 local; operators announce flights at 14:30 local.
- A federation field would be wrong on the road; a per-attempt field is overkill.

Per-competition is the right granularity. Multi-day cross-timezone tournaments (rare) pick the venue's primary timezone; the operator handles travel-day edges manually.

## Why IANA, not offset

`"Europe/Moscow"` (a name) keeps DST and policy changes correct over time. `"+03:00"` (an offset) silently breaks if Russia ever reintroduces DST or shifts a region (Volgograd's recent moves between MSK and MSK+1 are recent precedent).

## Implementation

- All `*Kopecks` fields: `z.number().int().nonnegative()` in Zod, `Int @db.BigInt` in Prisma (M1)
- Display helper in `packages/ui`: `formatRub(kopecks: number, locale = 'ru-RU')`
- Competition timezone: `z.string().min(3).max(64)` with a regex sanity-check for IANA shape; full validation against tzdata happens at the API boundary using a lookup against `Intl.supportedValuesOf('timeZone')` (M1)
- Display helper in `packages/ui`: `formatLocalTime(isoUtc: string, timezone: string, locale = 'ru-RU')`
- Server time always returned as UTC ISO 8601; never offset-suffixed local time

## Consequences

- Any place that currently writes a money input as `41` to mean "41 RUB" must now write `4100` for "41.00 RUB".
- Forms accept user input as decimal RUB and convert to kopecks before storing.
- Display always converts kopecks → display string at the leaf component; intermediate calculations stay in integer kopecks.
- All competition CRUD must include `timezone`; the UI defaults to `'Europe/Moscow'` at competition-create.
