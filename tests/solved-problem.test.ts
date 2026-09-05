import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PersonalManager } from "../src/personal/manager.js";
import { createLearningCandidate } from "../src/learning/pipeline.js";

let tmpDir: string;
let manager: PersonalManager;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "skill-solved-"));
  manager = new PersonalManager(tmpDir);
});

afterEach(() => {
  manager.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Solved Problem Learning", () => {
  it("records a verified solution", async () => {
    const candidate = createLearningCandidate(
      "verified-solution",
      "Bun subprocess stops returning output. Root cause: ReadableStream must be consumed before re-use. Solution: await stream.text() before second call.",
      {
        entryType: "solved-problem",
        tags: ["bun", "subprocess", "stream"],
        domain: "automation",
        confidence: 1.0,
      }
    );

    const { decision, updated } = await manager.applyLearningCandidate("user1", candidate);
    expect(decision.operation).toBe("ADD");
    expect(updated).toBe(true);
  });

  it("retrieves solved problem when same domain queried", async () => {
    const candidate = createLearningCandidate(
      "verified-solution",
      "Bun subprocess output issue. Solution: consume stream before reuse.",
      {
        entryType: "solved-problem",
        tags: ["bun", "subprocess"],
        domain: "automation",
        confidence: 1.0,
      }
    );
    await manager.applyLearningCandidate("user1", candidate);

    const entries = await manager.findRelevantEntries(
      "user1",
      ["bun", "subprocess"],
      "automation"
    );
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.content.includes("subprocess"))).toBe(true);
  });

  it("persists to disk and reloads correctly", async () => {
    const candidate = createLearningCandidate(
      "verified-solution",
      "Problem: Rust lifetime error in struct. Solution: Use owned String instead of &str reference.",
      {
        entryType: "solved-problem",
        tags: ["rust", "lifetime"],
        domain: "rust",
      }
    );
    await manager.applyLearningCandidate("user1", candidate);
    manager.invalidateCache("user1");

    // Reload from disk — should find the entry
    const skill = await manager.getSkill("user1");
    expect(skill.entries.some((e) => e.content.includes("lifetime"))).toBe(true);
  });

  it("solved problem has solved-problem entry type after round-trip", async () => {
    const candidate = createLearningCandidate(
      "verified-solution",
      "Fix: missing semicolon caused parse error in pipeline",
      {
        entryType: "solved-problem",
        tags: ["parsing", "pipeline"],
        domain: "automation",
      }
    );
    await manager.applyLearningCandidate("user1", candidate);
    manager.invalidateCache("user1");

    const skill = await manager.getSkill("user1");
    const entry = skill.entries.find((e) => e.content.includes("semicolon"));
    expect(entry).toBeDefined();
    expect(entry!.type).toBe("solved-problem");
  });

  it("multiple solved problems for same user accumulate", async () => {
    const problems = [
      { content: "Fix stream issue by draining buffer first", tags: ["stream"] },
      { content: "Fix timeout by increasing retry delay exponentially", tags: ["retry", "timeout"] },
    ];

    for (const p of problems) {
      const c = createLearningCandidate("verified-solution", p.content, {
        entryType: "solved-problem",
        tags: p.tags,
        domain: "automation",
      });
      await manager.applyLearningCandidate("user1", c);
    }

    const skill = await manager.getSkill("user1");
    expect(skill.entries.filter((e) => e.type === "solved-problem").length).toBeGreaterThanOrEqual(2);
  });
});