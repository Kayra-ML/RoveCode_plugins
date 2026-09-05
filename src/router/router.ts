import type {
  RoutingRequest,
  RoutingDecision,
  TokenBudget,
  SkillMetadata,
  PersonalEntry,
  Plugin,
} from "../types/index.js";
import type { PluginRegistry } from "../plugins/registry.js";
import type { PersonalManager } from "../personal/manager.js";
import { classifyRequest, extractKeywordsFromRequest, buildWordsAndNgrams } from "./classifier.js";
import { selectSkills } from "./skill-selector.js";

export const DEFAULT_BUDGET: TokenBudget = {
  personal: 800,
  domainSkills: 4000,
  projectContext: 1000,
  total: 6000,
};

export class Router {
  constructor(
    private registry: PluginRegistry,
    private personal: PersonalManager,
    private budget: TokenBudget = DEFAULT_BUDGET
  ) {}

  async route(req: RoutingRequest): Promise<RoutingDecision> {
    const debug = req.debug === true;
    const debugLog: string[] = [];

    // 1. Classify
    const classification = classifyRequest(req.userRequest);
    if (debug) {
      debugLog.push(`[classifier] domains: ${classification.domains.join(", ")}`);
      debugLog.push(`[classifier] keywords: ${classification.keywords.join(", ")}`);
      if (classification.isAmbiguous) debugLog.push("[classifier] ⚠ ambiguous request");
    }

    // 2. Match plugins
    const selectedPlugins: Plugin[] = [];
    const allPlugins = this.registry.getAllPlugins();
    const requestLower = req.userRequest.toLowerCase();
    const { ngrams: requestNgrams } = buildWordsAndNgrams(req.userRequest);
    const multiWordSignalOwners = buildMultiWordSignalOwners(allPlugins);

    for (const plugin of allPlugins) {
      // A domain only counts as "matched" if the classifier actually scored a
      // signal for it. When classifyRequest finds nothing at all (every domain
      // scores 0), it still returns one domain as a last-resort guess so callers
      // always get a non-empty list — but that guess carries confidence 0 and
      // must not be treated as a real match, or the guessed domain (whichever
      // happens to be declared first in DOMAIN_SIGNALS) would leak into every
      // request that has no real domain signal at all.
      const domainMatch =
        classification.domains.includes(plugin.manifest.id as any) &&
        (classification.confidence[plugin.manifest.id as any] ?? 0) > 0;

      // hintMatch: count how many activation hints appear in the request as
      // whole words/phrases. Word-boundary matching (not raw substring) so a
      // short hint like "ci" can't fire on "circuit" or "hallucination", "orm"
      // can't fire on "performance", "ai" can't fire on "remain", etc.
      const matchingHints = plugin.manifest.activationHints.filter((hint) =>
        hintMatchesRequest(requestLower, hint)
      );
      const multiWordHits = matchingHints.filter(h => h.includes(" ")).length;
      const singleWordHits = matchingHints.filter(h => !h.includes(" ")).length;

      // Strong hint: at least one multi-word match, OR 3+ single-word matches
      const strongHintMatch = multiWordHits >= 1 || singleWordHits >= 3;

      // When classifier is confident (not ambiguous), only accept strong hint matches
      // When ambiguous, accept weaker signals too
      const hintMatch = classification.isAmbiguous
        ? matchingHints.length >= 1
        : strongHintMatch;

      // Never add a plugin via hintMatch alone if classifier already found domains
      // and this plugin's domain is not among them — unless the hit is very strong
      const classifierFoundDomains = classification.domains.length > 0 && !classification.isAmbiguous;

      // Fall back to the plugin's own skill-level activation signals, which are
      // far richer and more specific than the coarse per-domain hint list above
      // (e.g. rust/async-concurrency's "async runtime", game-development/game-loop's
      // "fixed timestep"). Only multi-word phrases count here — single-word skill
      // signals include generic English words (visual-review's "review", "improve")
      // that would reintroduce cross-domain leakage if trusted at the plugin level.
      // A phrase shared verbatim by more than one plugin (e.g. "error handling"
      // appears in both rust/error-handling and backend/error-handling-http) is
      // excluded too — a shared phrase isn't discriminating evidence for either.
      const skillSignalMatch = hasMultiWordSkillSignalMatch(plugin, requestNgrams, multiWordSignalOwners);

      const shouldInclude =
        domainMatch ||
        skillSignalMatch ||
        (hintMatch && (!classifierFoundDomains || multiWordHits >= 1));

      if (shouldInclude) {
        selectedPlugins.push(plugin);
        if (debug) debugLog.push(`[plugins] ✓ selected: ${plugin.manifest.id}`);
      } else {
        if (debug) debugLog.push(`[plugins] ✗ rejected: ${plugin.manifest.id} (no domain/hint match)`);
      }
    }

    // 3. Select skills within token budget
    // Extract keywords once and reuse for both skill selection and personal retrieval
    const extractedKeywords = extractKeywordsFromRequest(req.userRequest);
    const skillKeywords = [...classification.keywords, ...extractedKeywords];

    const { selected: selectedSkills, rejected: rejectedSkills, compositionLog } = selectSkills(
      selectedPlugins,
      skillKeywords,
      this.budget.domainSkills
    );

    if (debug) {
      for (const s of selectedSkills) {
        debugLog.push(`[skills] ✓ selected: ${s.pluginId}/${s.id} (~${s.estimatedTokens} tokens)`);
      }
      for (const r of rejectedSkills) {
        debugLog.push(`[skills] ✗ rejected: ${r.id} — ${r.reason}`);
      }
      for (const c of compositionLog) {
        debugLog.push(c);
      }
    }

    // 4. Retrieve personal knowledge
    const allKeywords = [
      ...skillKeywords,
      ...(req.techHints ?? []),
    ];
    const primaryDomain = classification.domains[0];

    const personalEntries = await this.personal.findRelevantEntries(
      req.userId,
      allKeywords,
      primaryDomain,
      8
    );

    const personalTokensUsed = estimateTokens(
      personalEntries.map((e) => e.content).join("\n")
    );

    if (personalTokensUsed > this.budget.personal) {
      // Trim to fit budget
      let tokens = 0;
      const trimmed: PersonalEntry[] = [];
      for (const entry of personalEntries) {
        const cost = estimateTokens(entry.content);
        if (tokens + cost <= this.budget.personal) {
          trimmed.push(entry);
          tokens += cost;
        }
      }
      personalEntries.splice(0, personalEntries.length, ...trimmed);
    }

    if (debug) {
      for (const e of personalEntries) {
        debugLog.push(`[personal] ✓ selected: ${e.id} (${e.type})`);
      }
    }

    // 5. Total estimate
    // If no personal entries were found, note the unused personal budget as available headroom
    const skillTokens = selectedSkills.reduce((sum, s) => sum + s.estimatedTokens, 0);
    const actualPersonalTokens = personalEntries.length === 0 ? 0 : personalTokensUsed;
    const estimatedTokens = skillTokens + actualPersonalTokens;
    if (debug) {
      debugLog.push(`[budget] estimated total: ${estimatedTokens} / ${this.budget.total}`);
      if (personalEntries.length === 0) {
        debugLog.push(`[budget] personal budget unused (+${this.budget.personal} tokens available as headroom)`);
      }
    }

    return {
      request: req.userRequest,
      selectedPlugins: selectedPlugins.map((p) => p.manifest.id),
      selectedSkills,
      rejectedSkills,
      selectedPersonalEntries: personalEntries,
      estimatedTokens,
      tokenBudget: this.budget,
      debugLog,
    };
  }
}

function estimateTokens(text: string): number {
  // Rough approximation: 1 token ≈ 4 characters
  return Math.ceil(text.length / 4);
}

// Maps each multi-word skill activation signal (lowercased) to the set of
// plugin ids that declare it, across the whole registry.
function buildMultiWordSignalOwners(plugins: Plugin[]): Map<string, Set<string>> {
  const owners = new Map<string, Set<string>>();
  for (const plugin of plugins) {
    for (const skill of plugin.skills.values()) {
      for (const signal of skill.activationSignals) {
        if (!signal.includes(" ")) continue;
        const key = signal.toLowerCase();
        let set = owners.get(key);
        if (!set) {
          set = new Set();
          owners.set(key, set);
        }
        set.add(plugin.manifest.id);
      }
    }
  }
  return owners;
}

function hasMultiWordSkillSignalMatch(
  plugin: Plugin,
  requestNgrams: Set<string>,
  multiWordSignalOwners: Map<string, Set<string>>
): boolean {
  for (const skill of plugin.skills.values()) {
    for (const signal of skill.activationSignals) {
      if (!signal.includes(" ")) continue;
      const signalLower = signal.toLowerCase();
      // Only trust this phrase if it belongs to exactly one plugin — a phrase
      // shared verbatim across plugins isn't discriminating evidence for either.
      if ((multiWordSignalOwners.get(signalLower)?.size ?? 0) !== 1) continue;
      // Tolerate a simple trailing plural on the phrase's last word, same as hintMatchesRequest.
      if (requestNgrams.has(signalLower) || requestNgrams.has(`${signalLower}s`)) {
        return true;
      }
    }
  }
  return false;
}

const HINT_REGEX_CACHE = new Map<string, RegExp>();

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Matches a hint as a whole word/phrase (word-boundary anchored) rather than
// a raw substring, so short hints like "ci", "orm", "ai", "test", "rest",
// "ios", "mock" don't false-positive inside unrelated words such as
// "circuit", "performance", "remain", "latest", "interest", "serious", or
// "mockup".
function hintMatchesRequest(requestLower: string, hint: string): boolean {
  const hintLower = hint.toLowerCase();
  let regex = HINT_REGEX_CACHE.get(hintLower);
  if (!regex) {
    // Trailing "s?" tolerates simple plurals ("animation" also matches
    // "animations", "micro-interaction" also matches "micro-interactions")
    // without needing a full stemmer.
    regex = new RegExp(`\\b${escapeRegExp(hintLower)}s?\\b`);
    HINT_REGEX_CACHE.set(hintLower, regex);
  }
  return regex.test(requestLower);
}
