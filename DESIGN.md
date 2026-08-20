# Design system

## Color strategy
Committed olive on a visibly tinted beige field (not paper-white). Olive carries 30–40% of the public surface (hero, footer, primary actions, map markers); beige `--field` is the body. Severity uses olive / ochre / rust. Tokens in `src/styles/tokens.css`, all OKLCH.

## Type
- Public site: Literata (variable, opsz), display tracking -0.03em floor, 1.02 line-height on display, 1.55 on body, 66ch prose cap. Italic only as a single emphasis word in a heading.
- App and portal: system UI stack, fixed rem scale (0.72 to 1.9rem), 600 weight headings.

## Motion
- `--ease-out` = out-quint. 150–250ms in product surfaces; 420ms for the one orchestrated hero reveal (content visible by default, animation enhances).
- Transform and opacity only. Press feedback on `:active` (scale .97).
- Mobile map detail is a drag sheet: 1:1 tracking, rubber-band above rest, velocity projection, critically damped spring (`src/components/useSheetDrag.ts`).
- Route changes: view-transition crossfade via react-router `viewTransition`.
- Every animation has a `prefers-reduced-motion` fallback; `prefers-reduced-transparency` removes backdrop blur.

## Components
Buttons (`.btn` + primary/dark/ghost/danger, sm/lg), chips, badges (severity/status/source/ai/demo), fields, option grid, segmented control, notices, empty states, skeletons, toasts, native `<dialog>` confirm, lifecycle bar, priority bar, KPI tiles, bar charts (plain DOM), funnel.

## Bans honored
No side-stripe borders, gradient text, glass cards, eyebrow kickers on every section, numbered scaffolding (the only numbered sequences are real sequences), identical icon-card grids, radii over 16px on cards, decorative grid or stripe backgrounds.
