# Large-Scale Objective Benchmark

A 400+ scenario benchmark for the RoveCode Plugins routing system (`Router` in
`src/router/router.ts`), built to be much harder to game than the original
20-scenario `benchmark/run-benchmark.ts`: most of it is generated straight
from the system's own real activation data instead of hand-picked examples
that are likely to pass.

## Composition

| Source | Count | How it's built |
|---|---|---|
| `generate-skill-scenarios.ts` | 360 | 5 request variants per skill (72 skills × 5), each built from that skill's real `activationSignals` array in `plugins/{plugin}/skills-meta/{skill}.json` — not invented keywords. |
| `manual-scenarios.ts` — isolation | 35 | Keyword-overlap traps (e.g. "deadlock" is correct for both `rust/async-concurrency` and `database/transactions` depending on context; "render" must NOT trigger `game-development`). |
| `manual-scenarios.ts` — ambiguous | 20 | Requests that legitimately span two domains (e.g. schema migration + deployment rollout ordering). |
| `manual-scenarios.ts` — negative | 15 | Vague/non-technical messages ("Make it better.", "What time zone are you running in?") that should NOT trigger a confident domain selection. |
| `manual-scenarios.ts` — composition | 15 | Verifies the real `requires`/`suggests` edges declared in `web-design`'s skills-meta (e.g. `motion-engineering` requires `interaction-design`; `creative-direction` suggests `typography`/`layout-composition`/`color-system`/`visual-review`). |
| **Total** | **445** | |

## Running it

```bash
bun run benchmark/large/run-large-benchmark.ts
```

This prints an overall score, a breakdown by category and by plugin, and the
worst-scoring scenarios, then writes:

- `benchmark/large/results.json` — full machine-readable results
- `benchmark/large/REPORT.md` — the same breakdown as a markdown table, plus every scenario that scored below 80/100

## Scoring

Each scenario is scored 0-100 on four dimensions, averaged for an overall score:

- **Routing accuracy** (40 pts plugin match + 40 pts skill hit + 20 pts no forbidden plugin). `composition` scenarios require *all* expected skills to appear (testing the requires/suggests chain specifically); every other category requires at least one expected skill to appear. `negative` scenarios instead score 100 only if the plugin count stays within `maxPlugins`.
- **Token efficiency** — reward staying in the 20-60% band of the 6,000-token budget.
- **Routing speed** — deterministic classifier, so this is consistently near 100.
- **Domain isolation** — penalizes any plugin selected outside the scenario's expected set.

## What the last run found

Running this benchmark (see `results.json` for the full data) surfaced two
concrete, reproducible bugs in the router — not benchmark flakiness:

1. **Classifier fallback always defaults to `web-design`.** In
   `src/router/classifier.ts`, when a request scores 0 against every domain's
   signal list, `classifyRequest` falls back to
   `Object.entries(scores).sort(...).slice(0, 1)`. Since every score is tied
   at 0, `Array.sort` (stable) preserves the original insertion order of the
   `DOMAIN_SIGNALS` object — and `"web-design"` is declared first. So *any*
   request with zero domain signal (a vague message, an off-topic question,
   or a technical request whose vocabulary just isn't in any domain's list)
   is silently classified as `web-design` and marked "ambiguous," which then
   lets `web-design`'s plugin hints/skills leak in. Reproduced by e.g.
   `NEG-07` ("Can you explain how computers work in general?"), `NEG-10`
   ("Write me a short poem about autumn."), and `ISO-21` ("Set up structured
   logging with correlation IDs and error tracking via Sentry." — scored
   `web-design` alone despite having a clean devops-only vocabulary that
   simply doesn't appear in `DOMAIN_SIGNALS.devops`).

2. **`devops`'s plugin-level activation hints are too short and match as
   substrings.** `plugins/devops/manifest.json` lists `"ci"`, `"cd"`, and
   `"env"` as activation hints. Plugin matching uses
   `requestLower.includes(hint)`, and once the classifier is in its
   "ambiguous" fallback (see bug 1 — which is extremely easy to trigger),
   *any single hint substring match* is enough to add the plugin. `"ci"`
   appears inside ordinary English words like **circuit**, **hallucination**,
   **specific**, and **decision** — so devops silently attaches itself to
   unrelated requests. Reproduced by `SK-AUTO-reliability-retries-4`
   ("...handle backoff when it interacts with **circuit** breaker?" → devops
   selected) and the auto-generated ai-engineering scenario referencing
   "**hallu**ci**nation**."

Both bugs compound: because bug 1 makes "ambiguous" classification common,
bug 2's substring hints get far more opportunities to fire than they would
if the classifier only fell into ambiguous mode on genuinely unclear input.
Together they explain most of the sub-80 scores in the `skill` category
(`web-design` and `devops` appearing as unwanted extra plugins) and are the
main reason Domain Isolation (73.2/100) and Routing Accuracy (69.5/100)
trail Token Efficiency and Speed in the overall score.

Everything else the benchmark checks — skill-composition chains (100%
pass), token budget discipline (97.3/100), and routing latency (100/100,
sub-millisecond) — held up well at this scale.
