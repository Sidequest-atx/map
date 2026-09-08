/**
 * The subdivision plat. Straight block faces, uniform setbacks, houses
 * square to their street — alignment comes from here, not from eyeballing.
 * Everything that lives on a parcel (house, driveway, walkway, mailbox,
 * yard trees, parked cars) reads from this one table.
 */
import { BARTON_AT, DOWNTOWN_Z, INTERSECTIONS, STREET, STREET_W, CURB_W, WALK_OFF, type P } from "./route";
import { rng } from "./rng";

export type Lot = {
  id: string;
  /** house footprint center */
  cx: number;
  cz: number;
  /** yaw the house front faces (radians, 0 = +z south, standard three Y-yaw) */
  yaw: number;
  seed: number;
  /** on the sidewalk side of the main street */
  near: boolean;
  back: boolean;
  block: "A" | "B" | "C";
  station: number;
  drive?: { a: P; b: P };
  walkway?: { a: P; b: P };
  mailbox?: { x: number; z: number; yaw: number };
  hero?: "falls";
};

const SETBACK = 15; // street centerline → house front face (≈7 m of yard past the walk)
const BACK_OFF = 40; // street centerline → back-row house center
const PITCH = 15.5;
const HOUSE_HALF = 4.6; // rough half-depth, for centering behind the front face

const nearInt = (x: number, z: number, r: number) => INTERSECTIONS.some((i) => Math.hypot(i.at.x - x, i.at.z - z) < r);
const nearBarton = (x: number, z: number) => Math.hypot(BARTON_AT.x - x, BARTON_AT.z - z) < 46;

/** yaw so a house at offset side faces the street. For a NS street (along z),
    a house west of it faces east: front normal +x → yaw = -PI/2 ... we define
    house geometry with its front on +z, so yaw rotates +z to the facing dir. */
const yawToward = (dirX: number, dirZ: number) => Math.atan2(dirX, dirZ);

function laneEdge() {
  return STREET_W / 2 + CURB_W;
}

export function planLots(): Lot[] {
  const out: Lot[] = [];
  const r = rng(4242);
  let n = 0;

  type Face = {
    block: "A" | "B" | "C";
    axis: "ns" | "ew";
    fixed: number; // street centerline coordinate on the other axis
    from: number;
    to: number;
    side: 1 | -1; // +1 = house at fixed + offset*side
    near: boolean;
    back: boolean;
  };

  /* Every face fronts a real street: the three legs of the main street, and
     the residential cross streets — no house floats roadless in a field. */
  const faces: Face[] = [
    // Block A: street x=0, z 430..194. West (near, sidewalk) + east (far).
    { block: "A", axis: "ns", fixed: 0, from: 424, to: 204, side: -1, near: true, back: false },
    { block: "A", axis: "ns", fixed: 0, from: 424, to: 204, side: 1, near: false, back: false },
    // Block B: street z=180, x 20..132. North (near) + south (far).
    { block: "B", axis: "ew", fixed: 180, from: 22, to: 130, side: -1, near: true, back: false },
    { block: "B", axis: "ew", fixed: 180, from: 22, to: 130, side: 1, near: false, back: false },
    // Block C suburban stretch: street x=150, z 166..DOWNTOWN_Z. Both sides.
    { block: "C", axis: "ns", fixed: 150, from: 160, to: DOWNTOWN_Z + 6, side: -1, near: true, back: false },
    { block: "C", axis: "ns", fixed: 150, from: 160, to: DOWNTOWN_Z + 6, side: 1, near: false, back: false },
    // The 4-way's cross street (z=310): both arms, both sides, clear of the
    // main street's own lot rows (which reach |x| ≈ 26).
    { block: "A", axis: "ew", fixed: 310, from: -78, to: -36, side: -1, near: false, back: false },
    { block: "A", axis: "ew", fixed: 310, from: -78, to: -36, side: 1, near: false, back: false },
    { block: "A", axis: "ew", fixed: 310, from: 36, to: 78, side: -1, near: false, back: false },
    { block: "A", axis: "ew", fixed: 310, from: 36, to: 78, side: 1, near: false, back: false },
    // The first signalized cross street (z=120), west arm only (east is downtown's edge).
    { block: "C", axis: "ew", fixed: 120, from: 66, to: 108, side: -1, near: false, back: false },
    { block: "C", axis: "ew", fixed: 120, from: 66, to: 108, side: 1, near: false, back: false },
  ];

  const fallsZ = 157; // hero lot: the oak whose roots heave the walk (block C west)

  for (const face of faces) {
    const span = Math.abs(face.to - face.from);
    const count = Math.floor(span / PITCH);
    const dir = Math.sign(face.to - face.from);
    for (let i = 0; i < count; i++) {
      const along = face.from + dir * (PITCH * (i + 0.5) + (r() - 0.5) * 1.2);
      const offset = face.back ? BACK_OFF + r() * 3 : SETBACK + HOUSE_HALF;
      let cx: number;
      let cz: number;
      let yaw: number;
      if (face.axis === "ns") {
        cx = face.fixed + face.side * offset;
        cz = along;
        yaw = yawToward(-face.side, 0); // face back toward the street
      } else {
        cx = along;
        cz = face.fixed + face.side * offset;
        yaw = yawToward(0, -face.side);
      }
      if (nearInt(cx, cz, face.back ? 16 : 13)) continue;
      if (nearBarton(cx, cz)) continue;
      // keep the two corner areas clear so the turns read
      if (Math.hypot(cx - 0, cz - 180) < 26 || Math.hypot(cx - 150, cz - 180) < 26) continue;

      const seed = 1000 + n * 17;
      const hero = face.block === "C" && face.near && !face.back && Math.abs(cz - fallsZ) < PITCH / 2 ? ("falls" as const) : undefined;
      const lot: Lot = {
        id: `lot${n}`,
        cx,
        cz,
        yaw,
        seed,
        near: face.near && !face.back,
        back: face.back,
        block: face.block,
        station: STREET.closestS({ x: cx, z: cz }),
        hero,
      };

      if (!face.back) {
        const rr = rng(seed + 5);
        const edge = laneEdge();
        if (face.axis === "ns") {
          const sx = face.fixed + face.side * edge;
          const hx = face.fixed + face.side * (SETBACK - 0.4);
          // walkway to the front door for every fronting house
          lot.walkway = { a: { x: face.near ? face.fixed + face.side * (WALK_OFF - 0.6) : sx, z: cz }, b: { x: hx, z: cz } };
          if (rr() < (face.near ? 0.55 : 0.75)) {
            const dz = cz + dir * (PITCH * 0.31);
            lot.drive = { a: { x: sx, z: dz }, b: { x: face.fixed + face.side * (SETBACK + 6.5), z: dz } };
          }
          if (face.near && face.block !== "B") {
            lot.mailbox = { x: face.fixed + face.side * (WALK_OFF + 1.4), z: cz + dir * 2.2, yaw: yawToward(-face.side, 0) };
          }
        } else {
          const sz = face.fixed + face.side * edge;
          const hz = face.fixed + face.side * (SETBACK - 0.4);
          lot.walkway = { a: { x: cx, z: face.near ? face.fixed + face.side * (WALK_OFF - 0.6) : sz }, b: { x: cx, z: hz } };
          if (rr() < 0.55) {
            const dx = cx + dir * (PITCH * 0.31);
            lot.drive = { a: { x: dx, z: sz }, b: { x: dx, z: face.fixed + face.side * (SETBACK + 6.5) } };
          }
        }
      }
      out.push(lot);
      n++;
    }
  }

  /* the cul-de-sac at the very start of the walk: three houses around the bulb */
  const BULB = { x: 0, z: 452 };
  const bulbSpots: [number, number][] = [
    [0, 19.5],
    [-16.5, 12],
    [16.5, 12],
  ];
  for (const [dx, dz] of bulbSpots) {
    const cx = BULB.x + dx;
    const cz = BULB.z + dz;
    const len = Math.hypot(dx, dz) || 1;
    const fx = -dx / len;
    const fz = -dz / len;
    const lot: Lot = {
      id: `cul${n}`,
      cx,
      cz,
      yaw: yawToward(fx, fz),
      seed: 1000 + n * 17,
      near: false,
      back: false,
      block: "A",
      station: 0,
      drive: {
        a: { x: BULB.x + (dx / len) * 11.3, z: BULB.z + (dz / len) * 11.3 },
        b: { x: BULB.x + (dx / len) * (len - 4), z: BULB.z + (dz / len) * (len - 4) },
      },
    };
    out.push(lot);
    n++;
  }
  return out;
}

let cached: Lot[] | null = null;
export function lots(): Lot[] {
  if (!cached) cached = planLots();
  return cached;
}
