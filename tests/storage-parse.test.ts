import { describe, it, expect } from "bun:test";
import {
  parseSkillFile,
  serializeSkillFile,
  generateId,
} from "../src/personal/storage.js";
import type { PersonalSkill, PersonalEntry } from "../src/types/index.js";

function makeEntry(overrides: Partial<PersonalEntry> = {}): PersonalEntry {
  const now = new Date().toISOString();
  return {
    id: generateId("e"),
    type: "design-preference",
    content: "Prefers narrow sidebars",
    tags: ["sidebar", "navigation"],
    domain: "web-design",
    confidence: 0.9,
    strength: 0.8,
    createdAt: now,
    updatedAt: now,
    usageCount: 2,
    ...overrides,
  };
}

describe("Personal Skill Storage", () => {
  it("serializes and parses entries round-trip", () => {
    const skill: PersonalSkill = {
      userId: "test",
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: [
        makeEntry({ type: "design-preference", content: "Prefers narrow sidebars" }),
        makeEntry({
          type: "working-preference",
          content: "Prefers direct answers without preamble",
          tags: ["communication"],
          domain: undefined,
        }),
        makeEntry({
          type: "technical-preference",
          content: "Prefers TypeScript strict mode",
          tags: ["typescript"],
          domain: "backend",
        }),
      ],
    };

    const serialized = serializeSkillFile(skill);
    const parsed = parseSkillFile("test", serialized);

    expect(parsed.userId).toBe("test");
    expect(parsed.entries).toHaveLength(3);
  });

  it("preserves entry IDs through serialization", () => {
    const entry = makeEntry({ id: "e_testid123" });
    const skill: PersonalSkill = {
      userId: "test",
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: [entry],
    };

    const serialized = serializeSkillFile(skill);
    const parsed = parseSkillFile("test", serialized);

    expect(parsed.entries[0].id).toBe("e_testid123");
  });

  it("preserves tags, domain, confidence, strength", () => {
    const entry = makeEntry({
      tags: ["sidebar", "navigation", "ui"],
      domain: "web-design",
      confidence: 0.87,
      strength: 0.75,
    });
    const skill: PersonalSkill = {
      userId: "test",
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: [entry],
    };

    const serialized = serializeSkillFile(skill);
    const parsed = parseSkillFile("test", serialized);
    const e = parsed.entries[0];

    expect(e.tags).toContain("sidebar");
    expect(e.domain).toBe("web-design");
    expect(e.confidence).toBeCloseTo(0.87, 2);
    expect(e.strength).toBeCloseTo(0.75, 2);
  });

  it("empty skill file parses to empty entries", () => {
    const skill: PersonalSkill = {
      userId: "empty",
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: [],
    };
    const serialized = serializeSkillFile(skill);
    const parsed = parseSkillFile("empty", serialized);
    expect(parsed.entries).toHaveLength(0);
  });

  it("preserves usageCount through round-trip", () => {
    const entry = makeEntry({ usageCount: 7 });
    const skill: PersonalSkill = {
      userId: "test",
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: [entry],
    };
    const serialized = serializeSkillFile(skill);
    const parsed = parseSkillFile("test", serialized);
    expect(parsed.entries[0].usageCount).toBe(7);
  });

  it("preserves entry type (solved-problem) through round-trip", () => {
    const entry = makeEntry({
      type: "solved-problem",
      content: "Fix: drain stream before reuse",
      tags: ["stream"],
    });
    const skill: PersonalSkill = {
      userId: "test",
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: [entry],
    };
    const serialized = serializeSkillFile(skill);
    const parsed = parseSkillFile("test", serialized);
    expect(parsed.entries[0].type).toBe("solved-problem");
  });

  it("generateId produces unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => generateId("e")));
    // All 100 should be unique
    expect(ids.size).toBe(100);
  });

  it("generateId respects prefix", () => {
    const id = generateId("cand");
    expect(id.startsWith("cand_")).toBe(true);
  });

  it("serialized output contains section headings", () => {
    const skill: PersonalSkill = {
      userId: "test",
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: [makeEntry({ type: "design-preference" })],
    };
    const serialized = serializeSkillFile(skill);
    expect(serialized).toContain("## Design Preferences");
    expect(serialized).toContain("# Personal Skill");
  });

  it("multi-line content survives round-trip", () => {
    const multiLine = "Line one\nLine two\nLine three";
    const entry = makeEntry({ content: multiLine });
    const skill: PersonalSkill = {
      userId: "test",
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: [entry],
    };
    const serialized = serializeSkillFile(skill);
    const parsed = parseSkillFile("test", serialized);
    expect(parsed.entries[0].content).toBe(multiLine);
  });
});