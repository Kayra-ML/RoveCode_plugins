import { join } from "path";
import { PersonalStorage } from "./storage.js";
import { PersonalIndexDb } from "./index-db.js";
import { PersonalUpdater } from "./updater.js";
import type {
  PersonalSkill,
  PersonalEntry,
  LearningCandidate,
  UpdateDecision,
} from "../types/index.js";

export class PersonalManager {
  private storage: PersonalStorage;
  private indexDb: PersonalIndexDb;
  private updater: PersonalUpdater;
  private skillCache: Map<string, PersonalSkill> = new Map();

  constructor(dataDir: string) {
    this.storage = new PersonalStorage(join(dataDir, "users"));
    this.indexDb = new PersonalIndexDb(join(dataDir, "index.db"));
    this.updater = new PersonalUpdater();
    this.indexDb.init();
  }

  /**
   * Load a user's PersonalSkill, using an in-memory cache to avoid
   * repeated disk reads within the same process lifetime.
   */
  async getSkill(userId: string): Promise<PersonalSkill> {
    const cached = this.skillCache.get(userId);
    if (cached) return cached;

    const skill = await this.storage.loadOrCreate(userId);
    this.skillCache.set(userId, skill);
    return skill;
  }

  /**
   * Return the full PersonalEntry objects that best match the supplied keywords
   * and optional domain, using the SQLite index for fast lookup and falling back
   * to a linear scan when the index is empty.
   */
  async findRelevantEntries(
    userId: string,
    keywords: string[],
    domain?: string,
    limit = 8
  ): Promise<PersonalEntry[]> {
    const skill = await this.getSkill(userId);

    const indexResults = this.indexDb.findRelevant(userId, keywords, domain, limit);

    if (indexResults.length > 0) {
      // The index only stores lightweight metadata; hydrate back to full entries.
      const entryMap = new Map(skill.entries.map((e) => [e.id, e]));
      return indexResults
        .map((r) => entryMap.get(r.entryId))
        .filter((e): e is PersonalEntry => e !== undefined);
    }

    // Index populated but no relevant results found (domain mismatch or no keyword hit).
    // Check if there are ANY entries for this user in the index.
    const userHasIndexedEntries = this.indexDb.findByUser(userId).length > 0;
    if (userHasIndexedEntries) {
      // Index is populated but filtered everything out — return empty, not a dump.
      return [];
    }

    // Index genuinely not populated yet — fall back to a domain-filtered linear scan.
    return skill.entries
      .filter((e) => {
        if (!domain) return true;
        // Include entries matching the domain, or entries with no domain (agnostic).
        return !e.domain || e.domain === domain;
      })
      .slice(0, limit);
  }

  /**
   * Run the full learn/decide/apply/save cycle for a single LearningCandidate.
   *
   * Returns the decision that was made and whether the skill was actually updated.
   */
  async applyLearningCandidate(
    userId: string,
    candidate: LearningCandidate
  ): Promise<{ decision: UpdateDecision; updated: boolean }> {
    const skill = await this.getSkill(userId);
    const decision = this.updater.decide(candidate, skill.entries);

    if (decision.operation === "IGNORE") {
      return { decision, updated: false };
    }

    let updated = this.updater.apply(skill, candidate, decision);
    updated = this.updater.prune(updated);

    await this.storage.save(updated);
    this.indexDb.rebuildFromSkill(updated);
    this.skillCache.set(userId, updated);

    return { decision, updated: true };
  }

  /**
   * Rebuild the SQLite index from the persisted skill file.
   * Useful after manual edits to the skill.md or after a crash
   * left the index out of sync.
   */
  async rebuildIndex(userId: string): Promise<void> {
    const skill = await this.getSkill(userId);
    this.indexDb.rebuildFromSkill(skill);
  }

  /**
   * Evict a user's skill from the in-process cache so the next read
   * loads fresh data from disk.
   */
  invalidateCache(userId: string): void {
    this.skillCache.delete(userId);
  }

  close(): void {
    this.indexDb.close();
  }
}