# SideQuest ATX hero media: Blender 5.2 / Cycles pipeline report

Final. Everything lives in `C:\Users\james\Projects\sidequest-atx\render\` (nothing outside render/ was touched).

## Deliverables (absolute paths)

- Hero video: `C:\Users\james\Projects\sidequest-atx\render\out\hero\hero_1080.mp4` (H.264, yuv420p, CRF 20, 1920x1080, 24 fps, 432 frames, 18.0 s, 25.7 MB) and `hero_1080.webm` (VP9 CRF 31, 15.2 MB); `hero_poster.webp` (frame 1, 1920 wide, q85) and `hero_last.webp` (frame 432). Frames kept in `out\hero\frames\frame_0001..0432.png`.
- Stills (1920x1080 WebP q88 + `_960.webp`, PNG masters in `out\stills\png\`): `out\stills\missing.webp`, `broken.webp`, `falls.webp`, `precedent.webp`, `count.webp`, `aerial.webp`, `bus.webp`.
- Scene: `render\street.blend` (119 MB). Caches: `render\cache\tex` (2K/1K texture copies), `render\cache\protos\*.blend` (prepared glTF prototypes).
- Scripts: `render\build.py`, `render\render.py`, `render\pipeline.ps1`, `render\prep_textures.py`, `render\prep_proto.py`, `render\street\{common,mats,ground,houses,protos,nature,props,district,vehicles,camera}.py`.
- Stray files in `out\stills` not made by this pipeline: `aerial_real.webp`, `conditions.webp`, `failing.webp`, `never-built.webp`.

## Render times (RTX 5060 Laptop GPU, OptiX)

| image | res | samples | time |
|---|---|---|---|
| missing | 1920x1080 | 192 adaptive (0.02) | 31.5 s |
| broken | 1920x1080 | 192 | 28.8 s |
| falls | 1920x1080 | 192 | 30.3 s |
| precedent | 1920x1080 | 192 | 35.7 s |
| count | 1920x1080 | 192 | 28.5 s |
| aerial | 1920x1080 | 192 | 28.5 s |
| bus | 1920x1080 | 192 | 27.6 s |
| hero video, per frame | 1920x1080 | 96 adaptive (0.03) | 5.92 s (432 frames in 43 min, persistent data on) |

Each still time includes the one-off scene sync of its own Blender session (about 4 s); the video frames share one session. The whole scene builds in about 70 s from the caches.

## What was built

| file | role |
|---|---|
| `build.py` | assembles the scene from `world.json`, saves `street.blend`; `--quick` (24 spp check build), `--test <shots>` (960x540 check frames) |
| `render.py` | `--still <name>` / `--stills all` (PNG master + WebP 1920 and 960 wide via ffmpeg), `--anim` (keys the camera and the northbound sedan per frame, renders 432 frames), `--encode` (mp4/webm/posters), `--hero-frame t` |
| `pipeline.ps1` | detached end-to-end run (build, stills, anim, encode), one log per stage in `out\logs` |
| `prep_textures.py`, `prep_proto.py` | child-process cache builders (host-RAM guard, see Compromises) |
| `street\common.py` | world data, three.js to Blender coordinates, mulberry32 RNG, mesh helpers (existing; bus-stop constants + font loader added) |
| `street\mats.py` | material library from the asset manifest: Poly Haven scans at their real tile size (`dimensions_m`), `normal_gl` handled, AO/displacement opt-in, per-object weathering tints, metre-scale lawn patchiness; downscaled texture cache |
| `street\ground.py` | terrain, lawn corridor + Cycles hair grass, road with boolean potholes, curbs, paint, slab-by-slab sidewalk with V-groove cracks, the split/lifted hero panel over a pushed-up soil mound, desire lines (existing; hair-length bug fixed: `normal_factor` aliases `hair_length`, so setting it made 4 m grass; concrete lightened to sidewalk albedo) |
| `street\houses.py` | seeded houses (existing; roof tints lifted) |
| `street\protos.py` | glTF prototypes prepared once each in a child Blender (import, leaf alpha PNG wired into Principled Alpha, parts joined, origin at ground contact, 1K textures) and appended from cache; linked-mesh instancing |
| `street\nature.py` | yard trees per lot, planting-strip street trees (clear of driveways, intersections, hydrants, the bus stop and every story beat), grove behind block A, park inside the L, weed tufts, THE hero oak (island_tree_01 at 10.5 m, 3.1 m left of the walk at beats.falls) with a bezier root fan and heave mound under the two lifted slabs |
| `street\props.py` | mailboxes (door to the street), MUTCD R1-1 stop signs on poles at I1, cobra streetlights, wooden utility poles with transformers and sagging lines, aged hydrants at .115/.52/.87, benches, Type III barricades with striped rails at the gap ends, the orange ADA spray ring and the asphalt patch ray-cast onto the slabs (they follow lips and tilts), the green verified-fixed pin, the CapMetro stop (pole, sign "CapMetro / 383 / BUS STOP", trash can, worn dirt, lawn hair zeroed around it), the dropped wooden cane on the root-heaved slab, downtown cones and steel plates, curb ramps, manhole covers, a utility cabinet |
| `street\district.py` | downtown backdrop: commercial blocks with a procedural window-grid shader flanking the downtown leg (east row low and set back, single-storey frontage south of the precedent/count beats), a few towers |
| `street\vehicles.py` | site car models oriented by PCA of their vertices (the bus is baked at 45 deg, so bounding boxes lie), real lengths, grounded, nose at -Y at yaw 0, flip table `bus: pi, cybertruck: pi` confirmed by a lineup render; driveway cars, the pickup nosed across the walk before beats.broken, light traffic; the CapMetro bus (white body, #1c5fb0 cap, thin red stripe, "CapMetro" decal both sides, amber "383 RESEARCH" destination sign) stopped on the walk's lane with its door at the pole |
| `street\camera.py` | site shot keys to perspective camera (VFOV 40, distance = view / (2 tan 20), rig shifted to the camera's right by 0.18 x view x aspect); hero push: focus/el/az/log-view eased with smoothstep from 55 m up / el 50 looking down the street to the PANEL key (el 20, view 8, focus 1.1 m ahead, 0.1 m left), 16 s move + 2 s hold, no motion blur |

Lighting: `qwantani_morning_puresky_4k.hdr` (sun 20.2 deg up, measured from its brightest pixel) rotated so the sun sits at compass 202 deg (SSW). WSW, as first specified, put the whole west-side sidewalk in the shadow of its own houses at that elevation; SSW keeps the walk lit and still reads as warm late afternoon. AgX, medium-contrast look, exposure 0. Cycles: OptiX GPU, OptiX denoise, light tree, 6 bounces, GPU texture limit 2048, about 3M hair strands (300k parents x 10 children, 7.5 cm, 5 mm root).

## Verification pass (what I looked at)

missing, broken, falls, bus, precedent, count at full size (aerial at check-build size); video frames 1, 200, 330 and the final hold (432). Geometry, shadows, vehicle facing, livery, the bus stop, the split/lifted/cracked panel, the root heave with the cane, the barricades and desire line all read correctly; no tracebacks in any stage log.

## Remaining defects and what I would fix (not re-rendered, per instruction)

1. `count.webp`: a skyline tower placed at (108, 44) throws its long SSW-sun shadow across the count beat, so the fresh panel and pin sit in shade. Fix: in `district.py` move that tower to (104, -96) (north of both beats; shadows run NNE), then `pipeline.ps1 build stills_downtown` (about 2 min).
2. `precedent.webp` / `count.webp`: the downtown paving is the brushed_concrete_03 scan, which reads as bare dirt at 30 m scale. Fix: give `downtown_paving` the gravel_concrete_03 material with a light tint and scored joints, and limit paving to a 6 m band with lawn/planting beyond.
3. Lawn tiling is faintly visible from altitude (2 m scan tile) in `aerial.webp` and the first video frames. Fix: blend a second 9 m tile of the same scan into `sq_grass`, or drive the macro noise harder.
4. The bus front is low-poly (model limitation) and the downtown strip trees are small; a second scan tree (tree_small_02) would help if RAM allows.
5. The site's keys keep the defects small in frame (the split panel is about 15 percent of frame height at view 8 m); a view of 5-6 m would make broken/falls read stronger if the site ever loosens the keys.

## Compromises

- Trees are Poly Haven photoscans (island_tree_01/02) instanced with linked meshes, not Sapling: a scripted Sapling trial (`tree_add` after `importdata`) had the preset override every parameter and produced a 17 m leafless tree, and the coordinator asked for the scans. tree_small_02, island_tree_03 (2.1M tris each, the latter with a rock base) and searsia_burchellii were dropped for host RAM, so there are two oak variants plus one shrub.
- Host RAM, not the GPU, was the binding limit (16 GB, about 5 GB free): builds were killed three times until every glTF prototype was prepared in its own child process and every 4K texture replaced by a cached 2K/1K copy; the main build peaks about 1.4 GB, rendering about 5.4 GB. Blender is launched detached (`Start-Process`) so the task guard cannot kill a long render.
- The bus shot is an explicit eye-level view from the desire line (the site-style rig landed inside a yard tree); streetlights within 20 m of the stop are skipped.
- Downtown buildings are procedural boxes with a window-grid shader; scooters are not modelled; shingles use Poly Haven's grey roof tiles (no CC0 shingle scan exists).
- `Add-Content` to `out\logs\pipeline.txt` is unreliable while the file is tailed; the per-stage logs are the source of truth.

## Attributions used (CC-BY items must be credited on the site)

- Montreal Bus by Nick Ladd, CC BY 3.0, https://poly.pizza/m/fFCCghvRImG
- Mitsubishi L200 (pickup) by Muhammad Reyhan, CC BY 3.0, https://poly.pizza/m/4qjS9tFhsJg
- Terrano (suv-large) by Muhammad Reyhan, CC BY 3.0, https://poly.pizza/m/fWGNi96ckzn
- Cybertruck by Mobolaji, CC BY 3.0, https://poly.pizza/m/Jpar3f32mt
- CC0, no credit required: Quaternius sedan/SUV/cone, CreativeTrio mailbox, Poly Haven scans (gravel_concrete_03, brushed_concrete_03, concrete_floor_worn_02, asphalt_02/04, withered_grass, sparse_grass, brown_mud_dry, dry_ground_rocks, grey_roof_01, brick_wall_09, brown_brick_02, white_stucco, beige_wall_001, jolcham_oak_bark_01, painted_metal_shutter), HDRI qwantani_morning_puresky (Jarod Guest), models island_tree_01/02, searsia_lucida, grass_medium_01, grass_bermuda_01, fire_hydrant, modular_street_seating, modular_electricity_poles, metal_trash_can, utility_box_02, water_manhole_cover; ambientCG WoodChips003. The MUTCD R1-1 face is US public domain.

## How to re-run

- Everything: `powershell -File render\pipeline.ps1` (stages: build, stills, stills_downtown, anim, encode; pass stage names to run a subset).
- One still: `blender -b render\street.blend --python render\render.py -- --still broken --samples 192`.
