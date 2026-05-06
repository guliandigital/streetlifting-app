# Brand

## Palette

| Name             | Hex       | Usage                              |
|------------------|-----------|------------------------------------|
| Dark Charcoal    | `#10151D` | Primary background                 |
| Dark Alt         | `#0D1219` | Surface elevation / subtle areas   |
| Lime Accent      | `#99CD14` | Brand mark, primary action, focus  |
| White            | `#FFFFFF` | Foreground on dark surfaces        |

Palette source: `COLOR_PALETTE.txt`. Tailwind tokens live in `apps/web/src/index.css` under `@theme`.

## Logo and assets in this repo

- Web favicons + manifest → `apps/web/public/`
- Selected logo PNGs → `apps/web/public/brand/`
- Desktop app icons → `apps/desktop/src-tauri/icons/`

## Source pack (not committed)

The full multi-variant logo pack ships outside the repo (12 MB ZIP). Copy stored separately by the maintainer; the curated subset above is what the apps actually load. To add a new variant from the pack, copy it into `apps/web/public/brand/` and reference it from the relevant view.

For the production master files (vector SVG/AI/PDF) — the source pack notes those are still TODO and should be drawn separately for print and brand-book use.

## Usage rules

- Default theme is **dark** (per the source pack and the dark backgrounds across product surfaces).
- The lime accent (`#99CD14`) is reserved for the brand mark, primary CTA, focus rings, and the "good lift" state. Don't dilute it as a generic surface colour.
- Symbol-only icons go in tight or square contexts (favicons, sidebar collapsed, OS app icon).
- Horizontal lockup goes in the app header.
- Never recolour the mark outside the palette.
