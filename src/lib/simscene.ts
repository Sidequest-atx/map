/**
 * Procedural sidewalk frames for the simulated Quest Drive (desktop demo /
 * camera denied). Draws a concrete panel with optional defects so the mock
 * classifier, which reads real pixel statistics, produces varied labels.
 */
export type SimDefect = "none" | "crack" | "lifted" | "vegetation" | "debris";

let seed = 17;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

export function pickDefect(i: number): SimDefect {
  const r = (i * 7919) % 10;
  if (r < 3) return "none";
  if (r < 5) return "crack";
  if (r < 7) return "vegetation";
  if (r < 9) return "lifted";
  return "debris";
}

export function drawSimFrame(canvas: HTMLCanvasElement, defect: SimDefect, t: number) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  // sky + far ground
  ctx.fillStyle = "#cfd6d8";
  ctx.fillRect(0, 0, W, H * 0.35);
  ctx.fillStyle = "#8d9b6a";
  ctx.fillRect(0, H * 0.35, W, H * 0.15);
  // concrete
  const g = ctx.createLinearGradient(0, H * 0.5, 0, H);
  g.addColorStop(0, "#b9b4a6");
  g.addColorStop(1, "#d6d1c3");
  ctx.fillStyle = g;
  ctx.fillRect(0, H * 0.5, W, H * 0.5);
  // panel joints, scrolling with t
  ctx.strokeStyle = "#aaa597";
  ctx.lineWidth = 2;
  const off = (t * 120) % (H * 0.18);
  for (let y = H * 0.5 + off; y < H; y += H * 0.18) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  // curb
  ctx.fillStyle = "#9a9486";
  ctx.fillRect(W * 0.82, H * 0.5, W * 0.18, H * 0.5);
  // speckle
  for (let i = 0; i < 220; i++) {
    ctx.fillStyle = `rgba(60,55,45,${0.06 + rnd() * 0.08})`;
    ctx.fillRect(rnd() * W, H * 0.5 + rnd() * H * 0.5, 2, 2);
  }
  switch (defect) {
    case "crack": {
      ctx.strokeStyle = "#2d2a24";
      ctx.lineWidth = 4;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        let x = W * (0.15 + rnd() * 0.5);
        let y = H * (0.55 + rnd() * 0.1);
        ctx.moveTo(x, y);
        for (let s = 0; s < 12; s++) {
          x += (rnd() - 0.5) * W * 0.12;
          y += H * 0.035;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    }
    case "lifted": {
      const y = H * 0.7;
      ctx.fillStyle = "#c9c4b6";
      ctx.fillRect(0, y, W * 0.82, H * 0.3);
      ctx.fillStyle = "#1f1d19";
      ctx.fillRect(0, y - 14, W * 0.82, 18);
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(0, y + 4, W * 0.82, 10);
      break;
    }
    case "vegetation": {
      for (let k = 0; k < 70; k++) {
        const x = W * (0.55 + rnd() * 0.5);
        const y = H * (0.45 + rnd() * 0.5);
        const r = 18 + rnd() * 34;
        ctx.fillStyle = `rgb(${40 + rnd() * 40}, ${110 + rnd() * 70}, ${40 + rnd() * 40})`;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case "debris": {
      ctx.fillStyle = "#2a2622";
      ctx.beginPath();
      ctx.ellipse(W * 0.45, H * 0.78, W * 0.28, H * 0.12, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3d3a35";
      ctx.fillRect(W * 0.25, H * 0.6, W * 0.3, H * 0.1);
      break;
    }
    default:
      break;
  }
}
