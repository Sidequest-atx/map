# How the model rates severity

SideQuest ATX shows every AI read as a suggestion with its confidence and reason, and a person confirms it. This file documents where the three severity anchors in `index.ts` come from, so the rubric can be audited and re-scored as models improve (the model name is recorded on every report).

## The metric

Severity is anchored on the two things that are actually measurable in sidewalk-condition practice — **vertical displacement** and **crack width** — plus the passability criteria used by the largest academic sidewalk-labeling effort.

| Severity | Vertical displacement | Crack width | Passability |
| --- | --- | --- | --- |
| low | < 1/4 in (6 mm) | < 1/4 in (6 mm) | passable for everyone with care; easily avoided |
| moderate | 1/4–1/2 in (6–13 mm) | 1/4–3/4 in (6–19 mm) | catches a toe or wheel; forces single file or a brief detour |
| severe | > 1/2 in (13 mm) | > 3/4 in (19 mm), broken/missing sections | could put someone on the ground; impassable by wheelchair |

## Sources

1. **ADA 2010 Standards / PROWAG (Public Right-of-Way Accessibility Guidelines)** — vertical changes in level up to 1/4 in may remain untreated; 1/4–1/2 in must be beveled at 1:2; above 1/2 in requires a ramp or remediation. This is the legal trip-hazard line for pedestrian access routes and the basis of our low/moderate/severe displacement bands. (See e.g. the U.S. Access Board's PROWAG surface provisions, summarized in municipal compliance guides such as safesidewalks.com/ada-compliance.)
2. **FHWA, *Distress Identification Manual for the Long-Term Pavement Performance Program* (5th rev. ed., FHWA-HRT-13-092)** — standard crack-severity classes: low < 6 mm mean width, moderate 6–19 mm, high > 19 mm. Our crack-width bands are these classes mapped onto three levels.
3. **UW Project Sidewalk labeling guide + Saha et al., "Project Sidewalk: A Web-based Crowdsourcing Tool for Collecting Sidewalk Accessibility Data at Scale" (CHI 2019)** — severity rises with how much of the path width the problem covers, whether it can be avoided, and whether it would destabilize a wheelchair. This supplies the passability column and the tie-breaking guidance (prefer the lower severity unless the evidence supports the higher).

## Scale estimation

A photo carries no ruler, so the prompt tells the model to calibrate against in-frame references (shoes ≈ 4 in wide, curb ≈ 6 in, panel joints 3–5 ft apart; 1/4 in ≈ a pencil's diameter, 1/2 in ≈ a finger's width) and to lower its confidence rather than guess upward when torn.

## Cost control

Default model `claude-haiku-4-5` ($1/M input, $5/M output). Every call's actual token usage is metered into `sq_ai_usage`; the function refuses at `ai_monthly_budget_usd` (default **$90**, under the $100/month ceiling) and at `ai_user_daily_calls` per reporter per day (default 500). Both knobs plus `ai_model` live in `sq_config`. When the budget gate closes, clients quietly fall back to manual type/severity selection — the app never blocks on the classifier. As a second backstop, set a $100 workspace spend limit in the Anthropic Console.

## Updating

Tune the prompt in `index.ts`, redeploy with
`npx supabase functions deploy sq-classify --project-ref ncvglhlmmbnkhbevzelu`,
and note the change here. Because the model name rides on every report, old reports remain comparable to new ones.
