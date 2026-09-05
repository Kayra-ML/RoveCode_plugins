import type {
  LearningCandidate,
  LearningSignalType,
  PersonalEntryType,
} from "../types/index.js";

// ============================================================
// FACTORY
// ============================================================

/**
 * Create a LearningCandidate ready to be passed to PersonalUpdater.decide().
 *
 * The caller supplies the raw signal type, content, and optional metadata.
 * Confidence defaults are derived from the signal type when not provided.
 */
export function createLearningCandidate(
  signalType: LearningSignalType,
  content: string,
  options: {
    entryType: PersonalEntryType;
    tags?: string[];
    domain?: string;
    confidence?: number;
    sourceContext?: string;
  }
): LearningCandidate {
  const confidence = options.confidence ?? defaultConfidence(signalType);
  const id = `cand_${Math.random().toString(36).slice(2, 10)}`;

  return {
    id,
    signalType,
    proposedEntry: {
      type: options.entryType,
      content: content.trim(),
      tags: options.tags ?? [],
      domain: options.domain,
      confidence,
      strength: confidence * 0.8,
    },
    sourceContext: options.sourceContext ?? "",
    confidence,
    createdAt: new Date().toISOString(),
  };
}

// ============================================================
// CONFIDENCE DEFAULTS
// ============================================================

/**
 * Return a sensible default confidence value for each signal type.
 *
 * explicit-remember and verified-solution are the highest because
 * they represent deliberate, confirmed user intent.
 * Weaker signals like successful-workflow get a lower floor.
 */
function defaultConfidence(signalType: LearningSignalType): number {
  switch (signalType) {
    case "explicit-like":       return 0.85;
    case "explicit-dislike":    return 0.85;
    case "explicit-remember":   return 0.95;
    case "verified-solution":   return 1.0;
    case "repeated-preference": return 0.8;
    case "successful-workflow": return 0.75;
    default:                    return 0.7;
  }
}

// ============================================================
// SANITIZATION
// ============================================================

/**
 * Patterns that look like credentials or sensitive values.
 *
 * We err on the side of caution: long base64-like tokens, obvious
 * key/token prefixes, and IP addresses are all redacted.
 */
const CREDENTIAL_PATTERNS: RegExp[] = [
  // Common API key prefixes and adjacent tokens
  /\b(sk-|pk-|api[-_]key|apikey|token|secret|password|passwd|credential)[^\s]*/gi,
  // Long base64-like strings (≥40 chars)
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g,
  // IPv4 addresses
  /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
];

/**
 * Strip credential-like patterns from content before it enters the
 * learning pipeline.  Returns the sanitized string.
 */
export function sanitizeForLearning(content: string): string {
  let sanitized = content;
  for (const pattern of CREDENTIAL_PATTERNS) {
    // Reset lastIndex so repeated calls with global regexes behave correctly
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, "[REDACTED]");
  }
  return sanitized;
}

// ============================================================
// SIGNAL DETECTION
// ============================================================

/**
 * Inspect a free-form user message and return the strongest
 * LearningSignalType it contains, or null if none is detected.
 *
 * Matching is case-insensitive.  The order of checks matters:
 * more specific patterns (explicit-remember) are tested before
 * broader ones (explicit-like) to avoid false positives.
 */
export function detectSignals(message: string): LearningSignalType | null {
  const lower = message.toLowerCase();

  // "remember that", "always use", "note that", "save this"
  if (/\b(remember\s+(that|this)|always\s+(use|do)|note\s+that|save\s+this)\b/.test(lower)) {
    return "explicit-remember";
  }

  // Positive preference signals
  if (/\b(i\s+like|i\s+love|i\s+prefer|i\s+want|keep\s+it\s+like|this\s+is\s+great)\b/.test(lower)) {
    return "explicit-like";
  }

  // Negative preference signals
  if (/\b(i\s+dislike|i\s+hate|i\s+don'?t\s+like|avoid|never\s+do|stop\s+doing)\b/.test(lower)) {
    return "explicit-dislike";
  }

  return null;
}