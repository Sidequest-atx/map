/**
 * Every texture in the scene is painted here on canvas at runtime — asphalt,
 * concrete, lawns, the crack atlas, downtown facades, Capitol granite — so
 * the "realistic" surface read costs zero network weight. Materials are
 * shared singletons; the lighting rig animates the emissive ones.
 */
import * as THREE from "three";
import { rng } from "./rng";

function makeTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, opts?: { repeat?: boolean }) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (opts?.repeat !== false) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
  }
  t.anisotropy = 4;
  return t;
}

/** Offsets that make edge marks wrap, so the texture tiles seamlessly. */
const WRAP: [number, number][] = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
];

function speckle(
  ctx: CanvasRenderingContext2D,
  r: () => number,
  count: number,
  colors: string[],
  minR: number,
  maxR: number,
  alpha = 1,
) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    ctx.globalAlpha = alpha * (0.35 + r() * 0.65);
    const rad = minR + r() * (maxR - minR);
    const x = r() * w;
    const y = r() * h;
    const wrap = x < maxR * 2 || y < maxR * 2 || x > w - maxR * 2 || y > h - maxR * 2 ? WRAP : WRAP.slice(0, 1);
    for (const [ox, oy] of wrap) {
      ctx.beginPath();
      ctx.arc(x + ox * w, y + oy * h, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function blotches(ctx: CanvasRenderingContext2D, r: () => number, count: number, colors: string[], minR: number, maxR: number, alpha: number) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  for (let i = 0; i < count; i++) {
    const rad = minR + r() * (maxR - minR);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    const col = colors[Math.floor(r() * colors.length)];
    g.addColorStop(0, col);
    g.addColorStop(1, "rgba(0,0,0,0)");
    const x = r() * w;
    const y = r() * h;
    const a = alpha * (0.4 + r() * 0.6);
    for (const [ox, oy] of WRAP) {
      ctx.save();
      ctx.translate(x + ox * w, y + oy * h);
      ctx.globalAlpha = a;
      ctx.fillStyle = g;
      ctx.fillRect(-rad, -rad, rad * 2, rad * 2);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
}

/* ---------- surface textures ---------- */

function asphaltTex() {
  return makeTex(512, 512, (ctx) => {
    const r = rng(101);
    ctx.fillStyle = "#33342f";
    ctx.fillRect(0, 0, 512, 512);
    blotches(ctx, r, 26, ["#2c2d29", "#3a3b35"], 40, 130, 0.5);
    speckle(ctx, r, 5200, ["#43443d", "#292a26", "#4c4c44", "#383931"], 0.5, 1.6);
    speckle(ctx, r, 350, ["#55564d", "#23241f"], 1.2, 2.4, 0.7);
  });
}

function concreteTex() {
  return makeTex(512, 512, (ctx) => {
    const r = rng(202);
    ctx.fillStyle = "#c9c2b2";
    ctx.fillRect(0, 0, 512, 512);
    blotches(ctx, r, 22, ["#bfb7a5", "#d2ccbc", "#b7ae9a"], 50, 150, 0.5);
    speckle(ctx, r, 4200, ["#b3ab99", "#d6d0c1", "#a89f8c", "#ddd7c9"], 0.4, 1.3);
    // faint trowel drag
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = "#8f8775";
    for (let i = 0; i < 22; i++) {
      ctx.beginPath();
      const y = r() * 512;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(170, y + (r() - 0.5) * 22, 340, y + (r() - 0.5) * 22, 512, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

function grassTex() {
  // Austin lawn in late summer, graded toward the site's olive: warm,
  // slightly dried, never golf-course green.
  return makeTex(512, 512, (ctx) => {
    const r = rng(303);
    ctx.fillStyle = "#6f7a44";
    ctx.fillRect(0, 0, 512, 512);
    blotches(ctx, r, 34, ["#5f6b3a", "#7d8a4d", "#57633a", "#868c52"], 40, 140, 0.55);
    // dry patches
    blotches(ctx, r, 14, ["#9c945e", "#a89e66", "#8f8a58"], 24, 78, 0.45);
    speckle(ctx, r, 2600, ["#525f34", "#7c8a4c", "#66743f", "#918f56"], 0.5, 1.5, 0.8);
  });
}

function dirtTex() {
  return makeTex(256, 256, (ctx) => {
    const r = rng(404);
    ctx.fillStyle = "#8a744f";
    ctx.fillRect(0, 0, 256, 256);
    blotches(ctx, r, 16, ["#7c6845", "#97815a", "#6f5d3e"], 24, 80, 0.55);
    speckle(ctx, r, 1400, ["#6a583a", "#a08a62", "#5c4c32"], 0.4, 1.4);
  });
}

function graniteTex() {
  return makeTex(256, 256, (ctx) => {
    const r = rng(505);
    ctx.fillStyle = "#b98a7a";
    ctx.fillRect(0, 0, 256, 256);
    blotches(ctx, r, 14, ["#af7f6f", "#c29585", "#a67667"], 30, 90, 0.5);
    speckle(ctx, r, 3000, ["#96685a", "#d0a898", "#88594c", "#c8988a"], 0.3, 1.1);
  });
}

function radialGlowTex() {
  return makeTex(
    128,
    128,
    (ctx) => {
      const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
      g.addColorStop(0, "rgba(255,214,150,0.85)");
      g.addColorStop(0.5, "rgba(255,205,130,0.28)");
      g.addColorStop(1, "rgba(255,200,120,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 128, 128);
    },
    { repeat: false },
  );
}

function waterTex() {
  return makeTex(256, 256, (ctx) => {
    const r = rng(606);
    ctx.fillStyle = "#3f8577";
    ctx.fillRect(0, 0, 256, 256);
    blotches(ctx, r, 12, ["#377768", "#4a9384", "#57a08f"], 40, 110, 0.5);
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = "#bfe6da";
    ctx.lineWidth = 1.1;
    for (let i = 0; i < 46; i++) {
      const y = r() * 256;
      const x = r() * 256;
      const len = 12 + r() * 40;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + len * 0.3, y - 2 - r() * 3, x + len * 0.7, y + 2 + r() * 3, x + len, y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });
}

/* ---------- the crack atlas: 12 unique cracks + 4 potholes, 4×4 cells ---------- */

export const ATLAS_N = 4;

function drawCrack(ctx: CanvasRenderingContext2D, r: () => number, cx: number, cy: number, cell: number) {
  const span = cell * (0.6 + r() * 0.25);
  const steps = 18 + Math.floor(r() * 10);
  let x = cx - span / 2;
  let y = cy + (r() - 0.5) * cell * 0.3;
  let a = (r() - 0.5) * 0.5;
  const pts: [number, number][] = [[x, y]];
  for (let i = 0; i < steps; i++) {
    if (r() < 0.14) a += (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.7);
    else a += (r() - 0.5) * 0.55;
    a = Math.max(-1.1, Math.min(1.1, a));
    const l = (span / steps) * (0.7 + r() * 0.7);
    x += Math.cos(a) * l;
    y += Math.sin(a) * l;
    y = Math.max(cy - cell * 0.42, Math.min(cy + cell * 0.42, y));
    pts.push([x, y]);
    // hairline branch
    if (r() < 0.16) {
      let bx = x;
      let by = y;
      let ba = a + (r() < 0.5 ? 1 : -1) * (0.5 + r() * 0.8);
      ctx.strokeStyle = "rgba(38,34,26,0.7)";
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      for (let j = 0; j < 4 + r() * 4; j++) {
        ba += (r() - 0.5) * 0.6;
        bx += Math.cos(ba) * (3 + r() * 5);
        by += Math.sin(ba) * (3 + r() * 5);
        ctx.lineTo(bx, by);
      }
      ctx.stroke();
    }
  }
  // sunlit lip on the upper-left edge
  ctx.strokeStyle = "rgba(244,238,222,0.75)";
  ctx.lineCap = "round";
  for (let i = 1; i < pts.length; i++) {
    const w = 3.2 * Math.sin((Math.PI * i) / pts.length) + 0.8;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0] - 2.6, pts[i - 1][1] - 3);
    ctx.lineTo(pts[i][0] - 2.6, pts[i][1] - 3);
    ctx.stroke();
  }
  // the gash itself, tapered — drawn bold so it survives the aerial camera
  const wMax = 14 + r() * 9;
  for (let i = 1; i < pts.length; i++) {
    const w = Math.max(1.4, wMax * Math.sin((Math.PI * i) / pts.length) * (0.75 + r() * 0.5));
    ctx.strokeStyle = "rgba(30,27,20,0.95)";
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
    ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    ctx.strokeStyle = "rgba(10,8,5,0.9)";
    ctx.lineWidth = w * 0.45;
    ctx.beginPath();
    ctx.moveTo(pts[i - 1][0], pts[i - 1][1]);
    ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }
  // spalled chips + debris
  for (let k = 0; k < 2 + r() * 3; k++) {
    const [px, py] = pts[Math.floor(r() * pts.length)];
    ctx.fillStyle = "rgba(44,40,30,0.4)";
    ctx.save();
    ctx.translate(px + (r() - 0.5) * 14, py + (r() - 0.5) * 14);
    ctx.rotate(r() * Math.PI);
    ctx.fillRect(-2 - r() * 3, -1.5 - r() * 2, 4 + r() * 6, 3 + r() * 4);
    ctx.restore();
  }
}

function drawPothole(ctx: CanvasRenderingContext2D, r: () => number, cx: number, cy: number, cell: number) {
  const R = cell * (0.24 + r() * 0.1);
  const blob = (scale: number, ox: number, oy: number, fill: string) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    const nV = 11;
    for (let i = 0; i < nV; i++) {
      const th = (i / nV) * Math.PI * 2;
      const rad = R * scale * (0.72 + r() * 0.5);
      const px = cx + ox + Math.cos(th) * rad;
      const py = cy + oy + Math.sin(th) * rad;
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  };
  blob(1.35, 0, 0, "rgba(148,138,116,0.75)"); // spalled ring of exposed base
  blob(1.0, R * 0.1, R * 0.1, "rgba(52,47,38,0.9)");
  blob(0.62, R * 0.22, R * 0.18, "rgba(16,14,10,0.92)");
  // rim highlight toward the light
  ctx.strokeStyle = "rgba(238,230,212,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx - R * 0.15, cy - R * 0.15, R * 0.95, Math.PI * 0.9, Math.PI * 1.7);
  ctx.stroke();
  // loose chunks
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = "rgba(90,82,66,0.8)";
    ctx.save();
    ctx.translate(cx + Math.cos(r() * 6.3) * R * 1.7, cy + Math.sin(r() * 6.3) * R * 1.7);
    ctx.rotate(r() * Math.PI);
    ctx.fillRect(-3, -2.4, 6 + r() * 4, 5 + r() * 3);
    ctx.restore();
  }
}

function crackAtlasTex() {
  const size = 1024;
  const cell = size / ATLAS_N;
  return makeTex(
    size,
    size,
    (ctx) => {
      ctx.clearRect(0, 0, size, size);
      const r = rng(777);
      for (let i = 0; i < ATLAS_N * ATLAS_N; i++) {
        const cx = (i % ATLAS_N) * cell + cell / 2;
        const cy = Math.floor(i / ATLAS_N) * cell + cell / 2;
        if (i < 12) drawCrack(ctx, r, cx, cy, cell * 0.86);
        else drawPothole(ctx, r, cx, cy, cell * 0.86);
      }
    },
    { repeat: false },
  );
}

/* ---------- downtown facades (day albedo + night emissive) ---------- */

export const FACADE_STYLES = 4;

function facadeTex(night: boolean) {
  // 4 styles side by side; each style column is one building face, v = floors.
  const w = 1024;
  const h = 512;
  return makeTex(
    w,
    h,
    (ctx) => {
      const r = rng(night ? 888 : 889);
      const styles = [
        { wall: "#9b8574", win: "#3d4a52", rows: 7, cols: 6, sill: "#b5a08e" },
        { wall: "#77706b", win: "#2f3a41", rows: 8, cols: 8, sill: "#8d867f" },
        { wall: "#b3a58c", win: "#46525a", rows: 6, cols: 5, sill: "#cabb9f" },
        { wall: "#6d6660", win: "#38434b", rows: 9, cols: 7, sill: "#7f7871" },
      ];
      const colW = w / FACADE_STYLES;
      styles.forEach((st, si) => {
        const x0 = si * colW;
        ctx.fillStyle = night ? "#000000" : st.wall;
        ctx.fillRect(x0, 0, colW, h);
        if (!night) {
          const rr = rng(50 + si);
          blotches(ctx, rr, 6, ["rgba(0,0,0,0.12)", "rgba(255,255,255,0.07)"], 30, 90, 1);
        }
        const mx = colW * 0.08;
        const gw = (colW - mx * 2) / st.cols;
        const gh = h / (st.rows + 1);
        for (let row = 0; row < st.rows; row++) {
          for (let col = 0; col < st.cols; col++) {
            const wx = x0 + mx + col * gw + gw * 0.16;
            const wy = gh * 0.55 + row * gh + gh * 0.12;
            const ww = gw * 0.68;
            const wh = gh * 0.62;
            if (night) {
              const lit = r() < 0.42;
              ctx.fillStyle = lit ? `rgba(255,${175 + Math.floor(r() * 50)},${96 + Math.floor(r() * 60)},${0.75 + r() * 0.25})` : "rgba(70,110,150,0.10)";
              ctx.fillRect(wx, wy, ww, wh);
            } else {
              ctx.fillStyle = st.win;
              ctx.fillRect(wx, wy, ww, wh);
              // sky reflection gradient
              const g = ctx.createLinearGradient(0, wy, 0, wy + wh);
              g.addColorStop(0, "rgba(200,215,220,0.55)");
              g.addColorStop(0.5, "rgba(200,215,220,0.08)");
              g.addColorStop(1, "rgba(0,0,0,0.15)");
              ctx.fillStyle = g;
              ctx.fillRect(wx, wy, ww, wh);
              ctx.fillStyle = st.sill;
              ctx.fillRect(wx - gw * 0.05, wy + wh, ww + gw * 0.1, 2.5);
              ctx.fillStyle = "rgba(0,0,0,0.35)";
              ctx.fillRect(wx, wy, ww, 2);
            }
          }
        }
      });
    },
    { repeat: false },
  );
}

/* ---------- glass tower curtain walls (day albedo + night emissive) ---------- */

export const TOWER_STYLES = 3;

function towerTex(night: boolean) {
  // 3 styles side by side: teal glass, blue-gray banded, pale silver.
  const w = 768;
  const h = 512;
  return makeTex(
    w,
    h,
    (ctx) => {
      const r = rng(night ? 991 : 990);
      const styles = [
        { glass: "#4e7d78", mull: "#2e3f3d", band: "#3a5a56", rows: 18, cols: 8 },
        { glass: "#55636e", mull: "#39434b", band: "#71808c", rows: 14, cols: 6 },
        { glass: "#8fa0a3", mull: "#5d686a", band: "#b7c4c4", rows: 16, cols: 10 },
      ];
      const colW = w / TOWER_STYLES;
      styles.forEach((st, si) => {
        const x0 = si * colW;
        ctx.fillStyle = night ? "#000000" : st.mull;
        ctx.fillRect(x0, 0, colW, h);
        const gh = h / st.rows;
        const gw = colW / st.cols;
        for (let row = 0; row < st.rows; row++) {
          for (let col = 0; col < st.cols; col++) {
            const wx = x0 + col * gw + 1.5;
            const wy = row * gh + 1.5;
            if (night) {
              // whole floors lit or dark, with scattered offices
              const floorLit = rng(1000 + si * 40 + row)() < 0.5;
              const lit = floorLit ? r() < 0.8 : r() < 0.1;
              const warm = r() < 0.35;
              ctx.fillStyle = lit
                ? warm
                  ? `rgba(255,${180 + Math.floor(r() * 40)},110,${0.7 + r() * 0.3})`
                  : `rgba(${170 + Math.floor(r() * 40)},${200 + Math.floor(r() * 30)},255,${0.55 + r() * 0.35})`
                : "rgba(60,90,130,0.08)";
              ctx.fillRect(wx, wy, gw - 3, gh - 3);
            } else {
              ctx.fillStyle = st.glass;
              ctx.fillRect(wx, wy, gw - 3, gh - 3);
              // sky gradient down each pane
              const g = ctx.createLinearGradient(0, wy, 0, wy + gh);
              g.addColorStop(0, "rgba(225,235,232,0.6)");
              g.addColorStop(0.55, "rgba(215,228,224,0.12)");
              g.addColorStop(1, "rgba(10,20,20,0.18)");
              ctx.fillStyle = g;
              ctx.fillRect(wx, wy, gw - 3, gh - 3);
              if (r() < 0.12) {
                ctx.fillStyle = "rgba(255,255,255,0.22)"; // stray reflection
                ctx.fillRect(wx, wy, gw - 3, (gh - 3) * 0.45);
              }
            }
          }
          if (!night && row % 4 === 0) {
            ctx.fillStyle = st.band;
            ctx.fillRect(x0, row * gh, colW, 2.2);
          }
        }
      });
    },
    { repeat: false },
  );
}

/* ---------- house window (small, shared) ---------- */

function houseWindowTex(night: boolean) {
  return makeTex(
    64,
    64,
    (ctx) => {
      if (night) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = "rgba(255,190,110,0.95)";
        ctx.fillRect(6, 6, 52, 52);
        ctx.fillStyle = "#000";
        ctx.fillRect(30, 6, 4, 52);
        ctx.fillRect(6, 30, 52, 4);
      } else {
        ctx.fillStyle = "#48555e";
        ctx.fillRect(0, 0, 64, 64);
        const g = ctx.createLinearGradient(0, 0, 0, 64);
        g.addColorStop(0, "rgba(205,220,226,0.7)");
        g.addColorStop(0.55, "rgba(205,220,226,0.1)");
        g.addColorStop(1, "rgba(0,0,0,0.2)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 64);
        ctx.fillStyle = "#ece5d6";
        ctx.fillRect(29, 0, 6, 64);
        ctx.fillRect(0, 29, 64, 6);
      }
    },
    { repeat: false },
  );
}

/* ---------- the library ---------- */

function std(p: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial(p);
}

export function buildWorldLib() {
  const tex = {
    asphalt: asphaltTex(),
    concrete: concreteTex(),
    grass: grassTex(),
    dirt: dirtTex(),
    granite: graniteTex(),
    water: waterTex(),
    crackAtlas: crackAtlasTex(),
    facadeDay: facadeTex(false),
    facadeNight: facadeTex(true),
    towerDay: towerTex(false),
    towerNight: towerTex(true),
    houseWinDay: houseWindowTex(false),
    houseWinNight: houseWindowTex(true),
    radialGlow: radialGlowTex(),
  };
  tex.asphalt.repeat.set(1, 1);
  tex.water.repeat.set(3, 3);

  const mats = {
    asphalt: std({ map: tex.asphalt, roughness: 0.96 }),
    concrete: std({ map: tex.concrete, vertexColors: true, roughness: 0.92 }),
    concretePlain: std({ map: tex.concrete, roughness: 0.92 }),
    paint: std({ color: "#e9e6da", roughness: 0.75 }),
    paintYellow: std({ color: "#d8a63e", roughness: 0.75 }),
    grass: std({ map: tex.grass, vertexColors: true, roughness: 1 }),
    dirt: std({ map: tex.dirt, roughness: 1 }),
    walls: std({ vertexColors: true, roughness: 0.85 }),
    roofs: std({ vertexColors: true, roughness: 0.9 }),
    trim: std({ color: "#f0ebdf", roughness: 0.6 }),
    /** house windows that stay dark at night */
    glassCool: std({ map: tex.houseWinDay, roughness: 0.3, metalness: 0.15 }),
    /** house windows that light up at night (emissive driven by the rig) */
    glassLit: std({
      map: tex.houseWinDay,
      roughness: 0.3,
      metalness: 0.15,
      emissive: "#ffb567",
      emissiveMap: tex.houseWinNight,
      emissiveIntensity: 0,
    }),
    foliage: std({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }),
    trunk: std({ color: "#6d5b46", roughness: 1 }),
    granite: std({ map: tex.granite, roughness: 0.8 }),
    metal: std({ color: "#494e54", metalness: 0.7, roughness: 0.45 }),
    signalBox: std({ color: "#2a3524", roughness: 0.6 }),
    rubber: std({ color: "#232426", roughness: 0.95 }),
    carGlass: std({ color: "#242b31", roughness: 0.12, metalness: 0.55 }),
    water: std({ map: tex.water, color: "#7fd0bd", roughness: 0.15, metalness: 0.05, transparent: true, opacity: 0.93 }),
    cracks: std({
      map: tex.crackAtlas,
      transparent: true,
      depthWrite: false,
      roughness: 0.95,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
    facade: std({ map: tex.facadeDay, emissive: "#ffc27d", emissiveMap: tex.facadeNight, emissiveIntensity: 0 }),
    /** landmark + filler tower curtain walls; night colors baked in the map */
    towerGlass: std({
      map: tex.towerDay,
      roughness: 0.32,
      metalness: 0.3,
      emissive: "#ffffff",
      emissiveMap: tex.towerNight,
      emissiveIntensity: 0,
    }),
    /** steel road plates ("steelboards") thrown over sidewalk work */
    plate: std({ color: "#565a60", metalness: 0.6, roughness: 0.48 }),
    /** streetlight lamp heads; the rig raises emissive at night */
    lamp: std({ color: "#d8d3c4", emissive: "#ffd9a0", emissiveIntensity: 0 }),
    dome: std({ map: tex.granite, color: "#e8d8cd", roughness: 0.65 }),
    /** the verified-fixed map pin */
    pin: std({ color: "#37734d", emissive: "#2e7d4f", emissiveIntensity: 0.35, roughness: 0.5 }),
    /** streetlight pools on the pavement; the rig fades them in at night */
    lampGlow: new THREE.MeshBasicMaterial({
      map: tex.radialGlow,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
    /** inspector's orange spray paint */
    spray: std({ color: "#cd6a2b", roughness: 0.85 }),
  };
  return { tex, mats };
}

export type WorldLib = ReturnType<typeof buildWorldLib>;

let lib: WorldLib | null = null;
export function worldLib(): WorldLib {
  if (!lib) lib = buildWorldLib();
  return lib;
}
