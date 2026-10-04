# Runway pipeline

Turns the project's own sidewalk photos into short clips for the site and for social posts. The site keeps its current media until a clip is published over a slot, and one command puts the old media back.

## What you need

- Photos in `runway/photos/`, named as `shots.json` expects (`hero.jpg`, `missing.jpg`, `broken.jpg`, `falls.jpg`, `hedge.jpg`). They stay on this machine; the folder is git-ignored because phone photos carry GPS.
- A Runway API key in the environment as `RUNWAYML_API_SECRET`. API credits are bought in the developer portal (dev.runwayml.com) at $0.01 per credit and are separate from the credits in a Runway app subscription.
- ffmpeg on the PATH.

## Steps

```
npm run runway -- status
npm run runway -- prep
npm run runway -- plan
npm run runway -- generate --shot hero --yes
npm run runway -- generate --shot hero --final --yes
npm run runway -- encode --shot hero
npm run runway -- publish --shot hero
npm run runway -- unpublish --shot hero
```

| Step | What it does | Costs credits |
| --- | --- | --- |
| `status` | Shows, per shot, which stage it has reached and whether it is live | No |
| `prep` | Crops each photo to the shot's ratio and strips all metadata | No |
| `plan` | Prints credits and dollars for one take of every shot | No |
| `generate` | Sends one take. Without `--yes` it only prints the cost. Drafts use `gen4_turbo`; `--final` uses `gen4.5` | Yes |
| `encode` | Newest take (or `--take <file>`) to `.mp4`, `.webm` and a poster | No |
| `publish` | Copies the clip to `public/media/runway/` and switches the slot in `src/lib/media.runway.json` | No |
| `unpublish` | Switches the slot back and removes the copied files | No |

## Shooting the photos

- Landscape, phone held level, low to the ground for the hero.
- Leave room around the subject: `prep` crops to 16:9 for the hero and 4:3 for the feature sections.
- Keep faces, license plates and house numbers out of frame. Check `runway/work/prepped/` before generating.
- Even light. Hard noon shadows make the concrete shimmer in the output.

## Rules for a usable take

- One camera move per clip, small, 5 seconds (10 for the hero).
- Compare the last frame with the photo. If a crack moved, grew or closed, discard the take.
- Report photos on the map never go through this pipeline.

## Slots

| Slot in `shots.json` | Where it shows |
| --- | --- |
| `hero` | Landing hero video |
| `stills.<id>` | A landing image slot (`missing`, `broken`, `falls`, ...), played as a silent loop |
| `clips.<id>` | Reserved for pages that do not exist yet |
| `social` | Not on the site. Vertical clips finish in `runway/work/social/` |

Every take is recorded in `runway/work/log.json` with its model, seed, prompt and credit cost.
