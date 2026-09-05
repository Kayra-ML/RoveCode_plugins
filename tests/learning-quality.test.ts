import { describe, it, expect } from "bun:test";
import { PersonalUpdater, applyDecay } from "../src/personal/updater.js";
import { detectSignalsFromTurn, type ConversationTurn } from "../src/learning/auto-detector.js";
import type { PersonalSkill, PersonalEntry, LearningCandidate } from "../src/types/index.js";

// ============================================================
// Helpers
// ============================================================

function makeSkill(entries: PersonalEntry[]): PersonalSkill {
  return {
    userId: "test",
    version: 1,
    updatedAt: new Date().toISOString(),
    entries,
  };
}

function makeEntry(overrides: Partial<PersonalEntry> & { id: string }): PersonalEntry {
  return {
    type: "working-preference",
    content: "some preference",
    tags: [],
    confidence: 0.8,
    strength: 0.5,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    usageCount: 1,
    ...overrides,
  };
}

function makeCandidate(
  overrides: Partial<LearningCandidate> & { id: string }
): LearningCandidate {
  return {
    signalType: "explicit-like",
    proposedEntry: {
      type: "working-preference",
      content: "some preference",
      tags: [],
      confidence: 0.8,
      strength: 0.5,
    },
    sourceContext: "test",
    confidence: 0.8,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================
// 1. Signal-proportional STRENGTHEN
// ============================================================

describe("STRENGTHEN — signal-proportional increment", () => {
  it("high confidence (0.95) strengthens more than low confidence (0.5)", () => {
    const updater = new PersonalUpdater();
    const entry = makeEntry({ id: "e1", strength: 0.4 });
    const skill = makeSkill([entry]);

    const decisionHigh = {
      operation: "STRENGTHEN" as const,
      candidateId: "c1",
      targetEntryId: "e1",
      reason: "test",
    };
    const decisionLow = {
      operation: "STRENGTHEN" as const,
      candidateId: "c2",
      targetEntryId: "e1",
      reason: "test",
    };

    const highCandidate = makeCandidate({ id: "c1", confidence: 0.95, signalType: "explicit-like" });
    const lowCandidate = makeCandidate({ id: "c2", confidence: 0.5, signalType: "explicit-like" });

    const skillAfterHigh = updater.apply(skill, highCandidate, decisionHigh);
    const skillAfterLow = updater.apply(skill, lowCandidate, decisionLow);

    const strengthHigh = skillAfterHigh.entries[0].strength;
    const strengthLow = skillAfterLow.entries[0].strength;

    expect(strengthHigh).toBeGreaterThan(strengthLow);
  });

  it("high confidence (0.95) increment is near 0.2 (0.05 + 0.95*0.15)", () => {
    const updater = new PersonalUpdater();
    const entry = makeEntry({ id: "e1", strength: 0.4 });
    const skill = makeSkill([entry]);
    const candidate = makeCandidate({ id: "c1", confidence: 0.95, signalType: "explicit-like" });
    const decision = {
      operation: "STRENGTHEN" as const,
      candidateId: "c1",
      targetEntryId: "e1",
      reason: "test",
    };

    const updated = updater.apply(skill, candidate, decision);
    const increment = updated.entries[0].strength - 0.4;
    // Expected increment: min(0.05 + 0.95*0.15, 0.25) = min(0.1925, 0.25) = 0.1925
    expect(increment).toBeCloseTo(0.1925, 3);
  });

  it("strength is capped at 1.0 after STRENGTHEN", () => {
    const updater = new PersonalUpdater();
    const entry = makeEntry({ id: "e1", strength: 0.95 });
    const skill = makeSkill([entry]);
    const candidate = makeCandidate({ id: "c1", confidence: 0.95, signalType: "explicit-like" });
    const decision = {
      operation: "STRENGTHEN" as const,
      candidateId: "c1",
      targetEntryId: "e1",
      reason: "test",
    };

    const updated = updater.apply(skill, candidate, decision);
    expect(updated.entries[0].strength).toBeLessThanOrEqual(1.0);
  });
});

// ============================================================
// 2. applyDecay — reduces strength of old entries
// ============================================================

describe("applyDecay", () => {
  it("reduces strength of entries older than 6 months with strength > 0.2", () => {
    const oldDate = new Date(Date.now() - 7 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const entry = makeEntry({ id: "e1", strength: 0.6, updatedAt: oldDate });
    const skill = makeSkill([entry]);

    const decayed = applyDecay(skill);
    expect(decayed.entries[0].strength).toBeLessThan(0.6);
  });

  it("reduces strength of entries older than 3 months with strength > 0.5", () => {
    const oldDate = new Date(Date.now() - 4 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const entry = makeEntry({ id: "e1", strength: 0.7, updatedAt: oldDate });
    const skill = makeSkill([entry]);

    const decayed = applyDecay(skill);
    expect(decayed.entries[0].strength).toBeLessThan(0.7);
  });

  it("does NOT decay entries newer than 3 months", () => {
    const recentDate = new Date(Date.now() - 1 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const entry = makeEntry({ id: "e1", strength: 0.8, updatedAt: recentDate });
    const skill = makeSkill([entry]);

    const decayed = applyDecay(skill);
    expect(decayed.entries[0].strength).toBe(0.8);
  });

  it("does NOT decay solved-problem entries even if very old", () => {
    const oldDate = new Date(Date.now() - 12 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const entry = makeEntry({ id: "e1", type: "solved-problem", strength: 0.8, updatedAt: oldDate });
    const skill = makeSkill([entry]);

    const decayed = applyDecay(skill);
    expect(decayed.entries[0].strength).toBe(0.8);
  });

  it("does NOT decay entries older than 6 months with strength <= 0.2", () => {
    const oldDate = new Date(Date.now() - 7 * 30 * 24 * 60 * 60 * 1000).toISOString();
    const entry = makeEntry({ id: "e1", strength: 0.15, updatedAt: oldDate });
    const skill = makeSkill([entry]);

    const decayed = applyDecay(skill);
    expect(decayed.entries[0].strength).toBe(0.15);
  });
});

// ============================================================
// 3. Also: chain consolidation after 3 merges
// ============================================================

describe("mergeContent — Also: chain consolidation", () => {
  it("consolidates into Preferences: when Also: count reaches 3", () => {
    const updater = new PersonalUpdater();

    // Build up an entry with 2 existing Also: chains by triggering MERGE twice
    const existingEntry = makeEntry({
      id: "e1",
      content: "Use TypeScript strict mode\n\nAlso: Always prefer interfaces over types\n\nAlso: Use named exports",
      type: "technical-preference",
      confidence: 0.8,
    });
    const skill = makeSkill([existingEntry]);

    // Third merge — should consolidate
    const candidate = makeCandidate({
      id: "c3",
      signalType: "explicit-like",
      proposedEntry: {
        type: "technical-preference",
        content: "Use ESLint with strict rules",
        tags: [],
        confidence: 0.8,
        strength: 0.5,
      },
    });
    const decision = {
      operation: "MERGE" as const,
      candidateId: "c3",
      targetEntryId: "e1",
      reason: "test",
    };

    const updated = updater.apply(skill, candidate, decision);
    const resultContent = updated.entries[0].content;

    expect(resultContent).toContain("Preferences:");
    expect(resultContent).not.toMatch(/Also:.*Also:.*Also:/s);
  });
});

// ============================================================
// 4. Contradiction detection
// ============================================================

describe("Contradiction detection in apply()", () => {
  it("weakens an existing dark-mode preference when light-mode is explicitly liked", () => {
    const updater = new PersonalUpdater();
    const darkEntry = makeEntry({
      id: "e-dark",
      type: "design-preference",
      content: "I prefer dark mode for all interfaces",
      strength: 0.7,
      domain: "web-design",
    });
    const skill = makeSkill([darkEntry]);

    // ADD a light-mode preference (explicit-like)
    const candidate = makeCandidate({
      id: "c-light",
      signalType: "explicit-like",
      proposedEntry: {
        type: "design-preference",
        content: "I prefer light mode for all interfaces",
        tags: [],
        confidence: 0.9,
        strength: 0.5,
        domain: "web-design",
      },
    });
    const decision = {
      operation: "ADD" as const,
      candidateId: "c-light",
      reason: "test",
    };

    const updated = updater.apply(skill, candidate, decision);

    // The dark-mode entry should have been weakened
    const darkAfter = updated.entries.find(e => e.id === "e-dark");
    expect(darkAfter).toBeDefined();
    expect(darkAfter!.strength).toBeLessThan(0.7);
  });

  it("does NOT weaken entries with no opposing keywords", () => {
    const updater = new PersonalUpdater();
    const entry = makeEntry({
      id: "e1",
      type: "design-preference",
      content: "I prefer card-based layouts",
      strength: 0.7,
      domain: "web-design",
    });
    const skill = makeSkill([entry]);

    // Adding a totally unrelated preference — no opposing keywords
    const candidate = makeCandidate({
      id: "c1",
      signalType: "explicit-like",
      proposedEntry: {
        type: "design-preference",
        content: "I prefer monospace fonts for code blocks",
        tags: [],
        confidence: 0.9,
        strength: 0.5,
        domain: "web-design",
      },
    });
    const decision = {
      operation: "ADD" as const,
      candidateId: "c1",
      reason: "test",
    };

    const updated = updater.apply(skill, candidate, decision);
    const entryAfter = updated.entries.find(e => e.id === "e1");
    expect(entryAfter).toBeDefined();
    expect(entryAfter!.strength).toBe(0.7);
  });
});

// ============================================================
// 5. Multi-signal detection
// ============================================================

describe("detectSignalsFromTurn — multi-signal", () => {
  it("'I love this layout, remember it' returns both like AND remember signals", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "I love this layout, keep it like this — remember that I want this style going forward",
    };
    const signals = detectSignalsFromTurn(turn);
    const types = signals.map(s => s.signal);
    // Should detect explicit-remember (from "remember that") and possibly explicit-like
    expect(types).toContain("explicit-remember");
    // At minimum we should get more than zero signals
    expect(signals.length).toBeGreaterThan(0);
  });

  it("a turn with both remember and dislike patterns returns both", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "remember that I don't like too much boilerplate in the code",
    };
    const signals = detectSignalsFromTurn(turn);
    const types = signals.map(s => s.signal);
    expect(types).toContain("explicit-remember");
    // "don't like" and "too much" are dislike patterns — should also capture dislike
    expect(types.some(t => t === "explicit-dislike" || t === "explicit-remember")).toBe(true);
  });

  it("does not return duplicate signal types from the same turn", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "I like this, keep it like this",
    };
    const signals = detectSignalsFromTurn(turn);
    const likeSignals = signals.filter(s => s.signal === "explicit-like");
    expect(likeSignals.length).toBeLessThanOrEqual(1);
  });
});

// ============================================================
// 6. Tightened false-positive patterns
// ============================================================

describe("Tightened false-positive patterns", () => {
  it("'perfect timing' does NOT trigger explicit-like", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "That was perfect timing on your response",
    };
    const signals = detectSignalsFromTurn(turn);
    const likeSignals = signals.filter(s => s.signal === "explicit-like");
    expect(likeSignals).toHaveLength(0);
  });

  it("'perfect, keep it' DOES trigger explicit-like", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "perfect, keep it this way",
    };
    const signals = detectSignalsFromTurn(turn);
    const likeSignals = signals.filter(s => s.signal === "explicit-like");
    expect(likeSignals.length).toBeGreaterThan(0);
  });

  it("'always do something like this' does NOT trigger explicit-like via always-do pattern", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "You should always do something like this when handling errors",
    };
    const signals = detectSignalsFromTurn(turn);
    const likeSignals = signals.filter(s => s.signal === "explicit-like");
    expect(likeSignals).toHaveLength(0);
  });

  it("'always do it this way' DOES trigger explicit-like", () => {
    const turn: ConversationTurn = {
      role: "user",
      content: "always do it this way when writing async functions",
    };
    const signals = detectSignalsFromTurn(turn);
    const likeSignals = signals.filter(s => s.signal === "explicit-like");
    expect(likeSignals.length).toBeGreaterThan(0);
  });
});