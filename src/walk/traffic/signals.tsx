/**
 * Signalized intersections: mast-arm poles with three-lamp heads on every
 * approach, cycling green → amber → all-red → cross green. The phase table
 * lives at module level so cars can read it without React in the loop.
 */
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { GeoBatch, trs } from "../world/util";
import { worldLib } from "../world/materials";
import { INTERSECTIONS, STREET, leftOf } from "../world/route";

export type Phase = "G" | "A" | "R";
/** live phase per signalized intersection, main-street approach vs cross */
export const signalPhases: Record<string, { main: Phase; cross: Phase }> = {
  i2: { main: "G", cross: "R" },
  i3: { main: "R", cross: "G" },
};

const CYCLE = { green: 8.5, amber: 2.4, allRed: 1.1 };
const PERIOD = (CYCLE.green + CYCLE.amber + CYCLE.allRed) * 2;
const OFFSETS: Record<string, number> = { i2: 0, i3: PERIOD * 0.42 };

function phaseAt(t: number): { main: Phase; cross: Phase } {
  const u = ((t % PERIOD) + PERIOD) % PERIOD;
  const g = CYCLE.green;
  const a = CYCLE.amber;
  const r = CYCLE.allRed;
  if (u < g) return { main: "G", cross: "R" };
  if (u < g + a) return { main: "A", cross: "R" };
  if (u < g + a + r) return { main: "R", cross: "R" };
  if (u < g + a + r + g) return { main: "R", cross: "G" };
  if (u < g + a + r + g + a) return { main: "R", cross: "A" };
  return { main: "R", cross: "R" };
}

type Head = { kind: "main" | "cross"; inter: string; lamps: (THREE.Mesh | null)[] };

export function Signals() {
  const lib = worldLib();
  const heads = useRef<Head[]>([]);

  const { static: staticGeo, lampMats, headNodes } = useMemo(() => {
    const metal = new GeoBatch();
    const box = new GeoBatch();
    const on = (c: string, e: string) =>
      new THREE.MeshStandardMaterial({ color: c, emissive: e, emissiveIntensity: 1.8, roughness: 0.4 });
    const off = (c: string) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5 });
    const lampMats = {
      rOn: on("#d43a2f", "#ff2f1f"),
      rOff: off("#4a1d19"),
      aOn: on("#e2a63b", "#ffb320"),
      aOff: off("#4d3a17"),
      gOn: on("#3fae5c", "#19e05a"),
      gOff: off("#17402a"),
    };

    const headNodes: { pos: THREE.Vector3; yaw: number; kind: "main" | "cross"; inter: string }[] = [];
    for (const inter of INTERSECTIONS) {
      if (!inter.signal) continue;
      const pm = STREET.frame(inter.mainS);
      const n = leftOf(pm.tx, pm.tz);
      const t = { x: pm.tx, z: pm.tz };
      // one mast per approach: pole on the near-right corner, arm over the lane
      const arms: { px: number; pz: number; ax: number; az: number; yaw: number; kind: "main" | "cross" }[] = [];
      for (const sgn of [1, -1] as const) {
        // main approaches (facing oncoming main traffic)
        arms.push({
          px: inter.at.x + t.x * sgn * 8.2 - n.x * sgn * 7.2,
          pz: inter.at.z + t.z * sgn * 8.2 - n.z * sgn * 7.2,
          ax: n.x * sgn,
          az: n.z * sgn,
          yaw: Math.atan2(t.x * sgn, t.z * sgn) + Math.PI,
          kind: "main",
        });
        // cross approaches
        arms.push({
          px: inter.at.x + n.x * sgn * 8.2 + t.x * sgn * 7.2,
          pz: inter.at.z + n.z * sgn * 8.2 + t.z * sgn * 7.2,
          ax: -t.x * sgn,
          az: -t.z * sgn,
          yaw: Math.atan2(n.x * sgn, n.z * sgn) + Math.PI,
          kind: "cross",
        });
      }
      for (const a of arms) {
        const pole = new THREE.CylinderGeometry(0.11, 0.15, 5.6, 8);
        metal.add(pole, trs(a.px, 2.8, a.pz));
        pole.dispose();
        const armLen = 5.2;
        const arm = new THREE.CylinderGeometry(0.07, 0.09, armLen, 6);
        arm.rotateX(Math.PI / 2);
        metal.add(arm, trs(a.px + a.ax * (armLen / 2), 5.35, a.pz + a.az * (armLen / 2), Math.atan2(a.ax, a.az)));
        arm.dispose();
        const housing = new THREE.BoxGeometry(0.42, 1.15, 0.3);
        box.add(housing, trs(a.px + a.ax * (armLen - 0.4), 4.72, a.pz + a.az * (armLen - 0.4), a.yaw));
        housing.dispose();
        headNodes.push({ pos: new THREE.Vector3(a.px + a.ax * (armLen - 0.4), 4.72, a.pz + a.az * (armLen - 0.4)), yaw: a.yaw, kind: a.kind, inter: inter.id });
      }
    }
    return { static: { metal: metal.build(), box: box.build() }, lampMats, headNodes };
  }, []);

  const lampGeo = useMemo(() => {
    const g = new THREE.CylinderGeometry(0.13, 0.13, 0.07, 10);
    g.rotateX(Math.PI / 2);
    return g;
  }, []);

  // one Head record per rendered head, filled by lamp refs
  if (heads.current.length !== headNodes.length) {
    heads.current = headNodes.map((hn) => ({ kind: hn.kind, inter: hn.inter, lamps: [null, null, null] }));
  }

  useFrame(({ clock }) => {
    for (const id of Object.keys(signalPhases)) {
      signalPhases[id] = phaseAt(clock.elapsedTime + OFFSETS[id]);
    }
    const m = lampMats;
    for (const h of heads.current) {
      const p = signalPhases[h.inter]?.[h.kind] ?? "R";
      if (h.lamps[0]) h.lamps[0].material = p === "R" ? m.rOn : m.rOff;
      if (h.lamps[1]) h.lamps[1].material = p === "A" ? m.aOn : m.aOff;
      if (h.lamps[2]) h.lamps[2].material = p === "G" ? m.gOn : m.gOff;
    }
  });

  return (
    <group>
      {staticGeo.metal && <mesh geometry={staticGeo.metal} material={lib.mats.metal} castShadow />}
      {staticGeo.box && <mesh geometry={staticGeo.box} material={lib.mats.signalBox} castShadow />}
      {headNodes.map((hn, i) => (
        <group key={i} position={hn.pos} rotation={[0, hn.yaw, 0]}>
          {[0.38, 0, -0.38].map((dy, li) => (
            <mesh
              key={li}
              geometry={lampGeo}
              material={lampMats.rOff}
              position={[0, dy, 0.19]}
              ref={(mesh) => {
                heads.current[i].lamps[li] = mesh;
              }}
            />
          ))}
        </group>
      ))}
    </group>
  );
}
