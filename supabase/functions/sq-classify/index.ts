// SideQuest ATX — hazard photo classifier + close-out verifier.
//
// One endpoint, two ops, same wire contract the clients have spoken since the
// mock era (src/ai/classify.ts / mobile/src/ai/classify.ts):
//   POST { op: "classify", image: <data URL> }
//     -> { label, severity, confidence, model, alternatives, reason }
//   POST { op: "verify", before: <data URL|null>, after: <data URL>, type }
//     -> { looksFixed, confidence, model, note }
//
// The Anthropic key lives here (never in a client build). Callers must be
// signed in (the gateway verifies the Supabase JWT before we run). Every call
// is metered into sq_ai_usage and refused once the month's budget is spent,
// so a runaway client cannot exceed the hard ceiling. The severity rubric is
// documented in RUBRIC.md next to this file, with sources.

import Anthropic from "npm:@anthropic-ai/sdk@0.71.2";
import { createClient } from "npm:@supabase/supabase-js@2";

const DEFAULT_MODEL = "claude-haiku-4-5";
const DEFAULT_MONTHLY_BUDGET_USD = 90; // hard stop under the $100/mo ceiling
const DEFAULT_USER_DAILY_CALLS = 500;
// Haiku 4.5: $1 in / $5 out per MTok -> microUSD = in*1 + out*5.
// If ai_model is changed to claude-sonnet-5 ($2/$10), double it.
const PRICE: Record<string, { inp: number; out: number }> = {
  "claude-haiku-4-5": { inp: 1, out: 5 },
  "claude-sonnet-5": { inp: 2, out: 10 },
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const HAZARDS = ["crack", "lifted", "vegetation", "missing-ramp", "missing-sidewalk", "debris", "other"] as const;
const SEVERITIES = ["low", "moderate", "severe"] as const;

// The rubric. Anchored in PROWAG/ADA vertical-displacement tiers, the FHWA
// LTPP Distress Identification Manual crack-width classes, and UW Project
// Sidewalk's passability criteria — see RUBRIC.md for citations.
const RUBRIC = `You rate sidewalk hazards for SideQuest ATX, a civic project that routes real repairs in Austin, TX. You look at one photograph of a public sidewalk and classify what is wrong and how badly. Real crews and Austin 311 tickets follow these ratings, so be calibrated and honest about uncertainty. Never invent a hazard: if the surface looks fine, say type "other" with low severity and say why.

HAZARD TYPES (pick exactly one "label"):
- "crack": cracked or shattered panel, spalling, potholes in the walking surface.
- "lifted": vertical displacement between panels or slabs (root heave, settling, frost heave) — a step or ledge in the walking path.
- "vegetation": plants blocking or overgrowing the path (branches, hedges, grass swallowing the walkway).
- "missing-ramp": a corner or crossing with no curb ramp where one belongs.
- "missing-sidewalk": the sidewalk simply ends or was never built; pedestrians forced onto dirt or the road.
- "debris": movable obstruction (trash, gravel spill, construction material, mud) on the path.
- "other": anything else, or nothing visibly wrong.

SEVERITY (pick exactly one, using these anchors):
- "low": passable for everyone with care.
  * Vertical change under 1/4 inch (6 mm) — the ADA/PROWAG threshold below which no treatment is required.
  * Hairline or narrow cracks under about 1/4 inch (6 mm) wide (FHWA low-severity class) with panels still level.
  * Vegetation or debris that narrows the path but leaves a comfortable clear lane; easily stepped around.
- "moderate": catches a toe or a wheel; uncomfortable or risky for wheelchair users, strollers, and people with low vision.
  * Vertical change between 1/4 and 1/2 inch (6-13 mm) — PROWAG requires beveling in this band.
  * Open cracks roughly 1/4 to 3/4 inch (6-19 mm) wide, moderate spalling, or a patchwork of cracks across part of the panel.
  * Obstruction covering a large share of the path width, forcing single file or a brief detour onto grass.
- "severe": could put someone on the ground, or makes the path impassable for a wheelchair.
  * Vertical change over 1/2 inch (13 mm) — PROWAG requires ramping or full remediation above this.
  * Cracks wider than 3/4 inch (19 mm), broken-up or missing panel sections, holes.
  * Path fully blocked or effectively impassable (dense vegetation wall, no ramp at a needed crossing, sidewalk ends into traffic, debris field).

ESTIMATING SCALE FROM A PHOTO: you cannot measure directly, so use in-frame references — a shoe (~4 in / 10 cm wide), a leaf, curb height (~6 in / 15 cm), panel joints (~3-5 ft spacing), a hand or phone if present. 1/4 inch is about a pencil's diameter; 1/2 inch is about an adult finger's width. When genuinely torn between two severities, pick the higher one only if the displacement/width evidence supports it; otherwise pick the lower and lower your confidence.

Respond with ONLY a JSON object, no code fences:
{"label": <one of ${JSON.stringify([...HAZARDS])}>, "severity": <one of ${JSON.stringify([...SEVERITIES])}>, "confidence": <0..1, your calibrated probability that label AND severity are both right>, "alternatives": [{"label": <different type>, "confidence": <0..1>}] (0-2 entries, only plausible ones), "reason": <one plain sentence naming the visual evidence, mentioning the scale reference you used>}`;

const VERIFY_PROMPT = (
  type: string,
  hasBefore: boolean,
) => `You verify sidewalk repairs for SideQuest ATX. ${hasBefore ? "The FIRST image is the original hazard photo; the SECOND is the after-photo taken at the same spot." : "You have only the after-photo of a spot that was reported as a hazard."} The original report was type "${type}". Decide whether the hazard has actually been fixed — a closed 311 ticket is not proof. Grinding, panel replacement, beveling, or full clearing counts as fixed; cosmetic patching over a still-raised edge, or vegetation merely pushed aside, does not. A human moderator makes the final call; your answer is advisory.

Respond with ONLY a JSON object, no code fences:
{"looksFixed": <true|false>, "confidence": <0..1>, "note": <one plain sentence saying what you see and what to double-check>}`;

interface Config {
  model: string;
  monthlyBudgetUsd: number;
  userDailyCalls: number;
}

type ImageSource =
  | { type: "base64"; media_type: "image/jpeg" | "image/png" | "image/webp"; data: string }
  | { type: "url"; url: string };

/** Accepts a data URL, or an https URL into this project's own public bucket
 * (the web app's live rows carry storage URLs, not pixels). */
function toImageSource(value: string): ImageSource | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/s.exec(value ?? "");
  if (m) {
    if (m[2].length > 14_000_000) return null; // ~10 MB decoded; nothing legitimate is bigger
    return { type: "base64", media_type: m[1] as "image/jpeg" | "image/png" | "image/webp", data: m[2].replace(/\s/g, "") };
  }
  const own = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/public/sidequest-photos/`;
  if (value?.startsWith(own)) return { type: "url", url: value };
  return null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

function extractJson(text: string): Record<string, unknown> | null {
  const cleaned = text.replace(/```(?:json)?/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!anthropicKey) return json(503, { error: "classifier not configured" });

  // The gateway has already verified the JWT signature; we only need the
  // subject for per-user metering.
  const auth = req.headers.get("authorization") ?? "";
  const jwtPayload = auth.split(".")[1];
  let uid = "anonymous";
  try {
    uid = (JSON.parse(atob(jwtPayload.replace(/-/g, "+").replace(/_/g, "/"))) as { sub?: string }).sub ?? "anonymous";
  } catch {
    // leave "anonymous"; the gateway rejected unsigned requests already
  }
  // The bare anon key passes gateway JWT verification but carries no subject;
  // only signed-in reporters and moderators get to spend the budget.
  if (uid === "anonymous") return json(401, { error: "sign in to use the classifier" });

  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Config (defaults unless sq_config overrides).
  const cfg: Config = { model: DEFAULT_MODEL, monthlyBudgetUsd: DEFAULT_MONTHLY_BUDGET_USD, userDailyCalls: DEFAULT_USER_DAILY_CALLS };
  const cfgRows = await service.from("sq_config").select("key, value").in("key", ["ai_model", "ai_monthly_budget_usd", "ai_user_daily_calls"]);
  for (const row of cfgRows.data ?? []) {
    if (row.key === "ai_model" && row.value) cfg.model = row.value;
    if (row.key === "ai_monthly_budget_usd" && Number(row.value) > 0) cfg.monthlyBudgetUsd = Number(row.value);
    if (row.key === "ai_user_daily_calls" && Number(row.value) > 0) cfg.userDailyCalls = Number(row.value);
  }

  // Budget gate — fail closed: if the ledger is unreachable, no spend.
  const now = new Date();
  const monthKey = `m:${now.toISOString().slice(0, 7)}`;
  const userKey = `u:${uid}:${now.toISOString().slice(0, 10)}`;
  const ledger = await service.from("sq_ai_usage").select("key, calls, cost_microusd").in("key", [monthKey, userKey]);
  if (ledger.error) return json(503, { error: "budget ledger unavailable (run supabase/schema.sql)" });
  const monthRow = ledger.data?.find((r) => r.key === monthKey);
  const userRow = ledger.data?.find((r) => r.key === userKey);
  if ((monthRow?.cost_microusd ?? 0) >= cfg.monthlyBudgetUsd * 1_000_000) {
    return json(429, { error: "monthly AI budget spent; classification resumes next month" });
  }
  if ((userRow?.calls ?? 0) >= cfg.userDailyCalls) {
    return json(429, { error: "daily per-reporter AI limit reached" });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json(400, { error: "invalid JSON" });
  }

  const op = body.op;
  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const price = PRICE[cfg.model] ?? PRICE[DEFAULT_MODEL];

  try {
    if (op === "classify") {
      const img = toImageSource(String(body.image ?? ""));
      if (!img) return json(400, { error: "image must be a jpeg/png/webp data URL under 10 MB" });
      const response = await anthropic.messages.create({
        model: cfg.model,
        max_tokens: 600,
        system: RUBRIC,
        messages: [
          {
            role: "user",
            content: [
              { type: "image", source: img },
              { type: "text", text: "Classify this sidewalk photo per the rubric. JSON only." },
            ],
          },
        ],
      });
      const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      const parsed = extractJson(text);
      if (!parsed) return json(502, { error: "model returned no JSON" });
      const cost = response.usage.input_tokens * price.inp + response.usage.output_tokens * price.out;
      await service.rpc("sq_ai_bump", { p_key: monthKey, p_cost_microusd: cost });
      await service.rpc("sq_ai_bump", { p_key: userKey, p_cost_microusd: cost });
      const label = HAZARDS.includes(parsed.label as (typeof HAZARDS)[number]) ? parsed.label : "other";
      const severity = SEVERITIES.includes(parsed.severity as (typeof SEVERITIES)[number]) ? parsed.severity : "moderate";
      return json(200, {
        label,
        severity,
        confidence: clamp01(parsed.confidence),
        model: cfg.model,
        alternatives: Array.isArray(parsed.alternatives)
          ? parsed.alternatives
              .filter((a): a is { label: string; confidence?: unknown } => !!a && HAZARDS.includes((a as { label?: string }).label as (typeof HAZARDS)[number]) && (a as { label?: string }).label !== label)
              .slice(0, 2)
              .map((a) => ({ label: a.label, confidence: clamp01(a.confidence) }))
          : [],
        reason: typeof parsed.reason === "string" ? parsed.reason.slice(0, 400) : "",
      });
    }

    if (op === "verify") {
      const after = toImageSource(String(body.after ?? ""));
      if (!after) return json(400, { error: "after must be a jpeg/png/webp data URL under 10 MB" });
      const before = body.before ? toImageSource(String(body.before)) : null;
      const type = HAZARDS.includes(body.type as (typeof HAZARDS)[number]) ? String(body.type) : "other";
      const content: Anthropic.ContentBlockParam[] = [];
      if (before) content.push({ type: "image", source: before });
      content.push({ type: "image", source: after });
      content.push({ type: "text", text: "Has the hazard been fixed? JSON only." });
      const response = await anthropic.messages.create({
        model: cfg.model,
        max_tokens: 400,
        system: VERIFY_PROMPT(type, Boolean(before)),
        messages: [{ role: "user", content }],
      });
      const text = response.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
      const parsed = extractJson(text);
      if (!parsed) return json(502, { error: "model returned no JSON" });
      const cost = response.usage.input_tokens * price.inp + response.usage.output_tokens * price.out;
      await service.rpc("sq_ai_bump", { p_key: monthKey, p_cost_microusd: cost });
      await service.rpc("sq_ai_bump", { p_key: userKey, p_cost_microusd: cost });
      return json(200, {
        looksFixed: parsed.looksFixed === true,
        confidence: clamp01(parsed.confidence),
        model: cfg.model,
        note: typeof parsed.note === "string" ? parsed.note.slice(0, 400) : "",
      });
    }

    return json(400, { error: `unknown op: ${String(op)}` });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // Anthropic rate limits / overload surface as retryable to the client.
    const status = msg.includes("429") || msg.includes("529") ? 429 : 502;
    return json(status, { error: `classifier upstream: ${msg.slice(0, 200)}` });
  }
});

function clamp01(v: unknown): number {
  const n = typeof v === "number" ? v : 0.5;
  return Math.max(0, Math.min(1, Math.round(n * 100) / 100));
}
