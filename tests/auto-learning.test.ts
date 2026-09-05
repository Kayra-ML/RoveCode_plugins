import { describe, it, expect, beforeEach } from "bun:test";
import {
  detectSignalsFromTurn,
  type ConversationTurn,
} from "../src/learning/auto-detector.js";
import { SessionLearningBuffer } from "../src/learning/session-buffer.js";

// ============================================================
// detectSignalsFromTurn
// ============================================================

describe("detectSignalsFromTurn — explicit-like", () => {
  it("detects explicit-like from 'I like this approach, keep it'", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "I like this approach, keep it",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].signal).toBe("explicit-like");
    expect(signals[0].confidence).toBeCloseTo(0.9);
  });

  it("detects explicit-like from 'perfect, exactly what I wanted'", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "perfect, exactly what I wanted",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].signal).toBe("explicit-like");
  });

  it("detects explicit-like from 'from now on always use tabs'", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "from now on always use tabs for indentation",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    // "from now on" triggers explicit-like; "always use" triggers explicit-remember
    // explicit-remember is checked first so it wins
    expect(["explicit-like", "explicit-remember"]).toContain(signals[0].signal);
  });
});

describe("detectSignalsFromTurn — explicit-dislike", () => {
  it("detects explicit-dislike from 'don't use rounded cards'", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "don't use rounded cards in the UI",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].signal).toBe("explicit-dislike");
    expect(signals[0].confidence).toBeCloseTo(0.9);
  });

  it("detects explicit-dislike from 'stop using classes'", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "stop using classes, switch to functions",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].signal).toBe("explicit-dislike");
  });

  it("detects explicit-dislike from 'too much boilerplate'", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "too much boilerplate in this code",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].signal).toBe("explicit-dislike");
  });
});

describe("detectSignalsFromTurn — explicit-remember", () => {
  it("detects explicit-remember from 'remember that I prefer compact layouts'", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "remember that I prefer compact layouts",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].signal).toBe("explicit-remember");
    expect(signals[0].confidence).toBeCloseTo(1.0);
  });

  it("detects explicit-remember from 'note that we use Drizzle not Prisma'", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "note that we use Drizzle not Prisma for all database work",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].signal).toBe("explicit-remember");
  });

  it("detects explicit-remember from 'for future reference, always use pnpm'", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "for future reference, always use pnpm not npm",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].signal).toBe("explicit-remember");
  });
});

describe("detectSignalsFromTurn — verified-solution", () => {
  it("detects verified-solution from assistant message with 'fixed' + code after error context", () => {
    const previousTurns: ConversationTurn[] = [
      { role: "user", content: "I keep getting a borrow error in Rust" },
    ];
    const assistantTurn: ConversationTurn = {
      role: "assistant",
      content:
        "The issue is fixed by cloning before moving into the closure:\n```rust\nlet s = val.clone();\n```",
    };
    const signals = detectSignalsFromTurn(assistantTurn, previousTurns);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].signal).toBe("verified-solution");
    expect(signals[0].confidence).toBeCloseTo(0.8);
  });

  it("detects verified-solution when tests show passing output", () => {
    const previousTurns: ConversationTurn[] = [
      { role: "user", content: "The auth middleware is broken" },
    ];
    const assistantTurn: ConversationTurn = {
      role: "assistant",
      content: "Here is the solution:\n```js\nreturn next();\n```\nAll tests ✓ passing now.",
    };
    const signals = detectSignalsFromTurn(assistantTurn, previousTurns);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].signal).toBe("verified-solution");
  });

  it("does NOT detect verified-solution from assistant message with no previous problem context", () => {
    const assistantTurn: ConversationTurn = {
      role: "assistant",
      content: "Here is a general approach:\n```ts\nconst x = 1;\n```",
    };
    const signals = detectSignalsFromTurn(assistantTurn, []);
    const solutionSignals = signals.filter(s => s.signal === "verified-solution");
    expect(solutionSignals).toHaveLength(0);
  });
});

describe("detectSignalsFromTurn — no false positives", () => {
  it("returns no signals for neutral user question", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "How do I create a React component?",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals).toHaveLength(0);
  });

  it("returns no signals for neutral assistant explanation", () => {
    const turn: ConversationTurn = {
      role: "assistant",
      content: "A React component is a function that returns JSX.",
    };
    const signals = detectSignalsFromTurn(turn, [
      { role: "user", content: "What is a React component?" },
    ]);
    expect(signals).toHaveLength(0);
  });

  it("does NOT trigger user-side signals on assistant turns", () => {
    const turn: ConversationTurn = {
      role: "assistant",
      content: "I like this approach and always use it myself.",
    };
    const signals = detectSignalsFromTurn(turn, []);
    const userSignals = signals.filter(s =>
      s.signal === "explicit-like" || s.signal === "explicit-remember"
    );
    expect(userSignals).toHaveLength(0);
  });
});

describe("detectSignalsFromTurn — entryType detection", () => {
  it("assigns 'design-preference' when content mentions UI/layout", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "I like this layout, keep it — the card spacing looks good",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].entryType).toBe("design-preference");
  });

  it("assigns 'technical-preference' when content mentions code patterns", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "I like this pattern, keep it — use interfaces over type aliases",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].entryType).toBe("technical-preference");
  });

  it("assigns 'workflow-preference' for process-related content", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "remember that our workflow is: branch → PR → review → merge",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].entryType).toBe("workflow-preference");
  });

  it("assigns 'solved-problem' when bug/error is mentioned", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "remember that the borrow error is fixed by cloning before passing to closure",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    // "remember that" → explicit-remember, content has "error" and "fixed"
    expect(signals[0].entryType).toBe("solved-problem");
  });
});

describe("detectSignalsFromTurn — domain detection", () => {
  it("detects 'rust' domain from Rust-specific keywords", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "remember that in Rust we always use clippy for linting",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].domain).toBe("rust");
  });

  it("detects 'database' domain from SQL keywords", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "note that we always use Drizzle ORM for all postgres migrations",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].domain).toBe("database");
  });

  it("detects 'web-design' domain from CSS/UI keywords", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "I like this — always use Tailwind for all CSS styling",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].domain).toBe("web-design");
  });

  it("returns undefined domain for generic content", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "remember that I prefer short variable names",
    };
    const signals = detectSignalsFromTurn(turn);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].domain).toBeUndefined();
  });
});

// ============================================================
// SessionLearningBuffer
// ============================================================

describe("SessionLearningBuffer", () => {
  let buffer: SessionLearningBuffer;

  beforeEach(() => {
    buffer = new SessionLearningBuffer();
  });

  it("starts empty", () => {
    expect(buffer.size()).toBe(0);
  });

  it("tracks added candidates", () => {
    buffer.add({
      signal: "explicit-like",
      content: "I like this",
      entryType: "working-preference",
      confidence: 0.9,
      reason: "test",
    });
    expect(buffer.size()).toBe(1);
  });

  it("deduplicates identical signal+content pairs", () => {
    const sig = {
      signal: "explicit-like" as const,
      content: "I like this approach keep it as is",
      entryType: "working-preference" as const,
      confidence: 0.9,
      reason: "test",
    };
    buffer.add(sig);
    buffer.add({ ...sig }); // exact duplicate
    expect(buffer.deduplicate()).toHaveLength(1);
  });

  it("keeps distinct signals with different signal types", () => {
    buffer.add({
      signal: "explicit-like",
      content: "I like this approach",
      entryType: "working-preference",
      confidence: 0.9,
      reason: "test",
    });
    buffer.add({
      signal: "explicit-dislike",
      content: "I like this approach", // same content, different signal
      entryType: "working-preference",
      confidence: 0.9,
      reason: "test",
    });
    expect(buffer.deduplicate()).toHaveLength(2);
  });

  it("filters below confidence threshold", () => {
    buffer.add({
      signal: "explicit-like",
      content: "high confidence signal",
      entryType: "working-preference",
      confidence: 0.9,
      reason: "test",
    });
    buffer.add({
      signal: "explicit-like",
      content: "low confidence signal that is completely different",
      entryType: "working-preference",
      confidence: 0.5,
      reason: "test",
    });
    const highConf = buffer.getHighConfidence(0.8);
    expect(highConf).toHaveLength(1);
    expect(highConf[0].content).toBe("high confidence signal");
  });

  it("clear() empties the buffer", () => {
    buffer.add({
      signal: "explicit-like",
      content: "some content",
      entryType: "working-preference",
      confidence: 0.9,
      reason: "test",
    });
    buffer.clear();
    expect(buffer.size()).toBe(0);
    expect(buffer.deduplicate()).toHaveLength(0);
  });

  it("deduplicates case-insensitively on content prefix", () => {
    const base = "I like this layout, use it everywhere";
    buffer.add({
      signal: "explicit-like",
      content: base,
      entryType: "design-preference",
      confidence: 0.9,
      reason: "first",
    });
    buffer.add({
      signal: "explicit-like",
      content: base.toUpperCase(),
      entryType: "design-preference",
      confidence: 0.9,
      reason: "second",
    });
    expect(buffer.deduplicate()).toHaveLength(1);
  });
});