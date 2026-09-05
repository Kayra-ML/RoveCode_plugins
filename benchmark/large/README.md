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

## What this benchmark found, and the fixes it verified

The first run of this benchmark (445 scenarios, before any router changes)
scored **85.1/100 overall** but only **69.5/100 routing accuracy** and
**73.2/100 domain isolation**, and it surfaced two concrete, reproducible
bugs in `src/router/`:

1. **Classifier fallback always defaulted to `web-design`.** In
   `classifyRequest` (`src/router/classifier.ts`), when a request scored 0
   against every domain's signal list, the fallback picked
   `Object.entries(scores).sort(...).slice(0, 1)` — since every score tied at
   0, the stable sort preserved `DOMAIN_SIGNALS`'s insertion order, and
   `"web-design"` is declared first. So *any* request with zero real domain
   signal (a vague message, an off-topic question, or a technical request
   whose vocabulary wasn't in any domain's list) got silently tagged
   `web-design`. Reproduced by e.g. `NEG-10` ("Write me a short poem about
   autumn.") and `ISO-21` ("Set up structured logging..." — a clean
   devops-only request).
2. **Plugin-level activation hints matched as raw substrings.** Several
   plugins declare short hints (`devops`: `"ci"`, `"cd"`, `"env"`;
   `database`: `"orm"`; `ai-engineering`: `"ai"`; `backend`: `"rest"`,
   `"api"`; `testing`: `"test"`, `"mock"`; `mobile`: `"ios"`), and
   `router.ts` matched them with `requestLower.includes(hint)`. `"ci"` is a
   substring of **circuit**, **hallucination**, **specific**; `"orm"` is a
   substring of **perf-orm-ance**; `"ai"` is a substring of **rem-ai-n**,
   **dom-ai-n**. Once bug 1 made "ambiguous" classification common, any of
   these substrings firing was enough to silently attach an unrelated
   plugin.

### The fixes (in `src/router/`, verified by rerunning this benchmark + the full `bun test` suite + `benchmark/run-benchmark.ts` + `benchmark/isolation-benchmark.ts` after each change)

- **`router.ts`** — a classifier domain only counts as a real "domain match"
  when `classification.confidence[domain] > 0`. The zero-score fallback
  guess now carries confidence 0, so it's no longer trusted as a match —
  without touching `classifyRequest`'s existing "always returns at least one
  domain" contract (`tests/classifier.test.ts` still passes unchanged).
- **`router.ts`** — activation-hint matching now uses a whole-word/phrase
  regex (`\bhint\b`, with a trailing `s?` to tolerate simple plurals) instead
  of raw substring `includes()`, closing the `"ci"`/`"orm"`/`"ai"`/etc.
  false-positive class for every plugin at once.
- **`router.ts`** — plugin selection also checks each skill's own
  `activationSignals` for an exact multi-word phrase match (e.g.
  `async-concurrency`'s `"async runtime"`, `game-loop`'s `"fixed
  timestep"`), since those lists are far richer than the coarse per-plugin
  hint list. Only *multi-word* signals count (single words like
  `visual-review`'s `"review"`/`"improve"` would reintroduce leakage), and
  only when that exact phrase is unique to one plugin (`"error handling"` is
  declared by both `rust/error-handling` and `backend/error-handling-http`,
  so it's excluded from this pathway for both — a shared phrase isn't
  discriminating evidence for either).

### Result after the fixes

| Metric | Before | After (router fixes) | After (+ signal cleanup) |
|---|---|---|---|
| Overall | 85.1 | 85.8 | **85.7** |
| Routing Accuracy | 69.5 | 76.4 | **76.2** |
| Domain Isolation | 73.2 | 95.7 | **96.1** |
| Token Efficiency | 97.3 | 69.9 | 69.1 |
| `benchmark/run-benchmark.ts` (20 scenarios) | 96/100 (A+) | 98/100 (A+) | **98/100 (A+)**, Plugin Isolation 94→**96** |
| `benchmark/isolation-benchmark.ts` (15 scenarios) | 88/100 | 100/100 | **100/100** |

Domain isolation and routing accuracy improved substantially — unrelated
plugins essentially stopped leaking into requests outside their domain.
Token efficiency *dropped* because a lot of it was an artifact of the same
bug: `web-design` and other plugins were being included (and loading skill
bodies) far more often than they should have been, which inflated the old
"efficiency" number with content nobody asked for.

### Follow-up: a signal-collision linter, and what it changed

`scripts/lint-signals.ts` (`bun run lint:signals`) scans every plugin
manifest and skill-meta file for the exact classes of signal that caused the
bugs above, so future plugin/skill additions get checked automatically
instead of relying on someone noticing a benchmark failure by chance. It
flags (ERROR, fails the run) a generic English word used as a *plugin-level*
`activationHint` — the one remaining class that can still misroute a whole
plugin — and (WARN) short hints, skill signals shared across plugins, and
generic-word skill-level signals, which are lower-severity now that the
router fixes above contain their blast radius.

Its first run found 12 real ERRORs: `activationHint`s like `"test"`,
`"mock"`, `"secret"`, `"monitor"`, `"container"`, `"index"`, `"server"`,
`"node"`, `"event"`, `"prompt"`, `"model"` — ordinary English words being used
as one-word triggers for an entire plugin. All 12 were removed or replaced
with a more specific alternative (e.g. `devops`'s `"container"` →
`"containerize"`, `database`'s `"index"` → `"db index"`, `testing`'s
`"test"`/`"mock"` → `"unit test"`/`"test suite"`) across
`plugins/{ai-engineering,automation,backend,database,devops,testing}/manifest.json`.
Every plugin retained 9+ other hints, so none lost meaningful coverage.

### What's still weak (and what's genuinely fixable)

`game-development` improved from 77.5→**83.5/100** after adding 5 signals to
`DOMAIN_SIGNALS.game-development` that were verified, one at a time, to be
both (a) needed to fix a specific observed miss and (b) checked against
every other domain's signal list for collisions before adding: `"atlas"`,
`"addressable"`, `"collider"`, `"raycast"`, and the bigram `"state machine"`.

`rust` (74.5/100) was **deliberately left unchanged** after the same
exercise found no safe fix. Every remaining `rust` miss falls into one of two
buckets: (1) the test sentence contains only one rust-relevant word at all
(e.g. "I need help with **async** for my project"), which the classifier's
own `threshold = max(2, maxScore * 0.6)` rule can never pass from a single
1-point unigram hit regardless of what's in the signal list — fixing this
would mean lowering that global "2" floor, a much bigger, riskier, all-domains
change, not a per-domain signal tweak; or (2) the two candidate words are
each individually too generic/cross-language to add safely (`"argument"`,
`"expect"` — the latter already shared with `testing`'s core assertion
function; `"heap"`/`"allocation"` — systems-programming vocabulary common to
C++/Java/Go, not Rust-specific; `"generic"`/`"iterator"` — used by nearly
every typed language). Forcing any of these in would very likely reproduce
the exact class of leakage this benchmark was built to catch. Reported here
rather than papered over with an unsafe addition.
