# ADR-0002: Monorepo split + repo rename

**Status**: Accepted, executed (2026-05-07)
**Decision-makers**: Ararat Gulyan + Claude

## Context

V1 was a single-app Tauri repo at `guliandigital/streetlifting-os`. V2 is a fundamentally different shape: monorepo with three apps and shared packages, with `apps/desktop` being just the smallest of the three. Continuing in the v1 repo would mean either nuking history or carrying an architecture that doesn't fit.

Separately, v1.4.1 was just published (2026-04-30) with working signed Tauri auto-update. Existing users must keep getting updates.

## Decision

1. Rename `guliandigital/streetlifting-os` → `guliandigital/streetlifting-os-legacy`. GitHub redirects keep the v1.4.1 auto-update endpoint working.
2. Create new `guliandigital/streetlifting-app` for V2 (matches the streetlifting.app domain).
3. Do **not** reuse the name `streetlifting-os` for V2 — that would clobber the rename redirect and break v1.4.1 auto-update.
4. Maintain v1.x in legacy repo as hotfix-only until V2 reaches feature parity.
5. Final v1.x release will publish a `latest.json` whose installer points at the V2 binary, migrating users in one step.
6. Reuse the v1.4.1 Ed25519 signing key (`AE2CE39D47158968`) in V2 so old binaries can verify new updates.

## Alternatives considered

- **One repo, new branch** — rejected; monorepo restructure would dominate every diff during the rewrite, and merge mistakes could break v1.x users
- **Reuse `streetlifting-os` for V2** — rejected; breaks v1.4.1 auto-update endpoint via redirect collision
- **Ship v1.4.2 first to update auto-update endpoint, then take the name back** — rejected as unnecessary complexity; the new name is permanent and matches the brand domain anyway
- **Keep V1 supported indefinitely** — rejected; small user base, single product line, parallel maintenance is cost without benefit beyond migration window

## Execution

- Rename: `gh repo rename streetlifting-os-legacy --repo guliandigital/streetlifting-os --yes` ✓
- Create: `gh repo create guliandigital/streetlifting-app --public ...` ✓
- Verified `https://github.com/GulianDigital/streetlifting-os/releases/latest/download/latest.json` still resolves 200 OK after both operations ✓

## Consequences

- v1.x users continue to receive updates from `streetlifting-os-legacy` releases
- V2 has clean slate, no v1 history
- Reusing the signing key requires the private half (which lives at `~/.tauri/streetlifting-os.key` on the maintainer's host, mirrored in `TAURI_SIGNING_PRIVATE_KEY` GHA secret) to be accessible from the new repo's Actions — needs to be re-pasted into the new repo's secrets when CI is set up
