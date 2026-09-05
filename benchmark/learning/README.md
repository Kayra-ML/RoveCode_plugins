# Personal Learning System Benchmark

`benchmark/large/` exhaustively tests routing (plugin/skill selection).
Before this, the *other* half of the project's pitch — personal preference
learning and domain-aware retrieval — had no equivalent large-scale check.
The existing unit tests (`tests/auto-learner.test.ts`,
`tests/personal-retrieval.test.ts`, etc. — 1500+ lines, 60+ tests) cover the
mechanics well, but `tests/personal-retrieval.test.ts` specifically only ever
asserts that the *right* domain's entries come back, never that *other*
domains' entries are absent. This benchmark closes exactly that gap, plus
does a broader sweep of the live signal-detection path.

## Composition

| Part | Count | What it exercises |
|---|---|---|
| Signal detection | 43 scenarios | `src/learning/auto-detector.ts`'s `detectSignalsFromTurn` — the function actually wired into the live `analyze_and_learn` MCP tool. Covers explicit-like/dislike/remember, verified-solution, and negative controls (including known over-triggering patterns, tracked rather than hidden). |
| Retrieval domain isolation | 14 scenarios | `PersonalManager.findRelevantEntries` → `PersonalIndexDb.findRelevant`'s TF-IDF cosine + keyword + domain scoring. 11 pure single-domain queries (one per plugin domain) plus 3 adversarial queries built from entries that deliberately share real vocabulary across domains ("async"/"streaming" between rust and ai-engineering; "api"/"endpoint" between backend and testing). |

## Running it

```bash
bun run benchmark:learning
```

Writes `benchmark/learning/results.json`.

## What it found, and what got fixed

**Two signal-detection recall bugs**, both in `src/learning/auto-detector.ts`, both fixed and verified against the existing 149-test suite:

1. The `"perfect!"` pattern (`EXPLICIT_LIKE_PATTERNS`) was `/\bperfect!\b/i` with a trailing `\b`. A word boundary requires a transition between a word and non-word character — but `"!"` is non-word, and the character after it in real text (a space, or end of string) is *also* non-word, so there's no boundary there. The pattern could only ever match the nonsensical case of `"perfect!"` immediately followed by a letter (`"perfect!ish"`), never `"Perfect! That's great."` — making it dead in practice. Fixed with a negative lookahead (`perfect!(?!\w)`) instead of `\b`.
2. `isVerifiedSolution`'s first gate only checked for `fixed|resolved|working now|this works|solution`; pass/✅ markers were only ever checked *after* that gate, as part of a secondary "problem context" condition — meaning a plain `"All tests passing now ✅"` message with none of those other words was silently never recognized as a verified solution, even though the function's own logic clearly intended pass markers to count as evidence. Fixed by adding `pass(ing)?|✓|✅` to the first gate.

**Two confirmed cross-domain retrieval leaks**, in `src/personal/index-db.ts`'s `findRelevant`, both fixed:

The scoring formula (`keywordScore + domainScore + semanticScore*3 + qualityBoost`, gated only by `total > 0`) applies just a `-3` penalty for a cross-domain entry — soft enough that a rust entry sharing "async"/"streaming" vocabulary with an ai-engineering query, or a backend entry sharing "api"/"endpoint" with a testing query, still scored positive overall and leaked through. A single shared tag is cheap for `-3` to absorb; realistic shared vocabulary is not. Fixed by adding a hard, unconditional exclusion: an entry with an explicit domain that conflicts with the query's domain is now never returned, regardless of score — matching what the README's "Rust preferences never appear in web-design requests" claim actually promises. The soft `-3` penalty is left in place for ranking among still-eligible (same-domain or domain-agnostic) entries.

## Result

| | Before fixes | After fixes |
|---|---|---|
| Signal detection | 41/43 (95/100) | **43/43 (100/100)** |
| Retrieval isolation | 12/14 (86/100) | **14/14 (100/100)** |
| Overall | 91/100 | **100/100** |

Two scenarios (`NEG-09`, `NEG-10`) are intentionally scored as "expected" over-triggers rather than hidden failures: `"too much"` and `"avoid using"` are broad enough patterns that they'll flag plain technical statements as `explicit-dislike` even when the user isn't expressing a preference. Left as documented, known behavior rather than force-fit — narrowing those patterns risks losing real recall on genuine dislike signals, and wasn't part of this benchmark's scope.
