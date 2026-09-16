/**
 * Dumps the walk's world data (plan paths, plat, defects, beats, camera keys)
 * to render/world.json so the Blender build reads the same truth the site uses.
 * Run: npx tsx render/export_world.ts
 */
import { writeFileSync } from "node:fs";
import {
  BARTON_AT, BARTON_BEAT, BEATS, BLOCKS, BRIDGE_CONGRESS, BRIDGE_FIRST, CAPITOL_AT, CURB_H, CURB_W, DISTRICT, DOWNTOWN_Z,
  FROST_CLEAR, GAPS, INTERSECTIONS, LAKE, LANES, LANE_W, LM, SLAB_L, SLAB_W, STREET, STREET_W, STRIP_W, WALK, WALK_OFF,
} from "../src/walk/world/route";
import { BARRICADES, CRACKS, FRESH_RANGE, MILD_HEAVES, MISSING_SLABS, ROOT_HEAVE, STREET_POTHOLES, WALK_POTHOLES } from "../src/walk/world/defects";
import { lots } from "../src/walk/world/lots";

// Camera director keys, copied from src/walk/camera.tsx (KEYS / FLY / RISE).
const K = (f: number, el: number, az: number, view: number, lat = 0, fwd = 6) => ({ f, el, az, view, lat, fwd });
const KEYS = [
  K(0, 36, 38, 48, -2, 8),
  K(BEATS.missing - 0.045, 36, 38, 46),
  K(BEATS.missing, 31, 45, 38, 0, 5),
  K(0.245, 36, 38, 46),
  K(0.302, 30, 33, 19, -0.3, 2.2),
  K(BEATS.broken, 20, 30, 8, -0.1, 1.1),
  K(0.372, 30, 34, 21, -0.2, 2.4),
  K(0.395, 36, 38, 46),
  K(BARTON_BEAT, 30, 50, 86, -34, 4),
  K(0.475, 36, 38, 46),
  K(BEATS.math, 29, 34, 33, 0, 4),
  K(0.555, 29, 36, 32, 0, 4),
  K(0.6, 36, 38, 46),
  K(BEATS.falls, 20, 26, 16, 0.4, 1.6),
  K(0.7, 36, 38, 48),
  K(BEATS.precedent, 26, 32, 29, 0, 3),
  K(0.84, 35, 40, 52),
  K(BEATS.count, 30, 36, 34, 0, 4),
  K(0.945, 33, 46, 62, 4, 10),
  K(1, 34, 54, 78, 7, 16),
];
const F = (u: number, x: number, z: number, el: number, az: number, view: number) => ({ u, x, z, el, az, view });
const FLY = [
  F(0.0, -40, 126, 8, -90, 58),
  F(0.14, 2, 122, 20, -72, 78),
  F(0.3, 58, 114, 40, -38, 112),
  F(0.44, 150, 0, 14, 0, 64),
  F(0.56, 150, -52, 16, 2, 76),
  F(0.7, 44, 40, 86, -16, 148),
  F(0.84, 20, 210, 64, 24, 230),
  F(0.94, 0, 330, 46, 34, 130),
];
const RISE = { el: 86.5, az: 4, view: 250, focus: { x: 148, z: 0 } };

const pts = (p: { pts: { x: number; z: number; tx: number; tz: number; s: number }[]; length: number }) => ({
  length: p.length,
  pts: p.pts.map((q) => [Number(q.x.toFixed(3)), Number(q.z.toFixed(3)), Number(q.tx.toFixed(4)), Number(q.tz.toFixed(4)), Number(q.s.toFixed(3))]),
});

const world = {
  note: "Plan coordinates in meters: x east, z south, y up (three.js). Blender: X=x, Y=-z, Z=y. Path pts = [x, z, tx, tz, s].",
  dims: { LANE_W, STREET_W, CURB_W, CURB_H, STRIP_W, WALK_OFF, SLAB_W, SLAB_L },
  street: pts(STREET),
  walk: pts(WALK),
  lanes: { fwd: pts(LANES.fwd), rev: pts(LANES.rev) },
  intersections: INTERSECTIONS.map((i) => ({ id: i.id, at: i.at, signal: i.signal, mainS: i.mainS, path: pts(i.path), lanes: { fwd: pts(i.lanes.fwd), rev: pts(i.lanes.rev) } })),
  beats: BEATS,
  bartonBeat: BARTON_BEAT,
  gaps: GAPS,
  downtownZ: DOWNTOWN_Z,
  capitolAt: CAPITOL_AT,
  bartonAt: BARTON_AT,
  lake: LAKE,
  bridges: { congress: BRIDGE_CONGRESS, first: BRIDGE_FIRST },
  district: DISTRICT,
  landmarks: LM,
  frostClear: FROST_CLEAR,
  blocks: BLOCKS,
  lots: lots(),
  defects: { cracks: CRACKS, walkPotholes: WALK_POTHOLES, streetPotholes: STREET_POTHOLES, mildHeaves: MILD_HEAVES, rootHeave: ROOT_HEAVE, missingSlabs: MISSING_SLABS, freshRange: FRESH_RANGE, barricades: BARRICADES },
  camera: { keys: KEYS, fly: FLY, rise: RISE, dist: 420 },
};
writeFileSync(new URL("./world.json", import.meta.url), JSON.stringify(world));
console.log("wrote render/world.json", "walk", WALK.length.toFixed(1), "m", "street", STREET.length.toFixed(1), "m", "lots", lots().length, "cracks", CRACKS.length);
