# SideQuest ATX

**Photograph every broken, blocked, or missing sidewalk in Austin, turn the photos into a living public map, and do not stop until the hazard is actually gone.**

SideQuest ATX is a student-run civic project based in Northwest Austin, running from 2026 through 2031 and designed to outlive its founders. Neighbors photograph hazards from a phone; computer vision classifies, deduplicates, ranks, and verifies them; the map becomes the city's repair queue; and nothing is marked resolved without a second photo.

> No one's grandmother should be injured by a sidewalk a photograph could have fixed.

## Why

Our 80-year-old grandmother tripped on a root-lifted panel on a walk she had taken for years, fell, and broke her finger. Nobody had reported the panel, because nobody was counting.

- Falls are the leading cause of injury death for Americans 65+; about 1 in 4 older adults falls each year (CDC).
- Austin's Sidewalk Program counts ~1,500 miles of missing sidewalk and a backlog near $1B; at current funding the city has said completion would take almost a century.
- 214 miles of Austin sidewalk are rated deficient *only because of vegetation*. Clearing that is the adjacent landowner's job: no bond, no wait.

## What this repo is

A React + TypeScript + Vite website, a native iPhone app (`mobile/`), and a shared Supabase backend (`supabase/schema.sql`). **Photos are captured only in the iPhone app**; the website is the living public map and the moderation desk.

| Surface | Route | Who | Job |
| --- | --- | --- | --- |
| Public site | `/` `/map` `/how` `/data` `/app` | anyone | Mission, live Mapbox map with filters and deep links, operating model, open data with CSV/GeoJSON downloads, how to get the app. **View only.** |
| Portal | `/portal` (sign-in at `/app/signin`) | moderators | KPIs, priority-ranked table, 311 ticket routing, duplicate merge, after-photo verification, exports. |
| iPhone app | `mobile/` | signed-in reporters | The only surface that takes photos. Camera + GPS-at-shutter, Quest Drive, Glasses Walk, and a Map tab showing the same shared map. |

### The AI is structural, not a chatbot

| Module | What it does today | How it grows |
| --- | --- | --- |
| `supabase/functions/sq-classify` | **Claude** (`claude-haiku-4-5`) rates every photo's type + severity against published sidewalk-condition criteria — PROWAG displacement tiers, FHWA LTPP crack classes, UW Project Sidewalk passability (sources in `RUBRIC.md`). Signed-in callers only, actual token cost metered into `sq_ai_usage`, hard monthly budget stop. Suggestion only; reporter confirms. | Tune the rubric and redeploy; swap `ai_model` in `sq_config` (e.g. `claude-sonnet-5`) without a client build. The model name is recorded on every report so the dataset can be re-scored as models improve. |
| `src/ai/classify.ts` (web, demo mode) | The original on-device pixel-statistics heuristic, kept for `VITE_DEMO=1`. | — |
| `src/ai/dedup.ts` | Distance + type match (15 m) on submit and within Quest Drive batches. Reporter decides "add to SQ-0142" vs new pin. | Visual similarity via the same endpoint. |
| `src/ai/rank.ts` | Transparent 0–100 priority: trip risk × who walks here (schools, transit, senior housing) × time waiting. Every factor shown. | Ingest the city's own prioritization inputs. |
| `src/ai/verify.ts` | Resolution requires an after-photo; Claude compares before/after and says whether the hazard is gone; a named moderator signs. | — |

### Phone app (`mobile/`)

A web page cannot lock a GPS fix to the shutter, write coordinates into the photo, or record a trail with the screen off. `mobile/` is the native iPhone app that can (Expo SDK 57, unsigned IPA from GitHub Actions + Sideloadly). Same types, same dedup and ranking math, same rules (no after-photo, no "resolved"). Three capture modes: **Report** (GPS locked at the shutter, EXIF-tagged JPEG, draggable pin with the accuracy ring, saved to a "SideQuest ATX" Photos album), **Quest Drive** (interval capture from the passenger seat with a breadcrumb trail and batch review), and **Glasses Walk**, where Meta glasses (or any camera without GPS) take the pictures and the phone in your pocket records the trail they get placed on. Local-first ledger, synced to Supabase whenever there is a connection; a **Map** tab shows the shared map (mapbox-gl in a WebView, same palette as the site). See `mobile/README.md`.

### Backend (`supabase/`)

One shared Supabase project (namespaced `sq_*` — see the header of `supabase/schema.sql` for why). Email + password accounts; everyone signs up as a reporter, the moderator role is a server-side JWT claim. RLS: the map is publicly readable, reporters insert their own rows, owners and moderators update. Photos land in the public `sidequest-photos` bucket under the uploader's folder. The website subscribes to realtime changes, so a photo taken on a walk appears on `/map` while the reporter is still standing next to the hazard.

**Bootstrap** (once, ~90 seconds): open the project's SQL editor, paste `supabase/schema.sql`, add the Mapbox token line at the bottom, Run. Then Authentication → Sign In / Providers → turn **off** "Confirm email" so accounts work instantly.

## Run it

```bash
npm install
cp .env.example .env.local   # add VITE_MAPBOX_TOKEN
npm run dev
```

To test the camera on a phone over LAN you need HTTPS: `npm run dev -- --host` plus `@vitejs/plugin-basic-ssl`, or a tunnel.

## Architecture notes

- **Design system**: hand-rolled, `src/styles/tokens.css` + `global.css`. Committed olive on a tinted beige field, Literata for the public site, system UI font for the app and portal. Motion is transform/opacity only, gated by `prefers-reduced-motion`; the mobile map sheet is a real drag sheet with velocity projection and a critically damped spring.
- **Storage**: `src/data/store.ts` is a `ReportStore` interface with two implementations: `SupabaseStore` (`src/data/remote.ts`, the default — live rows, realtime, optimistic moderation writes) and the original localStorage prototype seeded with ~60 synthetic NW Austin reports, kept behind `VITE_DEMO=1`. The database re-enforces the store's rules (a `resolved` row needs an after-photo).
- **Auth**: `src/data/session.ts` wraps Supabase email + password auth; pages still see the mock era's `{ name, role, since }`. Moderator comes from the JWT claim `app_metadata.sq_role`, granted server-side.
- **No dead ends**: error boundaries per layout, 404 route, role gate that explains and offers a way out, camera/geolocation/Mapbox fallbacks, browser-Back-aware report steps, leave-guard on drives, list view when tiles fail.
- **PWA**: manifest with `start_url: /app`, icons generated by `scripts/make_icons.py`, offline shell in `public/sw.js` (production only).

## Roadmap

- [x] Native iPhone capture app with GPS-at-shutter, EXIF-tagged photos, and Glasses Walk (`mobile/`)
- [x] Supabase backend + real accounts (photos app-only; site and app share one live map)
- [ ] Fine-tuned sidewalk vision model behind `VITE_AI_ENDPOINT` / `EXPO_PUBLIC_AI_ENDPOINT`
- [ ] Austin 311 API hand-off instead of manual ticket entry
- [ ] Printable door-hanger per vegetation report (sample on `/how`)
- [ ] Ingest the City's sidewalk inventory for true coverage miles
- [ ] Optional: Austin deployment with UW Project Sidewalk

## Constraints we hold ourselves to

Photos of public right-of-way only; no faces, plates, or house numbers published. Never claim dollars of falls prevented. Never close a report on the city's word alone. Never invent numbers on the public site.
