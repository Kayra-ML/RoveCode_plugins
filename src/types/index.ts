// ============================================================
// CORE SHARED TYPES
// ============================================================

export type Domain =
  | "web-design"
  | "rust"
  | "automation"
  | "backend"
  | "database"
  | "devops"
  | "security"
  | "mobile"
  | "desktop"
  | "ai-engineering"
  | "testing"
  | "game-development"
  | "networking"
  | string; // extensible

// ============================================================
// PLUGIN TYPES
// ============================================================

export interface PluginManifest {
  id: string;
  name: string;
  description: string;
  version: string;
  domains: Domain[];
  /** Short phrases/keywords that trigger this plugin */
  activationHints: string[];
  /** Skill IDs included in this plugin */
  skills: string[];
  dependencies?: string[];
  optionalDependencies?: string[];
}

export interface SkillMetadata {
  id: string;
  pluginId: string;
  name: string;
  description: string;
  /** Keywords/phrases that activate this specific skill */
  activationSignals: string[];
  /** Skill IDs this should NOT be loaded alongside */
  exclusions?: string[];
  /** Approximate token cost of this skill's body */
  estimatedTokens: number;
  /** Related skill IDs */
  relatedSkills?: string[];
  /** 0-100, higher = load sooner */
  priority: number;
  /** Path to the skill body markdown file */
  bodyPath: string;
  /** Skill IDs that must be included when this skill is selected */
  requires?: string[];
  /** Skill IDs that are nice-to-have (included if budget allows) */
  suggests?: string[];
  /** Parent skill ID — inherits its activation signals */
  extends?: string;
}

export interface LoadedSkill extends SkillMetadata {
  body: string;
}

export interface Plugin {
  manifest: PluginManifest;
  skills: Map<string, SkillMetadata>;
  /** Directory path of the plugin */
  pluginDir: string;
}

// ============================================================
// PERSONAL SKILL TYPES
// ============================================================

export type PersonalEntryType =
  | "working-preference"
  | "design-preference"
  | "technical-preference"
  | "solved-problem"
  | "workflow-preference"
  | "avoided-pattern"
  | "successful-pattern";

export interface PersonalEntry {
  id: string;
  type: PersonalEntryType;
  content: string;
  tags: string[];
  domain?: Domain;
  confidence: number; // 0-1
  strength: number;   // 0-1, how often this has been reinforced
  createdAt: string;  // ISO date
  updatedAt: string;  // ISO date
  usageCount: number;
}

export interface SolvedProblemEntry extends PersonalEntry {
  type: "solved-problem";
  problemSignature: string;
  symptoms: string[];
  rootCause: string;
  verifiedSolution: string;
  verificationMethod: string;
  recurrence: number;
  lastUsed: string;
}

export interface PersonalSkill {
  userId: string;
  version: number;
  updatedAt: string;
  entries: PersonalEntry[];
}

// ============================================================
// ROUTING TYPES
// ============================================================

export interface RoutingRequest {
  userRequest: string;
  userId: string;
  projectContext?: string;
  /** Hint about known technologies in the project */
  techHints?: string[];
  /** Enable debug logging (default false — skips string allocations for log lines) */
  debug?: boolean;
}

export interface RoutingDecision {
  request: string;
  selectedPlugins: string[];
  selectedSkills: SkillMetadata[];
  rejectedSkills: Array<{ id: string; reason: string }>;
  selectedPersonalEntries: PersonalEntry[];
  estimatedTokens: number;
  tokenBudget: TokenBudget;
  debugLog: string[];
}

export interface TokenBudget {
  personal: number;
  domainSkills: number;
  projectContext: number;
  total: number;
}

// ============================================================
// CONTEXT ASSEMBLY TYPES
// ============================================================

export interface AssembledContext {
  systemContext: string;
  personalKnowledge: string;
  domainSkills: string;
  projectContext: string;
  estimatedTokens: number;
}

// ============================================================
// LEARNING TYPES
// ============================================================

export type LearningSignalType =
  | "explicit-like"
  | "explicit-dislike"
  | "explicit-remember"
  | "verified-solution"
  | "repeated-preference"
  | "successful-workflow";

export interface LearningCandidate {
  id: string;
  signalType: LearningSignalType;
  proposedEntry: Omit<PersonalEntry, "id" | "createdAt" | "updatedAt" | "usageCount">;
  sourceContext: string;
  confidence: number;
  createdAt: string;
}

export type UpdateOperation = "ADD" | "MERGE" | "STRENGTHEN" | "WEAKEN" | "REPLACE" | "IGNORE";

export interface UpdateDecision {
  operation: UpdateOperation;
  candidateId: string;
  targetEntryId?: string;
  reason: string;
}

// ============================================================
// INDEX TYPES (SQLite metadata layer)
// ============================================================

export interface PersonalEntryIndex {
  entryId: string;
  userId: string;
  type: PersonalEntryType;
  domain: string;
  tags: string;     // JSON array as string
  keywords: string; // space-separated
  confidence: number;
  strength: number;
  lineStart: number;
  lineEnd: number;
  updatedAt: string;
}
