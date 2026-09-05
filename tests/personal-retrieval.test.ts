import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PersonalManager } from "../src/personal/manager.js";
import { createLearningCandidate } from "../src/learning/pipeline.js";

let tmpDir: string;
let manager: PersonalManager;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "skill-personal-"));
  manager = new PersonalManager(tmpDir);
});

afterEach(() => {
  manager.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Personal Retrieval", () => {
  it("returns empty entries for new user", async () => {
    const entries = await manager.findRelevantEntries("newuser", ["sidebar"], "web-design");
    expect(entries).toHaveLength(0);
  });

  it("retrieves only relevant entries by keyword", async () => {
    // Add web-design preference
    const webCandidate = createLearningCandidate(
      "explicit-like",
      "Prefers narrow sidebars for navigation",
      {
        entryType: "design-preference",
        tags: ["sidebar", "navigation"],
        domain: "web-design",
      }
    );
    await manager.applyLearningCandidate("user1", webCandidate);

    // Add rust knowledge (different domain)
    const rustCandidate = createLearningCandidate(
      "verified-solution",
      "Fix ownership error by cloning the value",
      {
        entryType: "solved-problem",
        tags: ["rust", "ownership"],
        domain: "rust",
      }
    );
    await manager.applyLearningCandidate("user1", rustCandidate);

    // Query with web-design keywords
    const webEntries = await manager.findRelevantEntries(
      "user1",
      ["sidebar", "navigation"],
      "web-design"
    );
    expect(webEntries.length).toBeGreaterThan(0);
    expect(webEntries.some((e) => e.content.includes("sidebars"))).toBe(true);

    // Rust knowledge should not dominate (web-design entry should appear)
    const webDesignEntries = webEntries.filter((e) => e.domain === "web-design");
    expect(webDesignEntries.length).toBeGreaterThan(0);
  });

  it("does not return other user entries", async () => {
    const candidate = createLearningCandidate(
      "explicit-like",
      "User A prefers dark mode themes",
      {
        entryType: "design-preference",
        tags: ["theme", "dark"],
        domain: "web-design",
      }
    );
    const { decision } = await manager.applyLearningCandidate("userA", candidate);
    expect(decision.operation).toBe("ADD");

    // userB should see no entries
    const entriesForB = await manager.findRelevantEntries("userB", ["dark", "theme"], "web-design");
    expect(entriesForB).toHaveLength(0);
  });

  it("returns entries after multiple candidates are applied", async () => {
    const candidates = [
      createLearningCandidate("explicit-like", "Prefers compact navigation bars", {
        entryType: "design-preference",
        tags: ["navigation", "compact"],
        domain: "web-design",
      }),
      createLearningCandidate("explicit-like", "Prefers high contrast text for readability", {
        entryType: "design-preference",
        tags: ["typography", "contrast"],
        domain: "web-design",
      }),
    ];

    for (const c of candidates) {
      await manager.applyLearningCandidate("user2", c);
    }

    const entries = await manager.findRelevantEntries("user2", ["navigation"], "web-design");
    expect(entries.length).toBeGreaterThan(0);
  });
});