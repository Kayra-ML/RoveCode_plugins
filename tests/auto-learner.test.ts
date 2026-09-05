import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { PersonalManager } from "../src/personal/manager.js";
import { AutoLearner } from "../src/learning/auto-learner.js";
import type { TaskOutcome } from "../src/learning/auto-learner.js";

let tmpDir: string;
let manager: PersonalManager;
let learner: AutoLearner;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "skill-autolearn-"));
  manager = new PersonalManager(tmpDir);
  learner = new AutoLearner(manager);
});

afterEach(() => {
  manager.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("AutoLearner", () => {
  it("produces a learning candidate from an explicit-like user message", async () => {
    const outcome: TaskOutcome = {
      userId: "user1",
      domain: "web-design",
      messages: [
        { role: "user", content: "I prefer compact sidebars for navigation" },
        { role: "assistant", content: "Got it, I will use compact sidebars." },
      ],
    };

    const { candidates, persisted } = await learner.processTaskOutcome(outcome);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].signalType).toBe("explicit-like");
    expect(persisted).toBeGreaterThan(0);
  });

  it("produces an explicit-remember candidate when user says remember/always", async () => {
    const outcome: TaskOutcome = {
      userId: "user2",
      domain: "rust",
      messages: [
        { role: "user", content: "Remember that I always use clippy for linting" },
        { role: "assistant", content: "Noted!" },
      ],
    };

    const { candidates } = await learner.processTaskOutcome(outcome);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0].signalType).toBe("explicit-remember");
  });

  it("produces a solved-problem candidate when tests pass and assistant describes a fix", async () => {
    const outcome: TaskOutcome = {
      userId: "user3",
      domain: "rust",
      taskSucceeded: true,
      testsPassedCount: 5,
      testsTotalCount: 5,
      messages: [
        { role: "user", content: "My ownership error is fixed now" },
        {
          role: "assistant",
          content:
            "The solution was to clone the value before passing it to the closure. " +
            "```rust\nlet s = value.clone();\nclosure(s);\n``` This fix resolves the borrow error.",
        },
      ],
    };

    const { candidates } = await learner.processTaskOutcome(outcome);
    const solvedCandidates = candidates.filter(c => c.signalType === "verified-solution");
    expect(solvedCandidates.length).toBeGreaterThan(0);
    expect(solvedCandidates[0].proposedEntry.type).toBe("solved-problem");
    expect(solvedCandidates[0].confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("produces no candidates from neutral messages", async () => {
    const outcome: TaskOutcome = {
      userId: "user4",
      messages: [
        { role: "user", content: "How do I create a component?" },
        { role: "assistant", content: "Here is how you create a component in React..." },
        { role: "user", content: "What is the best way to handle errors?" },
      ],
    };

    const { candidates, persisted } = await learner.processTaskOutcome(outcome);
    expect(candidates).toHaveLength(0);
    expect(persisted).toBe(0);
  });

  it("does not produce a solution candidate when tests did not pass", async () => {
    const outcome: TaskOutcome = {
      userId: "user5",
      domain: "backend",
      taskSucceeded: false,
      testsPassedCount: 0,
      messages: [
        {
          role: "assistant",
          content:
            "The fix involves updating the error handler. ```js\ntry { ... } catch(e) { log(e); }\n``` This should resolve the issue.",
        },
      ],
    };

    const { candidates } = await learner.processTaskOutcome(outcome);
    const solvedCandidates = candidates.filter(c => c.signalType === "verified-solution");
    expect(solvedCandidates).toHaveLength(0);
  });

  it("sanitizes API keys and credentials before persisting", async () => {
    const outcome: TaskOutcome = {
      userId: "user6",
      messages: [
        {
          role: "user",
          content: "I prefer using sk-proj-abc123def456ghi789jkl012mno345pqr as the auth token always",
        },
      ],
    };

    const { candidates } = await learner.processTaskOutcome(outcome);
    // A signal should still be detected (explicit-remember via "always")
    expect(candidates.length).toBeGreaterThan(0);
    // But the raw key must not appear in the stored content
    for (const c of candidates) {
      expect(c.proposedEntry.content).not.toContain("sk-proj-abc123");
      expect(c.proposedEntry.content).toContain("[REDACTED]");
    }
  });

  it("does not persist assistant-only messages as user signals", async () => {
    const outcome: TaskOutcome = {
      userId: "user7",
      messages: [
        {
          role: "assistant",
          content: "I prefer to always use TypeScript strict mode in every project.",
        },
      ],
    };

    // The "always use" signal is in an assistant turn — should be ignored
    const { candidates } = await learner.processTaskOutcome(outcome);
    // No user messages with signals → no candidates from step 1
    // taskSucceeded is falsy so step 2 also skipped
    expect(candidates).toHaveLength(0);
  });

  it("caps solution candidates at one per task even with multiple matching assistant messages", async () => {
    const outcome: TaskOutcome = {
      userId: "user8",
      domain: "backend",
      taskSucceeded: true,
      testsPassedCount: 3,
      messages: [
        {
          role: "assistant",
          content:
            "First attempt: the fix involves adding an index. ```sql\nCREATE INDEX ...\n``` This should solve the issue.",
        },
        {
          role: "assistant",
          content:
            "Second attempt: the solution is to add a unique constraint. ```sql\nALTER TABLE ...\n``` This resolved the error.",
        },
      ],
    };

    const { candidates } = await learner.processTaskOutcome(outcome);
    const solvedCandidates = candidates.filter(c => c.signalType === "verified-solution");
    // The loop breaks after the first match, so at most 1
    expect(solvedCandidates.length).toBeLessThanOrEqual(1);
  });
});