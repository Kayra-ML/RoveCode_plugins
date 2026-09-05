// Seed data + query scenarios for PersonalManager.findRelevantEntries /
// PersonalIndexDb.findRelevant — the retrieval path behind the README's
// claim "Domain-aware: Rust preferences never appear in web-design
// requests." The existing tests/personal-retrieval.test.ts checks that the
// right domain's entries appear, but never asserts that OTHER domains'
// entries are absent — this file closes exactly that gap, the same way
// benchmark/large/'s isolation scenarios did for plugin routing.
//
// Two of the eleven seed entries (rust, ai-engineering) and two more
// (backend, testing) are deliberately written to share real vocabulary
// ("async"/"streaming", "api"/"endpoint") with their counterpart, mirroring
// findRelevant()'s real scoring: keywordScore + domainScore(-3 on mismatch)
// + semanticScore*3 + qualityBoost, gated only by `total > 0`. A single
// shared tag is cheap for the -3 penalty to absorb; enough shared
// vocabulary for a high semantic/keyword score is exactly the adversarial
// case worth checking for.

import type { RetrievalSeedEntry, RetrievalQueryScenario } from "./types.js";

export const RETRIEVAL_SEED: RetrievalSeedEntry[] = [
  { id: "web-design-1", domain: "web-design", entryType: "design-preference",
    content: "Prefers narrow, compact sidebars with minimal padding in dashboard layouts.",
    tags: ["sidebar", "compact", "dashboard"] },

  { id: "rust-1", domain: "rust", entryType: "solved-problem",
    content: "Uses async Tokio tasks with channels for concurrent streaming of large model outputs during inference.",
    tags: ["async", "tokio", "streaming", "concurrent"] },

  { id: "automation-1", domain: "automation", entryType: "workflow-preference",
    content: "Prefers cron-based scheduling over event webhooks for nightly ETL jobs.",
    tags: ["cron", "schedule", "etl"] },

  { id: "backend-1", domain: "backend", entryType: "technical-preference",
    content: "Prefers Hono over Express for new API endpoints because of built-in request validation.",
    tags: ["api", "endpoint", "hono", "validation"] },

  { id: "database-1", domain: "database", entryType: "technical-preference",
    content: "Always uses Drizzle over Prisma for new services, prefers explicit SQL over query builders.",
    tags: ["orm", "drizzle", "sql"] },

  { id: "devops-1", domain: "devops", entryType: "workflow-preference",
    content: "Deploys via GitHub Actions with a required manual approval step before production.",
    tags: ["deploy", "ci", "github-actions"] },

  { id: "security-1", domain: "security", entryType: "solved-problem",
    content: "Fixed a stored XSS by sanitizing rich-text input with DOMPurify before render.",
    tags: ["xss", "sanitize", "security"] },

  { id: "mobile-1", domain: "mobile", entryType: "technical-preference",
    content: "Prefers Expo managed workflow over bare React Native for new mobile apps.",
    tags: ["expo", "react-native", "mobile"] },

  { id: "ai-engineering-1", domain: "ai-engineering", entryType: "technical-preference",
    content: "Prefers async streaming responses over blocking calls for LLM completions.",
    tags: ["async", "streaming", "llm"] },

  { id: "testing-1", domain: "testing", entryType: "workflow-preference",
    content: "Writes integration tests before unit tests for new REST API endpoints (outside-in TDD).",
    tags: ["integration-test", "tdd", "api", "endpoint"] },

  { id: "game-development-1", domain: "game-development", entryType: "technical-preference",
    content: "Prefers fixed timestep game loops over variable timestep for physics determinism.",
    tags: ["game-loop", "physics", "timestep"] },

  // Domain-agnostic entries — background noise, not asserted either way in queries below.
  { id: "agnostic-1", domain: "", entryType: "working-preference",
    content: "Prefers small, focused pull requests over large multi-feature ones.",
    tags: ["pr", "workflow"] },
  { id: "agnostic-2", domain: "", entryType: "technical-preference",
    content: "Prefers descriptive variable names over abbreviations in all languages.",
    tags: ["naming", "style"] },
];

const ALL_DOMAIN_ENTRY_IDS = RETRIEVAL_SEED.filter((e) => e.domain !== "").map((e) => e.id);
function othersExcept(...ids: string[]): string[] {
  return ALL_DOMAIN_ENTRY_IDS.filter((id) => !ids.includes(id));
}

export const RETRIEVAL_QUERIES: RetrievalQueryScenario[] = [
  // ─── Baseline: pure single-domain queries (mirrors routing's ISO-01..ISO-11) ───
  { id: "RQ-01", queryDomain: "web-design", queryKeywords: ["sidebar", "compact", "dashboard", "padding"],
    expectedEntryIds: ["web-design-1"], forbiddenEntryIds: othersExcept("web-design-1"),
    note: "Pure web-design query using the entry's own vocabulary." },
  { id: "RQ-02", queryDomain: "rust", queryKeywords: ["tokio", "channels", "concurrent", "task"],
    expectedEntryIds: ["rust-1"], forbiddenEntryIds: othersExcept("rust-1"),
    note: "Pure rust query." },
  { id: "RQ-03", queryDomain: "automation", queryKeywords: ["cron", "schedule", "etl", "nightly"],
    expectedEntryIds: ["automation-1"], forbiddenEntryIds: othersExcept("automation-1"),
    note: "Pure automation query." },
  { id: "RQ-04", queryDomain: "backend", queryKeywords: ["hono", "express", "validation", "middleware"],
    expectedEntryIds: ["backend-1"], forbiddenEntryIds: othersExcept("backend-1"),
    note: "Pure backend query (avoids 'api'/'endpoint' on purpose — see RQ-13 for the adversarial version)." },
  { id: "database", queryDomain: "database", queryKeywords: ["drizzle", "prisma", "sql", "orm"],
    expectedEntryIds: ["database-1"], forbiddenEntryIds: othersExcept("database-1"),
    note: "Pure database query." },
  { id: "RQ-06", queryDomain: "devops", queryKeywords: ["deploy", "github-actions", "approval", "production"],
    expectedEntryIds: ["devops-1"], forbiddenEntryIds: othersExcept("devops-1"),
    note: "Pure devops query." },
  { id: "RQ-07", queryDomain: "security", queryKeywords: ["xss", "sanitize", "dompurify", "richtext"],
    expectedEntryIds: ["security-1"], forbiddenEntryIds: othersExcept("security-1"),
    note: "Pure security query." },
  { id: "RQ-08", queryDomain: "mobile", queryKeywords: ["expo", "managed", "workflow", "reactnative"],
    expectedEntryIds: ["mobile-1"], forbiddenEntryIds: othersExcept("mobile-1"),
    note: "Pure mobile query." },
  { id: "RQ-09", queryDomain: "game-development", queryKeywords: ["timestep", "physics", "determinism", "gameloop"],
    expectedEntryIds: ["game-development-1"], forbiddenEntryIds: othersExcept("game-development-1"),
    note: "Pure game-development query (avoids generic 'loop' on purpose)." },
  { id: "RQ-10", queryDomain: "testing", queryKeywords: ["unittest", "tdd", "outsidein", "integrationtest"],
    expectedEntryIds: ["testing-1"], forbiddenEntryIds: othersExcept("testing-1"),
    note: "Pure testing query (avoids 'api'/'endpoint' on purpose — see RQ-14 for the adversarial version)." },
  { id: "RQ-11", queryDomain: "ai-engineering", queryKeywords: ["llm", "completions", "blocking"],
    expectedEntryIds: ["ai-engineering-1"], forbiddenEntryIds: othersExcept("ai-engineering-1"),
    note: "ai-engineering query WITHOUT the shared 'async'/'streaming' words, as a control for RQ-12." },

  // ─── Adversarial: deliberate shared-vocabulary probes ───
  { id: "RQ-12", queryDomain: "ai-engineering", queryKeywords: ["async", "streaming", "llm", "completions", "blocking"],
    expectedEntryIds: ["ai-engineering-1"], forbiddenEntryIds: ["rust-1"],
    note: "Adversarial: query shares 'async'+'streaming' with rust-1's tags/content. Tests whether the -3 cross-domain penalty actually holds when keyword+semantic overlap is strong, not just when it's a single incidental tag." },
  { id: "RQ-13", queryDomain: "backend", queryKeywords: ["api", "endpoint", "rest", "hono"],
    expectedEntryIds: ["backend-1"], forbiddenEntryIds: ["testing-1"],
    note: "Adversarial: 'api'+'endpoint' are shared with testing-1's tags. Backend query should not surface the testing entry." },
  { id: "RQ-14", queryDomain: "testing", queryKeywords: ["api", "endpoint", "testing", "tdd"],
    expectedEntryIds: ["testing-1"], forbiddenEntryIds: ["backend-1"],
    note: "Adversarial, reverse direction: testing query should not surface the backend entry despite the same shared tags." },
];
