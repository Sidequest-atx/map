# Design system

## Reference and register
The public site borrows the grammar of a flagship university homepage (utexas.edu): a thin drenched utility bar, a white main bar with an uppercase nav, a full-bleed photo or video hero with a black-weight headline, alternating image-and-text sections carrying big numbers, statement bands in the brand color, and a light footer. Photo-led: the imagery is the design. Product surfaces (portal, sign-in, app) stay dense and system-neutral.

## Color strategy
White page, charcoal ink, olive as the single accent. Olive carries the statement bands (`.band`, `.band--deep`), primary actions, links, the big numbers and map markers; nothing else is tinted. No beige field anywhere on the public site. Severity keeps olive / ochre / rust. Tokens in `src/styles/tokens.css`, all OKLCH; `--accent` is the one role every emphasis color resolves to.

## Type
One family, committed weight contrast: Libre Franklin (variable 100–900, self-hosted in `public/fonts`, `src/styles/fonts.css`). Display = 900 uppercase (hero, statements; letter-spacing floor -0.015em, line-height ≈ 0.96–1.02). Section titles 700, body 400 at 1rem / 1.5, stats 800 in the accent color with small uppercase 700 labels. Overpass Mono only for tabular data chips. App and portal: the same family via the `.ui` scope, fixed rem scale, 600 headings.

## Imagery
`src/lib/media.ts` lists the hero video (mp4 + webm + poster) and the stills; `public/media` holds the files, produced by the path-traced street model in `render/` (`node render/publish_media.mjs` copies finished renders in). A missing file degrades to a quiet olive panel (`.still--pending`), never a broken image. Alt text is written as a caption, not a filename.

## Motion
- `--ease-out` = out-quint. 150–250ms in product surfaces; one orchestrated hero reveal (title, sub, actions rise in sequence) on the landing.
- Transform and opacity only; hover zoom on story images at 700ms out-expo; count-ups on the big numbers when they enter view.
- Background video autoplays muted, loops, and has a visible pause control; it never plays under `prefers-reduced-motion`.
- Route changes: view-transition crossfade via react-router `viewTransition`.
- Every animation has a `prefers-reduced-motion` fallback.

## Components
Shell: `.utilbar`, `.topbar` + `.nav` (uppercase, 2px active underline), `.footer`. Landing: `.hero`, `.band` / `.statement` / `.statement-copy`, `.stories` (one lead card + two stacked), `.feature` (+ `--rev`) with `.stats` / `.stat` and `.sources`, `.live`, `.steps` (a real numbered sequence), `.quote`, `.more` (chevron text link). Product: buttons (`.btn` + primary/dark/ghost/danger, sm/lg), chips, badges, fields, option grid, segmented control, notices, empty states, skeletons, toasts, native `<dialog>` confirm, lifecycle bar, priority bar, KPI tiles, bar charts (plain DOM), funnel.

## Bans honored
No side-stripe borders, gradient text, glass cards, decorative crack or sidewalk motifs, eyebrow kickers on every section, numbered scaffolding (the only numbered sequence is the real three-step process), identical icon-card grids, radii over 8px on cards, decorative grid or stripe backgrounds, WebGL on the landing (it must render on every phone and every deploy).
