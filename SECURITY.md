# Security policy

## Reporting a vulnerability

If you have found a security issue in Streetlifting App, please **do not** open a public GitHub issue. Instead, report it privately:

- **Email**: araratgulyan69@gmail.com
- **Subject line**: `[security] short description`

If the issue is sensitive enough to need encryption in transit, ask in the first message and we'll exchange a PGP key out of band.

We aim to:

- Acknowledge receipt within **48 hours**
- Provide an initial assessment within **5 business days**
- Ship a fix or workaround within **30 days** for high/critical issues
- Coordinate public disclosure timing with you; default is **90 days** from your report or fix release, whichever comes first

## Scope

In scope:

- The web app at https://streetlifting.app
- The API server backing it
- Source code in this repository
- The Tauri desktop builds published to GitHub Releases of this repo

Out of scope:

- The legacy V1 app at https://github.com/guliandigital/streetlifting-os-legacy (in maintenance mode; report there if your finding is V1-specific)
- Third-party services (Telegram, Yandex.ID, GitHub, reg.ru, Cloudflare)
- Findings that require physical access, social engineering of staff, or attacks against unrelated infrastructure
- Findings against forks, copies, or self-hosted deployments not owned by `ИП Гулян А. Г.`

## What we do NOT consider vulnerabilities

- Missing best-practice headers without a demonstrable impact (please point at the impact, not the scanner output)
- Self-XSS where the user pastes content into their own browser
- Outdated software CVEs without exploitability proof in our context
- Rate-limit bypass that costs the attacker more than us
- Theoretical timing attacks below 100ms

## Coordinated disclosure

We follow the principle that **users come first**. When we agree on a fix and ship date, we will publish a CVE-style advisory in the GitHub Security tab and credit you (unless you prefer to remain anonymous).

## Bounties

We do not currently run a paid bug bounty. We're happy to credit researchers in advisories and our public changelog.

---

For non-security questions, please use the regular issue tracker.
