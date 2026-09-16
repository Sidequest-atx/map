/**
 * Copies the finished renders into public/media under the names the site
 * expects (src/lib/media.ts). Safe to re-run; only overwrites what exists in
 * render/out. Run: node render/publish_media.mjs
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
const dest = join(here, "..", "public", "media");
mkdirSync(dest, { recursive: true });

const MAP = [
  ["hero/hero_1080.mp4", "hero.mp4"],
  ["hero/hero_1080.webm", "hero.webm"],
  ["hero/hero_poster.webp", "hero-poster.webp"],
  ["stills/aerial.webp", "aerial.webp"],
  ["stills/missing.webp", "missing.webp"],
  ["stills/broken.webp", "broken.webp"],
  ["stills/falls.webp", "falls.webp"],
  ["stills/precedent.webp", "precedent.webp"],
  ["stills/count.webp", "count.webp"],
  ["stills/bus.webp", "bus.webp"],
];

let n = 0;
for (const [from, to] of MAP) {
  const src = join(out, from);
  if (!existsSync(src)) {
    console.log("skip (not rendered yet):", from);
    continue;
  }
  copyFileSync(src, join(dest, to));
  console.log("published", to, (statSync(src).size / 1024).toFixed(0) + " KB");
  n++;
}
console.log(n, "files in public/media");
