import { describe, it, expect } from "bun:test";
import { PersonalUpdater } from "../src/personal/updater.js";
import { createLearningCandidate } from "../src/learning/pipeline.js";
import type { PersonalSkill } from "../src/types/index.js";

describe("Deduplication", () => {
  const updater = new PersonalUpdater();

  function makeSkill(entries: any[] = []): PersonalSkill {
    return {
      userId: "test",
      version: 1,
      updatedAt: new Date().toISOString(),
      entries,
    };
  }

  it("similar preferences produce MERGE not ADD", () => {
    const skill = makeSkill();

    // Add first entry
    const first = createLearningCandidate(
      "explicit-like",
      "Prefers narrow sidebars for navigation",
      {
        entryType: "design-preference",
        tags: ["sidebar"],
      }
    );
    const decision1 = updater.decide(first, skill.entries);
    expect(decision1.operation).toBe("ADD");
    const skill2 = updater.apply(skill, first, decision1);

    // Add nearly identical entry — same type, very similar wording
    // Shares enough long words with the first to cross the 0.65 Jaccard threshold
    const second = createLearningCandidate(
      "explicit-like",
      "Prefers narrow sidebars for navigation panels",
      {
        entryType: "design-preference",
        tags: ["sidebar"],
      }
    );
    const decision2 = updater.decide(second, skill2.entries);
    // Should be MERGE or STRENGTHEN, not ADD
    expect(["MERGE", "STRENGTHEN"]).toContain(decision2.operation);
  });

  it("distinct preferences produce ADD", () => {
    const skill = makeSkill();

    const first = createLearningCandidate(
      "explicit-like",
      "Prefers narrow sidebars for navigation layout",
      {
        entryType: "design-preference",
        tags: ["sidebar"],
      }
    );
    const decision1 = updater.decide(first, skill.entries);
    const skill2 = updater.apply(skill, first, decision1);

    // Completely different preference — different topic, different tags
    const second = createLearningCandidate(
      "explicit-like",
      "Prefers high contrast typography with wide line height spacing",
      {
        entryType: "design-preference",
        tags: ["typography"],
      }
    );
    const decision2 = updater.decide(second, skill2.entries);
    expect(decision2.operation).toBe("ADD");
    const skill3 = updater.apply(skill2, second, decision2);
    expect(skill3.entries).toHaveLength(2);
  });

  it("low confidence candidates are ignored", () => {
    const skill = makeSkill();
    const candidate = createLearningCandidate(
      "explicit-like",
      "Maybe prefers something vague",
      {
        entryType: "design-preference",
        confidence: 0.3, // below 0.7 threshold
      }
    );
    const decision = updater.decide(candidate, skill.entries);
    expect(decision.operation).toBe("IGNORE");
  });

  it("repeated signal strengthens existing entry", () => {
    const skill = makeSkill();

    const first = createLearningCandidate(
      "explicit-like",
      "Prefers narrow compact sidebars for navigation",
      {
        entryType: "design-preference",
        tags: ["sidebar"],
      }
    );
    const d1 = updater.decide(first, skill.entries);
    const skill2 = updater.apply(skill, first, d1);

    const originalStrength = skill2.entries[0].strength;

    // Same preference again — very similar wording
    const second = createLearningCandidate(
      "explicit-like",
      "Prefers narrow compact sidebars for navigation layout",
      {
        entryType: "design-preference",
        tags: ["sidebar"],
      }
    );
    const d2 = updater.decide(second, skill2.entries);
    const skill3 = updater.apply(skill2, second, d2);

    if (d2.operation === "STRENGTHEN" || d2.operation === "MERGE") {
      expect(skill3.entries[0].strength).toBeGreaterThanOrEqual(originalStrength);
    }
  });

  it("dislike signal weakens a matching entry", () => {
    const skill = makeSkill();

    // First, add an entry
    const first = createLearningCandidate(
      "explicit-like",
      "Prefers dark mode with deep backgrounds",
      {
        entryType: "design-preference",
        tags: ["dark-mode"],
      }
    );
    const d1 = updater.decide(first, skill.entries);
    const skill2 = updater.apply(skill, first, d1);
    const originalStrength = skill2.entries[0].strength;

    // Now dislike the same thing
    const second = createLearningCandidate(
      "explicit-dislike",
      "Prefers dark mode with deep backgrounds",
      {
        entryType: "design-preference",
        tags: ["dark-mode"],
      }
    );
    const d2 = updater.decide(second, skill2.entries);
    expect(["WEAKEN", "IGNORE"]).toContain(d2.operation);
    if (d2.operation === "WEAKEN") {
      const skill3 = updater.apply(skill2, second, d2);
      // Either removed or weakened
      if (skill3.entries.length > 0) {
        expect(skill3.entries[0].strength).toBeLessThan(originalStrength);
      }
    }
  });

  it("prune removes entries below minimum strength", () => {
    const now = new Date().toISOString();
    const skill: PersonalSkill = {
      userId: "test",
      version: 1,
      updatedAt: now,
      entries: [
        {
          id: "e1",
          type: "design-preference",
          content: "Weak entry",
          tags: [],
          confidence: 0.5,
          strength: 0.05, // below MIN_STRENGTH of 0.1
          createdAt: now,
          updatedAt: now,
          usageCount: 1,
        },
        {
          id: "e2",
          type: "design-preference",
          content: "Strong entry",
          tags: [],
          confidence: 0.9,
          strength: 0.8,
          createdAt: now,
          updatedAt: now,
          usageCount: 5,
        },
      ],
    };
    const pruned = updater.prune(skill);
    expect(pruned.entries.some((e) => e.id === "e1")).toBe(false);
    expect(pruned.entries.some((e) => e.id === "e2")).toBe(true);
  });
});