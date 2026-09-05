import { join, resolve } from "path";
import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import type { PersonalSkill, PersonalEntry, SolvedProblemEntry, PersonalEntryType } from "../types/index.js";

// ============================================================
// ID GENERATION (exported so other modules can use it)
// ============================================================

export function generateId(prefix = "e"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================
// SECTION HEADING <-> PersonalEntryType MAPPING
// ============================================================

const SECTION_TO_TYPE: Record<string, PersonalEntryType> = {
  "Working Preferences": "working-preference",
  "Design Preferences": "design-preference",
  "Technical Preferences": "technical-preference",
  "Solved Problems": "solved-problem",
  "Workflow Preferences": "workflow-preference",
  "Avoided Patterns": "avoided-pattern",
  "Successful Patterns": "successful-pattern",
};

const TYPE_TO_SECTION: Record<PersonalEntryType, string> = {
  "working-preference": "Working Preferences",
  "design-preference": "Design Preferences",
  "technical-preference": "Technical Preferences",
  "solved-problem": "Solved Problems",
  "workflow-preference": "Workflow Preferences",
  "avoided-pattern": "Avoided Patterns",
  "successful-pattern": "Successful Patterns",
};

// The canonical section order used when writing the file
const SECTION_ORDER: PersonalEntryType[] = [
  "working-preference",
  "design-preference",
  "technical-preference",
  "solved-problem",
  "workflow-preference",
  "avoided-pattern",
  "successful-pattern",
];

// ============================================================
// PARSER
// ============================================================

/**
 * Parse a complete skill.md text into a PersonalSkill object.
 *
 * The format is:
 *
 *   # Personal Skill
 *   <!-- version: 1 -->
 *   <!-- updated: <ISO> -->
 *
 *   ## Section Name
 *
 *   <!-- entry id:xxx tags:a,b domain:y confidence:0.9 strength:0.8 created:<ISO> updated:<ISO> usage:3 -->
 *   Content text here
 *   <!-- /entry -->
 */
export function parseSkillFile(userId: string, text: string): PersonalSkill {
  const lines = text.split("\n");

  // Defaults
  let version = 1;
  let updatedAt = new Date().toISOString();
  const entries: PersonalEntry[] = [];

  // Scan header for version/updatedAt
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const versionMatch = lines[i].match(/<!--\s*version:\s*(\d+)\s*-->/);
    if (versionMatch) {
      version = parseInt(versionMatch[1], 10);
    }
    const updatedMatch = lines[i].match(/<!--\s*updated:\s*([^\s]+)\s*-->/);
    if (updatedMatch) {
      updatedAt = updatedMatch[1];
    }
  }

  // State machine: track current section type
  let currentType: PersonalEntryType | null = null;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Detect section heading: ## Section Name
    const headingMatch = line.match(/^##\s+(.+)$/);
    if (headingMatch) {
      const sectionName = headingMatch[1].trim();
      currentType = SECTION_TO_TYPE[sectionName] ?? null;
      i++;
      continue;
    }

    // Detect entry opening comment
    // <!-- entry id:xxx tags:a,b domain:y confidence:0.9 strength:0.8 created:<ISO> updated:<ISO> usage:3 -->
    const entryOpenMatch = line.match(/^<!--\s*entry\s+(.+?)\s*-->$/);
    if (entryOpenMatch && currentType !== null) {
      const metaStr = entryOpenMatch[1];
      const meta = parseEntryMeta(metaStr);

      // Collect content lines until <!-- /entry -->
      const contentLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^<!--\s*\/entry\s*-->$/)) {
        contentLines.push(lines[i]);
        i++;
      }
      // Skip the <!-- /entry --> line
      if (i < lines.length) i++;

      // Trim leading/trailing blank lines from content
      while (contentLines.length > 0 && contentLines[0].trim() === "") contentLines.shift();
      while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === "") contentLines.pop();

      const content = contentLines.join("\n");

      const entry: PersonalEntry = {
        id: meta.id ?? generateId("e"),
        type: currentType,
        content,
        tags: meta.tags ?? [],
        domain: meta.domain,
        confidence: meta.confidence ?? 0.7,
        strength: meta.strength ?? 0.5,
        createdAt: meta.created ?? new Date().toISOString(),
        updatedAt: meta.updated ?? new Date().toISOString(),
        usageCount: meta.usage ?? 1,
      };

      entries.push(entry);
      continue;
    }

    i++;
  }

  return { userId, version, updatedAt, entries };
}

/**
 * Parse the attribute string inside <!-- entry ... -->
 * Handles: id:xxx tags:a,b domain:y confidence:0.9 strength:0.8 created:<ISO> updated:<ISO> usage:3
 * ISO timestamps contain colons, so we tokenize on space-boundaries of known keys.
 */
function parseEntryMeta(metaStr: string): {
  id?: string;
  tags?: string[];
  domain?: string;
  confidence?: number;
  strength?: number;
  created?: string;
  updated?: string;
  usage?: number;
} {
  const result: Record<string, string> = {};

  // Known keys in order of appearance
  const knownKeys = ["id", "tags", "domain", "confidence", "strength", "created", "updated", "usage"];

  // Build a regex that matches key:value where value runs until the next known key or end
  // We use a lookahead for each known key to split properly
  const keyPattern = knownKeys.join("|");
  const tokenRegex = new RegExp(`(${keyPattern}):(.+?)(?=\\s+(?:${keyPattern}):|$)`, "g");

  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(metaStr)) !== null) {
    result[match[1]] = match[2].trim();
  }

  return {
    id: result["id"],
    tags: result["tags"] ? result["tags"].split(",").map((t) => t.trim()).filter(Boolean) : [],
    domain: result["domain"],
    confidence: result["confidence"] !== undefined ? parseFloat(result["confidence"]) : undefined,
    strength: result["strength"] !== undefined ? parseFloat(result["strength"]) : undefined,
    created: result["created"],
    updated: result["updated"],
    usage: result["usage"] !== undefined ? parseInt(result["usage"], 10) : undefined,
  };
}

// ============================================================
// SERIALIZER
// ============================================================

/**
 * Serialize a PersonalSkill back to the skill.md markdown format.
 */
export function serializeSkillFile(skill: PersonalSkill): string {
  const lines: string[] = [];

  // Header
  lines.push("# Personal Skill");
  lines.push(`<!-- version: ${skill.version} -->`);
  lines.push(`<!-- updated: ${skill.updatedAt} -->`);

  // Group entries by type
  const byType = new Map<PersonalEntryType, PersonalEntry[]>();
  for (const type of SECTION_ORDER) {
    byType.set(type, []);
  }
  for (const entry of skill.entries) {
    const bucket = byType.get(entry.type);
    if (bucket) {
      bucket.push(entry);
    } else {
      // Unknown type — put into working-preference bucket as fallback
      byType.get("working-preference")!.push(entry);
    }
  }

  // Write sections in canonical order
  for (const type of SECTION_ORDER) {
    const sectionName = TYPE_TO_SECTION[type];
    lines.push("");
    lines.push(`## ${sectionName}`);

    const sectionEntries = byType.get(type) ?? [];
    for (const entry of sectionEntries) {
      lines.push("");
      lines.push(serializeEntryMeta(entry));
      lines.push(entry.content);
      lines.push("<!-- /entry -->");
    }
  }

  lines.push(""); // trailing newline
  return lines.join("\n");
}

/**
 * Build the <!-- entry ... --> metadata comment line for an entry.
 */
function serializeEntryMeta(entry: PersonalEntry): string {
  const tagsStr = entry.tags.join(",");
  const domainPart = entry.domain ? ` domain:${entry.domain}` : "";
  return (
    `<!-- entry id:${entry.id}` +
    ` tags:${tagsStr}` +
    `${domainPart}` +
    ` confidence:${entry.confidence}` +
    ` strength:${entry.strength}` +
    ` created:${entry.createdAt}` +
    ` updated:${entry.updatedAt}` +
    ` usage:${entry.usageCount}` +
    ` -->`
  );
}

// ============================================================
// STORAGE CLASS
// ============================================================

export class PersonalStorage {
  private usersDir: string;

  constructor(usersDir: string) {
    this.usersDir = resolve(usersDir);
  }

  private userDir(userId: string): string {
    const safe = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return join(this.usersDir, safe);
  }

  skillPath(userId: string): string {
    return join(this.userDir(userId), "skill.md");
  }

  async exists(userId: string): Promise<boolean> {
    return existsSync(this.skillPath(userId));
  }

  async load(userId: string): Promise<PersonalSkill | null> {
    const path = this.skillPath(userId);
    if (!existsSync(path)) return null;
    const text = await readFile(path, "utf-8");
    return parseSkillFile(userId, text);
  }

  async save(skill: PersonalSkill): Promise<void> {
    const dir = this.userDir(skill.userId);
    await mkdir(dir, { recursive: true });
    const text = serializeSkillFile(skill);
    await writeFile(this.skillPath(skill.userId), text, "utf-8");
  }

  async createEmpty(userId: string): Promise<PersonalSkill> {
    const skill: PersonalSkill = {
      userId,
      version: 1,
      updatedAt: new Date().toISOString(),
      entries: [],
    };
    await this.save(skill);
    return skill;
  }

  async loadOrCreate(userId: string): Promise<PersonalSkill> {
    return (await this.load(userId)) ?? (await this.createEmpty(userId));
  }
}