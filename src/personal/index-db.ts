import { Database } from "bun:sqlite";
import { resolve, dirname } from "path";
import { mkdirSync } from "fs";
import type { PersonalEntry, PersonalEntryIndex, PersonalSkill } from "../types/index.js";

// ---------------------------------------------------------------------------
// TF-IDF helpers (module-level, pure functions)
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  const stopWords = new Set([
    "the","a","an","is","are","was","were","be","to","of",
    "in","on","at","by","for","with","and","or","but","not","this","that","it",
    "i","we","you","they","my","your","its","can","will","would","should","have",
    "has","had","do","does","did","from","up","down","out","so","if","as","than",
  ]);
  return text
    .toLowerCase()
    .split(/[\s\-_.,!?;:()\[\]{}"']+/)
    .filter((t) => t.length > 2 && !stopWords.has(t));
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  const dot = vecA.reduce((sum, a, i) => sum + a * (vecB[i] ?? 0), 0);
  const magA = Math.sqrt(vecA.reduce((sum, a) => sum + a * a, 0));
  const magB = Math.sqrt(vecB.reduce((sum, b) => sum + b * b, 0));
  return magA && magB ? dot / (magA * magB) : 0;
}

// ---------------------------------------------------------------------------
// Named entity list — tech terms that get a relevance boost when present in
// both query and entry.
// ---------------------------------------------------------------------------

const TECH_ENTITIES = new Set([
  "react","vue","angular","svelte","nextjs","nuxt","remix",
  "typescript","javascript","python","rust","go","java","kotlin","swift",
  "postgres","postgresql","mysql","sqlite","mongodb","redis","supabase",
  "docker","kubernetes","nginx","linux","windows","macos",
  "jwt","oauth","saml","csrf","xss","owasp",
  "rag","llm","gpt","claude","openai","anthropic","embedding","vector",
  "graphql","trpc","rest","grpc","websocket","http",
  "tailwind","css","sass","less","bootstrap",
  "prisma","drizzle","typeorm","sequelize","orm",
  "vitest","jest","playwright","cypress","testing",
  "github","gitlab","ci","cd","devops","terraform","ansible",
  "expo","reactnative","flutter","android","ios",
]);

// ---------------------------------------------------------------------------
// Synonym expansion — query terms are expanded with synonyms so semantically
// equivalent vocabulary in entries still matches.
// ---------------------------------------------------------------------------

const SYNONYMS: Record<string, string[]> = {
  "sidebar":        ["navigation", "nav", "panel", "drawer"],
  "narrow":         ["compact", "slim", "thin", "minimal"],
  "authentication": ["auth", "login", "signin", "sign-in"],
  "database":       ["db", "storage", "persistence", "datastore"],
  "button":         ["btn", "cta", "action", "clickable"],
  "error":          ["bug", "issue", "fault", "failure", "exception"],
  "performance":    ["speed", "fast", "slow", "latency", "optimization"],
  "component":      ["widget", "element", "module", "block"],
  "layout":         ["structure", "grid", "flex", "arrangement"],
  "dark":           ["night", "dim", "low-light"],
  "color":          ["colour", "hue", "palette", "theme"],
  "mobile":         ["phone", "responsive", "touch", "tablet"],
  "deploy":         ["release", "publish", "ship", "production"],
  "test":           ["spec", "check", "verify", "assert"],
  "api":            ["endpoint", "route", "service", "interface"],
  "ownership":      ["borrow", "lifetime", "borrow-checker"],
  "async":          ["await", "promise", "concurrent", "parallel"],
  // reverse direction entries (common abbreviations → full terms)
  "auth":           ["authentication", "authorization", "login"],
  "db":             ["database", "storage", "persistence"],
  "nav":            ["navigation", "sidebar", "menu"],
};

/** Expand a list of tokens with their synonyms (no duplicates). */
function expandWithSynonyms(tokens: string[]): string[] {
  const expanded = new Set(tokens);
  for (const t of tokens) {
    const syns = SYNONYMS[t];
    if (syns) {
      for (const s of syns) expanded.add(s);
    }
  }
  return Array.from(expanded);
}

// ---------------------------------------------------------------------------
// In-memory TF-IDF cache (per user, invalidated on rebuild)
// ---------------------------------------------------------------------------

interface TfIdfCache {
  /** entryId → { term → tfidf weight } */
  entryVectors: Map<string, Map<string, number>>;
  /** term → document frequency count */
  df: Map<string, number>;
  /** total number of indexed entries */
  docCount: number;
}

function buildTfIdfCache(
  allRows: { entryId: string; term: string; tf: number }[]
): TfIdfCache {
  // Group by entryId
  const byEntry = new Map<string, Map<string, number>>();
  for (const row of allRows) {
    let m = byEntry.get(row.entryId);
    if (!m) { m = new Map(); byEntry.set(row.entryId, m); }
    m.set(row.term, row.tf);
  }

  const docCount = byEntry.size;

  // Compute DF: how many documents contain each term
  const df = new Map<string, number>();
  for (const termMap of byEntry.values()) {
    for (const term of termMap.keys()) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }

  // Compute TF-IDF vectors: tfidf = tf * log((N + 1) / (df + 1)) + 1 (smoothed)
  const entryVectors = new Map<string, Map<string, number>>();
  for (const [entryId, termMap] of byEntry) {
    const vec = new Map<string, number>();
    for (const [term, tf] of termMap) {
      const idf = Math.log((docCount + 1) / ((df.get(term) ?? 0) + 1)) + 1;
      vec.set(term, tf * idf);
    }
    entryVectors.set(entryId, vec);
  }

  return { entryVectors, df, docCount };
}

/** Compute TF-IDF cosine similarity between a query token list and an entry vector. */
function tfidfCosineSimilarity(
  queryTokens: string[],
  entryVector: Map<string, number>,
  df: Map<string, number>,
  docCount: number
): number {
  if (queryTokens.length === 0 || entryVector.size === 0) return 0;

  // Build query TF-IDF vector (same smoothed IDF formula)
  const qCount = new Map<string, number>();
  for (const t of queryTokens) qCount.set(t, (qCount.get(t) ?? 0) + 1);
  const qTotal = queryTokens.length;

  const queryVec = new Map<string, number>();
  for (const [term, count] of qCount) {
    const idf = Math.log((docCount + 1) / ((df.get(term) ?? 0) + 1)) + 1;
    queryVec.set(term, (count / qTotal) * idf);
  }

  // Unified term space
  const terms = new Set([...queryVec.keys(), ...entryVector.keys()]);
  const vecQ: number[] = [];
  const vecE: number[] = [];
  for (const t of terms) {
    vecQ.push(queryVec.get(t) ?? 0);
    vecE.push(entryVector.get(t) ?? 0);
  }

  return cosineSimilarity(vecQ, vecE);
}

// ---------------------------------------------------------------------------
// Temporal scoring helper
// ---------------------------------------------------------------------------

/** Returns a multiplier based on how recently the entry was updated. */
function temporalMultiplier(updatedAt: string): number {
  const now = Date.now();
  const updated = new Date(updatedAt).getTime();
  if (isNaN(updated)) return 1.0;
  const ageDays = (now - updated) / (1000 * 60 * 60 * 24);

  if (ageDays <= 7)  return 1.20;  // used in last week  → +20 %
  if (ageDays <= 30) return 1.10;  // used in last month → +10 %
  if (ageDays > 90)  return 0.90;  // older than 3 months → −10 %
  return 1.0;
}

export class PersonalIndexDb {
  private db: Database;
  private ready = false;
  /** In-memory TF-IDF cache, keyed by userId. Invalidated on upsert/rebuild. */
  private tfidfCache: Map<string, TfIdfCache> = new Map();

  constructor(dbPath: string) {
    const absPath = resolve(dbPath);
    // Ensure parent directory exists before SQLite tries to create the file
    mkdirSync(dirname(absPath), { recursive: true });
    this.db = new Database(absPath);
  }

  init(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS entries (
        entryId TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        type TEXT NOT NULL,
        domain TEXT,
        tags TEXT,
        keywords TEXT,
        confidence REAL,
        strength REAL,
        lineStart INTEGER,
        lineEnd INTEGER,
        updatedAt TEXT
      )
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_userId ON entries(userId)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_type ON entries(type)`);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_domain ON entries(domain)`);

    this.db.run(`
      CREATE TABLE IF NOT EXISTS term_freq (
        entryId TEXT NOT NULL,
        userId  TEXT NOT NULL,
        term    TEXT NOT NULL,
        tf      REAL NOT NULL,
        PRIMARY KEY (entryId, term)
      )
    `);
    this.db.run(`CREATE INDEX IF NOT EXISTS idx_term ON term_freq(term, userId)`);

    this.ready = true;
  }

  upsert(entry: PersonalEntry, userId: string, lineStart: number, lineEnd: number): void {
    const keywords = [
      ...entry.tags,
      entry.domain ?? "",
      entry.type,
      entry.content.toLowerCase().split(/\s+/).slice(0, 20).join(" "),
    ]
      .join(" ")
      .trim();

    this.db.run(
      `INSERT OR REPLACE INTO entries 
       (entryId, userId, type, domain, tags, keywords, confidence, strength, lineStart, lineEnd, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entry.id,
        userId,
        entry.type,
        entry.domain ?? null,
        JSON.stringify(entry.tags),
        keywords,
        entry.confidence,
        entry.strength,
        lineStart,
        lineEnd,
        entry.updatedAt,
      ]
    );

    // Build TF-IDF index from the full content + tags for semantic scoring
    const indexText = [entry.content, ...entry.tags].join(" ");
    this.indexTerms(entry.id, userId, indexText);

    // Invalidate the in-memory TF-IDF cache so the next query rebuilds it
    this.tfidfCache.delete(userId);
  }

  // -------------------------------------------------------------------------
  // TF-IDF indexing
  // -------------------------------------------------------------------------

  private indexTerms(entryId: string, userId: string, content: string): void {
    // Remove existing term rows for this entry (handles re-index on update)
    this.db.run(`DELETE FROM term_freq WHERE entryId = ?`, [entryId]);

    const tokens = tokenize(content);
    if (tokens.length === 0) return;

    // Count raw term frequencies
    const counts = new Map<string, number>();
    for (const t of tokens) {
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }

    // TF = count / total terms; store each term row
    const total = tokens.length;
    const insert = this.db.prepare(
      `INSERT OR REPLACE INTO term_freq (entryId, userId, term, tf) VALUES (?, ?, ?, ?)`
    );
    for (const [term, count] of counts) {
      insert.run(entryId, userId, term, count / total);
    }
    insert.finalize();
  }

  /**
   * Lazily build (or return cached) TF-IDF index for a user.
   * Bulk-loads all term_freq rows in one query so findRelevant never issues
   * a per-entry DB round-trip.
   */
  private getTfIdfCache(userId: string): TfIdfCache {
    const cached = this.tfidfCache.get(userId);
    if (cached) return cached;

    const rows = this.db
      .query(`SELECT entryId, term, tf FROM term_freq WHERE userId = ?`)
      .all(userId) as { entryId: string; term: string; tf: number }[];

    const cache = buildTfIdfCache(rows);
    this.tfidfCache.set(userId, cache);
    return cache;
  }

  // -------------------------------------------------------------------------

  delete(entryId: string, userId?: string): void {
    this.db.run(`DELETE FROM entries WHERE entryId = ?`, [entryId]);
    this.db.run(`DELETE FROM term_freq WHERE entryId = ?`, [entryId]);
    // Invalidate cache — we may not know the userId here, so clear all
    if (userId) {
      this.tfidfCache.delete(userId);
    } else {
      this.tfidfCache.clear();
    }
  }

  findByUser(userId: string): PersonalEntryIndex[] {
    return this.db
      .query(
        `SELECT * FROM entries WHERE userId = ? ORDER BY strength DESC, confidence DESC`
      )
      .all(userId) as PersonalEntryIndex[];
  }

  findRelevant(
    userId: string,
    keywords: string[],
    domain?: string,
    limit = 10
  ): PersonalEntryIndex[] {
    if (keywords.length === 0) return this.findByUser(userId).slice(0, limit);

    // Load all rows for this user, then score in JS for keyword overlap.
    // A full-text-search extension isn't guaranteed in Bun's bundled SQLite,
    // so we keep the scoring logic here where it's testable and transparent.
    const rows = this.db
      .query(`SELECT * FROM entries WHERE userId = ?`)
      .all(userId) as PersonalEntryIndex[];

    // Entry type → domain affinity: entries with no explicit domain but a
    // type that belongs to a specific domain are treated as soft domain matches.
    const TYPE_DOMAIN_AFFINITY: Record<string, string[]> = {
      "design-preference":    ["web-design"],
      "working-preference":   [], // agnostic — belongs to any domain
      "technical-preference": [], // agnostic
      "workflow-preference":  [], // agnostic
      "successful-pattern":   [], // agnostic
      "avoided-pattern":      [], // agnostic
      "solved-problem":       [], // domain-specific, no affinity fallback
    };

    // --- Prepare query tokens once (with synonym expansion) ----------------
    const rawQueryTokens = keywords.flatMap((kw) => tokenize(kw));
    const expandedQueryTokens = expandWithSynonyms(rawQueryTokens);

    // Identify which tech entities appear in the query
    const queryEntities = new Set(expandedQueryTokens.filter((t) => TECH_ENTITIES.has(t)));

    // Lazily load the bulk TF-IDF cache for this user (one DB round-trip)
    const cache = this.getTfIdfCache(userId);

    const scored = rows.map((row) => {
      const rowKeywords = row.keywords.toLowerCase();

      // --- 1. Keyword overlap score (original signal, kept for recall) ------
      // Also check synonym-expanded query terms against the stored keyword string.
      const keywordScore = expandedQueryTokens.reduce((acc, kw) => {
        return acc + (rowKeywords.includes(kw) ? 1 : 0);
      }, 0);

      // --- 2. Domain scoring ------------------------------------------------
      // +3  exact explicit match       → strong signal
      // +1  type affinity (null domain, type implies this domain) → soft match
      //  0  null domain, agnostic type → neutral
      // -3  explicit different domain  → cross-domain noise penalty
      let domainScore = 0;
      if (domain) {
        if (row.domain === domain) {
          domainScore = 3; // explicit match
        } else if (row.domain && row.domain !== domain) {
          domainScore = -3; // explicit mismatch
        } else if (!row.domain) {
          const affinity = TYPE_DOMAIN_AFFINITY[row.type] ?? [];
          if (affinity.includes(domain)) {
            domainScore = 1; // soft domain match via type
          }
        }
      }

      // --- 3. Quality signal -----------------------------------------------
      const qualityBoost = (row.confidence + row.strength) * 0.25;

      // --- 4. TF-IDF cosine similarity (IDF-weighted, bulk cache) ----------
      const entryVector = cache.entryVectors.get(row.entryId);
      const semanticScore = entryVector
        ? tfidfCosineSimilarity(
            expandedQueryTokens,
            entryVector,
            cache.df,
            cache.docCount
          )
        : 0;

      // --- 5. Named entity boost -------------------------------------------
      // When a recognised tech entity appears in both query and entry, multiply
      // the base score by 1.5 per matching entity (capped to avoid runaway).
      let entityMultiplier = 1.0;
      if (queryEntities.size > 0 && entryVector) {
        let entityHits = 0;
        for (const entity of queryEntities) {
          if (entryVector.has(entity)) entityHits++;
        }
        // Each hit → ×1.5, but cap at ×3 (two hits)
        entityMultiplier = Math.min(1.0 + entityHits * 0.5, 3.0);
      }

      // --- 6. Temporal multiplier ------------------------------------------
      const temporal = temporalMultiplier(row.updatedAt);

      // Combine: keyword + domain + semantic (weighted ×3 now that IDF improves it)
      // then apply entity boost and temporal multiplier.
      const base = keywordScore + domainScore + semanticScore * 3 + qualityBoost;
      const total = base * entityMultiplier * temporal;

      return { row, score: total };
    });

    return scored
      // Require at least one positive signal: keyword/synonym hit, domain match, or type affinity
      .filter((s) => {
        const rowKeywords = s.row.keywords.toLowerCase();
        const hasKeywordHit = expandedQueryTokens.some((kw) =>
          rowKeywords.includes(kw)
        );
        const hasExplicitDomainMatch = domain && s.row.domain === domain;
        const affinity = TYPE_DOMAIN_AFFINITY[s.row.type] ?? [];
        const hasTypeAffinity = domain && !s.row.domain && affinity.includes(domain);
        return (hasKeywordHit || hasExplicitDomainMatch || hasTypeAffinity) && s.score > 0;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.row);
  }

  rebuildFromSkill(skill: PersonalSkill): void {
    // Wipe all index rows for this user and re-index from scratch.
    // Line numbers are approximated because we don't store actual byte offsets.
    this.db.run(`DELETE FROM entries WHERE userId = ?`, [skill.userId]);
    this.db.run(`DELETE FROM term_freq WHERE userId = ?`, [skill.userId]);
    // Invalidate the in-memory TF-IDF cache so the next query rebuilds it
    this.tfidfCache.delete(skill.userId);

    let lineNum = 10; // offset past the file header
    for (const entry of skill.entries) {
      const contentLineCount = entry.content.split("\n").length;
      // 1 metadata comment + content lines + 1 closing comment
      const lineEnd = lineNum + contentLineCount + 2;
      this.upsert(entry, skill.userId, lineNum, lineEnd);
      lineNum = lineEnd + 2; // blank line between entries
    }
  }

  close(): void {
    this.db.close();
  }
}