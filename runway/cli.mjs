/**
 * Runway pipeline for the site's video: photo in, site-ready clip out.
 *
 *   node runway/cli.mjs status                 what exists for every shot
 *   node runway/cli.mjs prep [--shot id]       photos -> clean, cropped inputs
 *   node runway/cli.mjs plan [--final]         credits and dollars, no API call
 *   node runway/cli.mjs generate --shot id [--final] [--seed n] --yes
 *   node runway/cli.mjs encode --shot id [--take file]
 *   node runway/cli.mjs publish --shot id      copy into public/media/runway + switch the slot
 *   node runway/cli.mjs unpublish --shot id    switch the slot back
 *
 * Nothing on the site changes until `publish`; src/lib/media.runway.json is
 * the only switch, and an empty object there means the site is as it was.
 * The key is read from RUNWAYML_API_SECRET and never written anywhere.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const DIR = {
  photos: join(here, "photos"),
  prepped: join(here, "work", "prepped"),
  raw: join(here, "work", "raw"),
  site: join(here, "work", "site"),
  social: join(here, "work", "social"),
  pub: join(root, "public", "media", "runway"),
};
const SWITCH = join(root, "src", "lib", "media.runway.json");
const LOG = join(here, "work", "log.json");

const API = "https://api.dev.runwayml.com";
const API_VERSION = "2024-11-06";
/** Credits per second of output; $0.01 per credit. docs.dev.runwayml.com/guides/pricing */
const CREDITS = { gen4_turbo: 5, "gen4.5": 12 };
const RATIOS = ["1280:720", "720:1280", "1104:832", "960:960", "832:1104", "1584:672"];
/** A base64 data URI may be 5 MB; base64 adds a third, so keep the file under this. */
const MAX_INPUT_BYTES = 3_600_000;

const { defaults, shots } = JSON.parse(readFileSync(join(here, "shots.json"), "utf8"));

const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = (name) => argv.includes(`--${name}`);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function pick() {
  const id = opt("shot");
  if (!id) return shots;
  const s = shots.find((x) => x.id === id);
  if (!s) die(`No shot "${id}" in shots.json. Known: ${shots.map((x) => x.id).join(", ")}`);
  return [s];
}

function one() {
  if (!opt("shot")) die("This command needs --shot <id>.");
  return pick()[0];
}

function run(bin, args) {
  const r = spawnSync(bin, args, { encoding: "utf8" });
  if (r.error) die(`${bin} is not available: ${r.error.message}`);
  if (r.status !== 0) die(`${bin} failed:\n${(r.stderr || "").split("\n").slice(-12).join("\n")}`);
  return r.stdout;
}

const duration = (s) => s.duration ?? defaults.duration;
const model = (final) => (final ? defaults.finalModel : defaults.draftModel);
const kb = (p) => (statSync(p).size / 1024).toFixed(0) + " KB";
const takes = (id) =>
  existsSync(DIR.raw)
    ? readdirSync(DIR.raw)
        .filter((f) => f.startsWith(id + ".") && f.endsWith(".mp4"))
        .map((f) => join(DIR.raw, f))
        .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
    : [];
const readSwitch = () => JSON.parse(readFileSync(SWITCH, "utf8"));
const writeSwitch = (o) => writeFileSync(SWITCH, JSON.stringify(o, null, 2) + "\n");

function validate() {
  const ids = new Set();
  for (const s of shots) {
    if (ids.has(s.id)) die(`Duplicate shot id "${s.id}".`);
    ids.add(s.id);
    if (!RATIOS.includes(s.ratio)) die(`Shot "${s.id}": ratio ${s.ratio} is not one Runway accepts (${RATIOS.join(", ")}).`);
    const d = duration(s);
    if (!Number.isInteger(d) || d < 2 || d > 10) die(`Shot "${s.id}": duration must be a whole number from 2 to 10.`);
    if (!s.prompt || s.prompt.length > 1000) die(`Shot "${s.id}": prompt must be 1 to 1000 characters.`);
  }
}

/* ------------------------------------------------------------ commands --- */

function status() {
  const live = readSwitch();
  console.log("shot           photo  prepped  takes  encoded  live");
  for (const s of shots) {
    const cell = (b) => (b ? "yes" : "-").padEnd(7);
    console.log(
      s.id.padEnd(15) +
        cell(existsSync(join(DIR.photos, s.photo))) +
        cell(existsSync(join(DIR.prepped, s.id + ".jpg"))).padEnd(9) +
        String(takes(s.id).length).padEnd(7) +
        cell(existsSync(join(s.slot === "social" ? DIR.social : DIR.site, s.id + ".mp4"))).padEnd(9) +
        (live[s.slot] ? "yes" : "-"),
    );
  }
  console.log(`\nAPI key: ${process.env.RUNWAYML_API_SECRET ? "set" : "not set (RUNWAYML_API_SECRET)"}`);
}

/** Crop to the shot's ratio, size to Runway's output, drop every metadata
    block (GPS included), and keep the file small enough for a data URI. */
function prep() {
  mkdirSync(DIR.prepped, { recursive: true });
  for (const s of pick()) {
    const src = join(DIR.photos, s.photo);
    if (!existsSync(src)) {
      console.log(`skip ${s.id}: runway/photos/${s.photo} is not there yet`);
      continue;
    }
    const [w, h] = s.ratio.split(":").map(Number);
    const out = join(DIR.prepped, s.id + ".jpg");
    for (const q of [2, 4, 6, 9]) {
      run("ffmpeg", [
        "-y", "-loglevel", "error", "-i", src,
        "-vf", `scale=${w * 2}:${h * 2}:force_original_aspect_ratio=increase,crop=${w * 2}:${h * 2}`,
        "-frames:v", "1", "-map_metadata", "-1", "-q:v", String(q), out,
      ]);
      if (statSync(out).size <= MAX_INPUT_BYTES) break;
    }
    if (statSync(out).size > MAX_INPUT_BYTES) die(`${s.id}: could not get the input under ${MAX_INPUT_BYTES} bytes.`);
    console.log(`prepped ${s.id}  ${w * 2}x${h * 2}  ${kb(out)}`);
  }
  console.log("\nLook at every file in runway/work/prepped before generating: no faces, plates or house numbers in frame.");
}

function plan() {
  const final = flag("final");
  const m = model(final);
  let total = 0;
  console.log(`One take per shot on ${m} (${CREDITS[m]} credits per second):\n`);
  for (const s of pick()) {
    const c = duration(s) * CREDITS[m];
    total += c;
    console.log(`${s.id.padEnd(15)} ${String(duration(s)).padStart(2)} s  ${String(c).padStart(4)} credits`);
  }
  console.log(`\nTotal ${total} credits, $${(total / 100).toFixed(2)} at API rates. Budget 4 to 5 takes per shot.`);
}

async function api(path, init = {}) {
  const key = process.env.RUNWAYML_API_SECRET;
  if (!key) die("RUNWAYML_API_SECRET is not set. Nothing was sent.");
  const res = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, "X-Runway-Version": API_VERSION, "Content-Type": "application/json", ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) die(`Runway ${res.status} on ${path}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : {};
}

async function generate() {
  const s = one();
  const final = flag("final");
  const m = model(final);
  const cost = duration(s) * CREDITS[m];
  const input = join(DIR.prepped, s.id + ".jpg");
  if (!existsSync(input)) die(`Run prep first: ${input} does not exist.`);
  if (!flag("yes")) {
    console.log(`Would spend ${cost} credits ($${(cost / 100).toFixed(2)}) on ${s.id}, ${duration(s)} s, ${m}, ${s.ratio}.`);
    console.log("Add --yes to send it.");
    return;
  }
  const org = await api("/v1/organization");
  if (typeof org.creditBalance === "number" && org.creditBalance < cost) die(`Balance is ${org.creditBalance} credits; this take needs ${cost}.`);

  const seed = opt("seed") ? Number(opt("seed")) : Math.floor(Math.random() * 4294967295);
  const body = {
    model: m,
    promptImage: "data:image/jpeg;base64," + readFileSync(input).toString("base64"),
    promptText: s.prompt,
    ratio: s.ratio,
    duration: duration(s),
    seed,
  };
  const { id } = await api("/v1/image_to_video", { method: "POST", body: JSON.stringify(body) });
  console.log(`task ${id} started (${cost} credits, seed ${seed})`);

  let task;
  for (;;) {
    await new Promise((r) => setTimeout(r, 6000));
    task = await api(`/v1/tasks/${id}`);
    process.stdout.write(`  ${task.status}${task.progress != null ? " " + Math.round(task.progress * 100) + "%" : ""}\n`);
    if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(task.status)) break;
  }
  if (task.status !== "SUCCEEDED") die(`Task ended ${task.status}: ${task.failure ?? ""} ${task.failureCode ?? ""}`);

  // Output URLs expire, so the file is pulled down straight away.
  mkdirSync(DIR.raw, { recursive: true });
  const file = join(DIR.raw, `${s.id}.${m}.${seed}.mp4`);
  const dl = await fetch(task.output[0]);
  if (!dl.ok) die(`Download failed: ${dl.status}`);
  writeFileSync(file, Buffer.from(await dl.arrayBuffer()));

  const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : [];
  log.push({ at: new Date().toISOString(), shot: s.id, task: id, model: m, seed, ratio: s.ratio, duration: duration(s), credits: cost, prompt: s.prompt, file });
  writeFileSync(LOG, JSON.stringify(log, null, 2) + "\n");
  console.log(`saved ${file}  ${kb(file)}`);
  console.log("Compare the last frame against the photo. If the concrete changed, throw the take away.");
}

function encode() {
  const s = one();
  const take = opt("take") ?? takes(s.id)[0];
  if (!take || !existsSync(take)) die(`No take for ${s.id}. Generate one, or pass --take <file>.`);
  const social = s.slot === "social";
  const dir = social ? DIR.social : DIR.site;
  mkdirSync(dir, { recursive: true });
  const base = join(dir, s.id);
  const common = ["-y", "-loglevel", "error", "-i", take, "-an", "-map_metadata", "-1"];
  run("ffmpeg", [...common, "-c:v", "libx264", "-crf", social ? "20" : "24", "-preset", "slow", "-pix_fmt", "yuv420p", "-movflags", "+faststart", base + ".mp4"]);
  console.log(`encoded ${s.id}.mp4  ${kb(base + ".mp4")}`);
  if (social) return;
  run("ffmpeg", [...common, "-c:v", "libvpx-vp9", "-crf", "34", "-b:v", "0", "-row-mt", "1", base + ".webm"]);
  run("ffmpeg", ["-y", "-loglevel", "error", "-i", take, "-frames:v", "1", "-map_metadata", "-1", "-quality", "82", base + "-poster.webp"]);
  console.log(`encoded ${s.id}.webm  ${kb(base + ".webm")}`);
  console.log(`encoded ${s.id}-poster.webp  ${kb(base + "-poster.webp")}`);
}

function publish() {
  const s = one();
  if (s.slot === "social") die(`${s.id} is a social clip; it is finished in runway/work/social and never goes on the site.`);
  const files = [".mp4", ".webm", "-poster.webp"].map((ext) => s.id + ext);
  for (const f of files) if (!existsSync(join(DIR.site, f))) die(`Run encode first: ${f} is missing.`);
  mkdirSync(DIR.pub, { recursive: true });
  for (const f of files) copyFileSync(join(DIR.site, f), join(DIR.pub, f));
  const live = readSwitch();
  live[s.slot] = { mp4: `/media/runway/${files[0]}`, webm: `/media/runway/${files[1]}`, poster: `/media/runway/${files[2]}`, alt: s.alt };
  writeSwitch(live);
  console.log(`${s.slot} now plays the Runway clip. Rebuild the site to see it; \`unpublish --shot ${s.id}\` puts the old media back.`);
}

function unpublish() {
  const s = one();
  const live = readSwitch();
  if (!live[s.slot]) return console.log(`${s.slot} is already on the original media.`);
  delete live[s.slot];
  writeSwitch(live);
  for (const ext of [".mp4", ".webm", "-poster.webp"]) rmSync(join(DIR.pub, s.id + ext), { force: true });
  console.log(`${s.slot} is back on the original media.`);
}

validate();
const commands = { status, prep, plan, generate, encode, publish, unpublish };
if (!commands[cmd]) die(`Usage: node runway/cli.mjs <${Object.keys(commands).join("|")}> [--shot id] [--final] [--yes]`);
await commands[cmd]();
