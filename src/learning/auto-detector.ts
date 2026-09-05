import type { LearningSignalType, PersonalEntryType, Domain } from "../types/index.js";

// ============================================================
// PUBLIC INTERFACES
// ============================================================

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

export interface AutoDetectedSignal {
  signal: LearningSignalType;
  content: string;
  entryType: PersonalEntryType;
  domain?: string;
  confidence: number; // 0-1
  reason: string;
}

// ============================================================
// DOMAIN KEYWORD MAP
// ============================================================

const DOMAIN_KEYWORDS: Array<{ domain: Domain; keywords: RegExp }> = [
  { domain: "rust",           keywords: /\b(rust|cargo|clippy|tokio|borrow|lifetime|ownership|trait|enum)\b/i },
  { domain: "web-design",     keywords: /\b(ui|css|layout|color|typography|animation|dashboard|landing|tailwind|sass|styled)\b/i },
  { domain: "backend",        keywords: /\b(api|server|express|fastify|hono|endpoint|rest|graphql|middleware|auth|node)\b/i },
  { domain: "database",       keywords: /\b(sql|postgres|mysql|sqlite|schema|migration|orm|drizzle|prisma|query|table|index)\b/i },
  { domain: "devops",         keywords: /\b(docker|ci|cd|deploy|container|kubernetes|k8s|secret|env|pipeline|github.?actions)\b/i },
  { domain: "testing",        keywords: /\b(test|vitest|jest|playwright|tdd|mock|coverage|spec|assertion|expect)\b/i },
  { domain: "security",       keywords: /\b(xss|csrf|jwt|token|auth|owasp|injection|vuln|sanitize|encrypt)\b/i },
  { domain: "mobile",         keywords: /\b(react.?native|ios|android|expo|navigation|offline|mobile|app.?store)\b/i },
  { domain: "automation",     keywords: /\b(workflow|scrape|schedule|cron|transform|automate|pipeline|webhook)\b/i },
  { domain: "ai-engineering",  keywords: /\b(llm|rag|embed|prompt|agent|openai|anthropic|langchain|vector|fine.?tun)\b/i },
  { domain: "game-development", keywords: /\b(game|loop|physics|render|unity|godot|sprite|tilemap|shader|scene)\b/i },
];

// ============================================================
// ENTRY TYPE DETECTION
// ============================================================

function detectEntryType(content: string): PersonalEntryType {
  const lower = content.toLowerCase();
  if (/\b(ui|design|layout|color|typography|animation|visual|style|theme|spacing|font|icon|button|card)\b/.test(lower)) {
    return "design-preference";
  }
  if (/\b(code|pattern|architecture|refactor|abstract|interface|type|class|function|module|import|struct|enum)\b/.test(lower)) {
    return "technical-preference";
  }
  if (/\b(workflow|process|how to work|step|flow|procedure|approach|method|practice|habit)\b/.test(lower)) {
    return "workflow-preference";
  }
  if (/\b(bug|fix|error|issue|crash|solved|root.?cause|resolved|problem)\b/.test(lower)) {
    return "solved-problem";
  }
  return "working-preference";
}

// ============================================================
// DOMAIN DETECTION
// ============================================================

function detectDomain(content: string): string | undefined {
  for (const { domain, keywords } of DOMAIN_KEYWORDS) {
    if (keywords.test(content)) return domain;
  }
  return undefined;
}

// ============================================================
// PATTERN TABLES
// ============================================================

const EXPLICIT_LIKE_PATTERNS: RegExp[] = [
  /\bi\s+like\s+(this|that)\b/i,
  /\bkeep\s+it\s+like\s+this\b/i,
  /\bi\s+prefer\s+(this|that)\b/i,
  /\b(perfect,\s*keep|perfect!|exactly\s+perfect)\b/i,
  /\bexactly\s+what\s+i\s+wanted\b/i,
  /\bthis\s+is\s+great[,!.]?\s*keep\s+it\b/i,
  /\balways\s+do\s+it\s+this\s+way\b|\balways\s+do\s+(this|that)\s+way\b/i,
  /\bfrom\s+now\s+on\b/i,
  /\bsave\s+this\b/i,
];

const EXPLICIT_DISLIKE_PATTERNS: RegExp[] = [
  /\bi\s+(don'?t|do\s+not)\s+like\b/i,
  /\bavoid\s+(this|that|using)\b/i,
  /\bnever\s+do\s+this\b/i,
  /\bi\s+hate\s+when\b/i,
  /\bdon'?t\s+use\b/i,
  /\btoo\s+much\b/i,
  /\bless\s+\w+\s+please\b/i,
  /\bstop\s+using\b/i,
];

const EXPLICIT_REMEMBER_PATTERNS: RegExp[] = [
  /\bremember\s+(that|this)\b/i,
  /\bnote\s+that\b/i,
  /\bkeep\s+in\s+mind\b/i,
  /\bfor\s+future\s+reference\b/i,
  /\bgoing\s+forward\b/i,
  /\balways\s+use\b/i,
];

// ============================================================
// VERIFIED-SOLUTION DETECTION (assistant turn)
// ============================================================

function isVerifiedSolution(
  turn: ConversationTurn,
  previousTurns: ConversationTurn[]
): boolean {
  if (turn.role !== "assistant") return false;

  // Must contain code or solution keywords
  const hasSolutionKeywords = /```|fixed|resolved|working\s+now|this\s+works|solution/i.test(turn.content);
  if (!hasSolutionKeywords) return false;

  // Check if preceding user turn described a problem
  const prevUserTurns = previousTurns.filter(t => t.role === "user");
  if (prevUserTurns.length === 0) return false;

  const lastUserMsg = prevUserTurns[prevUserTurns.length - 1].content.toLowerCase();
  const isProblemContext =
    /\b(error|bug|broken|not\s+working|issue|problem|fail|crash|wrong|doesn'?t\s+work)\b/.test(lastUserMsg) ||
    // Test pass patterns in either turn
    /\bpass|\bpassing|\b✓|\b✅/.test(turn.content);

  return isProblemContext;
}

// ============================================================
// MAIN EXPORT
// ============================================================

/**
 * Inspect a single conversation turn and return all detected learning signals.
 * previousTurns is used for context (e.g. verified-solution detection).
 */
export function detectSignalsFromTurn(
  turn: ConversationTurn,
  previousTurns: ConversationTurn[] = []
): AutoDetectedSignal[] {
  const results: AutoDetectedSignal[] = [];
  const content = turn.content;

  // ---- User-only signals ----
  if (turn.role === "user") {
    const entryType = detectEntryType(content);
    const domain = detectDomain(content);

    // explicit-remember
    for (const pattern of EXPLICIT_REMEMBER_PATTERNS) {
      if (pattern.test(content)) {
        results.push({
          signal: "explicit-remember",
          content,
          entryType,
          domain,
          confidence: 1.0,
          reason: `Matched explicit-remember pattern: ${pattern.source}`,
        });
        break; // one explicit-remember per turn is enough
      }
    }

    // explicit-like (only if not already covered by a remember signal for same content)
    const hasRemember = results.some(r => r.signal === "explicit-remember");
    if (!hasRemember) {
      for (const pattern of EXPLICIT_LIKE_PATTERNS) {
        if (pattern.test(content)) {
          results.push({
            signal: "explicit-like",
            content,
            entryType,
            domain,
            confidence: 0.9,
            reason: `Matched explicit-like pattern: ${pattern.source}`,
          });
          break; // one explicit-like per turn
        }
      }
    }

    // explicit-dislike (independent — can coexist with remember/like for different parts,
    // but only add if not already present to avoid duplicates)
    const hasDislike = results.some(r => r.signal === "explicit-dislike");
    if (!hasDislike) {
      for (const pattern of EXPLICIT_DISLIKE_PATTERNS) {
        if (pattern.test(content)) {
          results.push({
            signal: "explicit-dislike",
            content,
            entryType,
            domain,
            confidence: 0.9,
            reason: `Matched explicit-dislike pattern: ${pattern.source}`,
          });
          break; // one explicit-dislike per turn
        }
      }
    }
  }

  // ---- Assistant-only signals ----
  if (turn.role === "assistant") {
    if (isVerifiedSolution(turn, previousTurns)) {
      results.push({
        signal: "verified-solution",
        content,
        entryType: "solved-problem",
        domain: detectDomain(content) ?? detectDomain(
          previousTurns.filter(t => t.role === "user").map(t => t.content).join(" ")
        ),
        confidence: 0.8,
        reason: "Assistant response contains solution markers and previous user turn described a problem",
      });
    }
  }

  return results;
}