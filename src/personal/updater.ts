import type {
  PersonalSkill,
  PersonalEntry,
  LearningCandidate,
  UpdateDecision,
} from "../types/index.js";

// Similarity threshold for deciding to MERGE vs ADD as a new entry
const MERGE_THRESHOLD = 0.65;

// ============================================================
// UPDATER
// ============================================================

export class PersonalUpdater {
  /**
   * Decide what operation to apply for a learning candidate against
   * the current set of existing entries.
   */
  decide(candidate: LearningCandidate, existing: PersonalEntry[]): UpdateDecision {
    const proposed = candidate.proposedEntry;

    const best = findBestMatch(proposed, existing);

    if (!best) {
      // No same-type entries at all — add if confidence is sufficient
      if (candidate.confidence >= 0.7) {
        return {
          operation: "ADD",
          candidateId: candidate.id,
          reason: "No similar entry exists; confidence sufficient.",
        };
      }
      return {
        operation: "IGNORE",
        candidateId: candidate.id,
        reason: `Confidence ${candidate.confidence} below threshold 0.7.`,
      };
    }

    const { entry: match, similarity } = best;

    if (similarity >= 0.9) {
      // Nearly identical entry already exists
      if (
        (["explicit-like", "verified-solution", "repeated-preference", "successful-workflow"] as const).includes(
          candidate.signalType as any
        )
      ) {
        return {
          operation: "STRENGTHEN",
          candidateId: candidate.id,
          targetEntryId: match.id,
          reason: `High similarity (${similarity.toFixed(2)}) with existing entry; strengthening.`,
        };
      }
      if (candidate.signalType === "explicit-dislike") {
        return {
          operation: "WEAKEN",
          candidateId: candidate.id,
          targetEntryId: match.id,
          reason: `High similarity; weakening due to negative signal.`,
        };
      }
      return {
        operation: "IGNORE",
        candidateId: candidate.id,
        targetEntryId: match.id,
        reason: "Nearly identical entry exists.",
      };
    }

    if (similarity >= MERGE_THRESHOLD) {
      // Similar enough to merge into the existing entry
      return {
        operation: "MERGE",
        candidateId: candidate.id,
        targetEntryId: match.id,
        reason: `Similar entry found (similarity ${similarity.toFixed(2)}); merging.`,
      };
    }

    // Distinct enough to be a new entry — but only if confidence warrants it
    if (candidate.confidence >= 0.7) {
      return {
        operation: "ADD",
        candidateId: candidate.id,
        reason: `Distinct from existing entries (best similarity ${similarity.toFixed(2)}); adding.`,
      };
    }

    return {
      operation: "IGNORE",
      candidateId: candidate.id,
      reason: `Confidence ${candidate.confidence} below threshold.`,
    };
  }

  /**
   * Apply an already-decided UpdateDecision to a PersonalSkill, returning
   * a new PersonalSkill (immutable update).
   */
  apply(
    skill: PersonalSkill,
    candidate: LearningCandidate,
    decision: UpdateDecision
  ): PersonalSkill {
    const entries = [...skill.entries];
    const now = new Date().toISOString();

    switch (decision.operation) {
      case "ADD": {
        const newEntry: PersonalEntry = {
          id: candidate.id,
          ...candidate.proposedEntry,
          createdAt: now,
          updatedAt: now,
          usageCount: 1,
        };
        entries.push(newEntry);
        break;
      }

      case "MERGE": {
        const idx = entries.findIndex((e) => e.id === decision.targetEntryId);
        if (idx >= 0) {
          const existing = entries[idx];
          entries[idx] = {
            ...existing,
            content: mergeContent(existing.content, candidate.proposedEntry.content),
            tags: Array.from(new Set([...existing.tags, ...candidate.proposedEntry.tags])),
            confidence: Math.max(existing.confidence, candidate.proposedEntry.confidence),
            strength: Math.min(1, existing.strength + 0.1),
            updatedAt: now,
            usageCount: existing.usageCount + 1,
          };
        }
        break;
      }

      case "STRENGTHEN": {
        const idx = entries.findIndex((e) => e.id === decision.targetEntryId);
        if (idx >= 0) {
          const increment = Math.min(0.05 + (candidate.confidence ?? 0.8) * 0.15, 0.25);
          entries[idx] = {
            ...entries[idx],
            strength: Math.min(1, entries[idx].strength + increment),
            confidence: Math.min(1, entries[idx].confidence + 0.05),
            usageCount: entries[idx].usageCount + 1,
            updatedAt: now,
          };
        }
        break;
      }

      case "WEAKEN": {
        const idx = entries.findIndex((e) => e.id === decision.targetEntryId);
        if (idx >= 0) {
          const weakened: PersonalEntry = {
            ...entries[idx],
            strength: Math.max(0, entries[idx].strength - 0.2),
            updatedAt: now,
          };
          if (weakened.strength <= 0) {
            // Drop entries that have been completely weakened
            entries.splice(idx, 1);
          } else {
            entries[idx] = weakened;
          }
        }
        break;
      }

      case "REPLACE": {
        const idx = entries.findIndex((e) => e.id === decision.targetEntryId);
        if (idx >= 0) {
          entries[idx] = {
            id: decision.targetEntryId!,
            ...candidate.proposedEntry,
            createdAt: entries[idx].createdAt,
            updatedAt: now,
            usageCount: entries[idx].usageCount + 1,
          };
        }
        break;
      }

      case "IGNORE":
      default:
        // Nothing to do
        break;
    }

    // Contradiction detection for explicit-like / explicit-remember signals
    if (
      candidate.signalType === "explicit-like" ||
      candidate.signalType === "explicit-remember"
    ) {
      const OPPOSING_PAIRS: [string, string][] = [
        ["dark", "light"],
        ["compact", "spacious"],
        ["minimal", "rich"],
        ["simple", "complex"],
        ["narrow", "wide"],
      ];
      const incomingContent = candidate.proposedEntry.content.toLowerCase();
      const incomingDomain = candidate.proposedEntry.domain;
      const incomingType = candidate.proposedEntry.type;

      for (const [wordA, wordB] of OPPOSING_PAIRS) {
        const incomingHasA = incomingContent.includes(wordA);
        const incomingHasB = incomingContent.includes(wordB);
        if (!incomingHasA && !incomingHasB) continue;

        const oppositeWord = incomingHasA ? wordB : wordA;

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (entry.type !== incomingType) continue;
          if (incomingDomain && entry.domain && entry.domain !== incomingDomain) continue;
          if (!entry.content.toLowerCase().includes(oppositeWord)) continue;

          // Found a contradiction — weaken the opposing entry
          const weakenedStrength = Math.max(0, entry.strength - 0.2);
          if (weakenedStrength <= 0) {
            entries.splice(i, 1);
            i--;
          } else {
            entries[i] = { ...entry, strength: weakenedStrength, updatedAt: now };
          }
        }
      }
    }

    return {
      ...skill,
      entries,
      version: skill.version + 1,
      updatedAt: now,
    };
  }

  /**
   * Remove entries below a minimum strength floor and cap the total count.
   * Returns a new PersonalSkill (immutable).
   */
  prune(skill: PersonalSkill): PersonalSkill {
    const MAX_ENTRIES = 200;
    const MIN_STRENGTH = 0.1;

    let entries = skill.entries.filter((e) => e.strength >= MIN_STRENGTH);

    if (entries.length > MAX_ENTRIES) {
      // Keep the highest-value entries (strength + confidence as combined score)
      entries = entries
        .sort((a, b) => b.strength + b.confidence - (a.strength + a.confidence))
        .slice(0, MAX_ENTRIES);
    }

    return { ...skill, entries, updatedAt: new Date().toISOString() };
  }
}

// ============================================================
// ID GENERATION (also exported from storage.ts; duplicated here
// as a local helper so updater.ts has no storage dependency)
// ============================================================

export function generateId(prefix = "e"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================
// PRIVATE HELPERS
// ============================================================

interface MatchResult {
  entry: PersonalEntry;
  similarity: number;
}

/**
 * Find the most similar existing entry to the proposed entry,
 * restricting comparison to entries of the same type.
 */
function findBestMatch(
  proposed: Omit<PersonalEntry, "id" | "createdAt" | "updatedAt" | "usageCount">,
  existing: PersonalEntry[]
): MatchResult | null {
  let best: MatchResult | null = null;

  for (const entry of existing) {
    if (entry.type !== proposed.type) continue;

    const sim = textSimilarity(
      normalizeText(entry.content),
      normalizeText(proposed.content)
    );

    if (!best || sim > best.similarity) {
      best = { entry, similarity: sim };
    }
  }

  return best;
}

/**
 * Lowercase, strip punctuation, collapse whitespace.
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Jaccard similarity over words longer than 3 characters.
 * Returns a value in [0, 1].
 */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.split(" ").filter((w) => w.length > 3));
  const wordsB = new Set(b.split(" ").filter((w) => w.length > 3));

  if (wordsA.size === 0 && wordsB.size === 0) return 1;
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return intersection / union;
}

/**
 * Merge two content strings.  When the incoming content is sufficiently
 * different from the existing one it is appended; otherwise the existing
 * (more established) content is kept as-is.
 * When 3 or more "Also:" chains accumulate, consolidate into a single
 * "Preferences:" line to keep content readable.
 */
function mergeContent(existing: string, incoming: string): string {
  const existingNorm = normalizeText(existing);
  const incomingNorm = normalizeText(incoming);

  if (textSimilarity(existingNorm, incomingNorm) > 0.8) {
    // Nearly identical — keep the established version
    return existing;
  }

  const merged = `${existing}\n\nAlso: ${incoming}`;

  // Count occurrences of "Also:" in the merged result
  const alsoCount = (merged.match(/Also:/g) ?? []).length;

  if (alsoCount >= 3) {
    // Consolidate: keep the first sentence, join all Also: parts
    const firstSentence = existing.split(/\n\nAlso:/)[0].trim();
    // Collect all Also: parts from existing plus the new incoming
    const allAlsoParts: string[] = [];
    const alsoRegex = /Also:\s*(.+?)(?=\n\nAlso:|$)/gs;
    let match: RegExpExecArray | null;
    while ((match = alsoRegex.exec(existing)) !== null) {
      allAlsoParts.push(match[1].trim());
    }
    allAlsoParts.push(incoming.trim());
    return `${firstSentence}\n\nPreferences: ${allAlsoParts.join("; ")}`;
  }

  return merged;
}

// ============================================================
// TIME-BASED DECAY
// ============================================================

const SIX_MONTHS_MS = 6 * 30 * 24 * 60 * 60 * 1000;
const THREE_MONTHS_MS = 3 * 30 * 24 * 60 * 60 * 1000;

/**
 * Apply time-based decay to a PersonalSkill's entries.
 * Entries that haven't been updated recently are weakened slightly.
 * Solved-problem entries are never decayed (they remain useful indefinitely).
 * Returns a new PersonalSkill (immutable).
 */
export function applyDecay(skill: PersonalSkill): PersonalSkill {
  const now = Date.now();
  const entries = skill.entries.map((entry) => {
    // Never decay solved-problem entries
    if (entry.type === "solved-problem") return entry;

    const age = now - new Date(entry.updatedAt).getTime();
    let { strength } = entry;

    if (age > SIX_MONTHS_MS && strength > 0.2) {
      strength = Math.round(strength * 0.95 * 100) / 100;
    } else if (age > THREE_MONTHS_MS && strength > 0.5) {
      strength = Math.round(strength * 0.97 * 100) / 100;
    } else {
      return entry; // no change
    }

    return { ...entry, strength };
  });

  return { ...skill, entries };
}