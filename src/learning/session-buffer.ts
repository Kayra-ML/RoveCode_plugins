import type { AutoDetectedSignal } from "./auto-detector.js";

// ============================================================
// SESSION LEARNING BUFFER
// ============================================================

/**
 * Lightweight in-memory accumulator for auto-detected signals within a session.
 * Deduplication is based on (signal, normalised content prefix) so the same
 * preference expressed twice doesn't produce two identical entries.
 */
export class SessionLearningBuffer {
  private candidates: AutoDetectedSignal[] = [];

  add(signal: AutoDetectedSignal): void {
    this.candidates.push(signal);
  }

  /**
   * Return a deduplicated list of candidates.
   * Two candidates are considered duplicates when they share the same signal type
   * AND their content starts with the same 80-character prefix (case-insensitive).
   */
  deduplicate(): AutoDetectedSignal[] {
    const seen = new Set<string>();
    const unique: AutoDetectedSignal[] = [];

    for (const candidate of this.candidates) {
      const key = `${candidate.signal}::${candidate.content.slice(0, 80).toLowerCase().trim()}`;
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(candidate);
      }
    }

    return unique;
  }

  /**
   * Return only candidates whose confidence meets or exceeds the threshold.
   * Default threshold is 0.8.
   */
  getHighConfidence(threshold = 0.8): AutoDetectedSignal[] {
    return this.deduplicate().filter(c => c.confidence >= threshold);
  }

  clear(): void {
    this.candidates = [];
  }

  size(): number {
    return this.candidates.length;
  }
}