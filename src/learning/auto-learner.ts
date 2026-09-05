import type { PersonalManager } from "../personal/manager.js";
import type { LearningCandidate } from "../types/index.js";
import { createLearningCandidate, detectSignals, sanitizeForLearning } from "./pipeline.js";

export interface TaskOutcome {
  userId: string;
  domain?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  testsPassedCount?: number;
  testsTotalCount?: number;
  taskSucceeded?: boolean;
}

export class AutoLearner {
  constructor(private personal: PersonalManager) {}

  /**
   * Scan a completed task's messages for strong learning signals.
   * Returns the candidates that were actually persisted.
   */
  async processTaskOutcome(outcome: TaskOutcome): Promise<{
    candidates: LearningCandidate[];
    persisted: number;
  }> {
    const candidates: LearningCandidate[] = [];

    // 1. Scan user messages for explicit signals
    for (const msg of outcome.messages) {
      if (msg.role !== "user") continue;
      const signal = detectSignals(msg.content);
      if (!signal) continue;

      const safe = sanitizeForLearning(msg.content);
      if (safe.length < 10) continue;

      candidates.push(createLearningCandidate(signal, safe, {
        entryType: signal === "verified-solution" ? "solved-problem" : "working-preference",
        domain: outcome.domain,
        confidence: 0.8,
      }));
    }

    // 2. If tests passed, look for assistant messages describing a solution
    if (outcome.taskSucceeded && outcome.testsPassedCount && outcome.testsPassedCount > 0) {
      const solutionMessages = outcome.messages
        .filter(m => m.role === "assistant" && m.content.length > 50)
        .slice(-2); // last 2 assistant messages

      for (const msg of solutionMessages) {
        const safe = sanitizeForLearning(msg.content);
        // Only save if it looks like a technical solution (has code patterns)
        if (/```|error|fix|solution|solved|issue/i.test(safe) && safe.length > 80) {
          candidates.push(createLearningCandidate("verified-solution", safe.slice(0, 400), {
            entryType: "solved-problem",
            domain: outcome.domain,
            confidence: 0.9,
          }));
          break; // max 1 solution per task
        }
      }
    }

    // 3. Apply all candidates
    let persisted = 0;
    for (const candidate of candidates) {
      const { updated } = await this.personal.applyLearningCandidate(outcome.userId, candidate);
      if (updated) persisted++;
    }

    return { candidates, persisted };
  }
}