// Shared scenario types for the personal-learning-system benchmark.
// Mirrors benchmark/large/'s approach (real code paths, not mocked) but for
// signal detection and personal-knowledge retrieval instead of routing.

export interface SignalScenario {
  id: string;
  category: "explicit-like" | "explicit-dislike" | "explicit-remember" | "verified-solution" | "negative";
  /** The user (or assistant, for verified-solution) message to run through detectSignalsFromTurn. */
  message: string;
  /** For verified-solution scenarios: the preceding user turn that sets problem context. */
  previousUserMessage?: string;
  /** Which signal type detectSignalsFromTurn should report (empty = none expected). */
  expectedSignals: Array<"explicit-like" | "explicit-dislike" | "explicit-remember" | "verified-solution">;
  note: string;
}

export interface RetrievalSeedEntry {
  id: string;
  domain: string;
  entryType: "design-preference" | "technical-preference" | "workflow-preference" | "solved-problem" | "working-preference";
  content: string;
  tags: string[];
}

export interface RetrievalQueryScenario {
  id: string;
  /** Domain the query is scoped to. */
  queryDomain: string;
  /** Keywords passed to findRelevantEntries, as a real caller would extract them. */
  queryKeywords: string[];
  /** Entry ids (from RETRIEVAL_SEED) that must appear in the result. */
  expectedEntryIds: string[];
  /** Entry ids that must NOT appear in the result (cross-domain leakage). */
  forbiddenEntryIds: string[];
  note: string;
}
